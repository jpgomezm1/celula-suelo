// Carpeta para el comité de tierras (PDF): resumen ejecutivo con veredicto, el lote (fachada, norma, riesgos, topografía,
// entorno, folio), anteproyecto (planchas en vector), mercado, números (presupuesto, cronograma, flujo, sensibilidades),
// riesgos y comparación con la tesis de inversión, y próximos pasos.
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { sql } from "../db";
import { encontrarPredio } from "../ficha";
import { analizarLote } from "../analisis_lote";
import { topografiaLote } from "../topografia";
import { entornoLote } from "../entorno";
import { fachadaLote, imagenFachada } from "../fachada";
import { planchas } from "../cabida/planos";
import { aPdf } from "../cabida/lienzo";
import type { PerfilConstructora } from "../constructora/perfil";

const C = { negro: rgb(0.03, 0.02, 0.1), morado: rgb(0.42, 0.3, 0.9), lila: rgb(0.94, 0.93, 1), texto: rgb(0.1, 0.1, 0.12), gris: rgb(0.42, 0.42, 0.46),
  linea: rgb(0.88, 0.87, 0.83), verde: rgb(0.2, 0.55, 0.28), amarillo: rgb(0.85, 0.6, 0), rojo: rgb(0.72, 0.2, 0.15), blanco: rgb(1, 1, 1), fondo: rgb(0.98, 0.98, 0.96) };
const fmt = (v: any, d = 0) => (v === null || v === undefined || Number.isNaN(Number(v)) ? "—" : Number(v).toLocaleString("es-CO", { maximumFractionDigits: d }));
const mill = (v: any) => (v == null ? "—" : `$${fmt(Number(v) / 1e6, Math.abs(Number(v)) < 1e8 ? 2 : 0)} M`);
const pct = (v: any, d = 1) => (v == null ? "—" : `${fmt(v, d)} %`);

