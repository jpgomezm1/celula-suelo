// Verificación v0.2: npm run verificar
// Por grupo (A, B, C, D) toma 20 predios al azar y vuelve a consultar la fuente en vivo por su punto interior:
//  · A y B: tratamiento y norma numérica del servicio + valor del suelo.
//  · C: código de tratamiento (la norma numérica es digitalizada o no existe).
//  · D: que el predio exista en la capa catastral de origen con la misma clave.
// También revisa conteos (registros = esperado) y privacidad (columnas prohibidas, valores con forma de teléfono).

import pg from "pg";
import { SOURCES } from "../ingest/sources";

const UA = { "User-Agent": "Mozilla/5.0 (compatible; celula-suelo/0.2)" };
async function enPunto(layer: string, lon: number, lat: number) {
  const qs = new URLSearchParams({ geometry: `${lon},${lat}`, geometryType: "esriGeometryPoint", inSR: "4326",
    spatialRel: "esriSpatialRelIntersects", outFields: "*", returnGeometry: "false", f: "json" });
  const r = await fetch(`${layer}/query?${qs}`, { headers: UA });
  return ((await r.json()).features ?? []).map((f: any) => f.attributes);
}
async function porWhere(layer: string, where: string) {
  const qs = new URLSearchParams({ where, returnCountOnly: "true", f: "json" });
  const r = await fetch(`${layer}/query?${qs}`, { headers: UA });
  return (await r.json()).count ?? 0;
}

const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
let fallasTotales = 0;

for (const grupo of ["A", "B", "C", "D"]) {
  const { rows } = await db.query(
    `SELECT id, municipio_dane, municipio, clave_local, lat, lon, tratamiento, codigo_tratamiento, altura_max, ic_max, densidad_max, valor_suelo_m2
     FROM parcel_profile WHERE grupo = $1 AND clase = 'U' AND ($1 = 'D' OR tratamiento IS NOT NULL) ORDER BY random() LIMIT 20`, [grupo]);
  let ok = 0;
  const fallas: string[] = [];
  for (const p of rows) {
    const lon = Number(p.lon), lat = Number(p.lat);
    const checks: Record<string, boolean> = {};
    try {
      if (grupo === "D") {
        const src = SOURCES.find((s) => s.municipio === p.municipio_dane && s.target === "parcel" && s.key.endsWith("_u"));
        const campo = src?.key.startsWith("geoant") ? "NPN" : "PK_PREDIOS";
        checks.existe_en_fuente = src ? (await porWhere(src.url, `${campo} = '${p.clave_local}'`)) > 0 : false;
      } else {
        const fuenteTrat = SOURCES.find((s) => s.municipio === p.municipio_dane && s.capa === "tratamiento");
        const enFuente = fuenteTrat ? (await enPunto(fuenteTrat.url, lon, lat)).map((a: any) => fuenteTrat.map(a)?.attrs as any) : [];
        if (grupo === "C") checks.codigo = enFuente.some((a: any) => a?.codigo === p.codigo_tratamiento);
        else {
          checks.tratamiento = enFuente.some((a: any) => a?.tratamiento === p.tratamiento);
          checks.altura = enFuente.some((a: any) => (a?.altura_max ?? null) === (p.altura_max === null ? null : Number(p.altura_max)));
          checks.indice = enFuente.some((a: any) => (a?.ic_max ?? null) === (p.ic_max === null ? null : Number(p.ic_max)));
        }
        const fuenteValor = SOURCES.find((s) => s.capa === "valor_suelo" && (s.municipio === p.municipio_dane || (!s.municipio && p.municipio_dane !== "05001")));
        if (fuenteValor && p.valor_suelo_m2 !== null) {
          const vals = (await enPunto(fuenteValor.url, lon, lat)).map((a: any) => Number((fuenteValor.map(a)?.attrs as any)?.valor_m2 ?? NaN));
          checks.valor_suelo = vals.includes(Number(p.valor_suelo_m2));
        }
      }
    } catch (e) {
      checks.consulta = false;
    }
    if (Object.values(checks).every(Boolean)) ok++;
    else fallas.push(`${p.id} (${p.municipio}): ${JSON.stringify(checks)}`);
  }
  fallasTotales += rows.length - ok;
  console.log(`Grupo ${grupo}: ${ok}/${rows.length} coinciden con la fuente en vivo`);
  fallas.slice(0, 5).forEach((f) => console.log(`  ✗ ${f}`));
}

const conteos = await db.query(
  `SELECT DISTINCT ON (fuente) fuente, esperado, registros FROM source_snapshot
   WHERE registros IS NOT NULL ORDER BY fuente, fetched_at DESC`);
const descuadres = conteos.rows.filter((r) => r.esperado !== null && r.registros !== r.esperado);
console.log(`\nConteos: ${conteos.rows.length - descuadres.length}/${conteos.rows.length} fuentes con registros = esperado`);
descuadres.forEach((r) => console.log(`  ≠ ${r.fuente}: ${r.registros} de ${r.esperado}`));

const prohibidas = await db.query(
  `SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public'
     AND column_name ~* '(telefono|celular|asesor|inmobiliaria|agente|contacto|email|cedula|matricula|propietari|texto_pedido|mensaje)'`);
const telefonos = await db.query(
  `SELECT count(*)::int n FROM listing WHERE titulo ~ '(\\+?57)?\\s?3\\d{2}[\\s-]?\\d{3}[\\s-]?\\d{4}'`);
console.log(`\nPrivacidad: ${prohibidas.rowCount} columnas con nombre prohibido${prohibidas.rowCount ? ` (${prohibidas.rows.map((r) => `${r.table_name}.${r.column_name}`).join(", ")})` : ""} · ${telefonos.rows[0].n} títulos con forma de celular`);
await db.end();
process.exit(fallasTotales ? 1 : 0);
