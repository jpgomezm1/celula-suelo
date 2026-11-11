// Ranking de oportunidades de suelo: potencial normativo × mercado. Todo es inferencia y cada punto se explica.
import { sql } from "./db";
import { resolverMunicipio } from "./mercado";

export type OportunidadesInput = { municipio?: string; area_min?: number; limite?: number };

export async function oportunidades(f: OportunidadesInput) {
  const mun = await resolverMunicipio(f.municipio);
  const limite = Math.min(f.limite ?? 15, 40);
  const rows = await sql`
    WITH c AS (
      SELECT id, municipio, municipio_dane, barrio_catastral, area_lote, tratamiento, area_construible_restante_inferida AS restante,
             viviendas_max_inferidas, valor_suelo_m2, geom, ST_SetSRID(ST_MakePoint(lon, lat), 4326) AS pt, lat, lon
      FROM parcel_profile
      WHERE potencial_preliminar AND area_lote >= ${f.area_min ?? 800}
        AND (${mun?.dane ?? null}::text IS NULL OR municipio_dane = ${mun?.dane ?? null})
      ORDER BY area_construible_restante_inferida DESC NULLS LAST
      LIMIT 250
    )
    SELECT c.id, c.municipio, c.barrio_catastral AS barrio, round(c.area_lote) AS area_lote, c.tratamiento,
           c.restante AS area_construible_restante, c.viviendas_max_inferidas, c.valor_suelo_m2,
           round(c.lat::numeric, 6) AS lat, round(c.lon::numeric, 6) AS lon,
           m.inventario, m.precio_m2_mediana, d.pedidos, pr.proyectos, pr.precio_m2_proyectos, lv.lotes_en_venta,
           s.registro AS matricula, fm.matricula_local, s.sucesion, s.derechos_de_cuota, s.dacion_en_pago, s.señal_empresa AS senal_empresa,
           s.fiducia, s.litigio, s.oferta_compra_publica, s.ultima_compraventa,
           (s.ultimo_embargo IS NOT NULL AND (s.ultima_cancelacion IS NULL OR s.ultima_cancelacion < s.ultimo_embargo)) AS embargo_vigente
    FROM c
    LEFT JOIN parcel_senales s ON s.parcel_id = c.id
    LEFT JOIN LATERAL (SELECT f.matricula AS matricula_local FROM parcel_folio f WHERE f.parcel_id = c.id
                       ORDER BY f.por_derecho DESC NULLS LAST LIMIT 1) fm ON true
    CROSS JOIN LATERAL (
      SELECT count(*)::int AS inventario, percentile_cont(0.5) WITHIN GROUP (ORDER BY l.precio_m2)::bigint AS precio_m2_mediana
      FROM listing l WHERE l.activa AND l.negocio = 'venta' AND l.tipo LIKE 'apartamento%' AND l.precio >= 30000000
        AND ST_DWithin(l.geom::geography, c.pt::geography, 1000)) m
    CROSS JOIN LATERAL (
      SELECT count(*)::int AS pedidos FROM demand_request dr
      WHERE dr.fecha > now() - interval '90 days' AND COALESCE(dr.estado, '') NOT IN ('retirado', 'reemplazado')
        AND dr.barrio_ids && ARRAY(SELECT b.id FROM fynder_barrio b WHERE ST_DWithin(b.pt::geography, c.pt::geography, 1000))) d
    CROSS JOIN LATERAL (
      SELECT count(*)::int AS proyectos, percentile_cont(0.5) WITHIN GROUP (ORDER BY p.precio_m2_desde)::bigint AS precio_m2_proyectos
      FROM project p WHERE p.estado = 'activo' AND ST_DWithin(p.geom::geography, c.pt::geography, 1000)) pr
    CROSS JOIN LATERAL (
      SELECT count(*)::int AS lotes_en_venta FROM listing l WHERE l.activa AND l.tipo LIKE 'lote%'
        AND ST_DWithin(l.geom::geography, c.pt::geography, 300)) lv`;

  const maxRest = Math.max(...rows.map((r: any) => Number(r.area_construible_restante) || 0), 1);
  const puntuados = rows.map((r: any) => {
    const restante = Number(r.area_construible_restante) || 0;
    const presion = r.inventario > 0 ? r.pedidos / r.inventario : r.pedidos > 0 ? 1 : 0;
    const precioZona = Number(r.precio_m2_proyectos ?? r.precio_m2_mediana) || 0;
    const relacionSuelo = precioZona && r.valor_suelo_m2 ? precioZona / Number(r.valor_suelo_m2) : null;
    const favorables = [r.sucesion, r.embargo_vigente, r.dacion_en_pago, r.senal_empresa].filter(Boolean).length;
    const riesgos = [r.fiducia, r.litigio, r.oferta_compra_publica].filter(Boolean).length;
    const reciente = r.ultima_compraventa && Date.now() - new Date(r.ultima_compraventa).getTime() < 3 * 365 * 864e5;
    const factores = {
      potencial: Math.round(30 * Math.sqrt(restante / maxRest)),
      demanda: Math.round(20 * Math.min(presion / 0.6, 1)),
      actividad_proyectos: Math.round(10 * Math.min(r.proyectos / 5, 1)),
      precio_vs_suelo: relacionSuelo ? Math.round(10 * Math.min(Math.max((relacionSuelo - 1) / 5, 0), 1)) : 0,
      senales_de_venta: r.matricula ? Math.max(0, Math.min(20, 10 * favorables + (r.derechos_de_cuota ? 4 : 0) - 10 * riesgos - (reciente ? 8 : 0))) : 0,
      lote_anunciado_cerca: r.lotes_en_venta > 0 ? 10 : 0,
    };
    const lecturaVenta = !r.matricula
      ? (r.matricula_local ? `matrícula ${r.matricula_local}: sin actos registrados 2015–2023 (dueño de largo plazo o folio fuera de la base)` : "sin matrícula publicada")
      : [
      r.sucesion && "heredado (sucesión)", r.embargo_vigente && "embargo sin cancelar", r.dacion_en_pago && "dación en pago",
      r.senal_empresa && "titular probable: empresa", r.derechos_de_cuota && "copropiedad", r.fiducia && "en fiducia (riesgo)",
      r.litigio && "litigio (riesgo)", r.oferta_compra_publica && "oferta de compra pública (riesgo)", reciente && "comprado hace poco",
    ].filter(Boolean).join(", ") || "sin señales particulares en 2015–2023";
    const puntaje = Object.values(factores).reduce((a, b) => a + b, 0);
    return {
      ...r, puntaje, factores,
      por_que: [
        `Área construible restante ≈ ${Math.round(restante).toLocaleString("es-CO")} m² (${r.tratamiento})`,
        `${r.pedidos} pedidos de compradores (90 d) frente a ${r.inventario} apartamentos en venta a 1 km`,
        `${r.proyectos} proyectos nuevos a 1 km${r.precio_m2_proyectos ? `, desde $${(Number(r.precio_m2_proyectos) / 1e6).toFixed(1)} M/m²` : ""}`,
        relacionSuelo ? `Precio de venta ≈ ${relacionSuelo.toFixed(1)}× el valor de referencia del suelo por m²` : "Sin valor de suelo de referencia",
        r.matricula ? `Folio ${r.matricula}: ${lecturaVenta}` : `Folio: ${lecturaVenta}`,
        r.lotes_en_venta ? `${r.lotes_en_venta} lote(s) publicado(s) en Fynder a 300 m (ubicación aproximada)` : null,
      ].filter(Boolean),
    };
  }).sort((a: any, b: any) => b.puntaje - a.puntaje).slice(0, limite);

  return {
    municipio: mun?.nombre ?? "17 municipios",
    oportunidades: puntuados,
    metodo: "Puntaje 0–100 = potencial normativo (30) + presión de demanda a 1 km (20) + señales de venta del folio (20: herencia, embargo, dación, empresa; resta fiducia, litigio, oferta pública, compra reciente) + proyectos nuevos (10) + precio de venta vs valor del suelo (10) + lote anunciado cerca (10). Inferencia para priorizar, no un avalúo ni una cabida. Para contactar al dueño usar contacto_predio.",
  };
}
