// Resolución de entidades: project_source → project + constructora; enlace a predio; foto de precios.
//   npm run proyectos:resolver
// Mismo proyecto = mismo nombre normalizado, a menos de 300 m (o mismo municipio si falta coordenada).

import pg from "pg";

export const clave = (s: string | null | undefined) =>
  String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/\b(constructora|construcciones|inversiones|promotora|urbanizadora|s\.?\s?a\.?\s?s\.?|s\.?\s?a\.?|ltda|y cia|grupo)\b/g, " ")
    .replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

const db = new pg.Client({ connectionString: process.env.DATABASE_URL });

async function constructoraId(nombre: string | null): Promise<number | null> {
  const k = clave(nombre);
  if (!k) return null;
  const r = await db.query(
    `INSERT INTO constructora (nombre, clave) VALUES ($1, $2)
     ON CONFLICT (clave) DO UPDATE SET alias = CASE WHEN $1 = ANY(constructora.alias) OR $1 = constructora.nombre
       THEN constructora.alias ELSE array_append(constructora.alias, $1) END
     RETURNING id`, [nombre, k]);
  return r.rows[0].id;
}

async function main() {
  await db.connect();
  const fuentes = (await db.query(
    `SELECT id, fuente, url, nombre, constructora, municipio_dane, barrio, datos, ST_X(geom) lon, ST_Y(geom) lat
     FROM project_source WHERE activo ORDER BY fuente = 'zonario' DESC, fetched_at DESC`)).rows;
  let nuevos = 0, unidos = 0;
  await db.query("BEGIN");
  for (const s of fuentes) {
    const k = clave(s.nombre);
    if (!k) continue;
    const cid = await constructoraId(s.constructora);
    const d = s.datos ?? {};
    const precioM2 = d.precio_desde && d.area_min ? Math.round(d.precio_desde / d.area_min) : null;
    const existente = (await db.query(
      `SELECT id FROM project WHERE clave = $1 AND municipio_dane = $2
         AND ($3::float8 IS NULL OR geom IS NULL OR ST_DWithin(geom::geography, ST_SetSRID(ST_MakePoint($4, $3), 4326)::geography, 300))
       ORDER BY id LIMIT 1`, [k, s.municipio_dane, s.lat, s.lon])).rows[0];
    const valores = [s.nombre, k, cid, s.municipio_dane, s.barrio, s.lat, s.lon, d.entrega ?? null, d.precio_desde ?? null,
      d.precio_hasta ?? null, precioM2, d.area_min ?? null, d.area_max ?? null, (d.habitaciones ?? []).join(", ") || null,
      d.unidades_ofertadas ?? null, JSON.stringify(d.tipologias ?? []), d.tipo ?? null, d.estado_obra ?? null];
    let pid: number;
    if (existente) {
      pid = existente.id;
      await db.query(
        `UPDATE project SET nombre = $2, constructora_id = COALESCE($4, constructora_id), barrio = COALESCE($6, barrio),
           geom = COALESCE(CASE WHEN $7::float8 IS NOT NULL THEN ST_SetSRID(ST_MakePoint($8, $7), 4326) END, geom),
           entrega = COALESCE($9, entrega), precio_desde = COALESCE($10, precio_desde), precio_hasta = COALESCE($11, precio_hasta),
           precio_m2_desde = COALESCE($12, precio_m2_desde), area_min = COALESCE($13, area_min), area_max = COALESCE($14, area_max),
           habitaciones = COALESCE($15, habitaciones), unidades = COALESCE($16, unidades), tipologias = $17::jsonb,
           tipo = COALESCE($18, tipo), etapa = COALESCE($19, etapa), estado = 'activo', ultima_vez = now()
         WHERE id = $1 AND $3::text IS NOT NULL AND $5::text IS NOT NULL`, [pid, ...valores]);
      unidos++;
    } else {
      pid = (await db.query(
        `INSERT INTO project (nombre, clave, constructora_id, municipio_dane, barrio, geom, entrega, precio_desde, precio_hasta,
           precio_m2_desde, area_min, area_max, habitaciones, unidades, tipologias, tipo, etapa)
         VALUES ($1, $2, $3, $4, $5, CASE WHEN $6::float8 IS NOT NULL THEN ST_SetSRID(ST_MakePoint($7, $6), 4326) END,
                 $8, $9, $10, $11, $12, $13, $14, $15, $16::jsonb, $17, $18) RETURNING id`, valores)).rows[0].id;
      nuevos++;
    }
    await db.query("UPDATE project_source SET project_id = $1 WHERE id = $2", [pid, s.id]);
  }
  // Enlace a predio: el que contiene el punto, o el más cercano a menos de 50 m.
  await db.query(
    `UPDATE project pr SET parcel_id = sub.id FROM (
       SELECT pr2.id AS pid, (SELECT p.id FROM parcel p WHERE p.municipio_dane = pr2.municipio_dane
                               AND ST_DWithin(p.geom::geography, pr2.geom::geography, 50)
                              ORDER BY ST_Distance(p.geom::geography, pr2.geom::geography) LIMIT 1) AS id
       FROM project pr2 WHERE pr2.geom IS NOT NULL) sub
     WHERE pr.id = sub.pid AND sub.id IS NOT NULL`);
  // Desaparecidos: ninguna fuente activa.
  await db.query(
    `UPDATE project SET estado = 'desaparecido'
     WHERE estado = 'activo' AND NOT EXISTS (SELECT 1 FROM project_source s WHERE s.project_id = project.id AND s.activo)`);
  // Foto del día para historia de precios.
  await db.query(
    `INSERT INTO project_snapshot (project_id, fecha, precio_desde, precio_hasta, precio_m2_desde, etapa, fuentes)
     SELECT p.id, current_date, p.precio_desde, p.precio_hasta, p.precio_m2_desde, p.etapa,
            (SELECT array_agg(DISTINCT s.fuente) FROM project_source s WHERE s.project_id = p.id AND s.activo)
     FROM project p WHERE p.estado = 'activo'
     ON CONFLICT (project_id, fecha) DO UPDATE SET precio_desde = EXCLUDED.precio_desde, precio_hasta = EXCLUDED.precio_hasta,
       precio_m2_desde = EXCLUDED.precio_m2_desde, etapa = EXCLUDED.etapa, fuentes = EXCLUDED.fuentes`);
  await db.query("COMMIT");
  const s = (await db.query(
    `SELECT count(*) total, count(*) FILTER (WHERE parcel_id IS NOT NULL) con_predio, count(DISTINCT constructora_id) constructoras
     FROM project WHERE estado = 'activo'`)).rows[0];
  console.log(`Proyectos: ${nuevos} nuevos, ${unidos} actualizados · activos ${s.total} · con predio ${s.con_predio} · constructoras ${s.constructoras}`);
  await db.end();
}

if (process.argv[1]?.endsWith("resolve.ts")) main().catch(async (e) => { console.error(e); try { await db.query("ROLLBACK"); } catch {} process.exit(1); });
