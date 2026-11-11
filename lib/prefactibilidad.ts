// Traducción fiel de Fynder · comite-de-tierras/scripts/prefactibilidad.py (mismas fórmulas, umbrales y textos).
// Prefactibilidad comercial y financiera de un proyecto de vivienda. Todo en pesos colombianos.
// Validada contra el Python con scripts/comparar-prefactibilidad.ts (diferencia < 0,5 %).

export const DEFAULTS = {
  costos: {
    directo_m2: 3_800_000, // costo duro por m² CONSTRUIDO
    factor_area_construida: 1.25, // m² construidos por m² vendible (comunes)
    indirectos_pct: 0.15, // sobre el costo directo
    comercializacion_pct: 0.04, // sobre ventas
    financieros_pct: 0.05, // sobre (lote + directo + indirecto)
  },
  plazo_obra_meses: 24,
  preventa_requerida_pct: 0.6,
  vida_media_factor: 2.0,
  banda_pct: 0.1,
};

export const UMBRALES = {
  margen_verde: 0.18, margen_amarillo: 0.12, lote_verde: 0.15, lote_amarillo: 0.2,
  tension_hueco: 1.3, tension_saturada: 0.8, meses_venta_max: 36,
};

/** erf con error < 1.2e-7 (Numerical Recipes, erfc de Chebyshev). */
function erf(x: number): number {
  const z = Math.abs(x);
  const t = 1 / (1 + 0.5 * z);
  const r = t * Math.exp(-z * z - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 +
    t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))));
  return x >= 0 ? 1 - r : r - 1;
}
const phi = (z: number) => 0.5 * (1 + erf(z / Math.SQRT2));

const RATIO_PROMEDIO_MAX = 2.5;
const SIGMA_TIPICA = 0.45;
const Z75 = 0.6744897501960817;

type Ajuste = [number, number] | null;

export function promedioEsConfiable(mediana?: number | null, promedio?: number | null): boolean {
  if (!mediana || mediana <= 0 || !promedio || promedio <= mediana) return false;
  return promedio / mediana <= RATIO_PROMEDIO_MAX;
}

export function lognormalDeMedianaYPromedio(mediana?: number | null, promedio?: number | null): Ajuste {
  if (!mediana || mediana <= 0) return null;
  const mu = Math.log(mediana);
  if (!promedioEsConfiable(mediana, promedio)) return [mu, SIGMA_TIPICA];
  const sigma = Math.sqrt(Math.max(2 * Math.log(promedio! / mediana), 1e-6));
  return [mu, Math.min(sigma, 1.5)];
}

export function lognormalDeP25YMediana(p25?: number | null, mediana?: number | null): Ajuste {
  if (!mediana || mediana <= 0 || !p25 || p25 <= 0 || p25 >= mediana) return null;
  const mu = Math.log(mediana);
  const sigma = Math.log(mediana / p25) / Z75;
  return [mu, Math.min(Math.max(sigma, 1e-6), 1.5)];
}

export function pMenorOIgual(x: number | null | undefined, ajuste: Ajuste): number | null {
  if (!ajuste || x == null || x <= 0) return null;
  const [mu, sigma] = ajuste;
  return phi((Math.log(x) - mu) / sigma);
}

export function validarAjusteOferta(ajuste: Ajuste, p75Real?: number | null) {
  if (!ajuste || !p75Real) return null;
  const [mu, sigma] = ajuste;
  const pred = Math.exp(mu + Z75 * sigma);
  const error = Math.abs(pred - p75Real) / p75Real;
  return { p75_predicho: Math.round(pred), p75_real: Math.round(p75Real), error_pct: Math.round(error * 1000) / 10, confiable: error <= 0.15 };
}

export function millones(v: number | null | undefined): string {
  if (v == null) return "n/d";
  const m = v / 1_000_000;
  const txt = Math.abs(m) < 100
    ? m.toLocaleString("es-CO", { minimumFractionDigits: 1, maximumFractionDigits: 1 })
    : Math.round(m).toLocaleString("es-CO");
  return `$${txt} millones`;
}
const pct = (v: number | null | undefined, d = 1) => (v == null ? "n/d" : `${(v * 100).toFixed(d)}%`);
const r4 = (v: number | null) => (v ? Math.round(v * 1e4) / 1e4 : null);

