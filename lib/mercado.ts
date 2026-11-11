// Mercado de una zona: oferta (Fynder), demanda (pedidos), absorción, precios y proyectos nuevos.
// Reglas de lectura (comite-de-tierras/references/lectura-datos-fynder.md) aplicadas en código:
//  · percentiles, nunca mínimo ni máximo · baja_confianza con muestra < 15 · promedio de presupuesto contaminado
//    si supera 2,5× la mediana · la antigüedad del inventario activo ≈ mitad del tiempo de venta.

import { sql } from "./db";

export type Zona = {
  municipio?: string;       // nombre o DANE
  barrio?: string;          // barrio, sector o comuna (texto)
  lat?: number; lon?: number; radio_m?: number;
};
export type FiltroMercado = Zona & { tipo?: string; dias?: number };

const MIN_MUESTRA = 15;

export async function resolverMunicipio(m?: string): Promise<{ dane: string; nombre: string } | null> {
  if (!m) return null;
  const rows = await sql`
    SELECT dane, nombre FROM municipio
    WHERE dane = ${m} OR norm_txt(nombre) = norm_txt(${m}) OR norm_txt(nombre) LIKE norm_txt(${m}) || '%' LIMIT 1`;
  return (rows[0] as any) ?? null;
}

export async function mercadoZona(f: FiltroMercado) {
  const mun = await resolverMunicipio(f.municipio);
  const dias = f.dias ?? 90;
  const tipo = f.tipo ?? "apartamento";
  const radio = f.radio_m ?? 1500;
  const punto = f.lat !== undefined && f.lon !== undefined;
  const barrio = f.barrio ?? null;
  const dane = mun?.dane ?? null;
  if (!punto && !dane && !barrio) throw new Error("Indica un municipio, un barrio o una coordenada.");

  const [oferta] = await sql`
    WITH z AS (
      SELECT * FROM listing l
      WHERE l.activa AND l.negocio = 'venta' AND l.precio >= 30000000
        AND (${tipo}::text = 'todos' OR l.tipo LIKE ${tipo} || '%')
        AND CASE
          WHEN ${punto} THEN l.geom IS NOT NULL AND ST_DWithin(l.geom::geography, ST_SetSRID(ST_MakePoint(${f.lon ?? 0}, ${f.lat ?? 0}), 4326)::geography, ${radio})
          WHEN ${barrio}::text IS NOT NULL THEN (${dane}::text IS NULL OR l.municipio_dane = ${dane})
               AND (norm_txt(l.barrio) LIKE '%' || norm_txt(${barrio}) || '%' OR norm_txt(l.comuna) LIKE '%' || norm_txt(${barrio}) || '%')
          ELSE l.municipio_dane = ${dane}
        END
    )
    SELECT count(*)::int AS inventario,
      percentile_cont(0.25) WITHIN GROUP (ORDER BY precio)::bigint AS p25,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY precio)::bigint AS mediana,
      percentile_cont(0.75) WITHIN GROUP (ORDER BY precio)::bigint AS p75,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY precio_m2)::bigint AS precio_m2_mediana,
      percentile_cont(0.25) WITHIN GROUP (ORDER BY precio_m2)::bigint AS precio_m2_p25,
      percentile_cont(0.75) WITHIN GROUP (ORDER BY precio_m2)::bigint AS precio_m2_p75,
      round(avg(EXTRACT(epoch FROM now() - publicado_en) / 86400))::int AS dias_inventario_promedio,
      count(*) FILTER (WHERE estado_inmueble IN ('nuevo', 'sobre_planos'))::int AS nuevos_o_sobre_planos,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY precio_m2) FILTER (WHERE estado_inmueble IN ('nuevo', 'sobre_planos'))::bigint AS precio_m2_nuevo,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY precio_m2) FILTER (WHERE estado_inmueble IN ('usado', 'remodelado', 'para_remodelar'))::bigint AS precio_m2_usado,
      (SELECT json_agg(x ORDER BY x.habitaciones) FROM (SELECT habitaciones, count(*)::int AS cantidad FROM z
         WHERE habitaciones IS NOT NULL GROUP BY habitaciones) x) AS mix_habitaciones,
      (SELECT count(*)::int FROM listing s WHERE s.salio_en > now() - make_interval(days => ${dias}) AND s.negocio = 'venta'
         AND s.id IN (SELECT id FROM listing l2 WHERE (${tipo}::text = 'todos' OR l2.tipo LIKE ${tipo} || '%') AND CASE
           WHEN ${punto} THEN l2.geom IS NOT NULL AND ST_DWithin(l2.geom::geography, ST_SetSRID(ST_MakePoint(${f.lon ?? 0}, ${f.lat ?? 0}), 4326)::geography, ${radio})
           WHEN ${barrio}::text IS NOT NULL THEN (${dane}::text IS NULL OR l2.municipio_dane = ${dane})
             AND (norm_txt(l2.barrio) LIKE '%' || norm_txt(${barrio}) || '%' OR norm_txt(l2.comuna) LIKE '%' || norm_txt(${barrio}) || '%')
           ELSE l2.municipio_dane = ${dane} END)) AS salidas_periodo,
      (SELECT count(*)::int FROM listing_price_change c JOIN z ON z.id = c.listing_id
         WHERE c.fecha > now() - make_interval(days => ${dias}) AND c.precio_nuevo < c.precio_antes) AS rebajas_periodo,
      (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY (c.precio_nuevo - c.precio_antes)::numeric / NULLIF(c.precio_antes, 0))
         FROM listing_price_change c JOIN z ON z.id = c.listing_id
         WHERE c.fecha > now() - make_interval(days => ${dias}) AND c.precio_nuevo < c.precio_antes) AS rebaja_mediana
    FROM z`;

  // Demanda: pedidos con barrio dentro de la zona (espacial) o, si no, por municipio / texto.
  const [demanda] = await sql`
    WITH bz AS (
      SELECT id FROM fynder_barrio b WHERE CASE
        WHEN ${punto} THEN b.pt IS NOT NULL AND ST_DWithin(b.pt::geography, ST_SetSRID(ST_MakePoint(${f.lon ?? 0}, ${f.lat ?? 0}), 4326)::geography, ${radio})
        WHEN ${barrio}::text IS NOT NULL THEN (${dane}::text IS NULL OR b.municipio_dane = ${dane})
             AND (norm_txt(b.nombre) LIKE '%' || norm_txt(${barrio}) || '%' OR norm_txt(b.comuna) LIKE '%' || norm_txt(${barrio}) || '%')
        ELSE b.municipio_dane = ${dane} END
    ),
    d AS (
      SELECT d.*, (d.barrio_ids && ARRAY(SELECT id FROM bz)) AS por_barrio
      FROM demand_request d
      WHERE d.fecha > now() - make_interval(days => ${dias})
        AND COALESCE(d.estado, '') NOT IN ('retirado', 'reemplazado')
        AND COALESCE(d.negocio, 'venta') = 'venta'
        AND (cardinality(d.tipos) = 0 OR ${tipo}::text = 'todos' OR EXISTS (SELECT 1 FROM unnest(d.tipos) t WHERE t LIKE ${tipo} || '%'))
        AND (
          d.barrio_ids && ARRAY(SELECT id FROM bz)
          OR (${barrio}::text IS NOT NULL AND EXISTS (SELECT 1 FROM unnest(d.zonas_texto) zt WHERE norm_txt(zt) LIKE '%' || norm_txt(${barrio}) || '%'))
          OR (NOT ${punto} AND ${barrio}::text IS NULL AND ${dane}::text = ANY(d.municipios_dane))
        )
    )
    SELECT count(*)::int AS pedidos,
      count(*) FILTER (WHERE por_barrio)::int AS pedidos_por_barrio,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY presupuesto) FILTER (WHERE presupuesto >= 30000000)::bigint AS presupuesto_mediana,
      avg(presupuesto) FILTER (WHERE presupuesto >= 30000000)::bigint AS presupuesto_promedio,
      percentile_cont(0.25) WITHIN GROUP (ORDER BY presupuesto) FILTER (WHERE presupuesto >= 30000000)::bigint AS presupuesto_p25,
      percentile_cont(0.75) WITHIN GROUP (ORDER BY presupuesto) FILTER (WHERE presupuesto >= 30000000)::bigint AS presupuesto_p75
    FROM d`;

  const proyectos = await sql`
    SELECT count(*)::int AS proyectos,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY precio_m2_desde)::bigint AS precio_m2_desde_mediana,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY precio_desde)::bigint AS precio_desde_mediana,
      (SELECT json_object_agg(entrega, n) FROM (SELECT entrega, count(*)::int n FROM project p2
         WHERE p2.estado = 'activo' AND p2.entrega IS NOT NULL AND CASE
           WHEN ${punto} THEN p2.geom IS NOT NULL AND ST_DWithin(p2.geom::geography, ST_SetSRID(ST_MakePoint(${f.lon ?? 0}, ${f.lat ?? 0}), 4326)::geography, ${radio})
           WHEN ${barrio}::text IS NOT NULL THEN (${dane}::text IS NULL OR p2.municipio_dane = ${dane}) AND norm_txt(p2.barrio) LIKE '%' || norm_txt(${barrio}) || '%'
           ELSE p2.municipio_dane = ${dane} END GROUP BY entrega ORDER BY entrega) e) AS entregas_por_anio,
      (SELECT json_agg(c) FROM (SELECT k.nombre, count(*)::int AS proyectos FROM project p3 JOIN constructora k ON k.id = p3.constructora_id
         WHERE p3.estado = 'activo' AND CASE
           WHEN ${punto} THEN p3.geom IS NOT NULL AND ST_DWithin(p3.geom::geography, ST_SetSRID(ST_MakePoint(${f.lon ?? 0}, ${f.lat ?? 0}), 4326)::geography, ${radio})
           WHEN ${barrio}::text IS NOT NULL THEN (${dane}::text IS NULL OR p3.municipio_dane = ${dane}) AND norm_txt(p3.barrio) LIKE '%' || norm_txt(${barrio}) || '%'
           ELSE p3.municipio_dane = ${dane} END GROUP BY k.nombre ORDER BY count(*) DESC LIMIT 8) c) AS constructoras
    FROM project p
    WHERE p.estado = 'activo' AND CASE
      WHEN ${punto} THEN p.geom IS NOT NULL AND ST_DWithin(p.geom::geography, ST_SetSRID(ST_MakePoint(${f.lon ?? 0}, ${f.lat ?? 0}), 4326)::geography, ${radio})
      WHEN ${barrio}::text IS NOT NULL THEN (${dane}::text IS NULL OR p.municipio_dane = ${dane}) AND norm_txt(p.barrio) LIKE '%' || norm_txt(${barrio}) || '%'
      ELSE p.municipio_dane = ${dane} END`;

  const tendencia = mun
    ? await sql`SELECT to_char(mes, 'YYYY-MM') AS mes, zona, m2_mediana::bigint, var_m2_pct, activos, salieron, pedidos, suficiente
                FROM market_index WHERE norm_txt(municipio) = norm_txt(${mun.nombre}) AND nivel = 'municipio' ORDER BY mes DESC LIMIT 6`
    : [];

  const o = oferta as any, d = demanda as any;
  const promedioContaminado = d.presupuesto_mediana && d.presupuesto_promedio ? d.presupuesto_promedio / d.presupuesto_mediana > 2.5 : false;
  const mesesVentaEstimados = o.dias_inventario_promedio ? Math.round((o.dias_inventario_promedio * 2) / 30) : null;
  const absorcionMes = o.salidas_periodo ? Math.round((o.salidas_periodo / dias) * 30 * 10) / 10 : null;

  return {
    zona: { municipio: mun?.nombre ?? null, barrio, punto: punto ? { lat: f.lat, lon: f.lon, radio_m: radio } : null, tipo, ventana_dias: dias },
    oferta: {
      inventario_activo: o.inventario, precio_p25: o.p25, precio_mediana: o.mediana, precio_p75: o.p75,
      precio_m2_p25: o.precio_m2_p25, precio_m2_mediana: o.precio_m2_mediana, precio_m2_p75: o.precio_m2_p75,
      precio_m2_nuevo_o_sobre_planos: o.precio_m2_nuevo, precio_m2_usado: o.precio_m2_usado,
      nuevos_o_sobre_planos: o.nuevos_o_sobre_planos, mix_habitaciones: o.mix_habitaciones ?? [],
      dias_inventario_promedio: o.dias_inventario_promedio,
      baja_confianza: o.inventario < MIN_MUESTRA,
    },
    demanda: {
      pedidos_compradores: d.pedidos, pedidos_ubicados_por_barrio: d.pedidos_por_barrio,
      presupuesto_p25: d.presupuesto_p25, presupuesto_mediana: d.presupuesto_mediana, presupuesto_p75: d.presupuesto_p75,
      presupuesto_promedio: promedioContaminado ? null : d.presupuesto_promedio,
      promedio_descartado_por_outliers: promedioContaminado,
      baja_confianza: d.pedidos < MIN_MUESTRA,
    },
    ritmo: {
      salidas_del_mercado_periodo: o.salidas_periodo, absorcion_observada_mes: absorcionMes,
      meses_venta_estimados: mesesVentaEstimados,
      rebajas_de_precio_periodo: o.rebajas_periodo,
      rebaja_mediana_pct: o.rebaja_mediana ? Math.round(o.rebaja_mediana * 1000) / 10 : null,
      nota: "meses_venta_estimados = antigüedad promedio del inventario activo × 2 (en estado estacionario el inventario vivo tiene la mitad de su vida).",
    },
    proyectos_nuevos: proyectos[0],
    tendencia_municipio: tendencia,
    procedencia: [
      { fuente: "Fynder (avisos y pedidos, vista celula_export)", tipo: "anunciado" },
      { fuente: "Zonario (proyectos de vivienda nueva)", tipo: "anunciado", atribucion: "Zonario, zonario.co" },
    ],
    lectura: [
      "Precios de oferta (pedidos), no de cierre.",
      "La relación pedidos/inventario es direccional: compara zonas, no es 'compradores por inmueble'.",
    ],
  };
}
