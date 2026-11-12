// Prefactibilidad financiera de un anteproyecto: ingresos desde el mercado (Galería), presupuesto paramétrico según el
// ADN de la constructora, cronograma por etapas (una por torre), flujo de caja mensual con fiducia y crédito constructor,
// utilidad, TIR, exposición máxima, valor máximo del lote, sensibilidades y veredicto frente a la tesis de inversión.
// Es prefactibilidad: supuestos explícitos y editables; no reemplaza el presupuesto detallado ni el modelo de la constructora.
import { sql } from "../db";
import { memo } from "../memo";
import { costoDirectoM2, type PerfilConstructora } from "../constructora/perfil";

type Proyecto = any;
export type OpcionesFinanzas = {
  sin_sensibilidades?: boolean;
  costo_lote?: number;              // precio pedido o negociado (COP). Si no se da, se evalúa el valor máximo.
  precio_m2?: number;               // sobrescribe el precio de mercado (COP/m² privado)
  absorcion_mes?: number;           // sobrescribe la velocidad de ventas (unidades/mes)
  estrato?: number;
  ajustes?: { precio_pct?: number; costo_pct?: number; absorcion_pct?: number; obra_meses?: number };
};

const r0 = (x: number) => Math.round(x);
const mediana = (xs: number[]) => { const v = xs.filter(Number.isFinite).sort((a, b) => a - b); if (!v.length) return null; const m = Math.floor(v.length / 2); return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2; };

/** Comparables de Galería: mismo tipo de vivienda y estrato ±1, sin vivienda turística ni desistidos. */
export async function comparablesGaleria(lat: number, lon: number, estrato: number | null, tipo: "VIS" | "NO VIS" = "NO VIS") {
  for (const radio of [2500, 4000, 6000]) {
    const rs = await sql`
      SELECT proyecto, construye, estrato, precio_m2_oferta::float p, area_prom_oferta::float a, ventas_prom_semestre_un::float v, unidades_total::int u,
             unidades_disponibles::int disp, meses_en_venta::float meses, estado_obra, ST_Distance(geom::geography, ST_SetSRID(ST_MakePoint(${lon}, ${lat}), 4326)::geography)::int d
      FROM galeria_vigente
      WHERE geom IS NOT NULL AND (tipo IS NULL OR tipo ILIKE 'Apto%') AND precio_m2_oferta > 0 AND area_prom_oferta > 20
        AND proyecto NOT ILIKE '%(VT)%' AND NOT COALESCE(rentas_cortas::boolean, false) AND COALESCE(estado_obra, '') NOT ILIKE 'Desist%'
        AND (${tipo} = 'NO VIS' AND tipo_vivienda ILIKE '%NO VIS%' OR ${tipo} = 'VIS' AND tipo_vivienda NOT ILIKE '%NO VIS%')
        AND (${estrato}::int IS NULL OR estrato::int BETWEEN ${estrato}::int - 1 AND ${estrato}::int + 1)
        AND ST_DWithin(geom::geography, ST_SetSRID(ST_MakePoint(${lon}, ${lat}), 4326)::geography, ${radio})
      ORDER BY d LIMIT 40`;
    if (rs.length >= 5 || radio === 6000) return { radio, comparables: rs as any[] };
  }
  return { radio: 6000, comparables: [] as any[] };
}

/** Precio por m² según el área: ajuste log-log ponderado por ventas (más pequeño, más caro por m²). */
function curvaPrecio(comp: any[]) {
  const pts = comp.filter((c) => c.p > 0 && c.a > 0).map((c) => ({ x: Math.log(c.a), y: Math.log(c.p), w: 1 + Math.max(0, c.v) }));
  const pm = mediana(comp.map((c) => c.p)) ?? 0, am = mediana(comp.map((c) => c.a)) ?? 70;
  let b = -0.15; // elasticidad típica si no hay datos suficientes
  if (pts.length >= 6) {
    const W = pts.reduce((s, p) => s + p.w, 0), mx = pts.reduce((s, p) => s + p.w * p.x, 0) / W, my = pts.reduce((s, p) => s + p.w * p.y, 0) / W;
    const sxy = pts.reduce((s, p) => s + p.w * (p.x - mx) * (p.y - my), 0), sxx = pts.reduce((s, p) => s + p.w * (p.x - mx) ** 2, 0);
    if (sxx > 0) b = Math.max(-0.45, Math.min(0.05, sxy / sxx));
  }
  return { precio_mediano: pm, area_mediana: am, elasticidad: Math.round(b * 100) / 100, precio: (area: number) => pm * Math.pow(area / am, b) };
}

