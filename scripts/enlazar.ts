// Enlaza construcciones a su predio por lotes (punto interior dentro del predio), municipio por municipio.
//   npm run enlazar [-- <dane>]
import pg from "pg";

const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
await db.query("ANALYZE parcel; ANALYZE building");
const soloDane = process.argv[2];
const muns = (await db.query(
  `SELECT municipio_dane AS dane, count(*)::int AS n FROM building WHERE parcel_id IS NULL AND pt IS NOT NULL
   ${soloDane ? "AND municipio_dane = $1" : ""} GROUP BY 1 ORDER BY 2`, soloDane ? [soloDane] : [])).rows;

for (const { dane, n } of muns) {
  const t0 = Date.now();
  let ultimo = "", enlazadas = 0, revisadas = 0;
  for (;;) {
    const lote = await db.query(
      `SELECT max(id) AS hasta, count(*)::int AS n FROM (
         SELECT id FROM building WHERE municipio_dane = $1 AND parcel_id IS NULL AND pt IS NOT NULL AND id > $2 ORDER BY id LIMIT 20000) s`,
      [dane, ultimo]);
    if (!lote.rows[0].n) break;
    const r = await db.query(
      `UPDATE building b SET parcel_id = m.pid
       FROM (SELECT b2.id, (SELECT p.id FROM parcel p WHERE p.municipio_dane = $1 AND ST_Contains(p.geom, b2.pt) LIMIT 1) AS pid
             FROM building b2
             WHERE b2.municipio_dane = $1 AND b2.parcel_id IS NULL AND b2.pt IS NOT NULL AND b2.id > $2 AND b2.id <= $3) m
       WHERE b.id = m.id AND m.pid IS NOT NULL`,
      [dane, ultimo, lote.rows[0].hasta]);
    enlazadas += r.rowCount ?? 0;
    revisadas += lote.rows[0].n;
    ultimo = lote.rows[0].hasta;
    process.stdout.write(`  ${dane}: ${revisadas}/${n}\r`);
  }
  console.log(`${dane}: ${enlazadas} de ${n} construcciones enlazadas (${Math.round((Date.now() - t0) / 1000)} s)`);
}
await db.end();
