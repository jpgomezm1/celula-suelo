// Alturas del entorno de un lote a partir del catastro (pisos de las construcciones de cada predio vecino).
// Sirve para el 3D (vecinos con su altura real aproximada) y para leer si lo que permite la norma
// es coherente con lo que hay construido alrededor.
import { sql } from "./db";
import { ALTURA_PISO } from "./volumen";

/** Predios vecinos con su número de pisos máximo, en un radio en metros. */
export async function entornoLote(id: string, radio = 150) {
  const grados = radio / 100000; // filtro grueso con índice; luego distancia exacta
  const rows = await sql`
    WITH l AS (SELECT geom FROM parcel WHERE id = ${id})
    SELECT p.id, max(b.pisos)::int AS pisos, ST_AsGeoJSON(p.geom, 6)::json AS g
    FROM l, parcel p JOIN building b ON b.parcel_id = p.id
    WHERE p.geom && ST_Expand(l.geom, ${grados * 1.2}) AND p.id <> ${id}
      AND ST_DWithin(p.geom::geography, l.geom::geography, ${radio}) AND b.pisos > 0
    GROUP BY p.id, p.geom`;
  const pisos = rows.map((r: any) => Number(r.pisos)).sort((a, b) => a - b);
  const q = (t: number) => (pisos.length ? pisos[Math.min(pisos.length - 1, Math.round(t * (pisos.length - 1)))] : null);
  const geojson = { type: "FeatureCollection", features: rows.map((r: any) => ({ type: "Feature", properties: { id: r.id, pisos: Number(r.pisos), altura: Number(r.pisos) * ALTURA_PISO }, geometry: r.g })) };
  return {
    radio_m: radio, predios_con_construccion: rows.length,
    pisos_mediana: q(0.5), pisos_p90: q(0.9), pisos_max: pisos.length ? pisos[pisos.length - 1] : null,
    predios_5_pisos_o_mas: pisos.filter((p) => p >= 5).length, predios_10_pisos_o_mas: pisos.filter((p) => p >= 10).length,
    fuente: "Catastro (construcciones por predio, número de pisos). La altura se estima como pisos × 3 m.",
    geojson,
  };
}

/** Lectura comercial de la altura posible frente al entorno. */
export function lecturaEntorno(pisosProyecto: number | null | undefined, e: { pisos_mediana: number | null; pisos_p90: number | null; pisos_max: number | null }) {
  if (!pisosProyecto || e.pisos_mediana == null) return null;
  const p90 = e.pisos_p90 ?? e.pisos_mediana;
  if (pisosProyecto <= p90) return `El edificio posible (${pisosProyecto} pisos) está dentro de lo que ya hay construido alrededor (la mayoría hasta ${p90} pisos).`;
  if (e.pisos_max != null && pisosProyecto <= e.pisos_max) return `El edificio posible (${pisosProyecto} pisos) sobresale del entorno típico (${e.pisos_mediana} pisos en promedio), aunque ya hay edificios de hasta ${e.pisos_max} pisos cerca.`;
  return `El edificio posible (${pisosProyecto} pisos) sería el más alto del entorno (hoy máximo ${e.pisos_max ?? p90} pisos a la redonda): revise vistas, sombras sobre vecinos y la reacción de la comunidad en la licencia.`;
}
