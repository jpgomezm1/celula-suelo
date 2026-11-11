import { sql } from "./db";
import { resolverMunicipio } from "./mercado";

const ATRIBUCION = "Fuente: Zonario, zonario.co (datos anunciados; confirmar con la constructora)";

export type BuscarProyectos = {
  municipio?: string; barrio?: string; constructora?: string; lat?: number; lon?: number; radio_m?: number;
  precio_min?: number; precio_max?: number; precio_m2_max?: number; entrega_hasta?: string; habitaciones?: number;
  vis?: boolean; limite?: number; orden?: "precio" | "precio_m2" | "entrega" | "distancia";
};

export async function buscarProyectos(f: BuscarProyectos) {
  const mun = await resolverMunicipio(f.municipio);
  const punto = f.lat !== undefined && f.lon !== undefined;
  const limite = Math.min(f.limite ?? 20, 50);
  const rows = await sql`
    SELECT p.id, p.nombre, k.nombre AS constructora, m.nombre AS municipio, p.barrio, p.entrega, p.etapa,
           p.precio_desde, p.precio_hasta, p.precio_m2_desde, p.area_min, p.area_max, p.habitaciones, p.unidades AS tipologias_ofertadas,
           p.tipo, ST_Y(p.geom) AS lat, ST_X(p.geom) AS lon, p.parcel_id,
           CASE WHEN ${punto} THEN round(ST_Distance(p.geom::geography, ST_SetSRID(ST_MakePoint(${f.lon ?? 0}, ${f.lat ?? 0}), 4326)::geography)) END AS distancia_m,
           (SELECT url FROM project_source s WHERE s.project_id = p.id AND s.activo ORDER BY fetched_at DESC LIMIT 1) AS url_fuente,
           (SELECT (datos->>'vis')::boolean FROM project_source s WHERE s.project_id = p.id ORDER BY fetched_at DESC LIMIT 1) AS vis
    FROM project p
    LEFT JOIN constructora k ON k.id = p.constructora_id
    LEFT JOIN municipio m ON m.dane = p.municipio_dane
    WHERE p.estado = 'activo'
      AND (${mun?.dane ?? null}::text IS NULL OR p.municipio_dane = ${mun?.dane ?? null})
      AND (${f.barrio ?? null}::text IS NULL OR norm_txt(p.barrio) LIKE '%' || norm_txt(${f.barrio ?? null}) || '%' OR norm_txt(p.nombre) LIKE '%' || norm_txt(${f.barrio ?? null}) || '%')
      AND (${f.constructora ?? null}::text IS NULL OR norm_txt(k.nombre) LIKE '%' || norm_txt(${f.constructora ?? null}) || '%')
      AND (NOT ${punto} OR ST_DWithin(p.geom::geography, ST_SetSRID(ST_MakePoint(${f.lon ?? 0}, ${f.lat ?? 0}), 4326)::geography, ${f.radio_m ?? 2000}))
      AND (${f.precio_min ?? null}::bigint IS NULL OR p.precio_hasta >= ${f.precio_min ?? null}::bigint)
      AND (${f.precio_max ?? null}::bigint IS NULL OR p.precio_desde <= ${f.precio_max ?? null}::bigint)
      AND (${f.precio_m2_max ?? null}::numeric IS NULL OR p.precio_m2_desde <= ${f.precio_m2_max ?? null}::numeric)
      AND (${f.entrega_hasta ?? null}::text IS NULL OR p.entrega <= ${f.entrega_hasta ?? null}::text)
      AND (${f.habitaciones ?? null}::text IS NULL OR p.habitaciones LIKE '%' || ${f.habitaciones ?? null}::text || '%')
    ORDER BY
      CASE WHEN ${f.orden ?? "precio"} = 'distancia' AND ${punto} THEN ST_Distance(p.geom::geography, ST_SetSRID(ST_MakePoint(${f.lon ?? 0}, ${f.lat ?? 0}), 4326)::geography) END,
      CASE WHEN ${f.orden ?? "precio"} = 'precio_m2' THEN p.precio_m2_desde END,
      CASE WHEN ${f.orden ?? "precio"} = 'entrega' THEN p.entrega END,
      p.precio_desde NULLS LAST
    LIMIT ${limite}`;
  const filtrados = f.vis === undefined ? rows : rows.filter((r: any) => r.vis === f.vis);
  return { resultados: filtrados.length, proyectos: filtrados, atribucion: ATRIBUCION };
}

