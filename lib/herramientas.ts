// Herramientas de análisis sobre varios lotes o zonas: comparar, cartera (100–250 lotes), zona dibujada,
// cambio de norma POT 2014 → 2026 y novedades normativas detectadas por el monitor.
import { randomBytes } from "node:crypto";
import { sql } from "./db";
import { encontrarPredio } from "./ficha";
import { analizarLote, AVISO_LEGAL } from "./analisis_lote";
import { consultaNorma } from "./consulta_norma";
import { leerKml } from "./kml";
import { mercadoZona } from "./mercado";
import { ESTADO_2026 } from "./norma2026";

const n = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v));
const base = () => process.env.PUBLIC_URL ?? "http://localhost:3077";

export type RefLote = { nombre?: string; id?: string; cbml?: string; matricula?: string; direccion?: string; lat?: number; lon?: number };

async function resolver(ref: RefLote) {
  if (ref.matricula || ref.direccion) {
    const c: any = await consultaNorma({ matricula: ref.matricula, direccion: ref.direccion });
    return c.encontrado ? await encontrarPredio({ id: c.predio }) : null;
  }
  return encontrarPredio({ id: ref.id, cbml: ref.cbml, lat: ref.lat, lon: ref.lon });
}

const resumen = (p: any, a: any) => {
  const esc = a.cabida.escenarios as any[];
  return {
    predio: p.id, barrio: p.barrio_catastral, municipio: p.municipio, area_lote_m2: Math.round(Number(p.area_lote)), area_util_m2: a.area_util.area_util_m2,
    tratamiento: p.tratamiento, semaforo: a.semaforo.general, alertas: a.semaforo.items.filter((i: any) => i.luz === "rojo" || i.luz === "amarillo").map((i: any) => `${i.categoria}: ${i.lectura}`),
    unidades: { conservador: esc[0]?.unidades ?? null, base: esc[1]?.unidades ?? null, maximo: esc[2]?.unidades ?? null },
    pisos_base: esc[1]?.pisos_sobre_rasante ?? null, area_construible_base_m2: esc[1]?.area_construible_m2 ?? null,
    cambio_pot_2026: a.pot_2026_preliminar?.disponible ? a.pot_2026_preliminar.frente_a_2014.area_construible_m2.cambio : null,
    cesion_espacio_publico_m2: a.cesiones.espacio_publico_suelo_m2,
    valor_residual_m2: a.valor_residual?.valor_residual_m2 ?? null, valor_suelo_referencia_m2: n(p.valor_suelo_m2) ? Math.round(n(p.valor_suelo_m2)!) : null,
    lat: Number(p.lat), lon: Number(p.lon),
  };
};

/** Comparar 2 a 5 lotes lado a lado (norma, cabida, semáforo, cesiones, valor residual). */
export async function compararLotes(lotes: RefLote[], opts: { area_unidad_m2?: number; tipo_vivienda?: "VIS" | "NO VIS" } = {}) {
  if (lotes.length < 2 || lotes.length > 5) return { error: "Compara entre 2 y 5 lotes." };
  const out = [];
  for (const l of lotes) {
    const p = await resolver(l);
    if (!p) { out.push({ nombre: l.nombre ?? l.id ?? l.cbml ?? l.matricula ?? "lote", encontrado: false }); continue; }
    const a = await analizarLote(p, opts);
    out.push({ nombre: l.nombre ?? p.id, encontrado: true, ...resumen(p, a), detalle: { semaforo: a.semaforo.items, cabida: a.cabida.escenarios, usos_nivel: a.usos.nivel_mixtura } });
  }
  const ok = out.filter((x: any) => x.encontrado) as any[];
  const mejor = (k: (x: any) => number | null) => ok.slice().sort((a, b) => (k(b) ?? -1) - (k(a) ?? -1))[0]?.nombre ?? null;
  return { lotes: out, destacados: { mas_unidades: mejor((x) => x.unidades.base), mayor_valor_residual_m2: mejor((x) => x.valor_residual_m2), mayor_area_util: mejor((x) => x.area_util_m2) }, aviso_legal: AVISO_LEGAL };
}

