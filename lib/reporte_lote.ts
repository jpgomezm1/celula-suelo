// Reporte visual de uno o varios lotes (los que se negocian juntos): mapa, semáforo, norma, área útil, cabida,
// terreno, inventario de la zona y, si se da, la lectura de un avalúo. Se guarda en la tabla estudio (tipo
// 'reporte_lote') y se abre en /api/estudio/{id}/reporte con la clave del workspace. Los textos en lenguaje
// natural (resumen, hallazgos, conclusión, qué verificar) los puede redactar quien llama y se guardan aparte.
import { randomBytes } from "node:crypto";
import { sql } from "./db";
import { consultaNorma } from "./consulta_norma";
import { encontrarPredio } from "./ficha";
import { analizarLote } from "./analisis_lote";
import { topografiaLote } from "./topografia";
import { mercadoZona } from "./mercado";

export type LoteRef = { nombre?: string; id?: string; cbml?: string; matricula?: string; direccion?: string; lat?: number; lon?: number };
export type Avaluo = {
  valor_total?: number; area_m2?: number; precio_m2?: number; fecha?: string; vigencia_hasta?: string;
  norma_citada?: string; pendiente_grados?: number; metodo?: string;
  comparables?: { nombre: string; precio_m2: number; nota?: string }[];
};
export type Textos = {
  titular?: string; bajada?: string;
  resumen_simple?: { titulo: string; texto: string; icono?: string }[];
  hallazgos?: { titulo: string; texto: string; luz?: "rojo" | "ambar" | "verde" | "gris" }[];
  observaciones_avaluo?: { cifra?: string; titulo: string; texto: string }[];
  conclusion?: string; verificar?: string[]; fuentes?: string[];
};
/** Marca del cliente para quien se prepara el reporte (co-marca: el cliente al frente, irrelevant como autor). */
export type Marca = { cliente: string; logo_url?: string; logo_fondo_oscuro_url?: string; color_oscuro?: string; color_acento?: string; fuente_titulos?: string };
export type ReporteInput = {
  nombre?: string; lotes: LoteRef[]; area_unidad_m2?: number; avaluo?: Avaluo; textos?: Textos;
  audiencia?: "general" | "constructora"; marca?: Marca;
  /** Con marca de cliente el reporte es para un tercero: Galería Inmobiliaria (confidencial) queda por fuera salvo que se pida. */
  incluir_galeria?: boolean;
};

const base = () => process.env.PUBLIC_URL ?? "http://localhost:3077";
const n = (x: any) => (x == null || x === "" || !Number.isFinite(Number(x)) ? null : Number(x));
const conTope = <T,>(p: Promise<T>, ms: number) => Promise.race([p, new Promise<null>((r) => setTimeout(() => r(null), ms))]).catch(() => null);

