// Direcciones (nomenclatura domiciliaria) de los lotes con potencial de Medellín, desde el catastro de GeoMedellín.
//   npm run direcciones
import pg from "pg";

const URL = "https://www.medellin.gov.co/servidormapas/rest/services/ServiciosCatastro/Base_Catastral/MapServer/8/query";
const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
const cbmls: string[] = (await db.query(
  `SELECT clave_local FROM parcel_profile WHERE municipio_dane = '05001' AND (potencial_preliminar OR area_lote >= 2000)
     AND id NOT IN (SELECT parcel_id FROM parcel_address)`)).rows.map((r) => r.clave_local);
console.log(`Lotes sin dirección: ${cbmls.length}`);
let guardadas = 0;
for (let i = 0; i < cbmls.length; i += 100) {
  const grupo = cbmls.slice(i, i + 100);
  const body = new URLSearchParams({ where: `cbml IN (${grupo.map((c) => `'${c}'`).join(",")})`,
    outFields: "cbml,via,placa,direccionencasillada,codigo_postal", returnGeometry: "false", f: "json", resultRecordCount: "2000" });
  const r = await fetch(URL, { method: "POST", body, headers: { "User-Agent": "Mozilla/5.0 (compatible; celula-suelo/0.3)" } });
  const feats = ((await r.json()).features ?? []).map((f: any) => f.attributes);
  const filas = feats.filter((a: any) => a.via && a.placa).map((a: any) => ({
    parcel_id: `05001:${a.cbml}`, direccion: `${a.via} # ${a.placa}`.replace(/\s+/g, " ").trim(), cp: a.codigo_postal ?? null }));
  if (filas.length) {
    const res = await db.query(
      `INSERT INTO parcel_address (parcel_id, direccion, codigo_postal, fuente)
       SELECT r.parcel_id, r.direccion, r.cp, 'geomed_nomenclatura' FROM jsonb_to_recordset($1::jsonb) r(parcel_id text, direccion text, cp text)
       ON CONFLICT DO NOTHING`, [JSON.stringify(filas)]);
    guardadas += res.rowCount ?? 0;
  }
  process.stdout.write(`  ${Math.min(i + 100, cbmls.length)}/${cbmls.length}\r`);
}
console.log(`\nDirecciones guardadas: ${guardadas}`);
await db.end();
