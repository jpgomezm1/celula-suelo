// Exporta un estudio de competencia al Excel con las mismas hojas del formato de estudio de competencia de constructora.
import ExcelJS from "exceljs";

const f = (d: unknown) => (d ? new Date(d as any).toISOString().slice(0, 10) : "");

const AZUL = "FF1F3864", GRIS = "FFF2F2F2";
const titulo = (ws: ExcelJS.Worksheet, paso: string, nombre: string) => {
  ws.addRow(["ETAPA 1:", "Concepción de Producto", "", paso, nombre]).font = { bold: true, color: { argb: AZUL } };
  ws.addRow([]);
};
const encabezado = (row: ExcelJS.Row) => {
  row.font = { bold: true, color: { argb: "FFFFFFFF" } };
  row.eachCell((c) => { c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: AZUL } }; c.alignment = { wrapText: true, vertical: "middle" }; });
};
const parrafo = (ws: ExcelJS.Worksheet, etiqueta: string, texto: string | null | undefined) => {
  ws.addRow([etiqueta]).font = { bold: true };
  const r = ws.addRow([texto ?? "(pendiente de redactar)"]);
  ws.mergeCells(r.number, 1, r.number, 10);
  r.getCell(1).alignment = { wrapText: true, vertical: "top" };
  r.height = Math.min(300, 15 * Math.ceil(String(texto ?? "").length / 140) + 15);
  ws.addRow([]);
};

