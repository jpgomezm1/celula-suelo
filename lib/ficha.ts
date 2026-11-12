import { procedencias, sql } from "./db";
import { mercadoZona } from "./mercado";
import { correr, millones } from "./prefactibilidad";
import { avisoPOT } from "./norma_aviso";
import { bloque2026Predio } from "./norma2026";

const INFERENCIA = "Cálculo propio con la norma y el catastro; orientativo. No reemplaza un estudio de cabida ni la consulta a Planeación.";

export type FichaInput = { id?: string; cbml?: string; clave?: string; municipio?: string; lat?: number; lon?: number };

/** Encuentra el predio: id "dane:clave", CBML de Medellín, clave local + municipio, o coordenada. */
export async function encontrarPredio(f: FichaInput): Promise<any | null> {
  if (f.id) return (await sql`SELECT * FROM parcel_profile WHERE id = ${f.id}`)[0] ?? null;
  if (f.cbml) return (await sql`SELECT * FROM parcel_profile WHERE id = ${"05001:" + f.cbml}`)[0] ?? null;
  if (f.clave) {
    const rows = await sql`SELECT pp.* FROM parcel_profile pp JOIN municipio m ON m.dane = pp.municipio_dane
                           WHERE pp.clave_local = ${f.clave} AND (${f.municipio ?? null}::text IS NULL
                             OR m.dane = ${f.municipio ?? null} OR norm_txt(m.nombre) = norm_txt(${f.municipio ?? null})) LIMIT 1`;
    return rows[0] ?? null;
  }
  if (f.lat !== undefined && f.lon !== undefined) {
    return (await sql`SELECT * FROM parcel_profile WHERE ST_Contains(geom, ST_SetSRID(ST_MakePoint(${f.lon}, ${f.lat}), 4326))
                      ORDER BY area_lote LIMIT 1`)[0] ?? null;
  }
  return null;
}

const n = (v: unknown) => (v === null || v === undefined ? null : Number(v));

/** Prefactibilidad rápida con supuestos explícitos: el número que importa es el lote máximo pagable. */
export function prefactibilidadRapida(p: any, mercado: any, opciones: { costo_lote?: number; area_unidad?: number; precio_m2?: number; plazo_obra_meses?: number; costos?: any } = {}) {
  const construible = n(p.area_construible_inferida) ?? (n(p.altura_max) && n(p.io_max) ? null : null);
  if (!construible || construible <= 0) {
    return { disponible: false, motivo: "Sin área construible calculable (no hay índice de construcción ni altura × ocupación para este predio)." };
  }
  const o = mercado.oferta, d = mercado.demanda;
  const precioM2 = opciones.precio_m2 ?? o.precio_m2_nuevo_o_sobre_planos ?? o.precio_m2_mediana;
  if (!precioM2) return { disponible: false, motivo: "Sin precio por m² de referencia en la zona." };
  const areaUnidad = opciones.area_unidad ?? (o.precio_mediana && o.precio_m2_mediana ? Math.round(o.precio_mediana / o.precio_m2_mediana) : 80);
  const areaVendible = construible * 0.8; // 20 % para zonas comunes y circulaciones (regla de comite-de-tierras)
  let unidades = Math.max(1, Math.floor(areaVendible / areaUnidad));
  const topeDensidad = n(p.viviendas_max_inferidas);
  if (topeDensidad && topeDensidad > 0 && unidades > topeDensidad) unidades = topeDensidad;
  const costoLote = opciones.costo_lote ?? (n(p.valor_suelo_m2) && n(p.area_lote) ? Math.round(n(p.valor_suelo_m2)! * n(p.area_lote)!) : 0);
  const r = correr({
    producto: { unidades, area_promedio_m2: areaUnidad, precio_m2: precioM2 },
    lote: { costo: costoLote },
    plazo_obra_meses: opciones.plazo_obra_meses,
    costos: opciones.costos,
    mercado: {
      inventario_activo: o.inventario_activo, dias_inventario_promedio: o.dias_inventario_promedio,
      precio_p25: o.precio_p25, precio_mediana: o.precio_mediana, precio_p75: o.precio_p75,
      pedidos_compradores: d.pedidos_compradores, presupuesto_pedidos_mediana: d.presupuesto_mediana,
      presupuesto_pedidos_promedio: d.presupuesto_promedio,
    },
  }) as any;
  if (r.error) return { disponible: false, motivo: `Faltan datos: ${r.faltantes.join(", ")}` };
  return {
    disponible: true,
    veredicto: r.veredicto,
    resumen: r.resumen,
    lote_maximo_pagable: r.financiero.lote_maximo_pagable,
    lote_maximo_legible: r.financiero.lote_maximo_legible,
    producto_supuesto: { unidades, area_unidad_m2: areaUnidad, precio_m2: Math.round(precioM2), precio_unidad: millones(unidades && areaUnidad * precioM2) },
    costo_lote_usado: { valor: costoLote, legible: millones(costoLote),
      origen: opciones.costo_lote ? "dado por el usuario" : "valor catastral del suelo × área (suele estar muy por debajo del precio real: úsalo solo como piso)" },
    margen: r.financiero.margen_sobre_ventas,
    indice_tension: r.mercado.indice_tension_banda,
    meses_para_agotar: r.mercado.meses_para_agotar,
    alertas: r.alertas,
    sensibilidad: r.sensibilidad,
    supuestos: { ...r.supuestos, area_vendible: "área construible × 0,8", unidades_limitadas_por_densidad: topeDensidad != null && unidades === topeDensidad },
    tipo: "inferencia",
    nota: "Modelo de Fynder comite-de-tierras (prefactibilidad comercial) alimentado con la norma del predio. " + INFERENCIA,
  };
}

