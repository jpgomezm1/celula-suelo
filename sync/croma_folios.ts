// Consulta en Croma la historia del folio principal de los lotes con potencial (o de los municipios indicados).
//   npm run croma:folios [-- 05001]
// Folio principal = el de mayor % de derecho del predio. Se guarda cada acto (sin nombres: solo número de partes).

import pg from "pg";
import { historiaFolio } from "../lib/croma";

const CIRCULOS: Record<string, string[]> = { "05001": ["001", "01N"] };
const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
const muns = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(CIRCULOS);

const objetivos = (await db.query(
  `SELECT DISTINCT ON (f.parcel_id) f.parcel_id, f.matricula, pp.municipio_dane
   FROM parcel_folio f JOIN parcel_profile pp ON pp.id = f.parcel_id
   WHERE pp.potencial_preliminar AND pp.municipio_dane = ANY($1) AND f.registro IS NULL
     AND NOT EXISTS (SELECT 1 FROM folio_consulta c WHERE c.registro IN (SELECT unnest(ARRAY['001-','01N-']) || f.matricula))
   ORDER BY f.parcel_id, f.por_derecho DESC NULLS LAST`, [muns])).rows;
console.log(`Folios por consultar: ${objetivos.length}`);

let hechos = 0, encontrados = 0, fallas = 0;
const cola = [...objetivos];
async function trabajador() {
  for (;;) {
    const o = cola.shift();
    if (!o) return;
    try {
      const h = await historiaFolio(o.matricula, CIRCULOS[o.municipio_dane] ?? []);
      if (h.encontrado) {
        encontrados++;
        await db.query("UPDATE parcel_folio SET registro = $1 WHERE parcel_id = $2 AND matricula = $3", [h.registro, o.parcel_id, o.matricula]);
        if (h.actos.length) {
          await db.query(
            `INSERT INTO folio_act (id, registro, anotacion, fecha, act_code, acto, instrumento, valor, partes_de, partes_a, folio_abierto)
             SELECT r.id, r.registration_number, r.annotation_number, r.filed_on::date, r.act_code, r.act, r.instrument, r.value_cop,
                    r.parties_from, r.parties_to, r.folio_opened_on::date
             FROM jsonb_to_recordset($1::jsonb) r(id text, registration_number text, annotation_number int, filed_on text, act_code int,
               act text, instrument text, value_cop bigint, parties_from int, parties_to int, folio_opened_on text)
             ON CONFLICT (id) DO NOTHING`, [JSON.stringify(h.actos)]);
        }
      }
      await db.query(
        `INSERT INTO folio_consulta (registro, encontrado, datos_hasta) VALUES ($1, $2, $3)
         ON CONFLICT (registro) DO UPDATE SET encontrado = $2, datos_hasta = $3, consultado_en = now()`,
        [h.registro ?? `${(CIRCULOS[o.municipio_dane] ?? ["?"])[0]}-${o.matricula}`, h.encontrado, h.datos_hasta]);
    } catch (e) {
      fallas++;
      if (fallas <= 5) console.log(`  ✗ ${o.matricula}: ${(e as Error).message}`);
    }
    hechos++;
    if (hechos % 50 === 0) process.stdout.write(`  ${hechos}/${objetivos.length} · encontrados ${encontrados}\r`);
  }
}
await Promise.all([trabajador(), trabajador(), trabajador(), trabajador()]);
await db.query(
  `INSERT INTO source_snapshot (fuente, nombre, url, tipo_dato, licencia, esperado, registros, notas)
   VALUES ('croma_folios', 'Historia de folios (actos registrados 2015–2023) · IGAC vía Croma', 'https://api.croma.run/co/igac-transactions/folio-history/v1',
           'oficial', 'Croma (servicio pagado); datos IGAC', $1, $2, $3)`,
  [objetivos.length, encontrados, `${fallas} fallas`]);
console.log(`\nListo: ${hechos} consultados · ${encontrados} con historia · ${fallas} fallas`);
await db.end();