export async function estudioAExcel(e: any, textos: any = {}): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Célula de suelo";
  const t4 = textos.paso4 ?? {};
  const terr = e.paso4_territorio ?? {};

  // Consolidado
  const c = wb.addWorksheet("Consolidado");
  c.columns = [{ width: 32 }, { width: 28 }, { width: 18 }, { width: 28 }, { width: 14 }, { width: 18 }];
  c.addRow(["COMPETENCIA COMERCIAL, NUEVO LOTE O PROYECTO INMOBILIARIO"]).font = { bold: true, size: 14, color: { argb: AZUL } };
  c.addRow([e.estudio]).font = { bold: true, size: 12 };
  c.addRow([]);
  c.addRow(["NOMBRE DEL PROYECTO:", e.estudio, "FECHA:", e.fecha]);
  c.addRow(["TIPO DE PROYECTO INMOBILIARIO", e.paso3_objetivo?.tipo_vivienda, "MUNICIPIO:", terr.ubicacion?.municipio ?? "", "BARRIO:", terr.ubicacion?.barrio ?? ""]);
  c.addRow(["Corte Galería Inmobiliaria", e.corte_galeria ?? "sin datos"]);
  c.addRow([]);
  for (const [paso, nombre] of [["Paso 3", "Objetivo del estudio"], ["Paso 4", "Delimitación del territorio"], ["Paso 5", "Proyectos a consultar por zona"],
    ["Paso 7", "Proyectos ZOOM"], ["Paso 8", "Tabla resumen de proyectos"], ["Paso 9", "Recomendaciones preliminares"]]) c.addRow([paso, nombre]);
  c.addRow([]);
  c.addRow(["Etapa 2 (cotizaciones, zonas comunes, hallazgos arquitectónicos) se completa con trabajo de campo."]).font = { italic: true };
  c.addRow(["Fuentes: " + (e.fuentes ?? []).join(" · ")]).font = { italic: true, size: 9 };

  // Paso 3
  const p3 = wb.addWorksheet("E1- Paso 3 Objetivo");
  p3.getColumn(1).width = 120;
  titulo(p3, "Paso 3:", "Objetivo del estudio");
  parrafo(p3, "Objetivo de la Etapa 1 – Concepción de Producto:", textos.objetivo ??
    `Evaluar la viabilidad comercial y competitiva del lote para un ${e.paso3_objetivo?.objetivo?.replace("_", " ")} ${e.paso3_objetivo?.tipo_vivienda}, ` +
    `vocación ${e.paso3_objetivo?.vocacion}, comparándolo con ${e.metricas_zona?.proyectos_en_zona ?? 0} proyectos de vivienda nueva de más de ` +
    `${e.paso3_objetivo?.filtros?.min_unidades} unidades en ${e.paso3_objetivo?.filtros?.zona}.`);

  // Paso 4
  const p4 = wb.addWorksheet("E1- Paso 4 Territorio");
  p4.getColumn(1).width = 120;
  titulo(p4, "Paso 4:", "Delimitación del territorio");
  const pr = terr.predio;
  const env = terr.entorno ?? {};
  const lista = (xs: any[] = []) => xs.map((x) => `${x.nombre} (${x.distancia_m} m)`).join("; ");
  parrafo(p4, "Breve explicación de la zona:", t4.zona ?? (pr ? `Predio ${pr.id}, ${pr.area_lote_m2} m², suelo ${pr.clase_suelo}. Tratamiento POT: ${pr.tratamiento ?? "s/d"}; uso: ${pr.uso ?? "s/d"}.` : null));
  parrafo(p4, "Lugares y referencias cercanas:", t4.referencias ?? `Comercio: ${lista(env.centros_comerciales_y_supermercados?.cercanos)}. Educación: ${lista(env.educacion?.cercanos)}. Salud: ${lista(env.salud?.cercanos)}. Parques: ${lista(env.parques)}.`);
  if (pr?.aviso_pot) { const r = p4.addRow([`⚠ ${pr.aviso_pot}`]); p4.mergeCells(r.number, 1, r.number, 10); r.getCell(1).alignment = { wrapText: true }; r.font = { italic: true, color: { argb: "FF9A6B00" } }; r.height = 45; p4.addRow([]); }
  parrafo(p4, "Vías y conectividad:", t4.vias ?? null);
  parrafo(p4, "Transporte público:", t4.transporte ?? `Estaciones de transporte masivo a 1,2 km: ${env.transporte_masivo?.cantidad ?? "s/d"} (${lista(env.transporte_masivo?.cercanas)}). Paraderos de bus a 500 m: ${env.paraderos_bus_500m ?? "s/d"}.`);
  parrafo(p4, "Comercio y servicios:", t4.comercio ?? `${env.centros_comerciales_y_supermercados?.cantidad ?? "s/d"} centros comerciales y supermercados, ${env.educacion?.cantidad ?? "s/d"} instituciones educativas y ${env.salud?.cantidad ?? "s/d"} de salud a 1 km.`);
  parrafo(p4, "Desarrollo y valorización:", t4.valorizacion ?? (pr ? `Norma: altura ${pr.altura_max ?? "s/d"} pisos, índice de construcción ${pr.indice_construccion ?? "s/d"}, densidad ${pr.densidad_max_viv_ha ?? "s/d"} viv/ha. Área construible ≈ ${pr.area_construible_m2 ?? "s/d"} m². Valor de referencia del suelo $${pr.valor_suelo_m2 ? Math.round(pr.valor_suelo_m2).toLocaleString("es-CO") : "s/d"}/m². Amenazas: ${(terr.restricciones?.amenazas ?? []).map((a: any) => `${a.tipo} ${a.grado}`).join(", ") || "ninguna cruzada"}.` : null));

  // Paso 5
  const p5 = wb.addWorksheet("E1- Paso 5 Proyectos a con.");
  titulo(p5, "Paso 5:", "Proyectos a consultar por zona");
  p5.addRow([`Listado de proyectos (${e.paso5_proyectos_a_consultar?.cantidad ?? 0}) — ${e.paso5_proyectos_a_consultar?.fuente}`]).font = { italic: true };
  const cols5 = ["Código", "Proyecto", "Construye", "Sub Zona", "Tipo", "$ m2", "Total unidades", "Ventas totales", "Disponibles", "Por lanzar", "% Vendido", "Ventas mes prom. semestre", "Inicio ventas", "Entrega", "Estado obra", "Distancia (m)", "Dirección", "Ubicación", "Descuento"];
  encabezado(p5.addRow(cols5));
  for (const g of e.paso5_proyectos_a_consultar?.proyectos ?? []) {
    p5.addRow([g.codigo, g.proyecto, g.construye, g.sub_zona, g.tipo_vivienda, g.precio_m2, g.unidades_total, g.ventas_total, g.disponibles, g.por_lanzar, g.pct_vendido, g.ventas_mes_prom_semestre, f(g.fecha_inicio), g.entrega, g.estado_obra, g.distancia_m, g.direccion ?? "", g.ubicacion_aproximada ? "aproximada (barrio/sector)" : "por dirección", g.descuento ?? ""]);
  }
  p5.getColumn(6).numFmt = "$#,##0"; p5.getColumn(11).numFmt = "0%";
  cols5.forEach((_, i) => (p5.getColumn(i + 1).width = i === 1 ? 34 : 14));
  if ((e.paso5_proyectos_a_consultar?.proyectos_sin_galeria ?? []).length) {
    p5.addRow([]);
    p5.addRow(["Otros proyectos en la zona sin datos de Galería (Zonario)"]).font = { bold: true };
    for (const z of e.paso5_proyectos_a_consultar.proyectos_sin_galeria) p5.addRow(["", z.nombre, z.constructora, z.barrio, "", z.precio_m2_desde, "", "", "", "", "", "", "", z.entrega, "", z.distancia_m]);
  }

  // Paso 7
  const p7 = wb.addWorksheet("E1- Paso 7 Proyectos ZOOM");
  titulo(p7, "Paso 7:", "Proyectos ZOOM");
  p7.addRow(["Competencia directa (cercanía, ritmo de ventas y oferta vigente):"]).font = { italic: true };
  for (const n of e.paso7_proyectos_zoom ?? []) p7.addRow([n]);
  p7.getColumn(1).width = 60;

  // Paso 8
  const p8 = wb.addWorksheet("E1- Paso 8 Tabla Resumen");
  titulo(p8, "Paso 8:", "Tabla Resumen");
  p8.addRow(["Comparativo proyecto competencia directa"]).font = { bold: true };
  const t = e.paso8_tabla_resumen ?? [];
  encabezado(p8.addRow(["", ...t.map((x: any) => x.proyecto)]));
  const filas: [string, (x: any) => unknown, string?][] = [
    ["Zona", (x) => x.zona], ["Constructor", (x) => x.constructor], ["Fecha lanzamiento", (x) => f(x.fecha_lanzamiento)],
    ["Área promedio", (x) => x.area_promedio, "0.0"], ["Promedio precio m2", (x) => x.precio_m2, "$#,##0"], ["Total unidades", (x) => x.total_unidades],
    ["Ventas totales", (x) => x.ventas_totales], ["% ventas / total und", (x) => x.pct_vendido, "0%"], ["Oferta actual", (x) => x.oferta_actual],
    ["Oferta futura", (x) => x.oferta_futura], ["Ventas mes promedio semestre", (x) => x.ventas_mes_promedio_semestre, "0.0"],
    ["Ventas último mes", (x) => x.ventas_ultimo_mes], ["Entrega", (x) => x.entrega], ["Distancia al lote (m)", (x) => x.distancia_m],
  ];
  for (const [et, f, fmt] of filas) {
    const r = p8.addRow([et, ...t.map(f)]);
    r.getCell(1).font = { bold: true }; r.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: GRIS } };
    if (fmt) r.eachCell((cc, i) => { if (i > 1) cc.numFmt = fmt; });
  }
  p8.getColumn(1).width = 30;
  t.forEach((_: any, i: number) => (p8.getColumn(i + 2).width = 24));
  p8.addRow([]);
  const m = e.metricas_zona ?? {};
  p8.addRow(["Métricas de la zona"]).font = { bold: true };
  for (const [k, v] of [["Proyectos en la zona", m.proyectos_en_zona], ["Ventas mes de la zona (prom. semestre)", m.ventas_mes_zona_promedio_semestre],
    ["Oferta disponible", m.oferta_disponible], ["Oferta por lanzar", m.oferta_por_lanzar], ["Meses de inventario (actual)", m.meses_de_inventario],
    ["Meses de inventario (con futura)", m.meses_de_inventario_con_futura], ["Precio m2 p25 / mediana / p75", `${m.precio_m2_p25} / ${m.precio_m2_mediana} / ${m.precio_m2_p75}`]]) p8.addRow([k, v]);

  // Paso 9
  const p9 = wb.addWorksheet("E1- Paso 9 Recomendaciones");
  p9.getColumn(1).width = 28; p9.getColumn(2).width = 90;
  titulo(p9, "Paso 9:", "Recomendaciones preliminares");
  const i9 = e.paso9_insumos_recomendacion ?? {};
  p9.addRow(["Recomendación general"]).font = { bold: true };
  const rg = p9.addRow([textos.recomendacion_general ?? "(pendiente de redactar)"]); p9.mergeCells(rg.number, 1, rg.number, 2); rg.getCell(1).alignment = { wrapText: true };
  p9.addRow([]);
  encabezado(p9.addRow(["Variable", "Recomendación"]));
  const rec = textos.recomendaciones ?? {};
  for (const [k, def] of [
    ["Tipo de producto", null], ["Área promedio", i9.area_promedio_objetivo ? `≈ ${i9.area_promedio_objetivo} m² (competencia entre ${i9.rango_area_competencia?.join(" y ")} m²)` : null],
    ["Tipologías", null], ["Entrega", i9.entrega_predominante ? `Predomina: ${i9.entrega_predominante}` : null],
    ["Precio objetivo", i9.precio_m2_objetivo_rango?.[0] ? `Entre $${Math.round(i9.precio_m2_objetivo_rango[0]).toLocaleString("es-CO")} y $${Math.round(i9.precio_m2_objetivo_rango[1]).toLocaleString("es-CO")} por m²` : null],
    ["Número estimado de unidades", i9.unidades_posibles_por_norma ? `≈ ${i9.unidades_posibles_por_norma} según norma (inferencia)` : null],
    ["Ritmo de ventas de referencia", i9.ritmo_ventas_referencia_mes ? `${i9.ritmo_ventas_referencia_mes} unidades/mes (competencia directa); ≈ ${i9.meses_para_vender_al_ritmo_referencia ?? "s/d"} meses para vender` : null],
    ["Zonas comunes", null], ["Enfoque comercial", null], ["Público objetivo", null], ["Diferencial recomendado", null],
  ] as [string, string | null][]) {
    const r = p9.addRow([k, rec[k] ?? def ?? "(pendiente)"]); r.getCell(2).alignment = { wrapText: true };
  }
  p9.addRow([]);
  p9.addRow(["Conclusión general"]).font = { bold: true };
  const cg = p9.addRow([textos.conclusion ?? "(pendiente de redactar)"]); p9.mergeCells(cg.number, 1, cg.number, 2); cg.getCell(1).alignment = { wrapText: true };

  return Buffer.from(await wb.xlsx.writeBuffer());
}