export type Entrada = {
  producto: { unidades?: number; area_promedio_m2?: number; precio_m2?: number };
  lote: { costo?: number | null };
  costos?: Partial<typeof DEFAULTS.costos>;
  plazo_obra_meses?: number;
  preventa_requerida_pct?: number;
  vida_media_factor?: number;
  banda_pct?: number;
  mercado?: {
    inventario_activo?: number | null; dias_inventario_promedio?: number | null;
    precio_p25?: number | null; precio_mediana?: number | null; precio_p75?: number | null;
    pedidos_compradores?: number | null; presupuesto_pedidos_mediana?: number | null; presupuesto_pedidos_promedio?: number | null;
  };
};

export function correr(entrada: Entrada) {
  const faltantes: string[] = [];
  const unidades = entrada.producto?.unidades;
  const areaU = entrada.producto?.area_promedio_m2;
  const precioM2 = entrada.producto?.precio_m2;
  if (!unidades) faltantes.push("producto.unidades");
  if (!areaU) faltantes.push("producto.area_promedio_m2");
  if (!precioM2) faltantes.push("producto.precio_m2");
  const costoLote = entrada.lote?.costo;
  if (costoLote == null) faltantes.push("lote.costo");
  if (faltantes.length) return { error: "datos_faltantes" as const, faltantes };

  const c = { ...DEFAULTS.costos, ...(entrada.costos ?? {}) };
  const plazoObra = entrada.plazo_obra_meses ?? DEFAULTS.plazo_obra_meses;
  const preventaReq = entrada.preventa_requerida_pct ?? DEFAULTS.preventa_requerida_pct;
  const vidaMedia = entrada.vida_media_factor ?? DEFAULTS.vida_media_factor;
  const banda = entrada.banda_pct ?? DEFAULTS.banda_pct;

  const areaVendible = unidades! * areaU!;
  const areaConstruida = areaVendible * c.factor_area_construida;
  const precioUnidad = areaU! * precioM2!;
  const ventas = unidades! * precioUnidad;

  const costoDirecto = areaConstruida * c.directo_m2;
  const costoIndirecto = costoDirecto * c.indirectos_pct;
  const costoComercial = ventas * c.comercializacion_pct;
  const costoFinanciero = (costoLote! + costoDirecto + costoIndirecto) * c.financieros_pct;
  const costoTotal = costoLote! + costoDirecto + costoIndirecto + costoComercial + costoFinanciero;

  const utilidad = ventas - costoTotal;
  const margen = ventas ? utilidad / ventas : null;
  const loteSobreVentas = ventas ? costoLote! / ventas : null;
  const equilibrioU = precioUnidad ? Math.ceil(costoTotal / precioUnidad) : null;
  const equilibrioPct = equilibrioU && unidades ? equilibrioU / unidades : null;

  const m = entrada.mercado ?? {};
  const ajOferta = lognormalDeP25YMediana(m.precio_p25, m.precio_mediana);
  const ajDemanda = lognormalDeMedianaYPromedio(m.presupuesto_pedidos_mediana, m.presupuesto_pedidos_promedio);
  const control = validarAjusteOferta(ajOferta, m.precio_p75);

  let demandaAlcanza: number | null = null;
  if (ajDemanda) {
    const pBajo = pMenorOIgual(precioUnidad, ajDemanda);
    demandaAlcanza = pBajo != null ? 1 - pBajo : null;
  }
  const ofertaDebajo = pMenorOIgual(precioUnidad, ajOferta);
  const tension = demandaAlcanza && ofertaDebajo ? demandaAlcanza / ofertaDebajo : null;

  let compBanda: number | null = null;
  let fracBanda: number | null = null;
  if (ajOferta && m.inventario_activo) {
    const alto = pMenorOIgual(precioUnidad * (1 + banda), ajOferta);
    const bajo = pMenorOIgual(precioUnidad * (1 - banda), ajOferta);
    if (alto != null && bajo != null) {
      fracBanda = Math.max(alto - bajo, 0);
      compBanda = fracBanda * m.inventario_activo;
    }
  }

  const mesesVentaZona = m.dias_inventario_promedio ? (m.dias_inventario_promedio * vidaMedia) / 30 : null;
  const rotZonaMes = m.inventario_activo && mesesVentaZona ? m.inventario_activo / mesesVentaZona : null;
  const rotBandaMes = rotZonaMes && fracBanda ? rotZonaMes * fracBanda : null;
  const cuota = compBanda != null ? unidades! / (compBanda + unidades!) : null;
  const absorcionMes = rotBandaMes && cuota ? rotBandaMes * cuota : null;
  const mesesAgotar = absorcionMes ? unidades! / absorcionMes : null;
  const mesesPreventa = absorcionMes ? (unidades! * preventaReq) / absorcionMes : null;

  const alertas: { nivel: string; tema: string; texto: string }[] = [];
  if (margen != null && margen < UMBRALES.margen_amarillo) {
    alertas.push({ nivel: "rojo", tema: "margen", texto: `Margen de ${pct(margen)} sobre ventas: por debajo del 12% minimo. Cualquier sobrecosto de obra se come la utilidad.` });
  } else if (margen != null && margen < UMBRALES.margen_verde) {
    alertas.push({ nivel: "amarillo", tema: "margen", texto: `Margen de ${pct(margen)}: viable pero sin colchon. El estandar sano del sector es 18-25%.` });
  }
  if (loteSobreVentas != null && loteSobreVentas > UMBRALES.lote_amarillo) {
    alertas.push({ nivel: "rojo", tema: "lote", texto: `El lote pesa ${pct(loteSobreVentas)} de las ventas (sano: 15-20%). O se renegocia el lote, o hay que sacarle mas area vendible.` });
  } else if (loteSobreVentas != null && loteSobreVentas > UMBRALES.lote_verde) {
    alertas.push({ nivel: "amarillo", tema: "lote", texto: `El lote pesa ${pct(loteSobreVentas)} de las ventas: en el limite alto de lo sano.` });
  }
  if (tension != null && tension >= UMBRALES.tension_hueco) {
    alertas.push({ nivel: "verde", tema: "hueco", texto: `Banda desatendida: ${pct(demandaAlcanza)} de los compradores alcanzan tu precio, pero solo ${pct(ofertaDebajo)} de la oferta compite ahi (tension ${tension.toFixed(2)}x).` });
  } else if (tension != null && tension < UMBRALES.tension_saturada) {
    alertas.push({ nivel: "rojo", tema: "hueco", texto: `Banda saturada: ${pct(ofertaDebajo)} de la oferta ya esta en tu precio o por debajo, y solo ${pct(demandaAlcanza)} de la demanda llega ahi (tension ${tension.toFixed(2)}x). Estas entrando donde sobra producto.` });
  }
  if (mesesAgotar && mesesAgotar > UMBRALES.meses_venta_max) {
    alertas.push({ nivel: "rojo", tema: "absorcion", texto: `Vender las ${unidades} unidades tomaria ~${mesesAgotar.toFixed(0)} meses al ritmo real de la zona. Es mas que el plazo de obra (${plazoObra} meses) con margen: riesgo de flujo de caja.` });
  }
  if (mesesPreventa && mesesPreventa > plazoObra) {
    alertas.push({ nivel: "rojo", tema: "preventa", texto: `Alcanzar el punto de equilibrio de preventa (${pct(preventaReq, 0)}) tomaria ~${mesesPreventa.toFixed(0)} meses. La fiducia no desembolsa antes.` });
  }
  if (m.presupuesto_pedidos_mediana && m.presupuesto_pedidos_promedio && !promedioEsConfiable(m.presupuesto_pedidos_mediana, m.presupuesto_pedidos_promedio)) {
    alertas.push({ nivel: "amarillo", tema: "datos", texto: `El promedio de presupuesto de los pedidos es ${(m.presupuesto_pedidos_promedio / m.presupuesto_pedidos_mediana).toFixed(0)} veces la mediana: viene contaminado por outliers. Se uso una dispersion tipica de mercado; el % de demanda que alcanza tu precio es aproximado.` });
  }
  if (control && !control.confiable) {
    alertas.push({ nivel: "amarillo", tema: "datos", texto: `El ajuste de la oferta desvia ${control.error_pct}% en el p75. Los porcentajes de mercado son indicativos, no finos.` });
  }

  const rojos = alertas.filter((a) => a.nivel === "rojo").length;
  let veredicto: string, resumen: string;
  if (rojos === 0 && margen && margen >= UMBRALES.margen_verde) [veredicto, resumen] = ["VA", "El proyecto se sostiene en precio, en margen y en ritmo de venta."];
  else if (rojos === 0) [veredicto, resumen] = ["VA CON AJUSTES", "No hay nada que lo mate, pero el margen no tiene colchon."];
  else if (rojos === 1) [veredicto, resumen] = ["VA CON AJUSTES", "Hay un punto que hay que resolver antes de comprar el lote."];
  else [veredicto, resumen] = ["NO VA", "Hay varios frentes rotos a la vez; asi no se compra el lote."];

  const sensibilidad = ([["Precio de venta -10%", -0.1, 0], ["Costo de obra +15%", 0, 0.15], ["Precio -10% y obra +15%", -0.1, 0.15]] as const).map(([escenario, dv, dc]) => {
    const v2 = ventas * (1 + dv);
    const cd2 = costoDirecto * (1 + dc);
    const ci2 = cd2 * c.indirectos_pct;
    const cc2 = v2 * c.comercializacion_pct;
    const cf2 = (costoLote! + cd2 + ci2) * c.financieros_pct;
    const ct2 = costoLote! + cd2 + ci2 + cc2 + cf2;
    const m2 = v2 ? (v2 - ct2) / v2 : null;
    return { escenario, margen: r4(m2), utilidad: Math.round(v2 - ct2) };
  });

  const piso = UMBRALES.margen_amarillo;
  const base = costoDirecto * (1 + c.indirectos_pct);
  const fin = c.financieros_pct;
  let loteMax: number | null = (ventas * (1 - piso - c.comercializacion_pct) - base * (1 + fin)) / (1 + fin);
  if (loteMax < 0) loteMax = 0;

  const rd = (v: number | null, d: number) => (v ? Math.round(v * 10 ** d) / 10 ** d : null);
  return {
    veredicto, resumen,
    producto: {
      unidades, area_promedio_m2: areaU, area_vendible_m2: Math.round(areaVendible), area_construida_m2: Math.round(areaConstruida),
      precio_m2: Math.round(precioM2!), precio_unidad: Math.round(precioUnidad), precio_unidad_legible: millones(precioUnidad),
    },
    financiero: {
      ventas_totales: Math.round(ventas), ventas_legible: millones(ventas), costo_lote: Math.round(costoLote!),
      costo_directo: Math.round(costoDirecto), costo_indirecto: Math.round(costoIndirecto), costo_comercializacion: Math.round(costoComercial),
      costo_financiero: Math.round(costoFinanciero), costo_total: Math.round(costoTotal), utilidad: Math.round(utilidad),
      utilidad_legible: millones(utilidad), margen_sobre_ventas: r4(margen), lote_sobre_ventas: r4(loteSobreVentas),
      equilibrio_unidades: equilibrioU, equilibrio_pct: r4(equilibrioPct),
      lote_maximo_pagable: Math.round(loteMax), lote_maximo_legible: millones(loteMax),
    },
    mercado: {
      demanda_que_alcanza_tu_precio: r4(demandaAlcanza), oferta_en_tu_precio_o_menos: r4(ofertaDebajo),
      indice_tension_banda: rd(tension, 2), competidores_en_tu_banda: compBanda ? Math.round(compBanda) : null,
      rotacion_zona_mes: rd(rotZonaMes, 1), rotacion_banda_mes: rd(rotBandaMes, 2), cuota_de_mercado_estimada: rd(cuota, 3),
      absorcion_mes: rd(absorcionMes, 2), meses_para_agotar: rd(mesesAgotar, 1), meses_para_preventa: rd(mesesPreventa, 1),
      pedidos_90d: m.pedidos_compradores ?? null, control_ajuste: control,
    },
    alertas, sensibilidad,
    supuestos: { ...c, plazo_obra_meses: plazoObra, preventa_requerida_pct: preventaReq, vida_media_factor: vidaMedia, banda_pct: banda },
  };
}
