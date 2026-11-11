// Calcula parcel_profile municipio por municipio, rápido y con avance visible.
//   npm run perfil [-- <dane> ...]   (sin argumentos: los 17, Medellín primero)
// 1) Parte los polígonos de zoning_layer en pedazos pequeños (ST_Subdivide) con índice espacial: los cruces
//    contra polígonos enormes (amenazas, protección, retiros) pasan de minutos a segundos.
// 2) Toma la consulta de db/profile.sql, la restringe a un municipio y la apunta a los pedazos.
// 3) Llena parcel_profile_nueva por municipio y al final la cambia por parcel_profile en una transacción.

import { readFileSync } from "node:fs";
import pg from "pg";

const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
const t = Date.now();
const seg = () => `${Math.round((Date.now() - t) / 1000)} s`;

const sqlPerfil = readFileSync("db/profile.sql", "utf8").split(String.fromCharCode(13)).join("");
const fin = sqlPerfil.indexOf("CREATE UNIQUE INDEX");
const cuerpo = sqlPerfil.slice(sqlPerfil.indexOf("WITH p AS"), sqlPerfil.lastIndexOf(";", fin))
  .replace("FROM parcel p JOIN municipio m ON m.dane = p.municipio_dane", "FROM parcel p JOIN municipio m ON m.dane = p.municipio_dane\n  WHERE p.municipio_dane = $1")
  .replaceAll("JOIN zoning_layer z ON", "JOIN zoning_sub z ON")
  .replaceAll("ORDER BY p.id, ST_Area(z.geom)", "ORDER BY p.id, z.area_orig");

const soloAlgunos = process.argv.slice(2);
const parcial = soloAlgunos.length > 0;

if (!parcial || !(await db.query("SELECT to_regclass('zoning_sub') r")).rows[0].r) {
  console.log("Partiendo polígonos grandes…");
  await db.query("DROP TABLE IF EXISTS zoning_sub");
  await db.query(`
    CREATE TABLE zoning_sub AS
    SELECT z.id AS zoning_id, z.fuente, z.municipio_dane, z.capa, z.subtipo, z.attrs, ST_Area(z.geom) AS area_orig,
           ST_Subdivide(z.geom, 128) AS geom
    FROM zoning_layer z`);
  await db.query("CREATE INDEX zoning_sub_geom ON zoning_sub USING gist (geom)");
  await db.query("CREATE INDEX zoning_sub_capa ON zoning_sub (capa, municipio_dane)");
  await db.query("ANALYZE zoning_sub");
  console.log(`  listo (${seg()})`);
}

const muns = (await db.query(
  `SELECT dane, nombre FROM municipio ${parcial ? "WHERE dane = ANY($1)" : ""} ORDER BY dane = '05001' DESC, grupo, nombre`,
  parcial ? [soloAlgunos] : [])).rows;

// Tabla de destino: en modo parcial se actualiza parcel_profile en sitio; si no, se arma una nueva y se intercambia.
const destino = parcial ? "parcel_profile" : "parcel_profile_nueva";
if (!parcial) {
  await db.query("DROP TABLE IF EXISTS parcel_profile_nueva");
  await db.query(`CREATE TABLE parcel_profile_nueva AS ${cuerpo.replace("$1", "'00000'")} `);
} else if (!(await db.query("SELECT to_regclass('parcel_profile') r")).rows[0].r) {
  await db.query(`CREATE TABLE parcel_profile AS ${cuerpo.replace("$1", "'00000'")}`);
}

for (const m of muns) {
  const t0 = Date.now();
  await db.query("BEGIN");
  await db.query(`DELETE FROM ${destino} WHERE municipio_dane = $1`, [m.dane]);
  const r = await db.query(`INSERT INTO ${destino} ${cuerpo}`, [m.dane]);
  await db.query("COMMIT");
  const pot = (await db.query(`SELECT count(*) FILTER (WHERE potencial_preliminar)::int n FROM ${destino} WHERE municipio_dane = $1`, [m.dane])).rows[0].n;
  console.log(`${m.nombre}: ${r.rowCount} predios, ${pot} con potencial (${Math.round((Date.now() - t0) / 1000)} s)`);
}

if (!parcial) {
  await db.query("BEGIN");
  await db.query("DROP MATERIALIZED VIEW IF EXISTS parcel_profile");
  await db.query("DROP TABLE IF EXISTS parcel_profile");
  await db.query("ALTER TABLE parcel_profile_nueva RENAME TO parcel_profile");
  await db.query("COMMIT");
}
await db.query("CREATE UNIQUE INDEX IF NOT EXISTS parcel_profile_id ON parcel_profile (id)");
await db.query("CREATE INDEX IF NOT EXISTS parcel_profile_geom ON parcel_profile USING gist (geom)");
await db.query("CREATE INDEX IF NOT EXISTS parcel_profile_mun ON parcel_profile (municipio_dane, potencial_preliminar)");
await db.query("CREATE INDEX IF NOT EXISTS parcel_profile_clave ON parcel_profile (clave_local)");
await db.query("ANALYZE parcel_profile");
console.log(`Perfil listo (${seg()})`);
await db.end();