export async function fichaProyecto(id: number) {
  const [p] = await sql`
    SELECT p.*, ST_Y(p.geom) AS lat, ST_X(p.geom) AS lon, k.nombre AS constructora, m.nombre AS municipio
    FROM project p LEFT JOIN constructora k ON k.id = p.constructora_id LEFT JOIN municipio m ON m.dane = p.municipio_dane
    WHERE p.id = ${id}`;
  if (!p) return { encontrado: false };
  const [historia, fuentes, competencia, predio] = await Promise.all([
    sql`SELECT fecha, precio_desde, precio_hasta, precio_m2_desde FROM project_snapshot WHERE project_id = ${id} ORDER BY fecha`,
    sql`SELECT fuente, url, to_char(fetched_at, 'YYYY-MM-DD') AS capturado, activo FROM project_source WHERE project_id = ${id}`,
    sql`SELECT q.id, q.nombre, k.nombre AS constructora, q.precio_desde, q.precio_m2_desde, q.entrega,
               round(ST_Distance(q.geom::geography, ${p.lon !== null ? sql`ST_SetSRID(ST_MakePoint(${p.lon}, ${p.lat}), 4326)` : sql`NULL`}::geography)) AS distancia_m
        FROM project q LEFT JOIN constructora k ON k.id = q.constructora_id
        WHERE q.id <> ${id} AND q.estado = 'activo' AND q.geom IS NOT NULL AND ${p.lat !== null}
          AND ST_DWithin(q.geom::geography, ST_SetSRID(ST_MakePoint(${p.lon ?? 0}, ${p.lat ?? 0}), 4326)::geography, 1500)
        ORDER BY distancia_m LIMIT 10`,
    p.parcel_id ? sql`SELECT id, area_lote, tratamiento, altura_max, ic_max, densidad_max, norma_fuente FROM parcel_profile WHERE id = ${p.parcel_id}` : Promise.resolve([]),
  ]);
  return {
    encontrado: true,
    proyecto: {
      id: p.id, nombre: p.nombre, constructora: p.constructora, municipio: p.municipio, barrio: p.barrio,
      lat: p.lat, lon: p.lon, entrega: p.entrega, etapa: p.etapa, tipo: p.tipo,
      precio_desde: p.precio_desde, precio_hasta: p.precio_hasta, precio_m2_desde: p.precio_m2_desde,
      area_min: p.area_min, area_max: p.area_max, habitaciones: p.habitaciones, tipologias: p.tipologias,
      primera_vez_visto: p.primera_vez, estado: p.estado,
    },
    historial_precios: historia,
    competencia_1500m: competencia,
    predio: predio[0] ?? null,
    fuentes,
    atribucion: ATRIBUCION,
  };
}

export async function constructoraPortafolio(nombre: string) {
  const ks = await sql`SELECT id, nombre, alias FROM constructora WHERE norm_txt(nombre) LIKE '%' || norm_txt(${nombre}) || '%'
                       OR EXISTS (SELECT 1 FROM unnest(alias) a WHERE norm_txt(a) LIKE '%' || norm_txt(${nombre}) || '%') LIMIT 5`;
  if (!ks.length) return { encontrada: false, mensaje: `No hay proyectos de "${nombre}" en el catálogo.` };
  const ids = ks.map((k: any) => k.id);
  const proyectos = await sql`
    SELECT p.id, p.nombre, m.nombre AS municipio, p.barrio, p.precio_desde, p.precio_hasta, p.precio_m2_desde, p.entrega, p.estado
    FROM project p LEFT JOIN municipio m ON m.dane = p.municipio_dane
    WHERE p.constructora_id = ANY(${ids}) ORDER BY p.estado, p.entrega NULLS LAST`;
  const activos = proyectos.filter((p: any) => p.estado === "activo");
  const m2 = activos.map((p: any) => Number(p.precio_m2_desde)).filter(Boolean).sort((a, b) => a - b);
  return {
    encontrada: true,
    constructoras: ks,
    resumen: {
      proyectos_activos: activos.length,
      municipios: [...new Set(activos.map((p: any) => p.municipio))],
      precio_m2_desde_mediana: m2.length ? m2[Math.floor(m2.length / 2)] : null,
      entregas: [...new Set(activos.map((p: any) => p.entrega).filter(Boolean))].sort(),
    },
    proyectos,
    nota: "Para finanzas, representantes legales y contratos públicos de la constructora, la siguiente fase conecta Croma (RUES, Supersociedades, SECOP).",
    atribucion: ATRIBUCION,
  };
}