/** Cartera de lotes (hasta 250): KML/KMZ o lista. Norma, cabida, semáforo, cesiones y ranking; guarda el resultado y entrega Excel. */
export async function analizarCartera(entrada: { nombre?: string; kml?: string; lotes?: RefLote[]; area_unidad_m2?: number; tipo_vivienda?: "VIS" | "NO VIS"; con_valor_residual?: boolean }) {
  let refs: RefLote[] = entrada.lotes ?? [];
  if (entrada.kml) refs = leerKml(entrada.kml).map((l) => {
    const c = l.punto ?? (l.poligono ? [l.poligono.reduce((a, p) => a + p[0], 0) / l.poligono.length, l.poligono.reduce((a, p) => a + p[1], 0) / l.poligono.length] : null);
    return { nombre: l.nombre, lon: c?.[0], lat: c?.[1] };
  });
  if (!refs.length) return { error: "No encontré lotes en la entrada." };
  if (refs.length > 250) return { error: "Máximo 250 lotes por cartera." };
  const conValor = entrada.con_valor_residual ?? refs.length <= 40;
  const filas: any[] = [];
  for (const r of refs) {
    const p = await resolver(r);
    if (!p) { filas.push({ nombre: r.nombre ?? r.cbml ?? r.id ?? "lote", encontrado: false }); continue; }
    const a = await analizarLote(p, { area_unidad_m2: entrada.area_unidad_m2, tipo_vivienda: entrada.tipo_vivienda, con_mercado: conValor });
    filas.push({ nombre: r.nombre ?? p.id, encontrado: true, ...resumen(p, a) });
  }
  const ok = filas.filter((f) => f.encontrado);
  const maxU = Math.max(1, ...ok.map((f) => f.unidades.base ?? 0));
  for (const f of ok) {
    const castigo = f.semaforo === "rojo" ? 35 : f.semaforo === "amarillo" ? 10 : 0;
    const gana = f.cambio_pot_2026 && f.cambio_pot_2026.startsWith("+") && f.cambio_pot_2026 !== "+0 %" ? 5 : 0;
    const valor = f.valor_residual_m2 && f.valor_suelo_referencia_m2 ? Math.min(20, Math.max(0, ((f.valor_residual_m2 / f.valor_suelo_referencia_m2) - 1) * 10)) : 0;
    f.puntaje = Math.round(Math.max(0, 60 * Math.sqrt((f.unidades.base ?? 0) / maxU) + valor + gana + 15 - castigo));
  }
  ok.sort((a, b) => b.puntaje - a.puntaje);
  const resultado = {
    tipo: "cartera", estudio: entrada.nombre ?? "Análisis de cartera de lotes", fecha: new Date().toISOString().slice(0, 10),
    resumen: { lotes: refs.length, encontrados: ok.length, verdes: ok.filter((f) => f.semaforo === "verde").length, amarillos: ok.filter((f) => f.semaforo === "amarillo").length,
      rojos: ok.filter((f) => f.semaforo === "rojo").length, unidades_base_total: ok.reduce((a, f) => a + (f.unidades.base ?? 0), 0) },
    ranking: ok, no_encontrados: filas.filter((f) => !f.encontrado).map((f) => f.nombre),
    metodo: "Puntaje 0–100: unidades posibles con la norma base (60) + valor residual frente al valor de referencia del suelo (hasta 20) + 15 base + 5 si el proyecto de POT 2026 sube el aprovechamiento − 10 (amarillo) o − 35 (rojo) del semáforo.",
    aviso_legal: AVISO_LEGAL,
  };
  const id = `c_${new Date().toISOString().slice(0, 10).replace(/-/g, "")}_${randomBytes(4).toString("hex")}`;
  await sql`INSERT INTO estudio (id, nombre, entrada, resultado) VALUES (${id}, ${resultado.estudio}, ${JSON.stringify({ ...entrada, kml: entrada.kml ? "(kml)" : undefined })}, ${JSON.stringify(resultado)})`;
  return { id, ...resultado, excel: `${base()}/api/estudio/${id}/xlsx` };
}

