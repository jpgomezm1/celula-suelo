// Volumen del edificio posible en cada escenario de cabida: huella (lote retirado hacia adentro hasta el área
// permitida por el índice de ocupación) × altura (pisos × 3 m + 1,5 m de primer piso). Para el mapa 3D y Google Earth.
import { sql } from "./db";
import { encontrarPredio } from "./ficha";
import { analizarLote } from "./analisis_lote";

export const ALTURA_PISO = 3.0;
export const COLORES_ESCENARIO: Record<string, string> = { conservador: "#a28df5", base: "#6c4de7", maximo: "#2d1b8a" };

const clave = (nombre: string) => (/conservador/i.test(nombre) ? "conservador" : /m[aá]ximo/i.test(nombre) ? "maximo" : "base");

export type Volumen = { escenario: string; clave: string; pisos: number; altura_m: number; huella_m2: number | null; unidades: number | null; area_construible_m2: number | null; geojson: any };

/** Volúmenes de los tres escenarios de un lote, más el contorno del lote. */
export async function volumenesLote(id: string, opts: { area_unidad_m2?: number; tipo_vivienda?: "VIS" | "NO VIS"; ocupacion?: number } = {}) {
  const p = await encontrarPredio({ id });
  if (!p) return { encontrado: false as const };
  const a = await analizarLote(p, { ...opts, con_mercado: false });
  // Tipología: huella máxima (índice de ocupación de la norma) o torres (ocupación menor, más altura; tope de altura de la norma si existe).
  const util = Number(a.area_util.area_util_m2) || Number(p.area_lote);
  const tope = p.altura_max ? Number(p.altura_max) : null;
  const esc = (a.cabida.escenarios as any[]).filter((e) => e.disponible && e.pisos_sobre_rasante).map((e) => {
    if (!opts.ocupacion) return e;
    const huella = util * opts.ocupacion;
    let pisos = Math.ceil(Number(e.area_construible_m2) / huella);
    if (tope && pisos > tope) pisos = tope;
    return { ...e, huella_m2: huella, pisos_sobre_rasante: pisos };
  });
  const objetivos = esc.map((e) => Number(e.huella_m2) || 0);
  const rows = esc.length ? await sql`
    SELECT o.i, ST_AsGeoJSON(huella_cabida(p.geom, o.objetivo), 7)::json AS g, round(ST_Area(huella_cabida(p.geom, o.objetivo)::geography)) AS area
    FROM parcel p, unnest(${objetivos}::float8[]) WITH ORDINALITY AS o(objetivo, i) WHERE p.id = ${id}` : [];
  const [lote] = await sql`SELECT ST_AsGeoJSON(geom, 7)::json AS g, ST_Y(ST_Centroid(geom)) AS lat, ST_X(ST_Centroid(geom)) AS lon FROM parcel WHERE id = ${id}`;
  const volumenes: Volumen[] = esc.map((e, k) => {
    const r: any = rows.find((x: any) => Number(x.i) === k + 1);
    const pisos = Number(e.pisos_sobre_rasante);
    return { escenario: e.escenario, clave: clave(e.escenario), pisos, altura_m: Math.round((pisos * ALTURA_PISO + 1.5) * 10) / 10,
      huella_m2: r ? Number(r.area) : null, unidades: e.unidades, area_construible_m2: e.area_construible_m2, geojson: r?.g ?? null };
  });
  return {
    encontrado: true as const, id: p.id, barrio: p.barrio_catastral, municipio: p.municipio, area_lote_m2: Math.round(Number(p.area_lote)),
    centro: { lat: Number(lote.lat), lon: Number(lote.lon) }, lote: lote.g, volumenes, analisis: a,
    tipologia: opts.ocupacion ? `torres (ocupación ${Math.round(opts.ocupacion * 100)} %)` : `plataforma (índice de ocupación máximo ${a.cabida.supuestos.indice_ocupacion})`,
    nota: `Volumen esquemático: huella retirada desde los linderos hasta el área de ocupación; altura = pisos × ${ALTURA_PISO} m + 1,5 m. No es un diseño arquitectónico.`,
  };
}

/** Volumen del escenario base de varios lotes (para KMZ de carteras y estudios). */
export async function volumenesBase(ids: string[]) {
  const out: Record<string, { lote: any; volumen: any; altura_m: number; pisos: number }> = {};
  for (const id of ids.slice(0, 250)) {
    const v = await volumenesLote(id).catch(() => null);
    if (!v || !v.encontrado) continue;
    const base = v.volumenes.find((x) => x.clave === "base") ?? v.volumenes[0];
    out[id] = { lote: v.lote, volumen: base?.geojson ?? null, altura_m: base?.altura_m ?? 0, pisos: base?.pisos ?? 0 };
  }
  return out;
}
