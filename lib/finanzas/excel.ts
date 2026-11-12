// Excel de la prefactibilidad financiera: resumen, flujo mensual, presupuesto, producto, mercado, sensibilidades y supuestos.
import ExcelJS from "exceljs";

export async function excelFinanzas(m: any, f: any) {
  const wb = new ExcelJS.Workbook(); wb.creator = "irrelevant · Inteligencia de suelo";
  const cab = (ws: ExcelJS.Worksheet) => { const r = ws.getRow(1); r.font = { bold: true, color: { argb: "FFFFFFFF" } }; r.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF6C4DE7" } }; ws.views = [{ state: "frozen", ySplit: 1 }]; };
  const pesos = "$#,##0";

  const wr = wb.addWorksheet("Resumen");
  wr.columns = [{ header: "Concepto", key: "c", width: 46 }, { header: "Valor", key: "v", width: 24 }, { header: "Nota", key: "n", width: 80 }];
  const R = f.resultado, L = f.lote;
  const filas: [string, any, string?, string?][] = [
    ["Predio", m.predio], ["Barrio · municipio", `${m.barrio ?? ""} · ${m.municipio ?? ""}`], ["Perfil de constructora", f.perfil.nombre, `Sistema: ${f.perfil.sistema}`],
    ["Veredicto", f.veredicto, f.razones.join(" · ")],
    ["Unidades", m.resumen.unidades], ["Área vendible (m²)", m.resumen.area_vendible_m2], ["Ventas totales", R.ventas, "", pesos], ["Costo total (incluye lote)", R.costo_total, "", pesos],
    ["Utilidad antes de impuestos", R.utilidad, "", pesos], ["Margen sobre ventas", R.margen_pct / 100, "", "0.0%"], ["TIR (E.A.)", R.tir_ea_pct != null ? R.tir_ea_pct / 100 : "—", "", "0.0%"],
    ["VPN", R.vpn, `Tasa de descuento del perfil`, pesos], ["Exposición máxima de caja", R.exposicion_maxima, "", pesos], ["Duración (meses)", R.duracion_meses], ["Meses de ventas", R.meses_de_ventas],
    ["Costo del lote evaluado", L.costo_evaluado, "", pesos], ["Valor máximo a pagar por el lote", L.valor_maximo, "El menor entre margen mínimo, TIR mínima y lote/ventas máximo", pesos],
    ["   · por margen mínimo", L.por_margen, "", pesos], ["   · por TIR mínima", L.por_tir, "", pesos], ["   · por lote / ventas máximo", L.por_lote_sobre_ventas, "", pesos],
    ["Valor máximo por m² de lote", L.por_m2_lote, "", pesos], ["Lote / ventas", L.lote_sobre_ventas_pct / 100, "", "0.0%"],
  ];
  for (const [c, v, n, fmt] of filas) { const row = wr.addRow({ c, v, n: n ?? "" }); if (fmt) row.getCell(2).numFmt = fmt; }
  cab(wr);

  const wf = wb.addWorksheet("Flujo mensual");
  wf.columns = [{ header: "Mes", key: "mes", width: 7 }, { header: "Ingresos", key: "ingresos", width: 18 }, { header: "Egresos", key: "egresos", width: 18 },
    { header: "Crédito (neto)", key: "credito_neto", width: 18 }, { header: "Flujo neto", key: "neto", width: 18 }, { header: "Acumulado", key: "acumulado", width: 18 }];
  for (const x of f.flujo) wf.addRow(x);
  for (const k of ["ingresos", "egresos", "credito_neto", "neto", "acumulado"]) wf.getColumn(k).numFmt = pesos;
  const n = f.flujo.length + 1;
  const tot = wf.addRow({ mes: "Total" }); tot.font = { bold: true };
  for (const [col, k] of [["B", "ingresos"], ["C", "egresos"], ["D", "credito_neto"], ["E", "neto"]] as [string, string][]) tot.getCell(k).value = { formula: `SUM(${col}2:${col}${n})` } as any;
  cab(wf);

  const wp = wb.addWorksheet("Presupuesto");
  wp.columns = [{ header: "Partida", key: "p", width: 40 }, { header: "Valor", key: "v", width: 22 }, { header: "% del total", key: "pct", width: 12 }];
  const nombres: Record<string, string> = { lote: "Lote", directo: "Costo directo de construcción", indirecto: "Indirectos (diseños, interventoría, gerencia, honorarios, imprevistos, otros)",
    licencias: "Licencias, expensas e impuestos de construcción", ventas: "Ventas y publicidad", fiducia: "Fiducia", sala: "Sala de ventas", compensacion: "Compensación de obligaciones urbanísticas", intereses: "Intereses del crédito constructor" };
  for (const [k, v] of Object.entries(f.presupuesto.partidas)) wp.addRow({ p: nombres[k] ?? k, v, pct: f.presupuesto.costo_total ? (v as number) / f.presupuesto.costo_total : 0 });
  wp.addRow({ p: "Total", v: f.presupuesto.costo_total, pct: 1 }).font = { bold: true };
  wp.getColumn("v").numFmt = pesos; wp.getColumn("pct").numFmt = "0.0%";
  wp.addRow({}); wp.addRow({ p: "Costo directo por m² construido", v: f.presupuesto.costo_directo_m2 }); wp.addRow({ p: "Indirectos (% del directo)", v: f.presupuesto.indirectos_pct / 100 }).getCell(2).numFmt = "0.0%";
  cab(wp);

  const wt = wb.addWorksheet("Producto y cronograma");
  wt.columns = [{ header: "Torre", key: "t", width: 8 }, { header: "Tipología", key: "ti", width: 12 }, { header: "Unidades", key: "u", width: 10 }, { header: "Área prom. (m²)", key: "a", width: 14 },
    { header: "Precio m²", key: "pm", width: 16 }, { header: "Precio unidad", key: "pu", width: 18 }, { header: "Lanzamiento (mes)", key: "l", width: 16 }, { header: "Inicio obra", key: "i", width: 12 },
    { header: "Entrega", key: "e", width: 10 }, { header: "Escrituración", key: "es", width: 13 }];
  for (const e of f.producto.etapas) {
    const c = f.cronograma.find((x: any) => x.torre === e.torre);
    for (const x of e.tipologias) wt.addRow({ t: e.torre, ti: x.tipologia, u: x.unidades, a: x.area_promedio_m2, pm: x.precio_m2, pu: x.precio_unidad, l: c?.lanzamiento, i: c?.inicio_obra, e: c?.entrega, es: c?.escrituracion });
  }
  wt.getColumn("pm").numFmt = pesos; wt.getColumn("pu").numFmt = pesos; cab(wt);

  const wm = wb.addWorksheet("Mercado (Galería)");
  wm.columns = [{ header: "Proyecto", key: "proyecto", width: 34 }, { header: "Constructora", key: "constructora", width: 26 }, { header: "Estrato", key: "estrato", width: 8 },
    { header: "Precio m²", key: "precio_m2", width: 14 }, { header: "Área (m²)", key: "area_m2", width: 10 }, { header: "Ventas/mes", key: "ventas_mes", width: 11 },
    { header: "Unidades", key: "unidades", width: 10 }, { header: "Disponibles", key: "disponibles", width: 11 }, { header: "Distancia (m)", key: "distancia_m", width: 12 }, { header: "Estado", key: "estado", width: 18 }];
  for (const c of f.mercado.lista) wm.addRow(c);
  wm.getColumn("precio_m2").numFmt = pesos; cab(wm);
  wm.addRow({}); wm.addRow({ proyecto: "Galería Inmobiliaria · uso interno del cliente" });

  const ws = wb.addWorksheet("Sensibilidades");
  ws.columns = [{ header: "Escenario", key: "escenario", width: 28 }, { header: "Margen", key: "m", width: 10 }, { header: "TIR E.A.", key: "t", width: 10 }, { header: "Utilidad", key: "utilidad", width: 20 }, { header: "Valor máx. lote", key: "valor_maximo_lote", width: 20 }];
  ws.addRow({ escenario: "Base", m: R.margen_pct / 100, t: R.tir_ea_pct != null ? R.tir_ea_pct / 100 : null, utilidad: R.utilidad, valor_maximo_lote: L.valor_maximo });
  for (const x of f.sensibilidades) ws.addRow({ ...x, m: x.margen_pct / 100, t: x.tir_ea_pct != null ? x.tir_ea_pct / 100 : null });
  ws.getColumn("m").numFmt = "0.0%"; ws.getColumn("t").numFmt = "0.0%"; ws.getColumn("utilidad").numFmt = pesos; ws.getColumn("valor_maximo_lote").numFmt = pesos; cab(ws);

  const wsu = wb.addWorksheet("Supuestos");
  wsu.columns = [{ header: "Supuesto", key: "s", width: 140 }];
  for (const s of f.supuestos) wsu.addRow({ s });
  wsu.addRow({ s: "Prefactibilidad: no reemplaza el presupuesto detallado, el estudio de títulos ni el modelo financiero de la constructora." });
  cab(wsu);
  return Buffer.from(await wb.xlsx.writeBuffer());
}