// Estudio general por perfil de edificio: resumen, ranking de lotes y distribución por barrio.
export async function perfilAExcel(e: any): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Inteligencia de suelo";
  const pf = e.perfil ?? {};
  const r = wb.addWorksheet("Resumen");
  r.columns = [{ width: 42 }, { width: 60 }];
  r.addRow(["OPORTUNIDADES DE SUELO POR PERFIL DE EDIFICIO"]).font = { bold: true, size: 14, color: { argb: AZUL } };
  r.addRow([e.estudio]).font = { bold: true, size: 12 };
  r.addRow(["Fecha", e.fecha]);
  r.addRow([]);
  r.addRow(["Perfil buscado"]).font = { bold: true, color: { argb: AZUL } };
  for (const [k, v] of [["Municipio", pf.municipio], ["Barrios", (pf.barrios ?? []).join(", ") || "todos"], ["Tipo de vivienda", pf.tipo_vivienda],
    ["Unidades", `${pf.unidades_min}${pf.unidades_max ? ` a ${pf.unidades_max}` : " o más"}`], ["Área por unidad (m²)", pf.area_unidad_m2],
    ["Pisos mínimos", pf.pisos_min ?? "sin mínimo"], ["Área de lote (m²)", `${pf.area_lote_min ?? "—"} a ${pf.area_lote_max ?? "—"}`],
    ["Precio objetivo por m²", pf.precio_m2_objetivo ?? "no definido"], ["Eficiencia (vendible / construido)", pf.eficiencia],
    ["Permite comprar derechos de construcción", pf.permitir_compra_derechos ? "sí" : "no"]]) r.addRow([k, v]);
  r.addRow([]);
  const s = e.resumen ?? {};
  r.addRow(["Resultado"]).font = { bold: true, color: { argb: AZUL } };
  for (const [k, v] of [["Lotes que cumplen la norma", s.lotes_que_cumplen_la_norma], ["Con norma base", s.con_norma_base],
    ["Solo comprando derechos", s.solo_comprando_derechos], ["Evaluados con mercado", s.evaluados_con_mercado]]) r.addRow([k, v]);
  r.addRow([]);
  r.addRow(["Método"]).font = { bold: true, color: { argb: AZUL } };
  const mt = r.addRow([e.metodo]); r.mergeCells(mt.number, 1, mt.number, 2); mt.getCell(1).alignment = { wrapText: true }; mt.height = 90;
  for (const a of e.advertencias ?? []) { const x = r.addRow([a]); r.mergeCells(x.number, 1, x.number, 2); x.getCell(1).alignment = { wrapText: true }; x.font = { italic: true, size: 9 }; }

  const t = wb.addWorksheet("Ranking de lotes");
  const cols = ["#", "Puntaje", "Predio", "Barrio", "Área lote m²", "Tratamiento", "Altura máx", "IC base", "IC con derechos", "Densidad viv/ha",
    "Unidades posibles", "Exige derechos", "Construcciones", "Área construida m²", "Valor suelo $/m²", "Precio zona $/m²", "Fuente precio",
    "Ventas mes Galería 2 km", "Meses inventario", "Proyectos nuevos 1,5 km", "Compradores 90 d", "Usados en venta", "Folio", "Señales de venta",
    "Encaje", "Precio", "Absorción", "Demanda", "Señales", "Facilidad", "Lat", "Lon", "Por qué"];
  encabezado(t.addRow(cols));
  (e.oportunidades ?? []).forEach((o: any, i: number) => {
    t.addRow([i + 1, o.puntaje, o.id, o.barrio, o.area_lote_m2, o.tratamiento, o.norma?.altura_max_pisos, o.norma?.ic_base, o.norma?.ic_con_derechos,
      o.norma?.densidad_viv_ha, o.unidades_posibles, o.requiere_compra_derechos ? "sí" : "no", o.construccion_actual?.construcciones,
      o.construccion_actual?.area_construida_m2, o.valor_suelo_m2, o.mercado?.precio_m2_referencia, o.mercado?.fuente_precio,
      o.mercado?.galeria?.ventas_mes ?? null, o.mercado?.galeria?.meses_inventario ?? null, o.mercado?.proyectos_nuevos_1500m,
      o.mercado?.pedidos_compradores_90d_1km, o.mercado?.usados_en_venta_1km, o.folio, (o.senales_de_venta ?? []).join(", "),
      o.factores?.encaje_normativo, o.factores?.precio, o.factores?.absorcion, o.factores?.demanda, o.factores?.senales_de_venta, o.factores?.facilidad,
      o.lat, o.lon, (o.por_que ?? []).join(" · ")]);
  });
  cols.forEach((_, i) => (t.getColumn(i + 1).width = i === cols.length - 1 ? 120 : i === 3 || i === 5 || i === 16 || i === 23 ? 26 : 13));
  for (const c of [15, 16]) t.getColumn(c).numFmt = "$#,##0";
  t.views = [{ state: "frozen", ySplit: 1, xSplit: 3 }];

  const b = wb.addWorksheet("Barrios");
  encabezado(b.addRow(["Barrio", "Lotes que cumplen", "Área de lotes m²", "Unidades posibles (norma base)"]));
  for (const x of s.barrios_con_mas_lotes ?? []) b.addRow([x.barrio, x.lotes, x.area_lote_total, x.unidades_posibles]);
  b.columns.forEach((c, i) => (c.width = i === 0 ? 32 : 20));

  return Buffer.from(await wb.xlsx.writeBuffer());
}

