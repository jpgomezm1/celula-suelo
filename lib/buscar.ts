import { sql } from "./db";
import { resolverMunicipio } from "./mercado";

export type BuscarInput = {
  municipio?: string; barrio?: string; area_min?: number; area_max?: number; tratamiento?: string;
  solo_potencial?: boolean; incluir_amenaza_alta?: boolean; construible_min?: number; gana_pot_2026?: boolean; max_construcciones?: number;
  orden?: "construible_restante" | "area" | "valor_suelo"; limite?: number;
  max_pct_retiro?: number; excluir_cauce?: boolean; excluir_arboles_patrimoniales?: boolean; excluir_plan_parcial?: boolean;
};

/** Restricciones físicas por lote, en lote (mismo criterio que restricciones.ts, simplificado para muchos lotes a la vez). */
async function restriccionesEnLote(ids: string[]) {
  if (!ids.length) return new Map<string, any>();
  const rows = await sql`
    WITH l AS (SELECT id, municipio_dane, geom, ST_Transform(geom, 9377) g, greatest(ST_Area(ST_Transform(geom, 9377)), 1) a FROM parcel WHERE id = ANY(${ids}))
    SELECT l.id,
      EXISTS (SELECT 1 FROM hidro_cauce c WHERE NOT coalesce(c.canalizado, false) AND c.geom && l.geom AND ST_Intersects(c.geom, l.geom)) AS cauce_cruza,
      coalesce((SELECT ST_Area(ST_Intersection(ST_Union(ST_Transform(r.geom, 9377)), l.g)) FROM hidro_retiro r WHERE r.geom && l.geom AND ST_Intersects(r.geom, l.geom)), 0) AS m2_oficial,
      CASE WHEN l.municipio_dane = '05001' THEN 0 ELSE coalesce((SELECT ST_Area(ST_Intersection(ST_Union(ST_Buffer(ST_Transform(c.geom, 9377), 30)), l.g))
        FROM hidro_cauce c WHERE NOT coalesce(c.canalizado, false) AND c.geom && ST_Expand(l.geom, 0.0004) AND ST_DWithin(c.geom::geography, l.geom::geography, 30)
          AND NOT EXISTS (SELECT 1 FROM hidro_retiro r WHERE r.geom && ST_Expand(c.geom, 0.0001) AND ST_DWithin(r.geom::geography, c.geom::geography, 5))), 0) END AS m2_faja,
      (SELECT count(*) FROM arbol a WHERE a.patrimonial AND a.geom && l.geom AND ST_Intersects(a.geom, l.geom))::int AS patrimoniales,
      (SELECT string_agg(DISTINCT coalesce(CASE WHEN coalesce(p.nombre, '') ~* '^ *(planes? parcial(es)?)? *$' THEN NULL ELSE p.nombre END, p.codigo, 'plan parcial'), ', ') FROM instrumento_plan p
        WHERE p.geom && l.geom AND ST_Intersects(p.geom, l.geom) AND (p.instrumento || ' ' || coalesce(p.nombre, '')) ~* 'parcial'
          AND ST_Area(ST_Intersection(ST_Transform(p.geom, 9377), l.g)) / l.a > 0.05) AS plan_parcial,
      l.a
    FROM l`;
  return new Map(rows.map((r: any) => {
    const m2 = Math.min(Number(r.a), (Number(r.m2_oficial) || 0) + (Number(r.m2_faja) || 0));
    return [r.id, { pct_en_retiro_hidrico: Math.round((m2 / Number(r.a)) * 1000) / 10, cauce_cruza: r.cauce_cruza, arboles_patrimoniales: r.patrimoniales, plan_parcial: r.plan_parcial }];
  }));
}

