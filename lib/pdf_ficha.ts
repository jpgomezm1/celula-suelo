// Ficha normativa en PDF: identificación, semáforo, norma (2014 y proyecto 2026), cabida, área útil, cesiones, usos,
// valor residual, avisos y fuentes, con la fecha de la consulta. Se genera con pdf-lib (sin navegador).
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

const C = { negro: rgb(0.03, 0.02, 0.1), morado: rgb(0.42, 0.3, 0.9), lila: rgb(0.94, 0.93, 1), texto: rgb(0.1, 0.1, 0.12), gris: rgb(0.42, 0.42, 0.46),
  linea: rgb(0.9, 0.89, 0.85), verde: rgb(0.25, 0.6, 0.3), amarillo: rgb(0.95, 0.66, 0), rojo: rgb(0.75, 0.22, 0.17), grisLuz: rgb(0.7, 0.7, 0.72), blanco: rgb(1, 1, 1) };
const LUZ: Record<string, any> = { verde: C.verde, amarillo: C.amarillo, rojo: C.rojo, gris: C.grisLuz };

const fmt = (v: any, d = 0) => (v === null || v === undefined || Number.isNaN(Number(v)) ? "—" : Number(v).toLocaleString("es-CO", { maximumFractionDigits: d }));
const m2 = (v: any) => (v === null || v === undefined ? "—" : `${fmt(v)} m²`);
const mill = (v: any) => (v ? `$${fmt(Number(v) / 1e6, Number(v) < 1e8 ? 2 : 0)} M` : "—");

