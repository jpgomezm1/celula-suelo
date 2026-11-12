// Estudio de competencia de un lote, con el formato de estudio de competencia de constructora (Etapa 1 · pasos 3 a 9).
// Datos: Galería Inmobiliaria (ventas, ritmo, oferta; licencia del cliente), Zonario (proyectos sin Galería),
// catastro + POT del predio (célula) y entorno (OpenStreetMap). La narrativa y las recomendaciones finales
// las redacta Claude a partir de estos hechos; aquí solo hay cálculos trazables.

import { sql } from "./db";
import { encontrarPredio } from "./ficha";
import { avisoPOT } from "./norma_aviso";
import { bloque2026Predio } from "./norma2026";

export type EstudioInput = {
  nombre?: string;
  lote: { id?: string; cbml?: string; direccion?: string; lat?: number; lon?: number };
  poligono?: { type: "Polygon"; coordinates: number[][][] };
  radio_m?: number;
  objetivo?: "proyecto_nuevo" | "etapa_nueva" | "proyecto_critico";
  tipo_vivienda?: "VIS" | "NO VIS" | "todos";
  min_unidades?: number;
  vocacion?: "vivienda" | "rentas_cortas" | "ambos";
  entrega?: "obra gris" | "acabados" | "todos";
  corte?: string; // fecha de corte de Galería; por defecto la foto más reciente de cada proyecto
  tipo_producto?: "Apto" | "Casa" | "Lote" | "todos"; // por defecto apartamentos
  max_competidores?: number;
};

const UA = { "User-Agent": "Mozilla/5.0 (compatible; celula-suelo/0.3)" };
const med = (xs: number[]) => { const s = xs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b); return s.length ? s[Math.floor((s.length - 1) / 2)] : null; };
const pct = (xs: number[], p: number) => { const s = xs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(p * (s.length - 1)))] : null; };

