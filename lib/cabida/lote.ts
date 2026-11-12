// Marco local del lote para diseñar: polígono en EPSG 9377 rotado para que el eje X quede paralelo al lado largo y
// el frente (vía más cercana) quede hacia Y negativo. Incluye utilidades geométricas 2D.
import { sql } from "../db";

export type Pt = [number, number];
export const r2 = (x: number) => Math.round(x * 100) / 100;
export const rect = (x0: number, y0: number, x1: number, y1: number): Pt[] => [[r2(x0), r2(y0)], [r2(x1), r2(y0)], [r2(x1), r2(y1)], [r2(x0), r2(y1)]];
export const area = (p: Pt[]) => Math.abs(p.reduce((s, q, i) => { const r = p[(i + 1) % p.length]; return s + q[0] * r[1] - r[0] * q[1]; }, 0)) / 2;
export const dentro = (p: Pt, poly: Pt[]) => {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > p[1]) !== (yj > p[1]) && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
};
const cruza = (a: Pt, b: Pt, c: Pt, d: Pt) => {
  const o = (p: Pt, q: Pt, r: Pt) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  const d1 = o(c, d, a), d2 = o(c, d, b), d3 = o(a, b, c), d4 = o(a, b, d);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
};
export const rectDentro = (r: Pt[], poly: Pt[]) => {
  if (!r.every((p) => dentro(p, poly))) return false;
  for (let i = 0; i < 4; i++) for (let j = 0, k = poly.length - 1; j < poly.length; k = j++) if (cruza(r[i], r[(i + 1) % 4], poly[k], poly[j])) return false;
  return true;
};
export const solapa = (a: Pt[], b: Pt[], margen = 0) =>
  !(a[1][0] + margen <= b[0][0] || b[1][0] + margen <= a[0][0] || a[2][1] + margen <= b[0][1] || b[2][1] + margen <= a[0][1]);
export const caja = (p: Pt[]) => ({ x0: Math.min(...p.map((q) => q[0])), x1: Math.max(...p.map((q) => q[0])), y0: Math.min(...p.map((q) => q[1])), y1: Math.max(...p.map((q) => q[1])) });

export type MarcoLote = { lote: Pt[]; area: number; cx: number; cy: number; rot: number; reflejado: boolean; via: { nombre: string | null; distancia_m: number | null } };

/** Polígono del lote en el marco local (metros) y los datos para volver a coordenadas reales. */
export async function marcoLote(id: string): Promise<MarcoLote | null> {
  const [g] = await sql`
    WITH l AS (SELECT ST_Transform(geom, 9377) g, geom FROM parcel WHERE id = ${id}),
         v AS (SELECT o.nombre, ST_Transform(o.geom, 9377) vg, ST_Distance(o.geom::geography, l.geom::geography) d FROM osm_via o, l
               WHERE o.geom && ST_Expand(l.geom, 0.0006) AND ST_DWithin(o.geom::geography, l.geom::geography, 40) ORDER BY o.geom <-> ST_Centroid(l.geom) LIMIT 1),
         e AS (SELECT ST_OrientedEnvelope(g) env FROM l)
    SELECT ST_AsGeoJSON(l.g, 3)::json AS lote, ST_X(ST_Centroid(l.g)) cx, ST_Y(ST_Centroid(l.g)) cy, ST_Area(l.g) area,
           (SELECT ST_AsGeoJSON(ST_ShortestLine(vg, l.g), 3)::json FROM v) AS a_via, (SELECT nombre FROM v) AS via, (SELECT d FROM v) AS dvia,
           (SELECT degrees(ST_Azimuth(ST_PointN(ST_ExteriorRing(env), 1), ST_PointN(ST_ExteriorRing(env), 2))) FROM e) AS az1,
           (SELECT degrees(ST_Azimuth(ST_PointN(ST_ExteriorRing(env), 2), ST_PointN(ST_ExteriorRing(env), 3))) FROM e) AS az2,
           (SELECT ST_Distance(ST_PointN(ST_ExteriorRing(env), 1), ST_PointN(ST_ExteriorRing(env), 2)) FROM e) AS d1,
           (SELECT ST_Distance(ST_PointN(ST_ExteriorRing(env), 2), ST_PointN(ST_ExteriorRing(env), 3)) FROM e) AS d2
    FROM l`;
  if (!g) return null;
  const cx = Number(g.cx), cy = Number(g.cy);
  const anillo: Pt[] = (g.lote.type === "MultiPolygon" ? g.lote.coordinates[0][0] : g.lote.coordinates[0]).slice(0, -1);
  const azLargo = Number(g.d1) >= Number(g.d2) ? Number(g.az1) : Number(g.az2);
  const ang = ((90 - azLargo) * Math.PI) / 180;
  const cos = Math.cos(-ang), sin = Math.sin(-ang);
  const aLocal = ([x, y]: number[]): Pt => { const dx = x - cx, dy = y - cy; return [r2(dx * cos - dy * sin), r2(dx * sin + dy * cos)]; };
  let lote = anillo.map(aLocal), reflejado = false;
  if (g.a_via) { const pv = aLocal(g.a_via.coordinates[0]); reflejado = pv[1] > 0; }
  if (reflejado) lote = lote.map(([x, y]) => [x, -y] as Pt).reverse();
  return { lote, area: Number(g.area), cx, cy, rot: (ang * 180) / Math.PI, reflejado, via: { nombre: g.via ?? null, distancia_m: g.dvia != null ? Math.round(Number(g.dvia)) : null } };
}