/** TIR mensual por bisección (flujo con cambio de signo). */
function tirMensual(flujo: number[]) {
  const vpn = (r: number) => flujo.reduce((s, f, t) => s + f / Math.pow(1 + r, t), 0);
  let lo = -0.5, hi = 1.0;
  if (vpn(lo) * vpn(hi) > 0) return null;
  for (let i = 0; i < 200; i++) { const m = (lo + hi) / 2; if (vpn(lo) * vpn(m) <= 0) hi = m; else lo = m; }
  return (lo + hi) / 2;
}
const aEA = (rm: number | null) => (rm == null ? null : Math.pow(1 + rm, 12) - 1);
const aMensual = (ea: number) => Math.pow(1 + ea, 1 / 12) - 1;

/** Datos de producto por etapa (una etapa por torre) a partir del anteproyecto. */
export function etapasDe(m: Proyecto) {
  const pp = m.resumen.pisos_plataforma ?? 0, pisosTorre = Math.max(1, m.resumen.pisos_totales - pp), nPrimero = pp > 0 ? 0 : 1;
  const conv = new Set<string>(m.primer_piso.flatMap((x: any) => [x.lobby, ...x.equipamiento.map((e: any) => e.id)].filter(Boolean)));
  return m.torres.map((t: any) => {
    const aptos = t.planta.aptos as any[];
    const porTipo: Record<string, { n: number; area: number }> = {};
    const sumar = (a: any, n: number) => { const k = a.tipologia; porTipo[k] ??= { n: 0, area: 0 }; porTipo[k].n += n; porTipo[k].area += n * a.area_privada; };
    for (const a of aptos) sumar(a, pisosTorre - nPrimero + (nPrimero && !conv.has(a.id) ? 1 : 0));
    const unidades = Object.values(porTipo).reduce((s, x) => s + x.n, 0);
    const vendible = Object.values(porTipo).reduce((s, x) => s + x.area, 0);
    return { torre: t.id, unidades, area_vendible_m2: vendible, area_construida_m2: t.planta.L * t.planta.D * pisosTorre, pisos: pisosTorre,
      tipologias: Object.entries(porTipo).map(([k, x]) => ({ tipologia: k, unidades: x.n, area_promedio_m2: x.area / x.n })) };
  });
}