export async function fichaPdf(c: any, a: any, extra: { topografia?: any; entorno?: any } = {}): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Ficha normativa ${c.predio}`); doc.setAuthor("irrelevant · Inteligencia de suelo"); doc.setCreationDate(new Date());
  const f = await doc.embedFont(StandardFonts.Helvetica), fb = await doc.embedFont(StandardFonts.HelveticaBold);
  const W = 595.28, H = 841.89, M = 40;
  let page: PDFPage = doc.addPage([W, H]);
  let y = H;

  const seguro = (t: string, font: PDFFont) => [...String(t ?? "")].map((ch) => { try { font.widthOfTextAtSize(ch, 10); return ch; } catch { return ch === "≈" ? "~" : ch === "→" ? "->" : ch === "−" ? "-" : ch === "⚠" ? "!" : "?"; } }).join("");
  const nueva = () => { pie(); page = doc.addPage([W, H]); y = H - M; };
  const espacio = (h: number) => { if (y - h < 60) nueva(); };
  const texto = (t: string, x: number, size = 9, font = f, color = C.texto) => page.drawText(seguro(t, font), { x, y, size, font, color });
  const parrafo = (t: string, size = 8.5, font = f, color = C.texto, ancho = W - 2 * M, x = M) => {
    const palabras = seguro(t, font).split(/\s+/); let linea = "";
    for (const p of palabras) {
      const prueba = linea ? `${linea} ${p}` : p;
      if (font.widthOfTextAtSize(prueba, size) > ancho) { espacio(size + 3); page.drawText(linea, { x, y, size, font, color }); y -= size + 3; linea = p; } else linea = prueba;
    }
    if (linea) { espacio(size + 3); page.drawText(linea, { x, y, size, font, color }); y -= size + 3; }
  };
  const seccion = (t: string) => { espacio(34); y -= 12; page.drawRectangle({ x: M, y: y - 4, width: 3, height: 14, color: C.morado }); texto(t.toUpperCase(), M + 9, 10, fb, C.negro); y -= 16; };
  const tabla = (cab: string[], filas: string[][], anchos: number[]) => {
    const alto = 15; espacio(alto * 2);
    page.drawRectangle({ x: M, y: y - 4, width: W - 2 * M, height: alto, color: C.negro });
    let x = M + 5; cab.forEach((h, i) => { page.drawText(seguro(h, fb), { x, y: y, size: 7.5, font: fb, color: C.blanco }); x += anchos[i]; }); y -= alto;
    filas.forEach((fila, k) => {
      espacio(alto);
      if (k % 2 === 0) page.drawRectangle({ x: M, y: y - 4, width: W - 2 * M, height: alto, color: C.lila });
      let xx = M + 5; fila.forEach((v, i) => { page.drawText(seguro(v, i === 0 ? fb : f).slice(0, 60), { x: xx, y, size: 7.8, font: i === 0 ? fb : f, color: C.texto }); xx += anchos[i]; }); y -= alto;
    });
    y -= 4;
  };
  const pie = () => {
    page.drawLine({ start: { x: M, y: 42 }, end: { x: W - M, y: 42 }, thickness: 0.5, color: C.linea });
    page.drawText(seguro(`Ficha normativa ${c.predio} · generada el ${new Date().toLocaleString("es-CO", { timeZone: "America/Bogota" })} · irrelevant · Inteligencia de suelo`, f), { x: M, y: 30, size: 6.8, font: f, color: C.gris });
    page.drawText(`${doc.getPageCount()}`, { x: W - M - 8, y: 30, size: 7, font: f, color: C.gris });
  };

  // Encabezado
  page.drawRectangle({ x: 0, y: H - 92, width: W, height: 92, color: C.negro });
  page.drawRectangle({ x: 0, y: H - 95, width: W, height: 3, color: C.morado });
  page.drawText("irrelevant", { x: M, y: H - 34, size: 15, font: fb, color: C.blanco });
  page.drawText("INTELIGENCIA DE SUELO · FICHA NORMATIVA", { x: M, y: H - 50, size: 7.5, font: f, color: rgb(0.8, 0.78, 0.95) });
  page.drawText(seguro(`${c.barrio ?? ""}${c.barrio ? ", " : ""}${c.municipio ?? ""}`, fb), { x: M, y: H - 73, size: 16, font: fb, color: C.blanco });
  page.drawText(seguro(`Consulta del ${new Date().toLocaleDateString("es-CO", { timeZone: "America/Bogota", day: "numeric", month: "long", year: "numeric" })}`, f), { x: W - M - 150, y: H - 34, size: 8, font: f, color: rgb(0.8, 0.78, 0.95) });
  y = H - 118;

  // Identificación
  seccion("Identificación del predio");
  const id = c.identificacion ?? {};
  tabla(["Dato", "Valor"], [
    ["Predio", String(c.predio)], ["CBML", id.cbml ?? "—"], ["Matrícula(s)", (id.matriculas ?? []).slice(0, 4).join(", ") || "—"],
    ["Dirección", (id.direcciones ?? []).slice(0, 2).join(" · ") || "—"], ["Área del lote", m2(c.area_lote_m2)], ["Clase de suelo", c.clase_suelo ?? "—"],
    ["Construcción actual", `${fmt(c.construccion_actual?.construcciones)} construcciones · ${m2(c.construccion_actual?.area_construida_m2)}`],
  ], [140, 375]);

  // Semáforo
  seccion(`Semáforo del lote: ${String(a.semaforo.general).toUpperCase()}`);
  for (const it of a.semaforo.items) {
    espacio(26);
    page.drawCircle({ x: M + 6, y: y + 3, size: 5, color: LUZ[it.luz] ?? C.grisLuz });
    texto(it.categoria, M + 18, 8.8, fb); y -= 11;
    parrafo(it.lectura, 8, f, C.gris, W - 2 * M - 18, M + 18); y -= 2;
  }

  // Norma
  seccion("Norma");
  const nm = c.norma ?? {}; const b26 = a.pot_2026_preliminar;
  const fa = b26?.disponible ? b26.frente_a_2014 : null;
  tabla(["Parámetro", "POT 2014 (vigente en datos)", "Proyecto POT 2026", "Cambio"], [
    ["Tratamiento", `${nm.tratamiento ?? "—"} ${nm.codigo ? `(${nm.codigo})` : ""}`, b26?.codigo_2026 ?? "—", ""],
    ["Uso del suelo", nm.uso_del_suelo ?? "—", "", ""],
    ["Altura máxima", nm.altura_max_pisos ? `${nm.altura_max_pisos} pisos` : nm.altura_texto ?? "—", "", ""],
    ["Índice de construcción", fmt(nm.indice_construccion_base, 1), fa ? fmt(fa.indice_construccion.pot2026, 1) : "—", fa?.indice_construccion.cambio ?? ""],
    ["IC con compra de derechos", fmt(nm.indice_construccion_con_derechos, 1), b26?.norma?.derechos_adicionales ? fmt(b26.norma.derechos_adicionales.ic_total, 1) : "—", ""],
    ["Densidad (viv/ha)", fmt(nm.densidad_max_viv_ha), fa ? fmt(fa.densidad_viv_ha.pot2026) : "—", fa?.densidad_viv_ha.cambio ?? ""],
    ["Área construible", m2(c.que_se_puede_hacer?.area_construible_m2), fa ? m2(fa.area_construible_m2.pot2026) : "—", fa?.area_construible_m2.cambio ?? ""],
    ["Viviendas por densidad", fmt(c.que_se_puede_hacer?.viviendas_max_por_densidad), fa ? fmt(fa.viviendas.pot2026) : "—", fa?.viviendas.cambio ?? ""],
    ["Valor de referencia del suelo", c.valor_suelo_referencia_m2 ? `${mill(c.valor_suelo_referencia_m2)}/m²` : "—", "", ""],
  ], [150, 140, 140, 85]);
  if (b26?.estado) parrafo(`Proyecto POT 2026: ${b26.estado}`, 7, f, C.gris);

  // Cabida
  seccion("Qué se puede construir (cabida aproximada)");
  const esc = a.cabida.escenarios as any[];
  tabla(["", ...esc.map((e) => e.escenario.replace(/\s*\(.*\)/, ""))], [
    ["Norma usada", ...esc.map((e) => e.escenario.match(/\((.*)\)/)?.[1] ?? "")],
    ["Índice de construcción", ...esc.map((e) => fmt(e.indice_construccion, 1))],
    ["Densidad (viv/ha)", ...esc.map((e) => fmt(e.densidad_viv_ha))],
    ["Área construible", ...esc.map((e) => m2(e.area_construible_m2))],
    ["Área vendible", ...esc.map((e) => m2(e.area_vendible_m2))],
    ["Unidades", ...esc.map((e) => `${fmt(e.unidades)}${e.limita ? ` (${e.limita})` : ""}`)],
    ["Pisos sobre rasante", ...esc.map((e) => `${fmt(e.pisos_sobre_rasante)}${e.limitado_por_altura ? " (tope altura)" : ""}`)],
    ["Parqueaderos / sótanos", ...esc.map((e) => `${fmt(e.parqueaderos)} / ${fmt(e.sotanos_aprox)}`)],
  ], [125, 130, 130, 130]);
  const s = a.cabida.supuestos;
  parrafo(`Supuestos: ${s.area_unidad_m2} m² por unidad, ${Math.round(s.eficiencia_vendible * 100)} % vendible, índice de ocupación ${s.indice_ocupacion}, ${s.parqueaderos_por_vivienda} parqueadero por vivienda + ${s.visitantes_por_vivienda} de visitantes, ${s.m2_por_parqueadero_en_sotano} m² por parqueadero. ${a.cabida.nota}`, 7, f, C.gris);

  // Área útil y cesiones
  seccion("Área útil y cesiones");
  const au = a.area_util;
  tabla(["Concepto", "Valor", "Detalle"], [
    ["Área del lote", m2(au.area_lote_m2), ""],
    ["Área afectada", m2(au.area_afectada_m2), [...au.proteccion.map((p: any) => `${p.tipo} ${m2(p.m2)}`), ...au.amenaza_alta.map((p: any) => `amenaza alta ${p.tipo}`)].join(" · ") || "sin afectaciones cruzadas"],
    ["Área útil", m2(au.area_util_m2), ""],
    ["Cesión de suelo (espacio público)", m2(a.cesiones.espacio_publico_suelo_m2), `${a.cesiones.pct_del_lote ?? "—"} % del lote · ${a.cesiones.regla}`],
    ["Equipamiento construido", m2(a.cesiones.equipamiento_construido_m2), a.cesiones.regla_equipamiento],
  ], [150, 80, 285]);
  parrafo(`${au.nota} ${a.cesiones.nota}`, 7, f, C.gris);

  // Topografía y entorno
  const tp = extra.topografia, en = extra.entorno;
  if (tp?.disponible || en?.pisos_mediana != null) {
    seccion("Topografía y entorno (análisis previo)");
    const filas: string[][] = [];
    if (tp?.disponible) {
      filas.push(["Pendiente media", `${tp.pendiente_pct} % (${tp.clase})${tp.cae_hacia ? `, cae hacia el ${tp.cae_hacia}` : ""}`, `máx. local ${tp.pendiente_max_local_pct} %`]);
      filas.push(["Desnivel en el lote", `${tp.desnivel_m} m`, `cotas ${tp.cota_min_m}–${tp.cota_max_m} m s.n.m.`]);
      if (tp.via) filas.push(["Relación con la vía", tp.via.lectura, tp.via.nombre]);
      filas.push(["Movimiento de tierras (plataforma)", `${tp.movimiento_tierras.corte_m3.toLocaleString("es-CO")} m3 corte / ${tp.movimiento_tierras.lleno_m3.toLocaleString("es-CO")} m3 lleno`, "orden de magnitud"]);
    }
    if (en?.pisos_mediana != null) filas.push(["Altura del entorno (150 m)", `mitad hasta ${en.pisos_mediana} pisos; máx. ${en.pisos_max}`, `${en.predios_con_construccion} predios (catastro)`]);
    tabla(["Concepto", "Valor", "Detalle"], filas, [170, 200, 145]);
    // Perfil del terreno
    const pf: { d: number; z: number }[] = tp?.perfil ?? [];
    if (pf.length > 3) {
      espacio(90);
      const x0 = M, ancho = W - 2 * M, alto = 70, base = y - alto;
      const dMax = pf[pf.length - 1].d || 1, zMin = Math.min(...pf.map((p) => p.z)), zMax = Math.max(...pf.map((p) => p.z));
      const k = Math.min(ancho / dMax, alto / Math.max(zMax - zMin + 2, 1));
      for (let i = 1; i < pf.length; i++) page.drawLine({ start: { x: x0 + pf[i - 1].d * (ancho / dMax), y: base + (pf[i - 1].z - zMin) * k }, end: { x: x0 + pf[i].d * (ancho / dMax), y: base + (pf[i].z - zMin) * k }, thickness: 1.6, color: C.morado });
      page.drawLine({ start: { x: x0, y: base }, end: { x: x0 + ancho, y: base }, thickness: 0.4, color: C.linea });
      y = base - 12;
      parrafo(`Perfil del terreno en la dirección de la pendiente (${Math.round(dMax)} m${k < ancho / dMax ? ", altura exagerada" : ", escala real"}). ${tp.sotanos}`, 7, f, C.gris);
    }
    if (tp?.disponible) parrafo(`Fuente: ${tp.fuente.nombre} (${tp.fuente.resolucion_m} m). ${tp.fuente.advertencia ?? ""} ${tp.aviso}`, 7, f, C.gris);
  }

  // Usos
  seccion(`Usos del suelo · ${a.usos.area_de_actividad}`);
  if (a.usos.usos) {
    const u = a.usos.usos as any[]; const mitad = Math.ceil(u.length / 2);
    tabla(["Actividad", "Estado", "Actividad", "Estado"], Array.from({ length: mitad }, (_, i) => [u[i]?.actividad ?? "", u[i]?.estado ?? "", u[i + mitad]?.actividad ?? "", u[i + mitad]?.estado ?? ""]), [150, 105, 150, 110]);
  }
  parrafo(a.usos.nota, 7, f, C.gris);

  // Valor residual
  if (a.valor_residual) {
    seccion("Valor residual del suelo");
    const v = a.valor_residual;
    if (v.disponible === false) parrafo(v.motivo, 8.5);
    else {
      tabla(["Concepto", "Valor"], [
        ["Lo máximo que se puede pagar por el lote", v.valor_residual_legible ?? mill(v.valor_residual_total)],
        ["Por m² de lote", v.valor_residual_m2 ? `${mill(v.valor_residual_m2)}/m²` : "—"],
        ["Valor de referencia del suelo (catastral)", v.valor_suelo_referencia_m2 ? `${mill(v.valor_suelo_referencia_m2)}/m²` : "—"],
        ["Precio de venta supuesto", v.precio_m2_venta_supuesto ? `${mill(v.precio_m2_venta_supuesto)}/m²` : "—"],
      ], [260, 255]);
      parrafo(v.nota, 7, f, C.gris);
    }
  }

  // Avisos
  seccion("Avisos");
  if (c.aviso_pot) parrafo(c.aviso_pot, 7.5);
  if (c.advertencia) parrafo(c.advertencia, 7.5);
  y -= 2;
  parrafo(a.aviso_legal, 7.5, fb);
  y -= 4;
  parrafo("Fuentes: catastro y POT municipales (GeoMedellín, IDEM del Área Metropolitana, GeoAntioquia, Cornare); Proyecto de Acuerdo 104 de 2026 de la revisión del POT de Medellín (Tomo V v3); matrículas de MEData; OpenStreetMap; mercado de Fynder.", 7, f, C.gris);
  pie();
  return doc.save();
}
