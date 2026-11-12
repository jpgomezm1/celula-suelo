import { sql } from "./db";
import { resolverMunicipio } from "./mercado";

export type BuscarInput = {
  municipio?: string; barrio?: string; area_min?: number; area_max?: number; tratamiento?: string;
  solo_potencial?: boolean; incluir_amenaza_alta?: boolean; construible_min?: number; gana_pot_2026?: boolean; max_construcciones?: number;
  orden?: "construible_restante" | "area" | "valor_suelo"; limite?: number;
};

export async function buscarLotes(f: BuscarInput) {
  const mun = await resolverMunicipio(f.municipio);
  if (f.municipio && !mun) return { resultados: 0, lotes: [], mensaje: `"${f.municipio}" no está entre los 17 municipios cargados.` };
  const limite = Math.min(f.limite ?? 20, 50);
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
      AND (${f.incluir_amenaza_alta ?? false} OR NOT amenaza_alta)
      AND (${f.gana_pot_2026 ?? false} = false OR EXISTS (SELECT 1 FROM norma_pot2026_equivalencia e JOIN norma_pot2026 n ON n.codigo = e.c26
           WHERE e.c14 = parcel_profile.codigo_tratamiento AND n.ic_residencial > COALESCE(parcel_profile.ic_max, 0)))
      AND (${f.max_construcciones ?? null}::int IS NULL OR COALESCE(construcciones, 0) <= ${f.max_construcciones ?? null})
    ORDER BY
      CASE WHEN ${orden} = 'construible_restante' THEN area_construible_restante_inferida END DESC NULLS LAST,
      CASE WHEN ${orden} = 'area' THEN area_lote END DESC NULLS LAST,
      CASE WHEN ${orden} = 'valor_suelo' THEN valor_suelo_m2 END ASC NULLS LAST,
      area_lote DESC
    LIMIT ${limite}`;
  return {
    filtro: { municipio: mun?.nombre ?? "todos", ...f },
    resultados: rows.length,
    lotes: rows,
    nota: "potencial_preliminar, área construible y viviendas máximas son inferencias propias (orientativas). En municipios con POT derogado en la fuente o sin capa de tratamientos no se marca potencial.",
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