async function datosLote(ref: LoteRef, i: number, area_unidad_m2?: number) {
  const c: any = await consultaNorma(ref as any);
  if (!c.encontrado) return { error: `No encontré el lote ${ref.nombre ?? i + 1}${c.mensaje ? `: ${c.mensaje}` : ""}` };
  const p: any = await encontrarPredio({ id: c.predio });
  const [an, topo]: any = await Promise.all([analizarLote(p, { area_unidad_m2 }), conTope(topografiaLote(c.predio), 15000)]);
  return {
    nombre: ref.nombre ?? `Lote ${i + 1}`, id: c.predio, municipio: p.municipio, municipio_dane: p.municipio_dane, barrio: p.barrio_catastral ?? null,
    clase: p.clase === "U" ? "urbano" : "rural", area: n(p.area_lote) ?? 0, lat: n(p.lat), lon: n(p.lon),
    construcciones: n(p.construcciones) ?? 0, area_construida: n(p.area_construida) ?? 0,
    norma: { tratamiento: p.tratamiento, codigo: p.codigo_tratamiento, altura: n(p.altura_max), ic: n(p.ic_max), ic_derechos: n(p.ic_total), densidad: n(p.densidad_max), io: n(p.io_max), uso: p.uso, fuente: p.norma_fuente, acuerdo: p.acuerdo_vigente },
    advertencia: c.advertencia ?? null, aviso_pot: c.aviso_pot ?? null, valor_suelo_m2: n(p.valor_suelo_m2),
    area_util: an.area_util, semaforo: an.semaforo, restricciones: an.restricciones, cabida: an.cabida, computo: an.computo_indice,
    inventario: an.inventario_zona, actividad: an.usos?.area_de_actividad ?? null,
    suelo_sismo: an.suelo_sismo?.disponible ? an.suelo_sismo : null,
    pot2026: an.pot_2026_preliminar?.disponible ? { codigo: an.pot_2026_preliminar.codigo_2026, estado: an.pot_2026_preliminar.estado, fuente: an.pot_2026_preliminar.fuente, frente_a_2014: an.pot_2026_preliminar.frente_a_2014 } : null,
    topo: topo?.disponible ? { clase: topo.clase, pendiente_pct: topo.pendiente_pct, pendiente_grados: topo.pendiente_grados, desnivel_m: topo.desnivel_m, cae_hacia: topo.cae_hacia, perfil: topo.perfil, corte_m3: topo.movimiento_tierras?.corte_m3, fuente: topo.fuente?.nombre } : null,
  };
}

/** Geometrías del entorno en MAGNA-SIRGAS origen nacional (metros) para dibujar el mapa sin librerías. */
async function geometriaMapa(ids: string[], munis: string[]) {
  const [b]: any = await sql`WITH u AS (SELECT ST_Transform(ST_Union(geom), 9377) g FROM parcel WHERE id = ANY(${ids})),
      c AS (SELECT ST_Centroid(g) c, greatest(ST_XMax(g) - ST_XMin(g), ST_YMax(g) - ST_YMin(g)) / 2 + 140 r FROM u)
    SELECT ST_X(c) - greatest(r, 200) x0, ST_Y(c) - greatest(r, 200) y0, ST_X(c) + greatest(r, 200) x1, ST_Y(c) + greatest(r, 200) y1 FROM c`;
  const env = sql`ST_Transform(ST_MakeEnvelope(${b.x0}, ${b.y0}, ${b.x1}, ${b.y1}, 9377), 4326)`;
  const geo = (g: any) => sql`ST_AsGeoJSON(ST_SimplifyPreserveTopology(ST_Transform(ST_Intersection(${g}, ${env}), 9377), 0.8), 1)::json`;
  const [parcelas, proteccion, amenaza, retiros, cauces, vias, vecinos] = await Promise.all([
    sql`SELECT p.id, p.id = ANY(${ids}) propio, EXISTS (SELECT 1 FROM building x WHERE x.parcel_id = p.id) construido, ${geo(sql`p.geom`)} g
      FROM parcel p WHERE p.geom && ${env} AND ST_Intersects(p.geom, ${env}) LIMIT 900`,
    sql`SELECT coalesce(z.attrs->>'categoria', z.subtipo, 'Protección') cat, ${geo(sql`z.geom`)} g FROM zoning_layer z
      WHERE z.capa = 'proteccion' AND z.municipio_dane = ANY(${munis}) AND z.geom && ${env} AND ST_Intersects(z.geom, ${env}) LIMIT 300`,
    sql`SELECT coalesce(z.attrs->>'tipo', 'amenaza') tipo, z.attrs->>'grado' grado, ${geo(sql`z.geom`)} g FROM zoning_layer z
      WHERE z.capa = 'amenaza' AND z.municipio_dane = ANY(${munis}) AND (z.attrs->>'grado') ~* 'alta|media|no mitigable' AND z.geom && ${env} AND ST_Intersects(z.geom, ${env}) LIMIT 300`,
    sql`SELECT r.nombre, ${geo(sql`r.geom`)} g FROM hidro_retiro r WHERE r.geom && ${env} AND ST_Intersects(r.geom, ${env}) LIMIT 300`,
    sql`SELECT c.nombre, coalesce(c.canalizado, false) canalizado, ${geo(sql`c.geom`)} g FROM hidro_cauce c WHERE c.geom && ${env} AND ST_Intersects(c.geom, ${env}) LIMIT 400`,
    sql`SELECT v.nombre, ${geo(sql`v.geom`)} g FROM osm_via v WHERE v.geom && ${env} AND ST_Intersects(v.geom, ${env}) LIMIT 400`,
    sql`WITH u AS (SELECT ST_Union(geom) g FROM parcel WHERE id = ANY(${ids}))
      SELECT count(*)::int n, coalesce(round(sum(p.area_lote)), 0)::int m2 FROM parcel p, u
      WHERE p.geom && ST_Expand(u.g, 0.002) AND ST_DWithin(p.geom::geography, u.g::geography, 150) AND NOT p.id = ANY(${ids})
        AND NOT EXISTS (SELECT 1 FROM building x WHERE x.parcel_id = p.id)`,
  ]);
  const [via]: any = await sql`WITH u AS (SELECT ST_Union(geom) g FROM parcel WHERE id = ANY(${ids}))
    SELECT v.nombre, round(ST_Distance(v.geom::geography, u.g::geography))::int d FROM osm_via v, u
    WHERE v.nombre IS NOT NULL AND v.geom && ST_Expand(u.g, 0.01) ORDER BY v.geom <-> u.g LIMIT 1`;
  return { bbox: b, parcelas, proteccion, amenaza, retiros, cauces, vias, vecinos_sin_construir: vecinos[0], via_cercana: via ?? null };
}