// Cartera de lotes: resumen y ranking.
export async function carteraAExcel(e: any): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "irrelevant · Inteligencia de suelo";
  const r = wb.addWorksheet("Resumen");
  r.columns = [{ width: 40 }, { width: 70 }];
  r.addRow(["ANÁLISIS DE CARTERA DE LOTES"]).font = { bold: true, size: 14, color: { argb: AZUL } };
  r.addRow([e.estudio]).font = { bold: true, size: 12 };
  r.addRow(["Fecha", e.fecha]);
  for (const [k, v] of Object.entries(e.resumen ?? {})) r.addRow([k.replace(/_/g, " "), v]);
  r.addRow([]);
  const m = r.addRow([e.metodo]); r.mergeCells(m.number, 1, m.number, 2); m.getCell(1).alignment = { wrapText: true }; m.height = 60;
  const al = r.addRow([e.aviso_legal]); r.mergeCells(al.number, 1, al.number, 2); al.getCell(1).alignment = { wrapText: true }; al.font = { italic: true, size: 9 }; al.height = 30;
  if ((e.no_encontrados ?? []).length) r.addRow(["No encontrados", e.no_encontrados.join(", ")]);
  const t = wb.addWorksheet("Ranking");
  const cols = ["#", "Puntaje", "Lote", "Carpeta (Google Earth)", "Notas (Google Earth)", "Predio", "Barrio", "Municipio", "Área lote m²", "Área útil m²", "Tratamiento", "Semáforo", "Unidades conservador", "Unidades base",
    "Unidades máximo", "Pisos (base)", "Área construible base m²", "Cambio POT 2026", "Cesión EP m²", "Valor residual $/m²", "Valor referencia $/m²", "Alertas", "Lat", "Lon", "Englobe: predios", "Englobe: área m²", "Englobe: construible m²", "Englobe: viviendas"];
  encabezado(t.addRow(cols));
  (e.ranking ?? []).forEach((f: any, i: number) => {
    const row = t.addRow([i + 1, f.puntaje, f.nombre, f.carpeta ?? "", f.notas ?? "", f.predio, f.barrio, f.municipio, f.area_lote_m2, f.area_util_m2, f.tratamiento, f.semaforo, f.unidades?.conservador,
      f.unidades?.base, f.unidades?.maximo, f.pisos_base, f.area_construible_base_m2, f.cambio_pot_2026, f.cesion_espacio_publico_m2, f.valor_residual_m2, f.valor_suelo_referencia_m2,
      (f.alertas ?? []).join(" · "), f.lat, f.lon, f.englobe ? f.englobe.predios : "", f.englobe ? f.englobe.area_lotes_m2 : "", f.englobe ? f.englobe.area_construible_2026_m2 ?? f.englobe.area_construible_2014_m2 : "", f.englobe ? f.englobe.viviendas_2026_con_derechos ?? f.englobe.unidades_2014 : ""]);
    const color = f.semaforo === "rojo" ? "FFF4CCCC" : f.semaforo === "amarillo" ? "FFFFF2CC" : "FFD9EAD3";
    row.getCell(12).fill = { type: "pattern", pattern: "solid", fgColor: { argb: color } };
  });
  cols.forEach((_, i) => (t.getColumn(i + 1).width = i === 21 ? 90 : i === 4 ? 40 : [2, 3, 6, 10].includes(i) ? 26 : 13));
  for (const c of [20, 21]) t.getColumn(c).numFmt = "$#,##0";
  t.views = [{ state: "frozen", ySplit: 1, xSplit: 3 }];
  return Buffer.from(await wb.xlsx.writeBuffer());
}