/** Zona dibujada (polígono): norma, cambio de POT, lotes con potencial, mercado y competencia (Galería). */
export async function analizarZona(poligono: [number, number][], nombre?: string) {
  const anillo = poligono[0][0] === poligono.at(-1)![0] && poligono[0][1] === poligono.at(-1)![1] ? poligono : [...poligono, poligono[0]];
  const geo = JSON.stringify({ type: "Polygon", coordinates: [anillo] });
  const [s] = await sql`
    WITH z AS (SELECT ST_SetSRID(ST_GeomFromGeoJSON(${geo}), 4326) AS g),
    pp AS (SELECT p.* FROM parcel_profile p, z WHERE ST_Intersects(p.geom, z.g) AND ST_Contains(z.g, ST_PointOnSurface(p.geom)))
    SELECT count(*)::int AS predios, round(sum(area_lote))::bigint AS area_lotes, count(*) FILTER (WHERE potencial_preliminar)::int AS con_potencial,
           round(sum(area_construible_inferida))::bigint AS construible_2014,
           round(sum(pp.area_lote * n.ic_residencial))::bigint AS construible_2026, count(n.codigo)::int AS con_norma_2026,
           round(sum(area_construible_inferida) FILTER (WHERE n.codigo IS NOT NULL))::bigint AS construible_2014_mismos,
           round(sum(viviendas_max_inferidas))::bigint AS viviendas_2014, round(sum(n.densidad_viv_ha * pp.area_lote / 10000))::bigint AS viviendas_2026,
           (SELECT ST_Area(g::geography) FROM z)::bigint AS area_zona_m2, (SELECT ST_Y(ST_Centroid(g)) FROM z) AS lat, (SELECT ST_X(ST_Centroid(g)) FROM z) AS lon,
           (SELECT json_agg(t) FROM (SELECT tratamiento, count(*) AS predios FROM pp GROUP BY 1 ORDER BY 2 DESC LIMIT 6) t) AS tratamientos
    FROM pp LEFT JOIN norma_pot2026_equivalencia e ON e.c14 = pp.codigo_tratamiento LEFT JOIN norma_pot2026 n ON n.codigo = e.c26`;
  const [g] = await sql`
    WITH z AS (SELECT ST_SetSRID(ST_GeomFromGeoJSON(${geo}), 4326) AS g)
    SELECT count(*)::int AS proyectos, round(sum(ventas_prom_semestre_un)::numeric, 1) AS ventas_mes, sum(unidades_disponibles)::int AS oferta,
           sum(unidades_por_lanzar)::int AS por_lanzar, percentile_cont(0.5) WITHIN GROUP (ORDER BY precio_m2_oferta)::bigint AS precio_m2_mediana
    FROM galeria_vigente gv, z WHERE gv.geom IS NOT NULL AND ST_Contains(z.g, gv.geom) AND (gv.tipo IS NULL OR gv.tipo ILIKE 'Apto%')`;
  const radio = Math.min(5000, Math.max(500, Math.round(Math.sqrt(Number(s.area_zona_m2) / Math.PI))));
  const mercado: any = s.lat ? await mercadoZona({ lat: Number(s.lat), lon: Number(s.lon), radio_m: radio }) : null;
  const pct = (a: any, b: any) => (n(a) && n(b) ? `${n(a)! >= n(b)! ? "+" : ""}${Math.round(((n(a)! - n(b)!) / n(b)!) * 100)} %` : null);
  return {
    zona: nombre ?? "Zona dibujada", area_zona_ha: Math.round(Number(s.area_zona_m2) / 1000) / 10,
    suelo: { predios: s.predios, area_lotes_m2: Number(s.area_lotes), lotes_con_potencial: s.con_potencial, tratamientos: s.tratamientos },
    norma: { area_construible_2014_m2: Number(s.construible_2014), viviendas_2014: Number(s.viviendas_2014),
      pot_2026_preliminar: s.con_norma_2026 ? { predios_con_norma_2026: s.con_norma_2026, area_construible_m2: Number(s.construible_2026), viviendas: Number(s.viviendas_2026),
        cambio_area_construible: pct(s.construible_2026, s.construible_2014_mismos), estado: ESTADO_2026 } : null },
    competencia_galeria: g?.proyectos ? { proyectos: g.proyectos, ventas_mes: Number(g.ventas_mes), oferta_disponible: g.oferta, oferta_por_lanzar: g.por_lanzar,
      meses_inventario: n(g.ventas_mes) ? Math.round(((g.oferta + g.por_lanzar) / Number(g.ventas_mes)) * 10) / 10 : null, precio_m2_mediana: n(g.precio_m2_mediana) } : null,
    mercado_usados: mercado ? { radio_equivalente_m: radio, apartamentos_en_venta: mercado.oferta?.inventario_activo, precio_m2_mediana: mercado.oferta?.precio_m2_mediana,
      compradores_90d: mercado.demanda?.pedidos_compradores, presupuesto_mediano: mercado.demanda?.presupuesto_mediana } : null,
    aviso_legal: AVISO_LEGAL,
  };
}