/** Del marco local a EPSG 9377. */
export function aGlobal(m: { cx: number; cy: number; rot: number; reflejado: boolean }) {
  const a = (m.rot * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  return ([x, y]: Pt): Pt => { const yy = m.reflejado ? -y : y; return [m.cx + x * c - yy * s, m.cy + x * s + yy * c]; };
}

/** Retiro hacia adentro con PostGIS (lateral en todo el borde y frontal adicional desde el frente). */
export async function edificable(lote: Pt[], lateral: number, frontal: number, fondo?: number) {
  const ys = lote.map((q) => q[1]);
  const yMin = Math.min(...ys), yMax = Math.max(...ys);
  const wkt = `POLYGON((${[...lote, lote[0]].map((q) => q.join(" ")).join(",")}))`;
  const [r] = await sql`
    WITH l AS (SELECT ST_GeomFromText(${wkt}) g)
    SELECT ST_AsGeoJSON(ST_Intersection(ST_Buffer(g, ${-lateral}, 'join=mitre'), ST_MakeEnvelope(-1e6, ${yMin + frontal}, 1e6, ${fondo != null ? yMax - fondo : 1e6})), 2)::json AS e,
           ST_AsGeoJSON(ST_Intersection(ST_Buffer(g, -0.5, 'join=mitre'), ST_MakeEnvelope(-1e6, ${yMin + frontal}, 1e6, 1e6)), 2)::json AS s FROM l`; // el sótano no ocupa el antejardín (Decreto 471, art. 207)
  const mayor = (gj: any): Pt[] => {
    if (!gj?.coordinates?.length) return [];
    const polys: Pt[][] = gj.type === "MultiPolygon" ? gj.coordinates.map((c: any) => c[0].slice(0, -1)) : gj.type === "Polygon" ? [gj.coordinates[0].slice(0, -1)] : [];
    return polys.sort((a, b) => area(b) - area(a))[0] ?? [];
  };
  return { edificable: mayor(r.e), sotano: mayor(r.s) };
}

/** De EPSG 9377 al marco local del lote (inversa de aGlobal). */
export function aLocal(m: { cx: number; cy: number; rot: number; reflejado: boolean }) {
  const a = (m.rot * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  return ([x, y]: Pt): Pt => { const dx = x - m.cx, dy = y - m.cy; const lx = dx * c + dy * s, ly = -dx * s + dy * c; return [r2(lx), r2(m.reflejado ? -ly : ly)]; };
}