/** Medellín: dirección → punto, con la nomenclatura oficial. */
export async function geocodificarMedellin(direccion: string) {
  const m = direccion.toUpperCase().replace(/\./g, "").replace(/N[°º]|NO\b/g, "#")
    .match(/^(CL|CALLE|CR|CRA|KR|CARRERA|AV|TV|DG|CIRC)\w*\s+(\d+\w*(?:\s+SUR)?)\s*#\s*(\d+\w*(?:\s+SUR)?)\s*-\s*(\d+)/);
  if (!m) return null;
  const tipo = /^C(ALLE|L)/.test(m[1]) ? "CL" : /^(CR|CRA|KR|CARRERA)/.test(m[1]) ? "CR" : m[1];
  const where = `via = '${tipo} ${m[2].replace(/\s+/g, " ")}' AND placa LIKE '${m[3].replace(/\s+SUR/, "")}-${m[4].padStart(2, "0")}%'`;
  const r = await fetch(`https://www.medellin.gov.co/servidormapas/rest/services/ServiciosCatastro/Base_Catastral/MapServer/8/query?` +
    new URLSearchParams({ where, outFields: "cbml,latitud,longitud", returnGeometry: "false", f: "json" }), { headers: UA })
    .then((x) => x.json()).catch(() => ({}));
  const a = r.features?.[0]?.attributes;
  return a ? { cbml: a.cbml as string, lat: a.latitud as number, lon: a.longitud as number } : null;
}

const cacheEntorno = new Map<string, any[]>();

/** Entorno a 1 km desde OpenStreetMap (Overpass): transporte, comercio, educación, salud, parques. */
async function entorno(lat: number, lon: number) {
  const q = `[out:json][timeout:25];(
    node(around:1200,${lat},${lon})[railway~"station|tram_stop"];node(around:1200,${lat},${lon})[public_transport=station];
    node(around:1200,${lat},${lon})[aerialway=station];
    nwr(around:1000,${lat},${lon})[shop~"mall|supermarket"];nwr(around:1000,${lat},${lon})[amenity~"school|university|college|hospital|clinic"];
    nwr(around:1000,${lat},${lon})[leisure=park][name];
    node(around:500,${lat},${lon})[highway=bus_stop];
  );out center tags;`;
  try {
    const clave = `${lat.toFixed(4)},${lon.toFixed(4)}`;
    let els: any[] | null = cacheEntorno.get(clave) ?? null;
    let fuente = "OpenStreetMap (copia local en la base, osm_poi), radio 1 km";
    if (!els) {
      // Primero la copia local (npm run osm:poi); mismos filtros de distancia que la consulta en vivo.
      try {
        const loc = await sql`
          SELECT tags, ST_Y(geom) AS lat, ST_X(geom) AS lon FROM osm_poi
          WHERE ST_DWithin(geom::geography, ST_SetSRID(ST_MakePoint(${lon}, ${lat}), 4326)::geography, 1200)
            AND (tags->>'highway' IS DISTINCT FROM 'bus_stop' OR ST_DWithin(geom::geography, ST_SetSRID(ST_MakePoint(${lon}, ${lat}), 4326)::geography, 500))
            AND (tags->>'railway' IS NOT NULL OR tags->>'public_transport' = 'station' OR tags->>'aerialway' = 'station' OR tags->>'highway' = 'bus_stop'
                 OR ST_DWithin(geom::geography, ST_SetSRID(ST_MakePoint(${lon}, ${lat}), 4326)::geography, 1000))`;
        const [{ n }] = await sql`SELECT count(*)::int AS n FROM osm_poi`;
        if (n > 0) els = loc as any[];
      } catch { /* tabla aún no creada */ }
    }
    if (!els) {
      fuente = "OpenStreetMap (Overpass en vivo), radio 1 km";
      // Los tres servidores en paralelo; gana el primero que responda JSON. Tope total de 20 s para no frenar el estudio.
      const control = new AbortController();
      const tope = setTimeout(() => control.abort(), 20_000);
      try {
        els = await Promise.any(["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter", "https://overpass.private.coffee/api/interpreter"].map(async (srv) => {
          const r = await fetch(srv, { method: "POST", body: new URLSearchParams({ data: q }), headers: { "User-Agent": "celula-suelo/0.3 (analisis inmobiliario)", Accept: "application/json" }, signal: control.signal });
          const t = await r.text();
          if (!t.trimStart().startsWith("{")) throw new Error("respuesta no JSON");
          return (JSON.parse(t).elements ?? []) as any[];
        }));
        cacheEntorno.set(clave, els);
      } catch { els = null; } finally { clearTimeout(tope); control.abort(); }
    }
    if (!els) throw new Error("Overpass no respondió en 20 s");
    const dist = (e: any) => {
      const la = e.lat ?? e.center?.lat, lo = e.lon ?? e.center?.lon;
      return Math.round(Math.hypot((la - lat) * 111_320, (lo - lon) * 111_320 * Math.cos((lat * Math.PI) / 180)));
    };
    const grupo = (f: (t: any) => boolean) => els.filter((e) => f(e.tags ?? {})).map((e) => ({ nombre: e.tags?.name ?? null, distancia_m: dist(e) }))
      .sort((a, b) => a.distancia_m - b.distancia_m);
    const nombres = (xs: { nombre: string | null; distancia_m: number }[], n = 5) => xs.filter((x) => x.nombre).slice(0, n);
    const estaciones = grupo((t) => /station|tram_stop/.test(t.railway ?? "") || t.public_transport === "station" || t.aerialway === "station");
    return {
      fuente,
      transporte_masivo: { cantidad: estaciones.length, cercanas: nombres(estaciones) },
      paraderos_bus_500m: grupo((t) => t.highway === "bus_stop").length,
      centros_comerciales_y_supermercados: { cantidad: grupo((t) => /mall|supermarket/.test(t.shop ?? "")).length, cercanos: nombres(grupo((t) => /mall|supermarket/.test(t.shop ?? ""))) },
      educacion: { cantidad: grupo((t) => /school|university|college/.test(t.amenity ?? "")).length, cercanos: nombres(grupo((t) => /school|university|college/.test(t.amenity ?? ""))) },
      salud: { cantidad: grupo((t) => /hospital|clinic/.test(t.amenity ?? "")).length, cercanos: nombres(grupo((t) => /hospital|clinic/.test(t.amenity ?? ""))) },
      parques: nombres(grupo((t) => t.leisure === "park"), 4),
    };
  } catch (e) {
    return { fuente: "OpenStreetMap", error: (e as Error).message };
  }
}

export async function estudioCompetencia(f: EstudioInput) {
  // ── Lote ──
  let { lat, lon } = f.lote;
  let predio: any = null;
  if (f.lote.id || f.lote.cbml) predio = await encontrarPredio({ id: f.lote.id, cbml: f.lote.cbml });
  if (!predio && f.lote.direccion) {
    const g = await geocodificarMedellin(f.lote.direccion);
    if (g) { predio = await encontrarPredio({ cbml: g.cbml }); lat = g.lat; lon = g.lon; }
  }
  if (!predio && lat !== undefined && lon !== undefined) predio = await encontrarPredio({ lat, lon });
  if (predio) { lat = Number(predio.lat); lon = Number(predio.lon); }
  if (lat === undefined || lon === undefined) {
    return { error: "No pude ubicar el lote: da un id/CBML, una dirección de Medellín o una coordenada." };
  }

  // ── Zona: polígono dibujado o radio ──
  const radio = f.radio_m ?? 3000;
  const zonaSql = f.poligono
    ? sql`ST_SetSRID(ST_GeomFromGeoJSON(${JSON.stringify(f.poligono)}), 4326)`
    : sql`ST_Buffer(ST_SetSRID(ST_MakePoint(${lon}, ${lat}), 4326)::geography, ${radio})::geometry`;
  void zonaSql;
  const zonaGeo = f.poligono ? JSON.stringify(f.poligono) : null;
  // Sin corte explícito se usa la foto vigente de cada proyecto (galeria_vigente): un corte parcial no borra los demás.
  const [hay] = await sql`SELECT count(*)::int AS n FROM galeria_proyecto WHERE geom IS NOT NULL`;
  const corte = f.corte ?? (hay?.n ? "vigente" : null);
  const tipoProd = f.tipo_producto ?? "Apto";

  // ── Paso 5: proyectos a consultar (Galería) ──
  const tipoViv = f.tipo_vivienda ?? "todos";
  const voc = f.vocacion ?? "ambos";
  const entrega = f.entrega ?? "todos";
  const galeria = corte ? await sql`
    SELECT g.*, ST_Y(g.geom) AS lat, ST_X(g.geom) AS lon,
           round(ST_Distance(g.geom::geography, ST_SetSRID(ST_MakePoint(${lon}, ${lat}), 4326)::geography)) AS distancia_m
    FROM ${f.corte ? sql`galeria_proyecto` : sql`galeria_vigente`} g
    WHERE (${f.corte ?? null}::date IS NULL OR g.fecha_corte = ${f.corte ?? null}::date) AND g.geom IS NOT NULL
      AND (${tipoProd} = 'todos' OR g.tipo IS NULL OR g.tipo ILIKE ${tipoProd} || '%')
      AND CASE WHEN ${zonaGeo}::text IS NOT NULL THEN ST_Intersects(g.geom, ST_SetSRID(ST_GeomFromGeoJSON(${zonaGeo}), 4326))
               ELSE ST_DWithin(g.geom::geography, ST_SetSRID(ST_MakePoint(${lon}, ${lat}), 4326)::geography, ${radio}) END
      AND COALESCE(g.unidades_total, 0) >= ${f.min_unidades ?? 100}
      AND (${tipoViv} = 'todos' OR (${tipoViv} = 'VIS' AND g.tipo_vivienda ILIKE '%VIS%' AND g.tipo_vivienda NOT ILIKE 'NO VIS%')
           OR (${tipoViv} = 'NO VIS' AND g.tipo_vivienda ILIKE '%NO VIS%'))
      AND (${voc} = 'ambos' OR (${voc} = 'rentas_cortas' AND g.rentas_cortas) OR (${voc} = 'vivienda' AND NOT g.rentas_cortas))
      AND (${entrega} = 'todos' OR norm_txt(g.entrega) LIKE '%' || norm_txt(${entrega}) || '%')
    ORDER BY g.ventas_prom_semestre_un DESC NULLS LAST` : [];

  // Proyectos del catálogo (Zonario) en la zona que no están en Galería: se listan sin datos de ventas.
  const zonario = await sql`
    SELECT p.id, p.nombre, k.nombre AS constructora, p.barrio, p.precio_desde, p.precio_m2_desde, p.area_min, p.area_max, p.entrega,
           round(ST_Distance(p.geom::geography, ST_SetSRID(ST_MakePoint(${lon}, ${lat}), 4326)::geography)) AS distancia_m
    FROM project p LEFT JOIN constructora k ON k.id = p.constructora_id
    WHERE p.estado = 'activo' AND p.geom IS NOT NULL
      AND CASE WHEN ${zonaGeo}::text IS NOT NULL THEN ST_Intersects(p.geom, ST_SetSRID(ST_GeomFromGeoJSON(${zonaGeo}), 4326))
               ELSE ST_DWithin(p.geom::geography, ST_SetSRID(ST_MakePoint(${lon}, ${lat}), 4326)::geography, ${radio}) END
    ORDER BY distancia_m`;
  const enGaleria = new Set(galeria.map((g: any) => String(g.proyecto).toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8)));
  const soloZonario = zonario.filter((z: any) => !enGaleria.has(String(z.nombre).toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8)));

  // ── Paso 7: competencia directa (zoom): cercanía + ritmo de ventas + oferta vigente ──
  const max = f.max_competidores ?? 5;
  const maxDist = Math.max(...galeria.map((g: any) => Number(g.distancia_m)), 1);
  const maxVentas = Math.max(...galeria.map((g: any) => Number(g.ventas_prom_semestre_un) || 0), 1);
  const zoom = galeria
    .map((g: any) => ({
      g,
      puntaje: 0.5 * (1 - Number(g.distancia_m) / maxDist) + 0.35 * Math.max(Number(g.ventas_prom_semestre_un) || 0, 0) / maxVentas
        + 0.15 * ((Number(g.unidades_disponibles) || 0) + (Number(g.unidades_por_lanzar) || 0) > 0 ? 1 : 0),
    }))
    .sort((a, b) => b.puntaje - a.puntaje).slice(0, max).map((x) => x.g);

  // ── Paso 8: tabla resumen (mismas filas que su formato) ──
  const tabla = zoom.map((g: any) => ({
    proyecto: g.proyecto, zona: g.sub_zona, constructor: g.construye, fecha_lanzamiento: g.fecha_inicio_ventas,
    area_promedio: Number(g.area_prom_ventas ?? g.area_prom_oferta), precio_m2: Number(g.precio_m2_oferta),
    total_unidades: Number(g.unidades_total), ventas_totales: Number(g.ventas_total_un), pct_vendido: Number(g.pct_vendido),
    oferta_actual: Number(g.unidades_disponibles), oferta_futura: Number(g.unidades_por_lanzar),
    ventas_mes_promedio_semestre: Number(g.ventas_prom_semestre_un), ventas_ultimo_mes: Number(g.ventas_mes_un),
    entrega: g.entrega, fecha_entrega: g.fecha_entrega, tipo_vivienda: g.tipo_vivienda, rentas_cortas: g.rentas_cortas, distancia_m: Number(g.distancia_m),
  }));

  // ── Métricas de zona ──
  const num = (k: string) => galeria.map((g: any) => Number(g[k]));
  const ventasMesZona = galeria.reduce((a: number, g: any) => a + Math.max(Number(g.ventas_prom_semestre_un) || 0, 0), 0);
  const ofertaDisp = galeria.reduce((a: number, g: any) => a + (Number(g.unidades_disponibles) || 0), 0);
  const ofertaFut = galeria.reduce((a: number, g: any) => a + (Number(g.unidades_por_lanzar) || 0), 0);
  const metricas = {
    proyectos_en_zona: galeria.length,
    ventas_mes_zona_promedio_semestre: Math.round(ventasMesZona * 10) / 10,
    oferta_disponible: ofertaDisp, oferta_por_lanzar: ofertaFut,
    meses_de_inventario: ventasMesZona > 0 ? Math.round(((ofertaDisp) / ventasMesZona) * 10) / 10 : null,
    meses_de_inventario_con_futura: ventasMesZona > 0 ? Math.round(((ofertaDisp + ofertaFut) / ventasMesZona) * 10) / 10 : null,
    precio_m2_p25: pct(num("precio_m2_oferta"), 0.25), precio_m2_mediana: med(num("precio_m2_oferta")), precio_m2_p75: pct(num("precio_m2_oferta"), 0.75),
    area_promedio_mediana: med(num("area_prom_ventas")),
    ventas_mes_mediana_por_proyecto: med(num("ventas_prom_semestre_un")),
    pct_vendido_mediana: med(num("pct_vendido")),
    entrega_predominante: Object.entries(galeria.reduce((a: any, g: any) => { a[g.entrega ?? "s/d"] = (a[g.entrega ?? "s/d"] ?? 0) + 1; return a; }, {}))
      .sort((a: any, b: any) => b[1] - a[1])[0]?.[0] ?? null,
  };

  // ── Paso 4: territorio (hechos del predio y del entorno) ──
  const [env, amenazas, protecciones] = await Promise.all([
    entorno(lat, lon),
    predio ? sql`SELECT DISTINCT z.attrs->>'tipo' AS tipo, z.attrs->>'grado' AS grado FROM zoning_layer z JOIN parcel x ON x.id = ${predio.id}
                 WHERE z.capa = 'amenaza' AND z.municipio_dane = x.municipio_dane AND ST_Intersects(z.geom, x.geom)` : Promise.resolve([]),
    predio ? sql`SELECT DISTINCT z.attrs->>'categoria' AS categoria FROM zoning_layer z JOIN parcel x ON x.id = ${predio.id}
                 WHERE z.capa = 'proteccion' AND z.municipio_dane = x.municipio_dane AND ST_Intersects(z.geom, x.geom)` : Promise.resolve([]),
  ]);

  // ── Paso 9: insumos para recomendaciones ──
  const unidadesPosibles = predio?.area_construible_inferida && metricas.area_promedio_mediana
    ? Math.floor((Number(predio.area_construible_inferida) * 0.8) / Number(metricas.area_promedio_mediana)) : null;
  const tope = predio?.viviendas_max_inferidas ? Number(predio.viviendas_max_inferidas) : null;
  const pot2026: any = predio ? await bloque2026Predio(predio, metricas.area_promedio_mediana ?? 65) : null;
  // Ritmo de referencia: el de la competencia directa (zoom), como se usa en los estudios de competencia de constructora.
  const ritmosZoom = zoom.map((g: any) => Math.max(Number(g.ventas_prom_semestre_un) || 0, 0));
  const ritmoReferencia = ritmosZoom.length ? Math.round((ritmosZoom.reduce((a, b) => a + b, 0) / ritmosZoom.length) * 10) / 10 : null;

  const cortesUsados = galeria.length
    ? [...new Set(galeria.map((g: any) => new Date(g.fecha_corte).toISOString().slice(0, 10)))].sort().join(", ")
    : corte === null ? null : "sin proyectos en la zona";
  const aproximados = galeria.filter((g: any) => ["barrio", "municipio", "sector"].includes(g.ubicacion_metodo)).length;
  return {
    estudio: f.nombre ?? "Estudio de competencia",
    fecha: new Date().toISOString().slice(0, 10),
    corte_galeria: cortesUsados,
    paso3_objetivo: {
      objetivo: f.objetivo ?? "proyecto_nuevo", tipo_vivienda: tipoViv, tipo_producto: tipoProd, vocacion: voc, entrega,
      filtros: { min_unidades: f.min_unidades ?? 100, zona: f.poligono ? "polígono dibujado" : `radio de ${radio} m` },
    },
    paso4_territorio: {
      ubicacion: { lat, lon, municipio: predio?.municipio ?? null, barrio: predio?.barrio_catastral ?? null, direccion: f.lote.direccion ?? null },
      predio: predio ? {
        id: predio.id, area_lote_m2: Number(predio.area_lote), clase_suelo: predio.clase === "U" ? "urbano" : "rural",
        tratamiento: predio.tratamiento, altura_max: predio.altura_max === null ? null : Number(predio.altura_max),
        indice_construccion: predio.ic_max === null ? null : Number(predio.ic_max), densidad_max_viv_ha: predio.densidad_max === null ? null : Number(predio.densidad_max),
        uso: predio.uso, area_construible_m2: predio.area_construible_inferida === null ? null : Number(predio.area_construible_inferida),
        viviendas_max_por_densidad: tope, valor_suelo_m2: predio.valor_suelo_m2 === null ? null : Number(predio.valor_suelo_m2),
        licencias_historicas: predio.licencias, norma_fuente: predio.norma_fuente, advertencia_norma: predio.pot_servicio === "derogado" ? "POT del servicio derogado" : null, aviso_pot: avisoPOT(predio.municipio_dane),
      } : null,
      restricciones: { amenazas, protecciones },
      entorno: env,
      nota: "Hechos verificables para redactar los apartados del paso 4 (zona, referencias, vías, transporte, comercio, desarrollo y valorización).",
    },
    paso5_proyectos_a_consultar: {
      fuente: corte ? `Galería Inmobiliaria, corte ${cortesUsados}` : "Sin datos de Galería cargados",
      cantidad: galeria.length,
      producto: tipoProd === "todos" ? "apartamentos, casas y lotes" : tipoProd === "Apto" ? "apartamentos" : tipoProd === "Casa" ? "casas" : "lotes",
      ubicacion_aproximada: aproximados
        ? `${aproximados} de ${galeria.length} proyectos están ubicados en el centro de su barrio, sector o municipio (dirección sin cruce de vías reconocible): su distancia al lote es aproximada.`
        : null,
      proyectos: galeria.map((g: any) => ({
        codigo: g.codigo, proyecto: g.proyecto, construye: g.construye, sub_zona: g.sub_zona, tipo_vivienda: g.tipo_vivienda,
        precio_m2: Number(g.precio_m2_oferta), unidades_total: Number(g.unidades_total), ventas_total: Number(g.ventas_total_un),
        disponibles: Number(g.unidades_disponibles), por_lanzar: Number(g.unidades_por_lanzar), pct_vendido: Number(g.pct_vendido),
        ventas_mes_prom_semestre: Number(g.ventas_prom_semestre_un), fecha_inicio: g.fecha_inicio_ventas, entrega: g.entrega,
        estado_obra: g.estado_obra, distancia_m: Number(g.distancia_m), ubicacion: g.ubicacion_metodo,
        ubicacion_aproximada: ["barrio", "municipio", "sector"].includes(g.ubicacion_metodo), direccion: g.direccion, municipio: g.municipio,
        tipo: g.tipo, gerenciador: g.gerenciador, descuento: g.descuento && g.descuento !== "---" ? g.descuento : null, corte: new Date(g.fecha_corte).toISOString().slice(0, 10),
      })),
      proyectos_sin_galeria: soloZonario.slice(0, 15).map((z: any) => ({ ...z, nota: "Zonario: sin datos de ventas" })),
    },
    paso7_proyectos_zoom: zoom.map((g: any) => g.proyecto),
    paso8_tabla_resumen: tabla,
    metricas_zona: metricas,
    paso9_insumos_recomendacion: {
      area_promedio_objetivo: metricas.area_promedio_mediana,
      rango_area_competencia: [pct(num("area_prom_ventas"), 0.25), pct(num("area_prom_ventas"), 0.75)],
      precio_m2_objetivo_rango: [metricas.precio_m2_p25, metricas.precio_m2_p75],
      entrega_predominante: metricas.entrega_predominante,
      ritmo_ventas_referencia_mes: ritmoReferencia,
      ritmo_ventas_por_competidor: zoom.map((g: any) => ({ proyecto: g.proyecto, ventas_mes_prom_semestre: Number(g.ventas_prom_semestre_un), ventas_ultimo_mes: Number(g.ventas_mes_un) })),
      unidades_posibles_por_norma: unidadesPosibles !== null && tope ? Math.min(unidadesPosibles, tope) : unidadesPosibles,
      norma_pot_2026_preliminar: pot2026 ? { ...pot2026.que_se_puede_hacer, frente_a_2014: pot2026.frente_a_2014, estado: pot2026.estado } : null,
      meses_para_vender_al_ritmo_referencia: unidadesPosibles && ritmoReferencia && ritmoReferencia > 0
        ? Math.round((Math.min(unidadesPosibles, tope ?? unidadesPosibles) / ritmoReferencia) * 10) / 10 : null,
      nota: "Con estos insumos se redactan las recomendaciones (tipo de producto, área, tipologías, entrega, precio objetivo, zonas comunes, enfoque, público y diferencial) y la conclusión. Etapa 2 (cotizaciones, zonas comunes, hallazgos arquitectónicos) sigue siendo trabajo de campo.",
    },
    fuentes: [
      corte && `Galería Inmobiliaria (exportación del cliente, corte ${cortesUsados}) — uso interno`,
      "Zonario, zonario.co (proyectos sin Galería)",
      "Catastro y POT municipal (célula de suelo)",
      "OpenStreetMap (entorno)",
    ].filter(Boolean),
  };
}