export async function fichaPredio(f: FichaInput) {
  const p = await encontrarPredio(f);
  if (!p) return { encontrado: false, mensaje: "No encontré ese predio en los 17 municipios cargados. Prueba con el id 'dane:clave', el CBML (Medellín) o una coordenada." };

  const lat = Number(p.lat), lon = Number(p.lon);
  const [src, construcciones, amenazas, protecciones, licencias, proyectos, lotesVenta, mercado] = await Promise.all([
    procedencias(),
    sql`SELECT pisos, area_construida, huella_m2, uso FROM building WHERE parcel_id = ${p.id} ORDER BY area_construida DESC NULLS LAST LIMIT 10`,
    sql`SELECT DISTINCT z.attrs->>'tipo' AS tipo, z.attrs->>'grado' AS grado, z.fuente FROM zoning_layer z JOIN parcel x ON x.id = ${p.id}
        WHERE z.capa = 'amenaza' AND z.municipio_dane = x.municipio_dane AND ST_Intersects(z.geom, x.geom)`,
    sql`SELECT DISTINCT z.attrs->>'categoria' AS categoria, z.subtipo FROM zoning_layer z JOIN parcel x ON x.id = ${p.id}
        WHERE z.capa = 'proteccion' AND z.municipio_dane = x.municipio_dane AND ST_Intersects(z.geom, x.geom)`,
    sql`SELECT anio, curaduria, objeto, nombre_proyecto, radicado FROM licence WHERE parcel_id = ${p.id} ORDER BY anio DESC NULLS LAST LIMIT 8`,
    sql`SELECT q.id, q.nombre, k.nombre AS constructora, q.precio_desde, q.precio_m2_desde, q.entrega,
               round(ST_Distance(q.geom::geography, ST_SetSRID(ST_MakePoint(${lon}, ${lat}), 4326)::geography)) AS distancia_m
        FROM project q LEFT JOIN constructora k ON k.id = q.constructora_id
        WHERE q.estado = 'activo' AND ST_DWithin(q.geom::geography, ST_SetSRID(ST_MakePoint(${lon}, ${lat}), 4326)::geography, 1500)
        ORDER BY distancia_m LIMIT 8`,
    sql`SELECT l.id AS fynder_id, l.titulo, l.barrio, l.precio, l.area, l.area_lote, l.precio_m2, l.ubicacion_aproximada,
               round(ST_Distance(l.geom::geography, ST_SetSRID(ST_MakePoint(${lon}, ${lat}), 4326)::geography)) AS distancia_m
        FROM listing l
        WHERE l.activa AND l.negocio = 'venta' AND l.tipo LIKE 'lote%'
          AND ST_DWithin(l.geom::geography, ST_SetSRID(ST_MakePoint(${lon}, ${lat}), 4326)::geography, 2000)
        ORDER BY distancia_m LIMIT 8`,
    mercadoZona({ lat, lon, radio_m: 1500, tipo: "apartamento" }),
  ]);

  const valorLote = n(p.valor_suelo_m2) && n(p.area_lote) ? Math.round(n(p.valor_suelo_m2)! * n(p.area_lote)!) : null;
  const advertenciaNorma =
    p.pot_servicio === "derogado" ? `La capa pública de tratamientos de ${p.municipio} corresponde a un POT derogado; el vigente es ${p.acuerdo_vigente}. El tratamiento se muestra solo como referencia.`
    : p.norma_fuente === "digitalizada_pendiente" ? `Norma digitalizada del ${p.norma_acuerdo} (${p.norma_articulo}); pendiente de validación profesional.`
    : p.grupo === "D" ? "No hay polígonos públicos de tratamiento para este municipio: la ficha muestra catastro, restricciones y mercado."
    : p.pot_servicio === "por_verificar" ? "Norma tomada del servicio público del municipio; vigencia del POT por verificar."
    : null;

  const pot2026 = await bloque2026Predio(p);
  return {
    encontrado: true,
    pot_2026_preliminar: pot2026,
    id: p.id,
    ubicacion: { municipio: p.municipio, barrio: p.barrio_catastral, clave_catastral: p.clave_local, clase: p.clase === "U" ? "urbano" : "rural", lat, lon },
    nivel_dato: p.nivel_dato,
    lote: { area_lote_m2: n(p.area_lote), tipo_lote: p.tipo_lote, desarrollable_por_tipo: p.tipo_desarrollable },
    construcciones: {
      cantidad: p.construcciones, area_construida_m2: n(p.area_construida), pisos_max: n(p.pisos_max),
      ocupacion_actual: n(p.ocupacion_actual), detalle: construcciones,
    },
    norma: {
      tratamiento: p.tratamiento, codigo: p.codigo_tratamiento, altura_max_pisos: n(p.altura_max), altura_texto: p.altura_texto,
      indice_construccion_max: n(p.ic_max), indice_construccion_con_derechos: n(p.ic_total),
      densidad_max_viv_ha: n(p.densidad_max), indice_ocupacion_max: n(p.io_max), uso_general: p.uso,
      fuente_norma: p.norma_fuente, acuerdo_vigente: p.acuerdo_vigente, advertencia: advertenciaNorma, aviso_pot: avisoPOT(p.municipio_dane),
    },
    restricciones: { amenazas, amenaza_alta: p.amenaza_alta, protecciones },
    valor_suelo: {
      valor_m2: n(p.valor_suelo_m2), tipo: p.valor_tipo, vigencia: p.valor_vigencia,
      valor_suelo_lote_estimado: valorLote, valor_suelo_lote_legible: millones(valorLote),
      nota: "Valor del suelo por zona (catastral o de referencia), no precio de mercado del lote.",
    },
    licencias_historicas: { cantidad: p.licencias, ultima: p.ultima_licencia, detalle: licencias },
    potencial: {
      potencial_preliminar: p.potencial_preliminar,
      area_construible_m2: n(p.area_construible_inferida),
      area_construible_restante_m2: n(p.area_construible_restante_inferida),
      viviendas_max_por_densidad: n(p.viviendas_max_inferidas),
      aprovechamiento_actual: n(p.aprovechamiento_actual_inferido),
      brecha_pisos: n(p.brecha_pisos_inferida),
      tipo: "inferencia", nota: INFERENCIA,
    },
    mercado_1500m: {
      apartamentos_en_venta: mercado.oferta.inventario_activo,
      precio_mediana: mercado.oferta.precio_mediana, precio_m2_mediana: mercado.oferta.precio_m2_mediana,
      precio_m2_nuevo_o_sobre_planos: mercado.oferta.precio_m2_nuevo_o_sobre_planos,
      pedidos_compradores_90d: mercado.demanda.pedidos_compradores, presupuesto_mediana: mercado.demanda.presupuesto_mediana,
      absorcion_observada_mes: mercado.ritmo.absorcion_observada_mes, meses_venta_estimados: mercado.ritmo.meses_venta_estimados,
      baja_confianza: mercado.oferta.baja_confianza || mercado.demanda.baja_confianza,
    },
    proyectos_nuevos_1500m: proyectos,
    lotes_en_venta_2km: lotesVenta,
    prefactibilidad_rapida: prefactibilidadRapida(p, mercado),
    procedencia: {
      catastro: Object.values(src).find((s) => s.fuente.includes("predios") || s.fuente === "geomed_lotes") ? "Catastro municipal (GeoMedellín / IDEM / GeoAntioquia / Cornare)" : null,
      norma: p.norma_fuente === "servicio" ? "Servicio público de tratamientos del municipio" : p.norma_acuerdo ?? null,
      mercado: "Fynder (anunciado)", proyectos: "Zonario, zonario.co (anunciado)",
      capturas: Object.values(src).filter((s) => ["fynder", "zonario", "geomed_lotes", "geomed_tratamientos", "idem_valores_suelo"].includes(s.fuente))
        .map((s) => ({ fuente: s.nombre, fecha: s.fecha, tipo: s.tipo })),
    },
  };
}