export async function buscarLotes(f: BuscarInput) {
  const mun = await resolverMunicipio(f.municipio);
  if (f.municipio && !mun) return { resultados: 0, lotes: [], mensaje: `"${f.municipio}" no está entre los 17 municipios cargados.` };
  const limite = Math.min(f.limite ?? 20, 50);
  const filtraFisico = f.max_pct_retiro != null || f.excluir_cauce || f.excluir_arboles_patrimoniales || f.excluir_plan_parcial;
  const candidatos = filtraFisico ? Math.min(limite * 8, 300) : limite;
  const orden = f.orden ?? "construible_restante";
  const rows = await sql`
    SELECT id, municipio, barrio_catastral AS barrio, clave_local, tipo_lote, area_lote, construcciones, area_construida, pisos_max,
           tratamiento, altura_max, ic_max, densidad_max, norma_fuente, nivel_dato, area_construible_inferida,
           area_construible_restante_inferida, viviendas_max_inferidas, valor_suelo_m2, amenaza_alta, protecciones, licencias,
           potencial_preliminar, round(lat::numeric, 6) AS lat, round(lon::numeric, 6) AS lon
    FROM parcel_profile
    WHERE (${mun?.dane ?? null}::text IS NULL OR municipio_dane = ${mun?.dane ?? null})
      AND area_lote >= ${f.area_min ?? 0}
      AND (${f.area_max ?? null}::numeric IS NULL OR area_lote <= ${f.area_max ?? null}::numeric)
      AND (${f.barrio ?? null}::text IS NULL OR norm_txt(barrio_catastral) LIKE '%' || norm_txt(${f.barrio ?? null}) || '%')
      AND (${f.tratamiento ?? null}::text IS NULL OR norm_txt(tratamiento) LIKE '%' || norm_txt(${f.tratamiento ?? null}) || '%')
      AND (${f.construible_min ?? null}::numeric IS NULL OR area_construible_restante_inferida >= ${f.construible_min ?? null}::numeric)
      AND (${f.solo_potencial ?? true} = false OR potencial_preliminar)
      AND (${f.incluir_amenaza_alta ?? false} OR NOT (amenaza_alta OR array_to_string(amenazas, ',') ~* 'muy alta'))
      AND (${f.gana_pot_2026 ?? false} = false OR codigo_tratamiento IN (SELECT e.c14 FROM norma_pot2026_equivalencia e JOIN norma_pot2026 n ON n.codigo = e.c26
           WHERE n.ic_residencial > COALESCE(e.ic_2014, 0)))
      AND (${f.max_construcciones ?? null}::int IS NULL OR COALESCE(construcciones, 0) <= ${f.max_construcciones ?? null})
    ORDER BY
      CASE WHEN ${orden} = 'construible_restante' THEN area_construible_restante_inferida END DESC NULLS LAST,
      CASE WHEN ${orden} = 'area' THEN area_lote END DESC NULLS LAST,
      CASE WHEN ${orden} = 'valor_suelo' THEN valor_suelo_m2 END ASC NULLS LAST,
      area_lote DESC
    LIMIT ${candidatos}`;
  const rs = await restriccionesEnLote(rows.map((r: any) => r.id));
  const conRs = rows.map((r: any) => ({ ...r, ...(rs.get(r.id) ?? {}) }));
  const pasan = conRs.filter((r: any) =>
    (f.max_pct_retiro == null || (r.pct_en_retiro_hidrico ?? 0) <= f.max_pct_retiro) &&
    (!f.excluir_cauce || !r.cauce_cruza) &&
    (!f.excluir_arboles_patrimoniales || !r.arboles_patrimoniales) &&
    (!f.excluir_plan_parcial || !r.plan_parcial));
  const lotes = pasan.slice(0, limite);
  return {
    filtro: { municipio: mun?.nombre ?? "todos", ...f },
    resultados: lotes.length,
    ...(filtraFisico ? { revisados: rows.length, descartados_por_restricciones: rows.length - pasan.length } : {}),
    lotes,
    nota: "potencial_preliminar, área construible y viviendas máximas son inferencias propias (orientativas). En municipios con POT derogado en la fuente o sin capa de tratamientos no se marca potencial. " +
      "Retiro hídrico: oficial del POT en Medellín, Envigado, Sabaneta, Itagüí, Bello y La Estrella; en los demás municipios, y en los cauces sin retiro oficial, faja de referencia de 30 m a cauces naturales. Árboles patrimoniales: solo hay censo en Medellín. Para el detalle de un lote usa consulta_norma.",
  };
}

export async function cobertura() {
  const rows = await sql`
    SELECT m.dane, m.nombre, m.region, m.grupo, m.cobertura,
      (SELECT count(*)::int FROM parcel p WHERE p.municipio_dane = m.dane) AS predios,
      (SELECT count(*)::int FROM building b WHERE b.municipio_dane = m.dane) AS construcciones,
      (SELECT count(*)::int FROM parcel_profile pp WHERE pp.municipio_dane = m.dane AND pp.potencial_preliminar) AS lotes_con_potencial,
      (SELECT count(*)::int FROM listing l WHERE l.municipio_dane = m.dane AND l.activa AND l.negocio = 'venta') AS avisos_en_venta,
      (SELECT count(*)::int FROM demand_request d WHERE m.dane = ANY(d.municipios_dane) AND d.fecha > now() - interval '90 days') AS pedidos_90d,
      (SELECT count(*)::int FROM project pr WHERE pr.municipio_dane = m.dane AND pr.estado = 'activo') AS proyectos_nuevos,
      (SELECT array_agg(DISTINCT z.capa) FROM zoning_layer z WHERE z.municipio_dane = m.dane) AS capas
    FROM municipio m ORDER BY m.grupo, m.nombre`;
  return {
    municipios: rows,
    leyenda: {
      A: "Catastro + norma numérica oficial (Medellín)",
      B: "Catastro + norma numérica del servicio municipal (vigencia por verificar)",
      C: "Catastro + tratamiento; norma numérica digitalizada solo donde el POT del servicio sigue vigente (Girardota)",
      D: "Oriente: catastro, amenazas y mercado; sin polígonos públicos de tratamiento",
    },
  };
}

export async function fuentes() {
  const rows = await sql`
    SELECT DISTINCT ON (fuente) fuente, nombre, tipo_dato, licencia, notas, esperado, registros,
           to_char(fetched_at, 'YYYY-MM-DD HH24:MI') AS capturado
    FROM source_snapshot WHERE registros IS NOT NULL ORDER BY fuente, fetched_at DESC`;
  return { fuentes: rows };
}