/** Descarga un logo y lo guarda como data URI dentro del reporte (no depende del sitio del cliente ni va al repo público). */
export async function logoDataUri(url?: string) {
  if (!url || !/^https:\/\//.test(url)) return null;
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(10000) });
    const tipo = (r.headers.get("content-type") ?? "").split(";")[0].trim();
    if (!r.ok || !/^image\/(png|jpeg|webp|svg\+xml|gif)$/.test(tipo)) return null;
    const b = Buffer.from(await r.arrayBuffer());
    return b.length > 600_000 ? null : `data:${tipo};base64,${b.toString("base64")}`;
  } catch { return null; }
}
const HEX = /^#[0-9a-fA-F]{6}$/;

/** Mercado de la zona para una constructora: oferta y demanda de Fynder y proyectos nuevos anunciados (Zonario), a 1,5 km. */
export async function mercadoReporte(lat: number, lon: number) {
  const [m, proyectos]: any = await Promise.all([
    mercadoZona({ lat, lon, radio_m: 1500, tipo: "apartamento" }).catch(() => null),
    sql`SELECT q.nombre, k.nombre constructora, q.precio_desde, q.precio_m2_desde, q.area_min, q.area_max, q.entrega, q.etapa,
          round(ST_Distance(q.geom::geography, ST_SetSRID(ST_MakePoint(${lon}, ${lat}), 4326)::geography))::int distancia_m
        FROM project q LEFT JOIN constructora k ON k.id = q.constructora_id
        WHERE q.estado = 'activo' AND q.geom && ST_Expand(ST_SetSRID(ST_MakePoint(${lon}, ${lat}), 4326), 0.02)
          AND ST_DWithin(q.geom::geography, ST_SetSRID(ST_MakePoint(${lon}, ${lat}), 4326)::geography, 1500)
        ORDER BY distancia_m LIMIT 10`.catch(() => []),
  ]);
  return {
    radio_m: 1500,
    fynder: m ? { en_venta: m.oferta?.inventario_activo, precio_m2_usado: n(m.oferta?.precio_m2_mediana), precio_m2_nuevo: n(m.oferta?.precio_m2_nuevo_o_sobre_planos),
      precio_mediana: n(m.oferta?.precio_mediana), compradores_90d: m.demanda?.pedidos_compradores, presupuesto_mediana: n(m.demanda?.presupuesto_mediana),
      ventas_mes: n(m.ritmo?.absorcion_observada_mes), meses_venta: n(m.ritmo?.meses_venta_estimados), baja_confianza: !!(m.oferta?.baja_confianza || m.demanda?.baja_confianza) } : null,
    proyectos,
  };
}