/** Quién gana y quién pierde aprovechamiento con el proyecto de POT 2026 (Medellín), por barrio, polígono o lote. */
export async function cambioPot(f: { agrupar?: "barrio" | "poligono"; barrio?: string; limite?: number; area_lote_min?: number }) {
  const limite = Math.min(f.limite ?? 15, 50);
  const agrupar = f.agrupar ?? "barrio";
  const grupos = await sql`
    SELECT CASE WHEN ${agrupar} = 'poligono' THEN pp.codigo_tratamiento || ' → ' || n.codigo ELSE pp.barrio_catastral END AS grupo,
           count(*)::int AS predios, round(sum(pp.area_construible_inferida))::bigint AS construible_2014, round(sum(pp.area_lote * n.ic_residencial))::bigint AS construible_2026,
           round(sum(pp.area_lote * n.ic_residencial) - sum(pp.area_construible_inferida))::bigint AS diferencia_m2,
           round(sum(n.densidad_viv_ha * pp.area_lote / 10000) - sum(pp.viviendas_max_inferidas))::bigint AS diferencia_viviendas
    FROM parcel_profile pp JOIN norma_pot2026_equivalencia e ON e.c14 = pp.codigo_tratamiento JOIN norma_pot2026 n ON n.codigo = e.c26
    WHERE pp.municipio_dane = '05001' AND pp.tipo_desarrollable AND pp.area_construible_inferida > 0
      AND (${f.barrio ?? null}::text IS NULL OR norm_txt(pp.barrio_catastral) LIKE '%' || norm_txt(${f.barrio ?? null}) || '%')
    GROUP BY 1 HAVING sum(pp.area_construible_inferida) > 0`;
  const conPct = grupos.map((g: any) => ({ ...g, cambio: `${Number(g.diferencia_m2) >= 0 ? "+" : ""}${Math.round((Number(g.diferencia_m2) / Number(g.construible_2014)) * 100)} %` }));
  const orden = (k: string, d = -1) => conPct.slice().sort((a: any, b: any) => d * (Number(a[k]) - Number(b[k])));
  const lotes = await sql`
    SELECT pp.id, pp.barrio_catastral AS barrio, round(pp.area_lote)::int AS area_lote, pp.codigo_tratamiento AS codigo_2014, n.codigo AS codigo_2026,
           pp.ic_max AS ic_2014, n.ic_residencial AS ic_2026, round(pp.area_construible_inferida)::int AS construible_2014, round(pp.area_lote * n.ic_residencial)::int AS construible_2026,
           round(pp.area_lote * n.ic_residencial - pp.area_construible_inferida)::int AS diferencia_m2, round(pp.lat::numeric, 6) AS lat, round(pp.lon::numeric, 6) AS lon
    FROM parcel_profile pp JOIN norma_pot2026_equivalencia e ON e.c14 = pp.codigo_tratamiento JOIN norma_pot2026 n ON n.codigo = e.c26
    WHERE pp.municipio_dane = '05001' AND pp.tipo_desarrollable AND pp.area_construible_inferida > 0 AND pp.area_lote >= ${f.area_lote_min ?? 1000}
      AND NOT COALESCE(pp.amenaza_alta, false)
      AND (${f.barrio ?? null}::text IS NULL OR norm_txt(pp.barrio_catastral) LIKE '%' || norm_txt(${f.barrio ?? null}) || '%')
    ORDER BY diferencia_m2 DESC LIMIT ${limite}`;
  return {
    agrupado_por: agrupar, grupos_analizados: conPct.length,
    mas_ganan: orden("diferencia_m2").slice(0, limite), mas_pierden: orden("diferencia_m2", 1).slice(0, limite).filter((g: any) => Number(g.diferencia_m2) < 0),
    lotes_que_mas_ganan: lotes, estado: ESTADO_2026,
    nota: "Compara el índice de construcción residencial base (sin compra de derechos). Solo predios desarrollables con norma en ambos POT; la Zona 1 no está incluida.",
  };
}

/** Documentos normativos nuevos detectados por el monitor (portal de la Alcaldía de Medellín). */
export async function novedadesNormativas(dias = 30) {
  const rows = await sql`SELECT titulo, url, tipo, to_char(publicado_en, 'YYYY-MM-DD') AS publicado, to_char(detectado_en, 'YYYY-MM-DD') AS detectado, relevancia
                         FROM norma_novedad WHERE detectado_en > now() - make_interval(days => ${dias}) OR publicado_en > now() - make_interval(days => ${dias})
                         ORDER BY publicado_en DESC NULLS LAST LIMIT 60`;
  const [u] = await sql`SELECT to_char(max(revisado_en), 'YYYY-MM-DD HH24:MI') AS ultima FROM norma_monitor`;
  return { ultima_revision: u?.ultima ?? null, novedades: rows, nota: "El monitor revisa a diario lo que publica la Alcaldía de Medellín (documentos del POT, decretos, anexos, cartografía, planes parciales). Cuando aparezca el texto final del POT 2026 o su cartografía, se recarga la norma." };
}
