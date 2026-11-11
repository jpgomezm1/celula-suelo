// Teselas vectoriales (MVT) desde PostGIS: /api/tiles/{predios|proyectos|avisos}/{z}/{x}/{y}
import { sql } from "@/lib/db";

export const maxDuration = 30;

export async function GET(_req: Request, ctx: { params: Promise<{ capa: string; z: string; x: string; y: string }> }) {
  const { capa, z, x, y: yRaw } = await ctx.params;
  const zi = Number(z), xi = Number(x), yi = Number(yRaw.replace(".pbf", ""));
  if (![zi, xi, yi].every(Number.isInteger)) return new Response("Tesela inválida", { status: 400 });
  let rows: any[] = [];
  if (capa === "predios") {
    if (zi < 14) return new Response(null, { status: 204 });
    rows = await sql`
      WITH b AS (SELECT ST_TileEnvelope(${zi}, ${xi}, ${yi}) AS env)
      SELECT ST_AsMVT(t, 'predios', 4096, 'g') AS mvt FROM (
        SELECT pp.id, pp.area_lote::float8 AS area, pp.potencial_preliminar AS potencial, pp.amenaza_alta AS amenaza,
               pp.nivel_dato AS nivel, coalesce(pp.tratamiento, '') AS tratamiento,
               coalesce(pp.area_construible_restante_inferida, 0)::float8 AS restante,
               ST_AsMVTGeom(ST_Transform(pp.geom, 3857), b.env, 4096, 64, true) AS g
        FROM parcel_profile pp, b
        WHERE pp.geom && ST_Transform(b.env, 4326)
      ) t`;
  } else if (capa === "proyectos") {
    rows = await sql`
      WITH b AS (SELECT ST_TileEnvelope(${zi}, ${xi}, ${yi}) AS env)
      SELECT ST_AsMVT(t, 'proyectos', 4096, 'g') AS mvt FROM (
        SELECT p.id, p.nombre, coalesce(k.nombre, '') AS constructora, coalesce(p.precio_desde, 0)::float8 AS precio_desde,
               coalesce(p.entrega, '') AS entrega,
               ST_AsMVTGeom(ST_Transform(p.geom, 3857), b.env, 4096, 64, true) AS g
        FROM project p LEFT JOIN constructora k ON k.id = p.constructora_id, b
        WHERE p.estado = 'activo' AND p.geom && ST_Transform(b.env, 4326)
      ) t`;
  } else if (capa === "avisos") {
    if (zi < 12) return new Response(null, { status: 204 });
    rows = await sql`
      WITH b AS (SELECT ST_TileEnvelope(${zi}, ${xi}, ${yi}) AS env)
      SELECT ST_AsMVT(t, 'avisos', 4096, 'g') AS mvt FROM (
        SELECT l.id, coalesce(l.tipo, '') AS tipo, coalesce(l.precio, 0)::float8 AS precio, coalesce(l.precio_m2, 0)::float8 AS precio_m2,
               l.ubicacion_aproximada AS aprox,
               ST_AsMVTGeom(ST_Transform(l.geom, 3857), b.env, 4096, 64, true) AS g
        FROM listing l, b
        WHERE l.activa AND l.negocio = 'venta' AND l.geom && ST_Transform(b.env, 4326)
      ) t`;
  } else {
    return new Response("Capa desconocida", { status: 404 });
  }
  // El driver HTTP de Neon entrega bytea como texto hexadecimal "\x…".
  const raw = rows[0]?.mvt;
  const mvt: Buffer | null = !raw ? null : typeof raw === "string" ? Buffer.from(raw.replace(/^\\x/, ""), "hex") : Buffer.from(raw);
  if (!mvt || !mvt.length) return new Response(null, { status: 204 });
  return new Response(new Uint8Array(mvt), {
    headers: { "content-type": "application/vnd.mapbox-vector-tile", "cache-control": "public, max-age=3600" },
  });
}