export async function crearReporte(input: ReporteInput) {
  if (!input.lotes?.length) return { error: "Da al menos un lote (id, CBML, matrícula, dirección o coordenada)." };
  const lotes: any[] = [];
  for (const [i, ref] of input.lotes.slice(0, 6).entries()) {
    const l: any = await datosLote(ref, i, input.area_unidad_m2);
    if (l.error) return l;
    if (!lotes.some((x) => x.id === l.id)) lotes.push(l);
  }
  const externo = !!input.marca?.cliente;
  if (externo && !input.incluir_galeria) for (const l of lotes) l.inventario = null; // Galería es confidencial: no sale en reportes para terceros
  const [mapa, mercado, logo, logoOscuro] = await Promise.all([
    geometriaMapa(lotes.map((l) => l.id), [...new Set(lotes.map((l) => l.municipio_dane))]),
    lotes[0].lat && lotes[0].lon ? mercadoReporte(lotes[0].lat, lotes[0].lon) : null,
    logoDataUri(input.marca?.logo_url), logoDataUri(input.marca?.logo_fondo_oscuro_url),
  ]);
  const marca = externo ? { cliente: input.marca!.cliente, logo, logo_oscuro: logoOscuro,
    color_oscuro: HEX.test(input.marca!.color_oscuro ?? "") ? input.marca!.color_oscuro : null, color_acento: HEX.test(input.marca!.color_acento ?? "") ? input.marca!.color_acento : null,
    fuente_titulos: /^[A-Za-z0-9 ]{2,40}$/.test(input.marca!.fuente_titulos ?? "") ? input.marca!.fuente_titulos : null } : null;
  const id = `r_${new Date().toISOString().slice(0, 10).replace(/-/g, "")}_${randomBytes(4).toString("hex")}`;
  const nombre = input.nombre ?? (lotes.length > 1 ? `${lotes.length} lotes en ${lotes[0].municipio}` : `${lotes[0].nombre}, ${lotes[0].municipio}`);
  const resultado = { tipo: "reporte_lote", nombre, generado: new Date().toISOString(), lotes, mapa, mercado, avaluo: input.avaluo ?? null,
    audiencia: input.audiencia ?? "general", marca, galeria: !externo || !!input.incluir_galeria };
  await sql`INSERT INTO estudio (id, nombre, entrada, resultado, textos) VALUES (${id}, ${nombre}, ${JSON.stringify(input)}, ${JSON.stringify(resultado)}, ${JSON.stringify(input.textos ?? {})})`;
  const { resumenAutomatico } = await import("./reporte_html");
  return {
    id, nombre, reporte: `${base()}/api/estudio/${id}/reporte`,
    lotes: lotes.map((l) => ({ nombre: l.nombre, id: l.id, area_m2: l.area, area_util_m2: l.area_util?.area_util_m2, semaforo: l.semaforo?.general,
      alertas: (l.semaforo?.items ?? []).filter((x: any) => x.luz === "rojo" || x.luz === "amarillo").map((x: any) => `${x.categoria}: ${x.lectura}`) })),
    resumen_automatico: resumenAutomatico(resultado),
    ...(marca ? { marca: { cliente: marca.cliente, logo: !!marca.logo, logo_fondo_oscuro: !!marca.logo_oscuro, galeria_incluida: resultado.galeria } } : {}),
    siguiente_paso: "Comparte el enlace (se abre con el correo y clave del workspace). Si investigaste más (avalúo, POT vigente, visita), redacta en lenguaje no técnico el resumen, los hallazgos, la conclusión y qué verificar, y guárdalos con completar_estudio (id, textos: {resumen_simple, hallazgos, observaciones_avaluo, conclusion, verificar, fuentes, titular, bajada}); el reporte los muestra en lugar del resumen automático.",
  };
}