export async function modeloFinanciero(m: Proyecto, perfil: PerfilConstructora, o: OpcionesFinanzas = {}) {
  const [pt] = await memo(`pt:${m.predio}`, () => sql`SELECT ST_Y(ST_PointOnSurface(geom)) lat, ST_X(ST_PointOnSurface(geom)) lon FROM parcel WHERE id = ${m.predio}`);
  const estrato = o.estrato ?? m.resumen.estrato ?? null;
  const merc = await memo(`comp:${m.predio}:${estrato}`, () => comparablesGaleria(Number(pt.lat), Number(pt.lon), estrato));
  const curva = curvaPrecio(merc.comparables);
  const absorcionMercado = mediana(merc.comparables.filter((c) => c.v > 0).map((c) => c.v)) ?? 3;
  const aj = o.ajustes ?? {};
  const absorcion = Math.max(0.5, (o.absorcion_mes ?? absorcionMercado) * (1 + (aj.absorcion_pct ?? 0) / 100));
  const etapas = etapasDe(m);
  const P = perfil, C = P.costos;
  const factorPrecio = (1 + (aj.precio_pct ?? 0) / 100), factorCosto = 1 + (aj.costo_pct ?? 0) / 100;
  const precioM2 = (area: number) => (o.precio_m2 ?? curva.precio(area)) * factorPrecio;

  // ---------- Ventas por etapa (a precios de hoy) ----------
  const ventasEtapa = etapas.map((e: any) => e.tipologias.reduce((s: number, x: any) => s + x.unidades * x.area_promedio_m2 * precioM2(x.area_promedio_m2), 0));
  const precioUnidadEtapa = etapas.map((e: any, i: number) => ventasEtapa[i] / Math.max(1, e.unidades));

  // ---------- Presupuesto ----------
  const pisos = m.resumen.pisos_totales;
  const cdM2 = costoDirectoM2(P, pisos) * factorCosto;
  const areaSotanos = Number(m.resumen.area_sotanos_m2) || 0, areaPlat = (m.resumen.pisos_plataforma ?? 0) * (Number(m.resumen.area_edificable_m2) || 0);
  const loteLibre = Math.max(0, Number(m.resumen.area_lote_m2) - m.torres.reduce((s: number, t: any) => s + t.planta.L * t.planta.D, 0));
  const directoEtapa = etapas.map((e: any, i: number) => e.area_construida_m2 * cdM2
    + (i === 0 ? areaSotanos * C.directo_m2_sotano * factorCosto + areaPlat * C.directo_m2_plataforma * factorCosto + loteLibre * C.urbanismo_m2_lote_libre : 0));
  const pctIndirectos = (C.diseno_estudios_pct + C.interventoria_pct + C.gerencia_pct + C.honorarios_construccion_pct + C.imprevistos_pct + C.reembolsables_pct) / 100;
  const compensacion = (Number(m.resumen.obligaciones?.equipamiento_a_compensar_m2) || 0) * C.compensacion_m2_equipamiento;

  // ---------- Cronograma ----------
  const nSot = m.resumen.sotanos ?? 0;
  const obraMeses = (i: number, e: any) => Math.ceil(P.obra.meses_preliminares + (i === 0 ? nSot * P.obra.meses_por_sotano : 0) + (e.pisos * P.obra.dias_por_piso) / 22 + P.obra.meses_acabados + (aj.obra_meses ?? 0));
  const lanzamiento = etapas.map((_: any, i: number) => 2 + i * P.obra.meses_entre_etapas);

  const calcular = (costoLote: number) => {
    const H = 120;
    const z = () => new Array(H).fill(0);
    const ing = { cuota: z(), saldo: z() }, egr = { lote: z(), directo: z(), indirecto: z(), licencias: z(), ventas: z(), fiducia: z(), sala: z(), compensacion: z(), intereses: z() };
    const credito = { desembolso: z(), pago: z() };
    egr.lote[0] = costoLote;
    egr.sala[1] = C.sala_ventas_fijo;
    // Ventas: tasa global de absorción, se atiende la etapa lanzada más antigua con inventario
    const vendidas = etapas.map(() => z());
    const stock = etapas.map((e: any) => e.unidades);
    let acumAbs = 0;
    for (let t = 0; t < H; t++) {
      acumAbs += absorcion;
      let cupo = Math.floor(acumAbs); acumAbs -= cupo;
      for (let i = 0; i < etapas.length && cupo > 0; i++) if (t >= lanzamiento[i] && stock[i] > 0) { const n = Math.min(stock[i], cupo); vendidas[i][t] += n; stock[i] -= n; cupo -= n; }
    }
    const inicio: number[] = [], entrega: number[] = [], escritura: number[] = [];
    const tasaM = aMensual(P.financiacion.tasa_ea / 100);
    let saldoCredito = 0;
    const creditoEtapa = etapas.map(() => 0);
    etapas.forEach((e: any, i: number) => {
      let acum = 0, tEq = H - 1;
      for (let t = 0; t < H; t++) { acum += vendidas[i][t]; if (acum >= (P.ventas.preventa_equilibrio_pct / 100) * e.unidades) { tEq = t; break; } }
      inicio[i] = Math.max(lanzamiento[i] + P.ventas.meses_preventa_antes_obra, tEq + 1);
      entrega[i] = Math.min(H - 4, inicio[i] + obraMeses(i, e));
      escritura[i] = Math.min(H - 1, entrega[i] + P.obra.meses_escrituracion);
      // Costos de obra repartidos uniformemente entre inicio y entrega
      const dur = Math.max(1, entrega[i] - inicio[i]);
      const inf = (t: number) => Math.pow(1 + C.incremento_costo_anual_pct / 100, t / 12); // costos a precios de cada mes
      for (let t = inicio[i]; t < entrega[i]; t++) { egr.directo[t] += (directoEtapa[i] / dur) * inf(t); egr.indirecto[t] += ((directoEtapa[i] * pctIndirectos) / dur) * inf(t); }
      egr.licencias[Math.max(0, inicio[i] - 1)] += directoEtapa[i] * (C.licencias_impuestos_pct / 100);
      if (i === 0) egr.compensacion[Math.max(0, inicio[0] - 1)] += compensacion;
      // Recaudo: cuota inicial en cuotas hasta la entrega (retenida en fiducia hasta el punto de equilibrio); saldo en la escrituración
      for (let t = 0; t < H; t++) {
        const n = vendidas[i][t]; if (!n) continue;
        const precio = precioUnidadEtapa[i] * Math.pow(1 + P.ventas.incremento_precio_anual_pct / 100, t / 12);
        egr.ventas[t] += n * precio * (C.ventas_publicidad_pct / 100);
        egr.fiducia[t] += n * precio * (C.fiducia_pct / 100);
        const ci = n * precio * (P.ventas.cuota_inicial_pct / 100), sal = n * precio - ci;
        const meses = Math.max(1, entrega[i] - t);
        for (let k = 0; k < meses; k++) { const tt = Math.max(t + k, inicio[i]); if (tt < H) ing.cuota[tt] += ci / meses; }
        ing.saldo[Math.max(escritura[i], t)] += sal;
      }
    });
    // Crédito constructor: financia un % del costo directo; se paga con los saldos de cada etapa al escriturar
    for (let t = 0; t < H; t++) {
      egr.intereses[t] = saldoCredito * tasaM;
      etapas.forEach((_: any, i: number) => {
        if (t >= inicio[i] && t < entrega[i]) {
          const tope = directoEtapa[i] * (P.financiacion.credito_constructor_pct_directo / 100);
          const d = Math.min(tope - creditoEtapa[i], (directoEtapa[i] / Math.max(1, entrega[i] - inicio[i])) * (P.financiacion.credito_constructor_pct_directo / 100));
          if (d > 0) { credito.desembolso[t] += d; creditoEtapa[i] += d; saldoCredito += d; }
        }
        if (t === escritura[i] && creditoEtapa[i] > 0) { credito.pago[t] += creditoEtapa[i]; saldoCredito -= creditoEtapa[i]; creditoEtapa[i] = 0; }
      });
    }
    const fin = Math.min(H, Math.max(...escritura) + 2);
    const neto: number[] = [], acum: number[] = [];
    let a = 0;
    for (let t = 0; t < fin; t++) {
      const e = Object.values(egr).reduce((s, v) => s + v[t], 0);
      const n = ing.cuota[t] + ing.saldo[t] - e + credito.desembolso[t] - credito.pago[t];
      neto.push(n); a += n; acum.push(a);
    }
    const ventasTot = ing.cuota.reduce((s, v) => s + v, 0) + ing.saldo.reduce((s, v) => s + v, 0);
    const costos: Record<string, number> = {}; for (const [k, v] of Object.entries(egr)) costos[k] = v.slice(0, fin).reduce((s, x) => s + x, 0);
    const costoTot = Object.values(costos).reduce((s, v) => s + v, 0);
    const utilidad = ventasTot - costoTot;
    const tir = aEA(tirMensual(neto));
    const td = aMensual(P.financiacion.tasa_descuento_ea / 100);
    const vpn = neto.reduce((s, f, t) => s + f / Math.pow(1 + td, t), 0);
    return { meses: fin, ingresos: { cuota: ing.cuota.slice(0, fin), saldo: ing.saldo.slice(0, fin) }, egresos: Object.fromEntries(Object.entries(egr).map(([k, v]) => [k, v.slice(0, fin)])),
      credito: { desembolso: credito.desembolso.slice(0, fin), pago: credito.pago.slice(0, fin) }, neto, acumulado: acum,
      ventas: ventasTot, costos, costo_total: costoTot, utilidad, margen: ventasTot ? utilidad / ventasTot : 0, tir_ea: tir, vpn,
      exposicion_maxima: -Math.min(0, ...acum), cronograma: etapas.map((e: any, i: number) => ({ torre: e.torre, lanzamiento: lanzamiento[i], inicio_obra: inicio[i], entrega: entrega[i], escrituracion: escritura[i], unidades: e.unidades })),
      meses_ventas: Math.max(...vendidas.map((v: number[]) => { let u = 0; v.forEach((x: number, t: number) => { if (x) u = t; }); return u; })) };
  };

  // ---------- Valor máximo del lote: cumple margen mínimo y TIR mínima ----------
  const buscar = (cumple: (r: ReturnType<typeof calcular>) => boolean) => {
    let lo = 0, hi = Math.max(1, ventasEtapa.reduce((s: number, v: number) => s + v, 0) * 0.6);
    if (!cumple(calcular(lo))) return 0;
    for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; if (cumple(calcular(mid))) lo = mid; else hi = mid; }
    return lo;
  };
  const porMargen = buscar((r) => r.margen >= P.comite.margen_minimo_pct / 100);
  const porTir = buscar((r) => (r.tir_ea ?? -1) >= P.comite.tir_minima_ea / 100);
  const ventasHoy = ventasEtapa.reduce((s: number, v: number) => s + v, 0);
  const porLote = ventasHoy * (P.comite.lote_max_sobre_ventas_pct / 100);
  const valorMaximo = Math.max(0, Math.min(porMargen, porTir, porLote));
  const costoLote = o.costo_lote ?? valorMaximo;
  const base = calcular(costoLote);

  // ---------- Veredicto ----------
  const loteSobreVentas = base.ventas ? costoLote / base.ventas : 0;
  const cumpleM = base.margen >= P.comite.margen_minimo_pct / 100, cumpleT = (base.tir_ea ?? -1) >= P.comite.tir_minima_ea / 100, cumpleL = loteSobreVentas <= P.comite.lote_max_sobre_ventas_pct / 100;
  const cerca = base.margen >= P.comite.margen_minimo_pct / 100 - 0.03 && (base.tir_ea ?? -1) >= P.comite.tir_minima_ea / 100 - 0.04;
  const veredicto = o.costo_lote == null ? "VALOR MÁXIMO" : cumpleM && cumpleT && cumpleL ? "VA" : cerca ? "VA CON AJUSTES" : "NO VA";
  const razones = [
    `Margen ${(base.margen * 100).toFixed(1)} % (mínimo ${P.comite.margen_minimo_pct} %) ${cumpleM ? "✓" : "✗"}`,
    `TIR ${base.tir_ea != null ? (base.tir_ea * 100).toFixed(1) + " % E.A." : "—"} (mínima ${P.comite.tir_minima_ea} %) ${cumpleT ? "✓" : "✗"}`,
    `Lote / ventas ${(loteSobreVentas * 100).toFixed(1)} % (máximo ${P.comite.lote_max_sobre_ventas_pct} %) ${cumpleL ? "✓" : "✗"}`,
  ];

  // ---------- Sensibilidades (sobre el mismo costo de lote) ----------
  const sens: any[] = [];
  if (!o.ajustes && !o.sin_sensibilidades) {
    for (const [nombre, a] of [["Precio −5 %", { precio_pct: -5 }], ["Precio −10 %", { precio_pct: -10 }], ["Costo +5 %", { costo_pct: 5 }], ["Costo +10 %", { costo_pct: 10 }],
      ["Ventas 30 % más lentas", { absorcion_pct: -30 }], ["Obra 6 meses más larga", { obra_meses: 6 }]] as [string, any][]) {
      const r: any = await modeloFinanciero(m, perfil, { ...o, costo_lote: costoLote, ajustes: a });
      sens.push({ escenario: nombre, margen_pct: r.resultado.margen_pct, tir_ea_pct: r.resultado.tir_ea_pct, utilidad: r.resultado.utilidad, valor_maximo_lote: r.lote.valor_maximo });
    }
  }

  return {
    perfil: { id: P.id, nombre: P.nombre, sistema: P.sistema },
    mercado: { radio_m: merc.radio, comparables: merc.comparables.length, estrato_usado: estrato, precio_m2_mediano: r0(curva.precio_mediano), area_mediana_m2: Math.round(curva.area_mediana),
      elasticidad_precio_area: curva.elasticidad, absorcion_mercado_mes: Math.round(absorcionMercado * 10) / 10, absorcion_usada_mes: Math.round(absorcion * 10) / 10,
      lista: merc.comparables.slice(0, 12).map((c) => ({ proyecto: c.proyecto, constructora: c.construye, estrato: c.estrato, precio_m2: r0(c.p), area_m2: Math.round(c.a), ventas_mes: c.v, unidades: c.u, disponibles: c.disp, distancia_m: c.d, estado: c.estado_obra })) },
    producto: { etapas: etapas.map((e: any, i: number) => ({ ...e, area_vendible_m2: r0(e.area_vendible_m2), area_construida_m2: r0(e.area_construida_m2), ventas_hoy: r0(ventasEtapa[i]),
      tipologias: e.tipologias.map((x: any) => ({ ...x, area_promedio_m2: Math.round(x.area_promedio_m2 * 10) / 10, precio_m2: r0(precioM2(x.area_promedio_m2)), precio_unidad: r0(precioM2(x.area_promedio_m2) * x.area_promedio_m2) })) })) },
    presupuesto: { costo_directo_m2: r0(cdM2), directo_total: r0(directoEtapa.reduce((s: number, v: number) => s + v, 0)), indirectos_pct: Math.round(pctIndirectos * 1000) / 10,
      partidas: Object.fromEntries(Object.entries(base.costos).map(([k, v]) => [k, r0(v)])), costo_total: r0(base.costo_total) },
    resultado: { ventas: r0(base.ventas), costo_total: r0(base.costo_total), utilidad: r0(base.utilidad), margen_pct: Math.round(base.margen * 1000) / 10,
      tir_ea_pct: base.tir_ea != null ? Math.round(base.tir_ea * 1000) / 10 : null, vpn: r0(base.vpn), exposicion_maxima: r0(base.exposicion_maxima), duracion_meses: base.meses, meses_de_ventas: base.meses_ventas },
    lote: { costo_evaluado: r0(costoLote), valor_maximo: r0(valorMaximo), por_margen: r0(porMargen), por_tir: r0(porTir), por_lote_sobre_ventas: r0(porLote),
      por_m2_lote: r0(valorMaximo / Math.max(1, Number(m.resumen.area_lote_m2))), lote_sobre_ventas_pct: Math.round(loteSobreVentas * 1000) / 10 },
    veredicto, razones, cronograma: base.cronograma,
    flujo: base.neto.map((n, t) => ({ mes: t, ingresos: r0(base.ingresos.cuota[t] + base.ingresos.saldo[t]), egresos: r0(Object.values(base.egresos).reduce((s, v) => s + v[t], 0)),
      credito_neto: r0(base.credito.desembolso[t] - base.credito.pago[t]), neto: r0(n), acumulado: r0(base.acumulado[t]) })),
    sensibilidades: sens,
    supuestos: [
      `Precio por m² desde ${merc.comparables.length} proyectos de Galería a ${merc.radio / 1000} km (mismo tipo, estrato ${estrato ?? "s/d"} ±1, sin vivienda turística ni desistidos); los apartamentos más pequeños se venden más caros por m² (elasticidad ${curva.elasticidad}).`,
      `Velocidad de ventas ${Math.round(absorcion * 10) / 10} unidades/mes (mediana de los comparables).`,
      `Costo directo ${Math.round(cdM2 / 1e5) / 10} M/m² construido para ${pisos} pisos; sótanos ${Math.round(C.directo_m2_sotano / 1e5) / 10} M/m²; indirectos ${Math.round(pctIndirectos * 1000) / 10} % del directo (perfil: ${P.nombre}).`,
      `Costos de construcción indexados al ${C.incremento_costo_anual_pct} % anual.`,
      `Una etapa por torre, lanzadas cada ${P.obra.meses_entre_etapas} meses; la obra arranca al ${P.ventas.preventa_equilibrio_pct} % de preventa y ${P.ventas.meses_preventa_antes_obra} meses después del lanzamiento como mínimo.`,
      `Cuota inicial del ${P.ventas.cuota_inicial_pct} % durante la obra (en fiducia hasta el punto de equilibrio) y saldo al escriturar; precios suben ${P.ventas.incremento_precio_anual_pct} % anual.`,
      `Crédito constructor del ${P.financiacion.credito_constructor_pct_directo} % del directo al ${P.financiacion.tasa_ea} % E.A.; VPN al ${P.financiacion.tasa_descuento_ea} % E.A.`,
      "Utilidad antes de impuestos. Sin valorización del lote ni ingresos por locales.",
    ],
  };
}
