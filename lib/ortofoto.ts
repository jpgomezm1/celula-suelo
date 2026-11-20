// Ortofoto del lote: imagen aérea recortada al lote y su entorno, con el lindero dibujado encima.
// Las fuentes por municipio se configuran en FUENTES; si ninguna responde, el estudio usa el mapa vectorial.
import { sql } from "./db";

type Fuente = { nombre: string; municipios: string[] | "*"; url: (b: { x0: number; y0: number; x1: number; y1: number }, w: number, h: number) => string; srid: number; atribucion: string };

// Se completan con servicios públicos verificados (export por bbox).
export const FUENTES: Fuente[] = [];

export async function ortofotoLote(id: string, w = 1600, h = 1000) {
  const [b]: any = await sql`WITH l AS (SELECT ST_Transform(geom, 3857) g, geom FROM parcel WHERE id = ${id}), c AS (SELECT ST_Centroid(g) c, greatest(ST_XMax(g) - ST_XMin(g), ST_YMax(g) - ST_YMin(g)) r FROM l)
    SELECT ST_X(c) cx, ST_Y(c) cy, r, (SELECT municipio_dane FROM parcel WHERE id = ${id}) dane FROM c`;
  if (!b) return null;
  const half = Math.max(120, Number(b.r) * 0.9), x0 = b.cx - half * (w / h), x1 = b.cx + half * (w / h), y0 = b.cy - half, y1 = b.cy + half;
  for (const f of FUENTES.filter((f) => f.municipios === "*" || f.municipios.includes(b.dane))) {
    try {
      const r = await fetch(f.url({ x0, y0, x1, y1 }, w, h), { headers: { "user-agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(20000) });
      const mime = (r.headers.get("content-type") ?? "").split(";")[0];
      if (!r.ok || !/^image\/(png|jpeg)$/.test(mime)) continue;
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.length < 5000) continue;
      // Lindero del lote en coordenadas de la imagen
      const [g]: any = await sql`SELECT ST_AsGeoJSON(ST_Transform(geom, 3857), 1)::json j FROM parcel WHERE id = ${id}`;
      const anillos = (g.j.type === "MultiPolygon" ? g.j.coordinates.map((p: any) => p[0]) : [g.j.coordinates[0]]) as number[][][];
      const lindero = anillos.map((r) => "M" + r.map(([x, y]) => `${(((x - x0) / (x1 - x0)) * w).toFixed(1)},${(((y1 - y) / (y1 - y0)) * h).toFixed(1)}`).join("L") + "Z").join("");
      return { disponible: true, fuente: f.nombre, atribucion: f.atribucion, w, h, mime, b64: buf.toString("base64"), lindero, escala_m_por_px: (x1 - x0) / w };
    } catch { /* siguiente fuente */ }
  }
  return { disponible: false, motivo: "Sin servicio de ortofoto disponible para este municipio." };
}
