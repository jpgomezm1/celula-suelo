// Matrícula, número de propietarios, uso, estrato y avalúo por predio de Medellín (MEData "Información Predios", CC BY-SA 4.0).
//   npm run medata:predios
// Se lee en streaming (≈92 MB) y se carga por lotes. No trae nombres de propietarios.

import { createReadStream, mkdirSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
import pg from "pg";

const URL = "https://medata.app.medellin.gov.co/sites/default/files/distribution/1-014-26-000298/informacion_predios.csv";
const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();

const res = await fetch(URL, { headers: { "User-Agent": "Mozilla/5.0 (compatible; celula-suelo/0.3)" } });
if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
mkdirSync("data/raw/medata", { recursive: true });
const archivo = "data/raw/medata/informacion_predios.csv";
writeFileSync(archivo, Buffer.from(await res.arrayBuffer()));
await db.query("DELETE FROM parcel_folio WHERE fuente = 'medata_informacion_predios'");
const lineas = createInterface({ input: createReadStream(archivo, "utf8"), crlfDelay: Infinity });

let cabecera: string[] | null = null;
let lote: any[] = [];
let total = 0;
const n = (v: string) => (v === "" || v === undefined || Number.isNaN(Number(v)) ? null : Number(v));

const enviar = async () => {
  if (!lote.length) return;
  await db.query(
    `INSERT INTO parcel_folio (parcel_id, matricula, por_derecho, uso_predial, estrato, nro_propietarios, avaluo, fuente)
     SELECT '05001:' || r.cbml, r.matricula, r.por, r.uso, r.estrato, r.nprop, r.avaluo, 'medata_informacion_predios'
     FROM jsonb_to_recordset($1::jsonb) r(cbml text, matricula text, por numeric, uso text, estrato int, nprop int, avaluo numeric)
     WHERE r.cbml IS NOT NULL AND r.matricula IS NOT NULL
     ON CONFLICT (parcel_id, matricula) DO UPDATE SET por_derecho = EXCLUDED.por_derecho, uso_predial = EXCLUDED.uso_predial,
       estrato = EXCLUDED.estrato, nro_propietarios = EXCLUDED.nro_propietarios, avaluo = EXCLUDED.avaluo`,
    [JSON.stringify(lote)],
  );
  total += lote.length;
  lote = [];
  process.stdout.write(`  ${total}\r`);
};

for await (const linea of lineas) {
  const c = linea.split(",");
  if (!cabecera) { cabecera = c; continue; }
  const get = (k: string) => c[cabecera!.indexOf(k)]?.trim();
  const mat = get("Matricula");
  if (!mat || mat === "0") continue;
  lote.push({ cbml: get("CBML"), matricula: mat, por: n(get("PorDes")), uso: get("UsoPredial") || null,
    estrato: n(get("Estrato")), nprop: n(get("NroPropietarios")), avaluo: n(get("AvaluoTotal")) });
  if (lote.length >= 5000) await enviar();
}
await enviar();
await db.query(
  `INSERT INTO source_snapshot (fuente, nombre, url, tipo_dato, licencia, esperado, registros, notas)
   VALUES ('medata_informacion_predios', 'Información Predios (matrícula, propietarios, avalúo) · MEData Medellín', $1, 'oficial',
           'CC BY-SA 4.0', $2, $2, 'Sin nombres de propietarios')`, [URL, total]);
console.log(`\nMatrículas cargadas: ${total}`);
await db.end();