export async function carpetaComite(m: any, f: any, perfil: PerfilConstructora) {
  const doc = await PDFDocument.create();
  doc.setTitle(`Carpeta de comité · ${m.barrio ?? m.predio}`); doc.setAuthor("irrelevant · Inteligencia de suelo");
  const fr = await doc.embedFont(StandardFonts.Helvetica), fb = await doc.embedFont(StandardFonts.HelveticaBold);
  const W = 595.28, H = 841.89, M = 44;
  let page: PDFPage = doc.addPage([W, H]); let y = H - M;
  const seguro = (t: string, font: PDFFont) => [...String(t ?? "")].map((ch) => { try { font.widthOfTextAtSize(ch, 10); return ch; } catch { return ch === "≈" ? "~" : ch === "≥" ? ">=" : ch === "≤" ? "<=" : ch === "✓" ? "OK" : ch === "✗" ? "X" : ch === "−" ? "-" : ch === "→" ? "->" : "?"; } }).join("");
  const pie = () => page.drawText(seguro(`Carpeta de comité · ${m.predio} · ${new Date().toLocaleDateString("es-CO", { timeZone: "America/Bogota" })} · irrelevant · Inteligencia de suelo · Prefactibilidad: no reemplaza estudios técnicos ni de títulos`, fr), { x: M, y: 24, size: 6.8, font: fr, color: C.gris });
  const nueva = () => { pie(); page = doc.addPage([W, H]); y = H - M; };
  const espacio = (h: number) => { if (y - h < 50) nueva(); };
  const texto = (t: string, x: number, size = 9, font = fr, color = C.texto) => page.drawText(seguro(t, font), { x, y, size, font, color });
  const parrafo = (t: string, size = 9, font = fr, color = C.texto, ancho = W - 2 * M, x = M) => {
    let linea = "";
    for (const p of seguro(t, font).split(/\s+/)) {
      const prueba = linea ? `${linea} ${p}` : p;
      if (font.widthOfTextAtSize(prueba, size) > ancho) { espacio(size + 3); page.drawText(linea, { x, y, size, font, color }); y -= size + 3.5; linea = p; } else linea = prueba;
    }
    if (linea) { espacio(size + 3); page.drawText(linea, { x, y, size, font, color }); y -= size + 3.5; }
  };
  const titulo = (t: string) => { espacio(40); y -= 10; page.drawRectangle({ x: M, y: y - 4, width: 4, height: 16, color: C.morado }); texto(t.toUpperCase(), M + 11, 11.5, fb, C.negro); y -= 22; };
  const tabla = (cab: string[], filas: string[][], anchos: number[], alto = 15, izq: number[] = [0]) => {
    y -= 6; espacio(alto * 2);
    page.drawRectangle({ x: M, y: y - 4, width: W - 2 * M, height: alto, color: C.negro });
    let x = M + 5; cab.forEach((h, i) => { page.drawText(seguro(h, fb), { x: izq.includes(i) ? x : x + anchos[i] - 10 - fb.widthOfTextAtSize(seguro(h, fb), 7.6), y, size: 7.6, font: fb, color: C.blanco }); x += anchos[i]; }); y -= alto;
    filas.forEach((fila, k) => {
      espacio(alto);
      if (k % 2 === 0) page.drawRectangle({ x: M, y: y - 4, width: W - 2 * M, height: alto, color: C.lila });
      let xx = M + 5;
      fila.forEach((v, i) => { const font = i === 0 ? fb : fr; let t = seguro(v ?? "", font); while (t.length > 3 && font.widthOfTextAtSize(t, 8) > anchos[i] - 12) t = t.slice(0, -2); if (t !== seguro(v ?? "", font)) t = t.slice(0, -1) + "…"; page.drawText(t, { x: izq.includes(i) ? xx : xx + anchos[i] - 10 - font.widthOfTextAtSize(t, 8), y, size: 8, font, color: C.texto }); xx += anchos[i]; });
      y -= alto;
    });
    y -= 6;
  };
  const kpis = (items: [string, string][]) => {
    espacio(56);
    const w = (W - 2 * M - 8 * (items.length - 1)) / items.length;
    items.forEach(([v, k], i) => {
      const x = M + i * (w + 8);
      page.drawRectangle({ x, y: y - 40, width: w, height: 48, color: C.fondo, borderColor: C.linea, borderWidth: 0.6 });
      page.drawText(seguro(v, fb), { x: x + 8, y: y - 14, size: 14, font: fb, color: C.negro });
      page.drawText(seguro(k, fr).slice(0, 44), { x: x + 8, y: y - 30, size: 7.5, font: fr, color: C.gris });
    });
    y -= 58;
  };

  // ---------- Datos complementarios ----------
  const p = await encontrarPredio({ id: m.predio });
  const [an, topo, ent, fach, folio]: any = await Promise.all([
    analizarLote(p!, { con_mercado: false }), topografiaLote(m.predio).catch(() => null), entornoLote(m.predio).catch(() => null), fachadaLote(m.predio).catch(() => null),
    sql`SELECT * FROM parcel_senales WHERE parcel_id = ${m.predio}`.then((r) => r[0] ?? null).catch(() => null)]);
  const R = f.resultado, L = f.lote, r = m.resumen;

  // ---------- Portada y resumen ejecutivo ----------
  page.drawRectangle({ x: 0, y: H - 150, width: W, height: 150, color: C.negro });
  page.drawRectangle({ x: 0, y: H - 154, width: W, height: 4, color: C.morado });
  page.drawText("irrelevant", { x: M, y: H - 46, size: 16, font: fb, color: C.blanco });
  page.drawText(seguro(`CARPETA DE COMITÉ DE TIERRAS${perfil.id !== "referencia" ? ` · ${perfil.nombre.toUpperCase()}` : ""}`, fr), { x: M, y: H - 64, size: 8, font: fr, color: rgb(0.8, 0.78, 0.95) });
  page.drawText(seguro(`${m.barrio ?? ""}${m.barrio ? ", " : ""}${m.municipio ?? ""}`, fb), { x: M, y: H - 100, size: 22, font: fb, color: C.blanco });
  page.drawText(seguro(`Predio ${m.predio}${folio?.registro ? ` · matrícula ${folio.registro}` : ""} · lote de ${fmt(r.area_lote_m2)} m²`, fr), { x: M, y: H - 120, size: 9.5, font: fr, color: rgb(0.85, 0.84, 0.95) });
  page.drawText(seguro(new Date().toLocaleDateString("es-CO", { timeZone: "America/Bogota", day: "numeric", month: "long", year: "numeric" }), fr), { x: W - M - 120, y: H - 46, size: 9, font: fr, color: rgb(0.8, 0.78, 0.95) });
  y = H - 182;
  const col = f.veredicto === "VA" ? C.verde : f.veredicto === "VA CON AJUSTES" ? C.amarillo : f.veredicto === "NO VA" ? C.rojo : C.morado;
  page.drawRectangle({ x: M, y: y - 52, width: W - 2 * M, height: 62, color: C.fondo, borderColor: col, borderWidth: 2 });
  page.drawText(seguro(f.veredicto === "VALOR MÁXIMO" ? "VALOR MÁXIMO A PAGAR POR EL LOTE" : `RECOMENDACIÓN: ${f.veredicto}`, fb), { x: M + 14, y: y - 12, size: 13, font: fb, color: col });
  page.drawText(seguro(`${mill(L.valor_maximo)} (${mill(L.por_m2_lote)}/m² de lote)${f.veredicto !== "VALOR MÁXIMO" ? ` · lote evaluado ${mill(L.costo_evaluado)}` : ""}`, fb), { x: M + 14, y: y - 30, size: 11, font: fb, color: C.negro });
  page.drawText(seguro(f.razones.join("   ·   "), fr), { x: M + 14, y: y - 45, size: 8, font: fr, color: C.texto });
  y -= 74;
  kpis([[`${r.unidades}`, `viviendas en ${r.torres} torre(s) de ${r.pisos_totales} pisos`], [mill(R.ventas), "ventas proyectadas"], [mill(R.utilidad), `utilidad · margen ${pct(R.margen_pct)}`], [pct(R.tir_ea_pct), "TIR efectiva anual"]]);
  kpis([[mill(R.exposicion_maxima), "exposición máxima de caja"], [`${R.duracion_meses} meses`, `duración · ${R.meses_de_ventas} de ventas`], [pct(r.aprovechamiento_pct, 0), "de la norma aprovechada"], [`${fmt(r.area_vendible_m2)} m²`, `vendibles · eficiencia ${r.eficiencia_planta_pct} %`]]);
  titulo("Lectura para el comité");
  const lectura: string[] = [];
  lectura.push(`El lote permite ${r.unidades} viviendas (${r.por_tipologia.map((x: any) => `${x.unidades} de ${x.tipologia.toLowerCase()}`).join(", ")}) en ${r.torres} torre(s) de ${r.pisos_totales} pisos, con ${r.sotanos} sótano(s) y ${r.parqueaderos_dibujados} parqueaderos; aprovecha el ${r.aprovechamiento_pct} % del área construible de la norma (${r.escenario}).`);
  lectura.push(`El mercado a ${f.mercado.radio_m / 1000} km (${f.mercado.comparables} proyectos de Galería del mismo estrato ±1) vende a una mediana de ${mill(f.mercado.precio_m2_mediano)}/m² y ${fmt(f.mercado.absorcion_usada_mes, 1)} unidades al mes: el proyecto tardaría unos ${R.meses_de_ventas} meses en venderse.`);
  lectura.push(`Con el perfil "${perfil.nombre}", el valor máximo del lote es ${mill(L.valor_maximo)}: ${L.valor_maximo === L.por_tir ? "lo limita la TIR mínima" : L.valor_maximo === L.por_margen ? "lo limita el margen mínimo" : "lo limita el tope de lote sobre ventas"} (${perfil.comite.tir_minima_ea} % E.A. y ${perfil.comite.margen_minimo_pct} % de margen).`);
  const peor = f.sensibilidades.reduce((a: any, x: any) => (!a || x.margen_pct < a.margen_pct ? x : a), null);
  if (peor) lectura.push(`La sensibilidad más crítica es "${peor.escenario}": el margen cae a ${pct(peor.margen_pct)} y el valor máximo del lote a ${mill(peor.valor_maximo_lote)}.`);
  const alertas = an.semaforo.items.filter((i: any) => i.luz === "rojo" || i.luz === "amarillo").map((i: any) => i.categoria);
  if (alertas.length) lectura.push(`Alertas a resolver antes de comprar: ${alertas.join(", ")}.`);
  for (const l of lectura) { parrafo(`• ${l}`, 9.2); y -= 2; }
  titulo("Próximos pasos sugeridos");
  for (const s of ["Estudio de títulos del folio y de los titulares (cadena de tradición, gravámenes, limitaciones).", "Levantamiento topográfico y estudio de suelos preliminar.",
    "Validar la norma específica con la curaduría o el DAP (retiros, aislamientos, obligaciones y parqueaderos).", "Ajustar el presupuesto con costos reales de obras recientes de la constructora.",
    `Negociación del lote con un tope de ${mill(L.valor_maximo)}; explorar pago por etapas o permuta para mejorar la TIR.`]) parrafo(`• ${s}`, 9);

  // ---------- El lote ----------
  nueva(); titulo("1. El lote");
  if (fach?.disponible) {
    try {
      const jpg = await imagenFachada(fach.pano, fach.heading, 640, 360);
      if (jpg) { const img = await doc.embedJpg(jpg); const w = W - 2 * M, h = (w * 360) / 640; espacio(h + 20); page.drawImage(img, { x: M, y: y - h, width: w, height: h }); y -= h + 6; texto(`Fachada desde la vía (Google Street View, imagen de ${fach.fecha ?? "fecha no informada"}). © Google`, M, 7.5, fr, C.gris); y -= 14; }
    } catch { /* la foto es opcional */ }
  }
  tabla(["Dato", "Valor"], [
    ["Ubicación", `${m.barrio ?? "—"}, ${m.municipio ?? "—"}`], ["Área del lote", `${fmt(r.area_lote_m2)} m²`], ["Tratamiento / código", `${p?.tratamiento ?? "—"} · ${p?.codigo_tratamiento ?? "—"}`],
    ["Índice de construcción / densidad", `${fmt(p?.ic_max, 2)} · ${fmt(p?.densidad_max)} viv/ha`], ["Altura máxima", p?.altura_max ? `${p.altura_max} pisos` : "Sin tope en la norma cargada"],
    ["Construcción existente", `${fmt(p?.construcciones)} construcciones · ${fmt(p?.area_construida)} m²`],
    ["Topografía", topo?.disponible ? `${topo.clase} · pendiente ${pct(topo.pendiente_pct)} · desnivel ${fmt(topo.desnivel_m, 1)} m · ${topo.via?.lectura ?? ""}` : "—"],
    ["Entorno (150 m)", ent ? `la mitad de los predios hasta ${ent.pisos_mediana} pisos; máximo ${ent.pisos_max}` : "—"],
  ], [190, 317]);
  titulo("Semáforo de riesgos");
  tabla(["Categoría", "Luz", "Detalle"], an.semaforo.items.map((i: any) => [i.categoria, i.luz.toUpperCase(), i.lectura ?? ""]), [140, 60, 307], 15, [0, 1, 2]);
  if (folio) {
    titulo("Folio de matrícula (señales 2015–2023)");
    const s = [folio.sucesion && "sucesión", folio.hipoteca && "hipoteca", folio.embargos && "embargos", folio.fiducia && "fiducia", folio.litigio && "litigio", folio.dacion_en_pago && "dación en pago", folio.derechos_de_cuota && "derechos de cuota", folio["señal_empresa"] && "titular probable empresa"].filter(Boolean);
    parrafo(`Matrícula ${folio.registro ?? "—"} · folio abierto en ${folio.folio_abierto ? new Date(folio.folio_abierto).getFullYear() : "—"} · ${fmt(folio.actos_2015_2023)} actos entre 2015 y 2023. Señales: ${s.length ? s.join(", ") : "ninguna particular"}. No incluye nombres de titulares (Ley 1581 de 2012): el estudio de títulos va por la ruta legal.`, 9);
  }

  // ---------- Anteproyecto ----------
  nueva(); titulo("2. Anteproyecto esquemático");
  kpis([[`${r.torres} torres`, `${r.pisos_totales} pisos · ${fmt(r.altura_m, 1)} m`], [`${r.aptos_por_piso}`, "apartamentos por piso tipo"], [`${fmt(r.area_construida_sobre_rasante_m2)} m²`, "construidos sobre rasante"], [`${r.sotanos}`, `sótanos · ${r.parqueaderos_dibujados} parqueaderos`]]);
  tabla(["Tipología", "Unidades", "Área prom.", "Mezcla"], r.por_tipologia.map((x: any) => [x.tipologia, String(x.unidades), `${fmt(x.area_promedio_m2, 1)} m²`, `${x.pct} %`]), [207, 100, 100, 100]);
  parrafo(`Norma aplicada: ${m.norma.fuente}. Retiros: frontal ${m.norma.frontal} m, lateral ${m.norma.lateral} m, fondo ${m.norma.fondo} m, entre torres ${m.norma.entre_torres} m. Punto fijo: ${r.punto_fijo.escaleras} escalera(s)${r.punto_fijo.a_prueba_de_humo ? " a prueba de humo" : ""} y ${r.punto_fijo.ascensores} ascensor(es) por torre.`, 8.5, fr, C.gris);
  parrafo("Las planchas del anteproyecto (localización, planta tipo, torre ampliada y cuadro de áreas) se anexan al final de esta carpeta.", 8.5, fr, C.gris);

  // ---------- Mercado ----------
  titulo("3. Mercado y precios");
  parrafo(`Comparables de Galería Inmobiliaria a ${f.mercado.radio_m / 1000} km, mismo tipo de vivienda y estrato ${f.mercado.estrato_usado ?? "s/d"} ±1, sin vivienda turística ni proyectos desistidos. Mediana ${mill(f.mercado.precio_m2_mediano)}/m², área mediana ${f.mercado.area_mediana_m2} m², ${fmt(f.mercado.absorcion_mercado_mes, 1)} unidades/mes por proyecto.`, 9);
  tabla(["Proyecto", "Estrato", "$/m²", "Área", "Ventas/mes", "Disponibles"], f.mercado.lista.slice(0, 10).map((c: any) => [c.proyecto, String(c.estrato ?? ""), mill(c.precio_m2), `${c.area_m2} m²`, fmt(c.ventas_mes, 1), fmt(c.disponibles)]), [187, 50, 70, 60, 70, 70]);
  tabla(["Tipología (torre " + (f.producto.etapas[0]?.torre ?? "") + ")", "Área", "Precio m²", "Precio unidad"], (f.producto.etapas[0]?.tipologias ?? []).map((x: any) => [x.tipologia, `${fmt(x.area_promedio_m2, 1)} m²`, mill(x.precio_m2), mill(x.precio_unidad)]), [187, 100, 110, 110]);
  parrafo("Datos de Galería: uso interno del cliente que los contrata.", 7.5, fr, C.gris);

  // ---------- Números ----------
  nueva(); titulo("4. Números del proyecto");
  const nombres: Record<string, string> = { lote: "Lote", directo: "Costo directo", indirecto: "Indirectos", licencias: "Licencias e impuestos", ventas: "Ventas y publicidad", fiducia: "Fiducia", sala: "Sala de ventas", compensacion: "Compensaciones", intereses: "Intereses crédito constructor" };
  tabla(["Partida", "Valor", "% del costo"], [...Object.entries(f.presupuesto.partidas).map(([k, v]) => [nombres[k] ?? k, mill(v), pct((Number(v) / f.presupuesto.costo_total) * 100)]), ["Total", mill(f.presupuesto.costo_total), "100 %"]], [267, 140, 100]);
  parrafo(`Costo directo ${mill(f.presupuesto.costo_directo_m2)}/m² construido; indirectos ${pct(f.presupuesto.indirectos_pct)} del directo (perfil ${perfil.nombre}).`, 8.5, fr, C.gris);
  titulo("Cronograma por etapas");
  tabla(["Torre", "Unidades", "Lanzamiento", "Inicio obra", "Entrega", "Escrituración"], f.cronograma.map((c: any) => [c.torre, String(c.unidades), `mes ${c.lanzamiento}`, `mes ${c.inicio_obra}`, `mes ${c.entrega}`, `mes ${c.escrituracion}`]), [77, 80, 90, 90, 80, 90]);
  titulo("Flujo de caja (acumulado)");
  {
    const alto = 130; espacio(alto + 20);
    const fl = f.flujo as any[], max = Math.max(1, ...fl.map((x) => Math.abs(x.acumulado)), ...fl.map((x) => Math.abs(x.neto)));
    const x0 = M, ancho = W - 2 * M, y0 = y - alto / 2;
    page.drawRectangle({ x: x0, y: y - alto, width: ancho, height: alto, color: C.fondo, borderColor: C.linea, borderWidth: 0.6 });
    page.drawLine({ start: { x: x0, y: y0 }, end: { x: x0 + ancho, y: y0 }, thickness: 0.5, color: C.linea });
    const bw = Math.max(1, ancho / fl.length - 0.6);
    fl.forEach((v, i) => { const h = (v.neto / max) * (alto / 2 - 6); page.drawRectangle({ x: x0 + (i * ancho) / fl.length, y: h >= 0 ? y0 : y0 + h, width: bw, height: Math.abs(h), color: h >= 0 ? C.verde : C.rojo, opacity: 0.5 }); });
    for (let i = 1; i < fl.length; i++) page.drawLine({ start: { x: x0 + ((i - 1) * ancho) / fl.length, y: y0 + (fl[i - 1].acumulado / max) * (alto / 2 - 6) }, end: { x: x0 + (i * ancho) / fl.length, y: y0 + (fl[i].acumulado / max) * (alto / 2 - 6) }, thickness: 1.6, color: C.morado });
    y -= alto + 6; texto(`Barras: flujo neto mensual · línea morada: acumulado · exposición máxima ${mill(R.exposicion_maxima)} · ${fl.length} meses`, M, 7.5, fr, C.gris); y -= 14;
  }
  titulo("Sensibilidades (mismo costo de lote)");
  tabla(["Escenario", "Margen", "TIR E.A.", "Utilidad", "Valor máx. lote"], [["Base", pct(R.margen_pct), pct(R.tir_ea_pct), mill(R.utilidad), mill(L.valor_maximo)], ...f.sensibilidades.map((x: any) => [x.escenario, pct(x.margen_pct), pct(x.tir_ea_pct), mill(x.utilidad), mill(x.valor_maximo_lote)])], [167, 70, 70, 100, 100]);

  // ---------- Riesgos y tesis ----------
  titulo("5. Comparación con la tesis de inversión");
  const est = f.mercado.estrato_usado;
  tabla(["Criterio", "Tesis", "Proyecto", "Cumple"], [
    ["Margen sobre ventas", `≥ ${perfil.comite.margen_minimo_pct} %`, pct(R.margen_pct), R.margen_pct >= perfil.comite.margen_minimo_pct ? "Sí" : "No"],
    ["TIR efectiva anual", `≥ ${perfil.comite.tir_minima_ea} %`, pct(R.tir_ea_pct), (R.tir_ea_pct ?? -99) >= perfil.comite.tir_minima_ea ? "Sí" : "No"],
    ["Lote / ventas", `≤ ${perfil.comite.lote_max_sobre_ventas_pct} %`, pct(L.lote_sobre_ventas_pct), L.lote_sobre_ventas_pct <= perfil.comite.lote_max_sobre_ventas_pct ? "Sí" : "No"],
    ["Estrato", perfil.comite.estratos.join(", "), String(est ?? "s/d"), est == null ? "—" : perfil.comite.estratos.includes(est) ? "Sí" : "No"],
    ["Municipio", perfil.comite.municipios.join(", ").slice(0, 40), m.municipio ?? "—", perfil.comite.municipios.includes(m.municipio) ? "Sí" : "No"],
  ], [150, 140, 137, 80]);
  titulo("Supuestos y advertencias");
  for (const s of [...f.supuestos, m.aviso]) parrafo(`• ${s}`, 8.2, fr, C.gris);
  pie();

  // ---------- Anexo: planchas del anteproyecto ----------
  const pl = planchas(m);
  const elegidas = pl.filter((x) => /Localización|Planta piso tipo|ampliada|Cuadro/.test(x.titulo));
  const anexo = await PDFDocument.load(await aPdf(elegidas, "Anexo"));
  const copias = await doc.copyPages(anexo, anexo.getPageIndices());
  copias.forEach((c) => doc.addPage(c));
  return doc.save();
}
