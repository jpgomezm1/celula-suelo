// Dibuja el reporte de lote en HTML (una sola página, marca irrelevant, gráficos en SVG sin librerías).
import type { Textos } from "./reporte_lote";

const MORADO = "#5e55fe", OSCURO = "#1a1a1f", LILA = "#a59fff", AZUL = "#38bdf8", VERDEAGUA = "#10b981", AMBAR = "#f59e0b", ROJO = "#fb7185", GRIS = "#8c88ab";
const SERIE = [MORADO, LILA, "#2d2599", "#7c74ff", "#c4c0ff", "#4338ca"];
const esc = (s: any) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const num = (x: any, d = 0) => (x == null || !Number.isFinite(Number(x)) ? "—" : Number(x).toLocaleString("es-CO", { maximumFractionDigits: d, minimumFractionDigits: 0 }));
const pesos = (x: any) => (x == null ? "—" : `$${num(x)}`);
const millones = (x: any) => (x == null ? "—" : `$${num(Number(x) / 1e6)} millones`);
const sum = (xs: any[], f: (x: any) => number) => xs.reduce((s, x) => s + (Number(f(x)) || 0), 0);
const LUZ: Record<string, string> = { rojo: "rojo", amarillo: "ambar", ambar: "ambar", verde: "verde", gris: "gris" };
const PESO: Record<string, number> = { rojo: 3, ambar: 2, gris: 1, verde: 0 };
const SIN_AMENAZA = new Set(["05212", "05308"]); // Copacabana y Girardota no publican capa de amenazas

/* ───────────── Resumen automático en palabras simples ───────────── */
// ---- Co-marca: colores y fuente del cliente sobre la plantilla ----
const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const hex = (c: number[]) => "#" + c.map((x) => Math.round(Math.max(0, Math.min(255, x))).toString(16).padStart(2, "0")).join("");
const mezcla = (a: string, b: string, t: number) => { const A = rgb(a), B = rgb(b); return hex(A.map((x, i) => x + (B[i] - x) * t)); };
const luminancia = (h: string) => { const [r, g, b] = rgb(h).map((x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
function aplicarMarca(html: string, mk: any) {
  if (!mk) return html;
  const ac = mk.color_acento ?? MORADO, os = mk.color_oscuro ?? OSCURO, claro = luminancia(ac) > 0.35;
  const pares: [string, string][] = [["#5e55fe", ac], ["#a59fff", mezcla(ac, "#ffffff", 0.35)], ["#eeecff", mezcla(ac, "#ffffff", 0.88)], ["#2d2599", mezcla(os, ac, 0.35)],
    ["#7c74ff", mezcla(ac, os, 0.25)], ["#c4c0ff", mezcla(ac, "#ffffff", 0.6)], ["#4338ca", mezcla(os, "#ffffff", 0.3)], ["#1a1a1f", os], ["#d9d7ff", mezcla(ac, "#ffffff", 0.75)],
    ["#e6e4ff", mezcla(ac, "#ffffff", 0.8)], ["#3b3670", os], ["#8c88ab", mezcla(os, "#ffffff", 0.55)], ["#cfcde0", mezcla(os, "#ffffff", 0.8)],
    ["rgba(94,85,254", `rgba(${rgb(ac).join(",")}`], ["rgba(165,159,255", `rgba(${rgb(ac).join(",")}`], ["rgba(26,26,31", `rgba(${rgb(os).join(",")}`]];
  for (const [a, b] of pares) html = html.split(a).join(b);
  if (mk.fuente_titulos) html = html.split("Poppins:wght@400;500;600;700;800").join(`${mk.fuente_titulos.replace(/ /g, "+")}:wght@400;500;600;700;800`).split("Poppins").join(`'${mk.fuente_titulos}'`);
  // Acento claro (dorado, amarillo): texto oscuro encima y títulos pequeños en el color oscuro de la marca.
  const extra = claro ? `.eyebrow{color:${os}}.eyebrow::before{content:"";display:inline-block;width:22px;height:3px;background:${ac};vertical-align:middle;margin-right:8px;border-radius:2px}.kpi.alerta .num,.kpi.alerta .num small{color:${os}}.kpi.alerta p{color:${mezcla(os, "#ffffff", 0.15)}}.ob .num{color:${os}}` : "";
  return html.replace("</style>", `${extra}.co{display:flex;align-items:center;gap:14px}.co .x{width:1px;height:30px;background:rgba(255,255,255,.25)}.co small{font-size:11.5px;color:rgba(255,255,255,.7);line-height:1.25}.co small b{color:#fff;font-weight:600}.top img.cli{height:44px}footer .pie{display:flex;align-items:center;gap:18px}footer img.cli{height:54px}footer img.irr{height:44px}</style>`);
}

export function resumenAutomatico(r: any): { titulo: string; texto: string; icono: string }[] {
  const L: any[] = r.lotes; const av = r.avaluo;
  const total = sum(L, (l) => l.area), util = sum(L, (l) => l.area_util?.area_util_m2 ?? l.area);
  const pctUtil = total ? Math.round((util / total) * 100) : 100;
  const mun = [...new Set(L.map((l) => l.municipio))].join(" y ");
  const out: { titulo: string; texto: string; icono: string }[] = [];
  const l0 = L[0];
  const trat = l0.norma?.tratamiento ? ` La norma lo clasifica como "${String(l0.norma.tratamiento).toLowerCase()}"${l0.norma.altura ? ` y permite hasta ${l0.norma.altura} pisos` : ""}.` : "";
  out.push({ icono: "📍", titulo: "Dónde está", texto: `${L.length > 1 ? `Son ${L.length} lotes vecinos` : "Es un lote"} en ${mun}${l0.barrio ? `, ${l0.barrio}` : ""}, en suelo ${l0.clase}, con ${num(total)} m² en total.${trat}` });
  if (pctUtil < 99) {
    const tipos = [...new Set(L.flatMap((l) => (l.area_util?.proteccion ?? []).map((x: any) => String(x.tipo).toLowerCase())))].slice(0, 3);
    out.push({ icono: "🧭", titulo: `Se puede usar cerca del ${pctUtil} % del terreno`, texto: `De ${num(total)} m², unos ${num(util)} m² quedan libres para construir. El resto está en ${tipos.length ? tipos.join(", ") : "zonas protegidas o de riesgo"}, donde no se puede construir.` });
  }
  const cruza = L.find((l) => l.restricciones?.hidrico?.cauces?.some((c: any) => c.cruza_el_lote && !c.canalizado));
  const enRetiro = L.filter((l) => (l.restricciones?.hidrico?.area_en_retiro_m2 ?? 0) > 1);
  if (cruza) out.push({ icono: "💧", titulo: "Una quebrada pasa por el lote", texto: "La ley obliga a dejar libre una franja a cada lado de la quebrada; ahí no se puede construir, ni siquiera sótanos." });
  else if (enRetiro.length) out.push({ icono: "💧", titulo: "Hay una quebrada cerca", texto: `Unos ${num(sum(enRetiro, (l) => l.restricciones.hidrico.area_en_retiro_m2))} m² quedan dentro del retiro que exige la quebrada y no se pueden construir.` });
  const amen = L.map((l) => l.semaforo?.items?.find((x: any) => x.categoria === "Amenaza y riesgo")).filter(Boolean);
  if (amen.some((a: any) => a.luz === "rojo")) out.push({ icono: "⚠️", titulo: "Parte del lote tiene riesgo alto", texto: "Una parte está en zona de amenaza alta (deslizamiento, inundación o avenida torrencial). Esa parte no se construye y el municipio exige un estudio de riesgo detallado." });
  else if (amen.some((a: any) => a.luz === "amarillo")) out.push({ icono: "⚠️", titulo: "Tiene un riesgo moderado", texto: "Está en zona de amenaza media o en condición de riesgo: antes de diseñar hay que hacer un estudio de suelos y de riesgo." });
  else if (L.some((l) => SIN_AMENAZA.has(l.municipio_dane))) out.push({ icono: "❔", titulo: "No sabemos el riesgo", texto: "El municipio no publica sus mapas de amenaza. Hay que pedirlos antes de avanzar." });
  const cabs = L.map((l) => l.cabida?.escenarios?.find((e: any) => /base/i.test(e.escenario))).filter((e: any) => e?.disponible);
  if (cabs.length) {
    const und = sum(cabs, (e) => e.unidades), pisos = Math.max(...cabs.map((e: any) => e.pisos_sobre_rasante ?? 0));
    out.push({ icono: "🏗️", titulo: `Cabrían unas ${num(und)} viviendas`, texto: `Con la norma actual y descontando lo que no se puede usar, cabrían unas ${num(und)} viviendas de unos ${r.lotes[0].cabida?.supuestos?.area_unidad_m2 ?? 65} m², en edificios de hasta ${pisos} pisos. Es un cálculo aproximado, no un diseño.` });
  } else out.push({ icono: "🏗️", titulo: "Falta la norma detallada", texto: "La herramienta no tiene las reglas de construcción de este lote (índices o alturas). Hay que pedirle al municipio un concepto de norma." });
  if (L.some((l) => l.advertencia)) out.push({ icono: "📄", titulo: "La norma pública está desactualizada", texto: "El mapa de normas que publica el municipio corresponde a un plan anterior. Lo que diga el plan vigente puede ser distinto: hay que confirmarlo con el municipio." });
  const inv = L.map((l) => l.inventario).find((i: any) => i && i.meses_inventario != null);
  if (inv) out.push({ icono: inv.meses_inventario > 36 ? "🐢" : inv.meses_inventario > 18 ? "⏳" : "🚀", titulo: inv.meses_inventario > 36 ? "En la zona hay mucha vivienda nueva sin vender" : inv.meses_inventario > 18 ? "La vivienda nueva se vende a ritmo medio" : "La vivienda nueva se vende rápido en la zona", texto: `Cerca hay ${num(inv.disponibles)} viviendas nuevas a la venta y se venden unas ${num(inv.ventas_mes, 1)} al mes: al ritmo actual tardarían unos ${num(inv.meses_inventario, 1)} meses en venderse.` });
  const t = L.map((l) => l.topo).find(Boolean);
  if (t) out.push({ icono: "⛰️", titulo: t.pendiente_pct < 8 ? "El terreno es casi plano" : t.pendiente_pct < 30 ? "El terreno es inclinado, pero manejable" : "El terreno es muy inclinado", texto: `Tiene una pendiente de unos ${num(t.pendiente_grados, 1)} grados (${num(t.pendiente_pct)} %) y ${num(t.desnivel_m, 1)} m de desnivel.${t.pendiente_pct >= 8 ? " Habrá que mover tierra para nivelarlo." : ""}` });
  const ref = L.find((l) => l.valor_suelo_m2)?.valor_suelo_m2;
  if (av?.precio_m2 && ref) {
    const veces = av.precio_m2 / ref;
    out.push({ icono: "💰", titulo: veces > 1.6 ? "El precio del avalúo parece alto" : veces < 0.8 ? "El precio del avalúo parece bajo" : "El precio del avalúo está en rango", texto: `El avalúo pone el metro cuadrado en ${pesos(av.precio_m2)}, ${num(veces, 1)} veces el valor de referencia de la zona (${pesos(ref)}).${pctUtil < 99 && av.valor_total ? ` Medido solo sobre lo que sí se puede usar, sale a unos ${pesos(Math.round(av.valor_total / util / 1000) * 1000)} por m².` : ""}` });
  }
  return out;
}

/* ───────────── Mapa ───────────── */
function mapaSvg(m: any, lotes: any[]) {
  const bb = m.bbox, W = 720, s = W / (bb.x1 - bb.x0), H = Math.round((bb.y1 - bb.y0) * s);
  const pt = (c: number[]) => `${((c[0] - bb.x0) * s).toFixed(1)},${((bb.y1 - c[1]) * s).toFixed(1)}`;
  const ring = (r: number[][]) => "M" + r.map(pt).join(" L") + " Z";
  const path = (g: any): string => {
    if (!g) return "";
    const c = g.coordinates;
    if (g.type === "Polygon") return c.map(ring).join(" ");
    if (g.type === "MultiPolygon") return c.flatMap((p: any) => p.map(ring)).join(" ");
    if (g.type === "LineString") return "M" + c.map(pt).join(" L");
    if (g.type === "MultiLineString") return c.map((l: any) => "M" + l.map(pt).join(" L")).join(" ");
    if (g.type === "GeometryCollection") return (g.geometries ?? []).map(path).join(" ");
    return "";
  };
  const centro = (g: any) => {
    const anillos = g.type === "Polygon" ? [g.coordinates[0]] : g.type === "MultiPolygon" ? g.coordinates.map((p: any) => p[0]) : [];
    const pts = anillos.flat(); if (!pts.length) return null;
    return [sum(pts, (p) => p[0]) / pts.length, sum(pts, (p) => p[1]) / pts.length];
  };
  const out: string[] = [`<rect width="${W}" height="${H}" fill="#fbfaf6"/>`];
  for (const p of m.parcelas) if (!p.propio) out.push(`<path d="${path(p.g)}" fill="${p.construido ? "#efedf9" : "#fff4dc"}" stroke="#cfcbe0" stroke-width=".8"/>`);
  for (const z of m.proteccion) {
    const agua = /h[ií]dric|quebrad|retiro|nacimiento/i.test(z.cat), acuif = /acu[ií]fer|recarga/i.test(z.cat);
    out.push(`<path d="${path(z.g)}" fill="url(#${agua ? "pAzul" : acuif ? "pVerde" : "pGris"})" stroke="${agua ? AZUL : acuif ? VERDEAGUA : GRIS}" stroke-width="1" stroke-opacity=".7" fill-rule="evenodd"/>`);
  }
  for (const r of m.retiros) out.push(`<path d="${path(r.g)}" fill="url(#pAzul)" stroke="${AZUL}" stroke-width="1" stroke-opacity=".8"/>`);
  for (const a of m.amenaza) { const media = /media/i.test(a.grado ?? "") && !/alta/i.test(a.grado ?? ""); out.push(`<path d="${path(a.g)}" fill="url(#${media ? "pAmbar" : "pRojo"})" stroke="${media ? AMBAR : ROJO}" stroke-width="1" stroke-opacity="${media ? ".6" : ".8"}"/>`); }
  for (const c of m.cauces) out.push(`<path d="${path(c.g)}" fill="none" stroke="${c.canalizado ? "#7dd3fc" : "#0284c7"}" stroke-width="${c.canalizado ? 1.5 : 2.4}" ${c.canalizado ? 'stroke-dasharray="4 3"' : ""}/>`);
  for (const p of m.parcelas) if (p.propio) out.push(`<path d="${path(p.g)}" fill="${MORADO}" fill-opacity=".28" stroke="${MORADO}" stroke-width="3" stroke-linejoin="round"/>`);
  for (const v of m.vias) {
    const d = path(v.g); const ancho = /autopista|troncal|avenida|variante/i.test(v.nombre ?? "") ? 8 : 4;
    out.push(`<path d="${d}" fill="none" stroke="#fff" stroke-width="${ancho + 5}" stroke-linecap="round"/><path d="${d}" fill="none" stroke="${OSCURO}" stroke-width="${ancho}" stroke-linecap="round" opacity="${ancho > 4 ? 1 : 0.55}"/>`);
  }
  // Etiquetas de los lotes con línea guía, alternando lados
  const props = m.parcelas.filter((p: any) => p.propio);
  lotes.forEach((l, i) => {
    const p = props.find((x: any) => x.id === l.id); const c = p && centro(p.g); if (!c) return;
    const [X, Y] = pt(c).split(",").map(Number);
    const dx = (i % 2 ? 1 : -1) * 120, dy = (i % 2 ? 1 : -1) * (60 + 18 * Math.floor(i / 2));
    const lx = Math.min(W - 60, Math.max(60, X + dx)), ly = Math.min(H - 30, Math.max(30, Y + dy));
    out.push(`<line x1="${X}" y1="${Y}" x2="${lx}" y2="${ly}" stroke="${OSCURO}" stroke-width="1.5"/><circle cx="${X}" cy="${Y}" r="4" fill="${OSCURO}"/>`);
    out.push(`<g transform="translate(${lx},${ly})"><rect x="-56" y="-24" width="112" height="48" rx="12" fill="${OSCURO}"/><text y="-3" text-anchor="middle" class="mt1">${esc(l.nombre).slice(0, 16)}</text><text y="14" text-anchor="middle" class="mt2">${num(l.area)} m²</text></g>`);
  });
  const Ls = 50 * s;
  out.push(`<g transform="translate(20,${H - 26})"><rect x="-8" y="-20" width="${Ls + 50}" height="34" rx="8" fill="#fff" fill-opacity=".9"/><line x1="0" y1="0" x2="${Ls.toFixed(1)}" y2="0" stroke="${OSCURO}" stroke-width="3"/><line x1="0" y1="-5" x2="0" y2="5" stroke="${OSCURO}" stroke-width="2"/><line x1="${Ls.toFixed(1)}" y1="-5" x2="${Ls.toFixed(1)}" y2="5" stroke="${OSCURO}" stroke-width="2"/><text x="${(Ls + 8).toFixed(1)}" y="4" class="mesc">50 m</text></g>`);
  out.push(`<g transform="translate(${W - 34},34)"><circle r="18" fill="#fff" stroke="${OSCURO}" stroke-width="1.2"/><path d="M0,-12 L6,6 L0,2 L-6,6 Z" fill="${OSCURO}"/></g>`);
  const defs = `<defs>
<pattern id="pAzul" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="8" height="8" fill="${AZUL}" fill-opacity=".16"/><line x1="0" y1="0" x2="0" y2="8" stroke="${AZUL}" stroke-width="3"/></pattern>
<pattern id="pVerde" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)"><rect width="8" height="8" fill="${VERDEAGUA}" fill-opacity=".12"/><line x1="0" y1="0" x2="0" y2="8" stroke="${VERDEAGUA}" stroke-width="2.4"/></pattern>
<pattern id="pRojo" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(30)"><rect width="7" height="7" fill="${ROJO}" fill-opacity=".14"/><line x1="0" y1="0" x2="0" y2="7" stroke="${ROJO}" stroke-width="2"/></pattern>
<pattern id="pAmbar" width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(-30)"><rect width="9" height="9" fill="${AMBAR}" fill-opacity=".08"/><line x1="0" y1="0" x2="0" y2="9" stroke="${AMBAR}" stroke-width="1.4" stroke-opacity=".75"/></pattern>
<pattern id="pGris" width="9" height="9" patternUnits="userSpaceOnUse"><rect width="9" height="9" fill="${GRIS}" fill-opacity=".10"/><circle cx="4.5" cy="4.5" r="1.3" fill="${GRIS}"/></pattern></defs>`;
  const ley = [[`background:${MORADO};opacity:.55;border:2px solid ${MORADO}`, "Lote(s) del reporte"], [`background:repeating-linear-gradient(45deg,${AZUL} 0 3px,#e0f4fe 3px 8px)`, "Retiro o ronda de quebrada"],
    [`background:repeating-linear-gradient(-45deg,${VERDEAGUA} 0 2px,#e2f7ef 2px 8px)`, "Recarga de acuíferos"], [`background:repeating-linear-gradient(30deg,${ROJO} 0 2px,#ffe4ea 2px 7px)`, "Amenaza alta"], ...(m.amenaza.some((a: any) => /media/i.test(a.grado ?? "") && !/alta/i.test(a.grado ?? "")) ? [[`background:repeating-linear-gradient(-30deg,${AMBAR} 0 1.5px,#fff6e6 1.5px 7px)`, "Amenaza media"]] : []),
    [`background:radial-gradient(${GRIS} 1.3px,#f3f2f7 1.5px) 0 0/6px 6px`, "Otra protección"], ["background:#0284c7;height:3px", "Quebrada"], ["background:#fff4dc;border:1px solid #cfcbe0", "Vecino sin construir"], ["background:#efedf9;border:1px solid #cfcbe0", "Vecino construido"]];
  return `<svg viewBox="0 0 ${W} ${H}" class="mapa" role="img" aria-label="Mapa del lote y sus restricciones">${defs}${out.join("")}</svg><div class="ley-mapa">${ley.map(([st, t]) => `<span><i style="${st}"></i>${t}</span>`).join("")}</div>`;
}

/* ───────────── Gráficos ───────────── */
function barrasH(items: { t: string; v: number; c: string; fuerte?: boolean; etq?: string }[], ancho = 430) {
  const max = Math.max(...items.map((x) => x.v), 1) * 1.08;
  return `<svg viewBox="0 0 ${ancho + 130} ${items.length * 46}" class="graf">${items.map((x, i) => {
    const w = (x.v / max) * ancho;
    return `<g transform="translate(0,${i * 46})"><text y="14" class="bl" font-weight="${x.fuerte ? 700 : 500}">${esc(x.t)}</text><rect y="20" width="${ancho}" height="14" rx="7" fill="#efedf5"/><rect y="20" width="${w.toFixed(1)}" height="14" rx="7" fill="${x.c}"/><text x="${(w + 8).toFixed(1)}" y="32" class="bv">${esc(x.etq ?? num(x.v))}</text></g>`;
  }).join("")}</svg>`;
}
function barraApilada(partes: { t: string; v: number; c: string }[]) {
  const tot = sum(partes, (p) => p.v) || 1; let x = 0;
  const seg = partes.map((p) => { const w = (p.v / tot) * 600; const s = `<rect x="${x.toFixed(1)}" width="${w.toFixed(1)}" height="44" fill="${p.c}"/>${w > 64 ? `<text x="${(x + w / 2).toFixed(1)}" y="28" text-anchor="middle" class="sv">${Math.round((p.v / tot) * 100)} %</text>` : ""}`; x += w; return s; }).join("");
  return `<svg viewBox="0 0 600 44" class="barra"><clipPath id="cr"><rect width="600" height="44" rx="12"/></clipPath><g clip-path="url(#cr)">${seg}</g></svg><div class="leyenda">${partes.map((p) => `<span><i style="background:${p.c}"></i>${esc(p.t)} · <b>${num(p.v)} m²</b></span>`).join("")}</div>`;
}
function perfilSvg(lotes: any[]) {
  const ps = lotes.filter((l) => l.topo?.perfil?.length > 2).map((l, i) => ({ l, pf: l.topo.perfil as { d: number; z: number }[], c: SERIE[i % SERIE.length] }));
  if (!ps.length) return "";
  const PW = 600, PH = 280, x0 = 52, y0 = 14;
  const zs = ps.flatMap((p) => p.pf.map((q) => q.z)); const zmin = Math.min(...zs) - 1, zmax = Math.max(...zs) + 1;
  const dmx = Math.max(...ps.map((p) => p.pf[p.pf.length - 1].d)) || 1;
  const X = (d: number) => x0 + (d / dmx) * (PW - x0 - 10), Y = (z: number) => y0 + ((zmax - z) / (zmax - zmin)) * (PH - y0 - 30);
  const paso = Math.max(1, Math.ceil((zmax - zmin) / 5));
  let ejes = "";
  for (let z = Math.ceil(zmin / paso) * paso; z <= zmax; z += paso) ejes += `<line x1="${x0}" x2="${PW - 10}" y1="${Y(z).toFixed(1)}" y2="${Y(z).toFixed(1)}" stroke="#e7e5ef"/><text x="${x0 - 8}" y="${(Y(z) + 4).toFixed(1)}" text-anchor="end" class="ax">${num(z)} m</text>`;
  const pd = dmx > 150 ? 50 : 20;
  for (let d = 0; d <= dmx; d += pd) ejes += `<text x="${X(d).toFixed(1)}" y="${PH - 12}" text-anchor="middle" class="ax">${d} m</text>`;
  const lineas = ps.reverse().map(({ pf, c }) => {
    const pts = pf.map((q) => `${X(q.d).toFixed(1)},${Y(q.z).toFixed(1)}`).join(" ");
    return `<polygon points="${X(0)},${PH - 30} ${pts} ${X(pf[pf.length - 1].d).toFixed(1)},${PH - 30}" fill="${c}" fill-opacity=".10"/><polyline points="${pts}" fill="none" stroke="${c}" stroke-width="3" stroke-linejoin="round"/>`;
  }).join("");
  return `<div class="leyenda" style="margin:2px 0 6px">${lotes.filter((l) => l.topo).map((l, i) => `<span><i style="background:${SERIE[i % SERIE.length]}"></i>${esc(l.nombre)} · cae ${num(l.topo.desnivel_m, 1)} m hacia el ${esc(l.topo.cae_hacia)}</span>`).join("")}</div><svg viewBox="0 0 ${PW} ${PH}" class="graf">${ejes}${lineas}</svg>`;
}
function espectroSvg(dis: { T: number; Sa: number }[], ctl: { T: number; Sa: number }[]) {
  const W = 560, H = 260, x0 = 46, y0 = 12, x1 = W - 12, y1 = H - 34;
  const tmax = 4, smax = Math.max(...dis.map((p) => p.Sa), ...ctl.map((p) => p.Sa)) * 1.12;
  const X = (t: number) => x0 + (t / tmax) * (x1 - x0), Y = (s: number) => y1 - (s / smax) * (y1 - y0);
  const linea = (ps: { T: number; Sa: number }[]) => ps.map((p, i) => `${i ? "L" : "M"}${X(p.T).toFixed(1)},${Y(p.Sa).toFixed(1)}`).join("");
  const ejeY = [0, 0.2, 0.4, 0.6, 0.8, 1].filter((v) => v <= smax);
  return `<svg viewBox="0 0 ${W} ${H}" class="graf" role="img" aria-label="Espectro de la microzonificación">
    ${ejeY.map((v) => `<line x1="${x0}" x2="${x1}" y1="${Y(v)}" y2="${Y(v)}" stroke="#e7e5ef"/><text x="${x0 - 6}" y="${Y(v) + 4}" text-anchor="end" class="ax">${num(v, 1)} g</text>`).join("")}
    ${[0, 0.5, 1, 2, 3, 4].map((t) => `<text x="${X(t)}" y="${y1 + 16}" text-anchor="middle" class="ax">${num(t, 1)} s</text>`).join("")}
    <path d="${linea(dis)}" fill="none" stroke="${MORADO}" stroke-width="3" stroke-linejoin="round"/>
    <path d="${linea(ctl)}" fill="none" stroke="${GRIS}" stroke-width="2" stroke-dasharray="5 4"/>
    <text x="${x1}" y="${y1 + 30}" text-anchor="end" class="ax">Período estructural T</text></svg>
    <div class="leyenda"><span><i style="background:${MORADO}"></i>Sismo de diseño (5 %)</span><span><i style="background:${GRIS}"></i>Control de daños (2 %)</span></div>`;
}

function arco(grados: number, c: string, etq: string, sub: string) {
  const r = 62, a = (grados * Math.PI) / 180, x2 = r * Math.cos(a) * 1.45, y2 = -r * Math.sin(a) * 1.45, h = r * 0.5;
  return `<div><svg viewBox="-12 -80 120 96" width="112"><line x1="0" y1="0" x2="100" y2="0" stroke="#cfcbe0" stroke-width="2"/><line x1="0" y1="0" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${c}" stroke-width="5" stroke-linecap="round"/><path d="M${h},0 A${h},${h} 0 0 0 ${(h * Math.cos(a)).toFixed(1)},${(-h * Math.sin(a)).toFixed(1)}" fill="none" stroke="${c}" stroke-width="2"/></svg><div class="pend-v" style="color:${c}">${etq}</div><div class="pend-s">${sub}</div></div>`;
}

/* ───────────── Página ───────────── */
export function renderReporte(r: any, textos: Textos = {}) {
  const L: any[] = r.lotes; const av = r.avaluo; const m = r.mapa;
  const total = sum(L, (l) => l.area), util = sum(L, (l) => l.area_util?.area_util_m2 ?? l.area);
  const pctRestr = total ? Math.round(((total - util) / total) * 100) : 0;
  const mun = [...new Set(L.map((l) => l.municipio))].join(" y ");
  const ref = L.find((l) => l.valor_suelo_m2)?.valor_suelo_m2 ?? null;
  const cabs = L.map((l) => l.cabida?.escenarios?.find((e: any) => /base/i.test(e.escenario))).filter((e: any) => e?.disponible);
  const und = sum(cabs, (e) => e.unidades);
  const inv = L.map((l) => l.inventario).find((i: any) => i && i.proyectos >= 3);
  const fecha = new Date(r.generado).toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric", timeZone: "America/Bogota" });
  const mk = r.marca ?? null, constructora = r.audiencia === "constructora", mer = r.mercado ?? null;
  const e14 = (l: any) => l.cabida?.escenarios?.find((e: any) => /2014/.test(e.escenario) && e.disponible), e26 = (l: any) => l.cabida?.escenarios?.find((e: any) => /2026/.test(e.escenario) && !/derechos/i.test(e.escenario) && e.disponible);
  const c14 = sum(L, (l) => e14(l)?.area_construible_m2 ?? 0), c26 = sum(L, (l) => e26(l)?.area_construible_m2 ?? 0);
  const u14 = sum(L, (l) => e14(l)?.unidades ?? 0), u26 = sum(L, (l) => e26(l)?.unidades ?? 0);
  const vRef = av?.valor_total ?? (ref ? ref * total : null), vRefTxt = av?.valor_total ? "el valor del avalúo" : "el valor de referencia del suelo";
  const v14 = sum(L, (l) => e14(l)?.area_vendible_m2 ?? 0), v26 = sum(L, (l) => e26(l)?.area_vendible_m2 ?? 0);
  const pNuevo = mer?.fynder?.precio_m2_nuevo ?? null;
  const pProy = (() => { const xs = (mer?.proyectos ?? []).map((q: any) => Number(q.precio_m2_desde)).filter((x: number) => x > 0).sort((a: number, b: number) => a - b); return xs.length >= 3 ? (xs[Math.floor((xs.length - 1) / 2)] + xs[Math.ceil((xs.length - 1) / 2)]) / 2 : null; })();
  const incid = (vend: number, precio: number | null) => (vRef && vend && precio ? (vRef / (vend * precio)) * 100 : null);
  const i14 = incid(v14, pNuevo), i26 = incid(v26, pNuevo), i14p = incid(v14, pProy);
  const luzInc = (x: number | null) => (x == null ? "gris" : x > 20 ? "rojo" : x > 15 ? "ambar" : "verde");
  const COL: Record<string, string> = { rojo: "#e11d48", ambar: "#d97706", verde: "#059669", gris: "#6f6c80" };

  // Cifras de portada
  const kpis: string[] = [];
  if (av?.valor_total) kpis.push(`<div class="kpi"><div class="num">${num(av.valor_total / 1e6)} <small>millones</small></div><p>Valor del avalúo${av.area_m2 ? `: ${num(av.area_m2)} m² × ${pesos(av.precio_m2)}/m²` : ""}</p></div>`);
  kpis.push(`<div class="kpi"><div class="num">${num(total)} <small>m²</small></div><p>${L.length > 1 ? `En ${L.length} predios del catastro` : "Área del predio según el catastro"}</p></div>`);
  kpis.push(`<div class="kpi ${pctRestr >= 20 ? "alerta" : ""}"><div class="num">${pctRestr} %</div><p>del terreno en protección, retiro de quebrada o amenaza alta</p></div>`);
  kpis.push(cabs.length ? `<div class="kpi"><div class="num">${num(und)}</div><p>viviendas aproximadas con la norma actual (escenario base)</p></div>` : `<div class="kpi"><div class="num">—</div><p>Sin norma numérica: hay que pedir concepto de norma</p></div>`);
  if (av?.precio_m2 && ref) kpis.push(`<div class="kpi"><div class="num">${num(av.precio_m2 / ref, 1)}×</div><p>el precio del avalúo frente al valor de referencia del suelo (${pesos(ref)}/m²)</p></div>`);
  else if (inv?.meses_inventario != null) kpis.push(`<div class="kpi"><div class="num">${num(inv.meses_inventario, 1)}</div><p>meses de inventario de vivienda nueva a ${inv.radio_m / 1000} km</p></div>`);
  else kpis.push(`<div class="kpi"><div class="num">${ref ? pesos(ref) : "—"}</div><p>valor de referencia del suelo por m² en la zona</p></div>`);

  if (constructora) {
    kpis.length = 0;
    kpis.push(`<div class="kpi"><div class="num">${num(total)} <small>m²</small></div><p>${L.length > 1 ? `En ${L.length} predios` : "Lote según catastro"}${util < total ? ` · ${num(util)} m² útiles` : " · sin descuentos por protección"}</p></div>`);
    if (c14) kpis.push(`<div class="kpi"><div class="num">${num(c14)} <small>m²</small></div><p>construibles con la norma vigente (POT 2014)${c26 ? ` · ${num(c26)} m² con el POT 2026` : ""}</p></div>`);
    if (u14) kpis.push(`<div class="kpi ${u26 && u26 < u14 ? "alerta" : ""}"><div class="num">${num(u14)}${u26 && u26 !== u14 ? ` <small>→ ${num(u26)}</small>` : ""}</div><p>viviendas de ≈ ${num(L[0].cabida?.supuestos?.area_unidad_m2)} m²${u26 && u26 !== u14 ? " hoy → con el POT 2026" : ""}</p></div>`);
    if (i14 != null) kpis.push(`<div class="kpi ${i14 > 20 ? "alerta" : ""}"><div class="num">${num(i14)} %${i26 != null ? ` <small>→ ${num(i26)} %</small>` : ""}</div><p>incidencia del suelo sobre las ventas (${vRefTxt})${i26 != null ? ", hoy → con el POT 2026" : ""}. Más de 20 % es difícil</p></div>`);
    else if (vRef && c14) kpis.push(`<div class="kpi"><div class="num">${pesos(Math.round(vRef / c14 / 1000) * 1000)}</div><p>de suelo por m² construible (${vRefTxt})</p></div>`);
    else if (mer?.fynder?.precio_m2_nuevo) kpis.push(`<div class="kpi"><div class="num">${pesos(mer.fynder.precio_m2_nuevo)}</div><p>precio por m² de vivienda nueva a 1,5 km</p></div>`);
  }

  // Resumen en palabras simples
  const simple = (textos.resumen_simple?.length ? textos.resumen_simple.map((x) => ({ icono: x.icono ?? "•", ...x })) : resumenAutomatico(r));
  const SIMPLE = `<div class="simple"><h2>${constructora ? "Resumen ejecutivo" : "En palabras simples"}</h2><p class="intro">${constructora ? "Lo esencial del lote para el comité de tierras." : "Lo que encontramos, sin términos técnicos."}</p><ol>${simple.map((x) => `<li><span class="ic">${esc(x.icono)}</span><div><b>${esc(x.titulo)}</b><p>${esc(x.texto)}</p></div></li>`).join("")}</ol>${textos.conclusion ? `<div class="cierre"><b>En resumen:</b> ${esc(textos.conclusion)}</div>` : ""}</div>`;

  // Semáforo: peor luz por categoría entre los lotes, más los hallazgos redactados
  const porCat = new Map<string, { luz: string; lectura: string }>();
  for (const l of L) for (const it of [...(l.semaforo?.items ?? []), ...(l.inventario?.semaforo ? [{ ...l.inventario.semaforo, categoria: "Vivienda nueva en la zona" }] : [])]) {
    const luz = LUZ[it.luz] ?? "gris", prev = porCat.get(it.categoria);
    if (!prev || PESO[luz] > PESO[prev.luz]) porCat.set(it.categoria, { luz, lectura: `${L.length > 1 && luz !== "verde" ? `${l.nombre}: ` : ""}${it.lectura}` });
  }
  const sems = [...(textos.hallazgos ?? []).map((h) => ({ cat: h.titulo, luz: h.luz ?? "ambar", lectura: h.texto })), ...[...porCat].map(([cat, v]) => ({ cat, ...v }))]
    .sort((a, b) => PESO[b.luz] - PESO[a.luz]);
  const SEM = sems.map((x) => `<div class="sem ${x.luz}"><div class="sem-h"><i></i>${esc(x.cat)}</div><p>${esc(x.lectura)}</p></div>`).join("");

  // Identificación
  const ID = `<div class="datos">${[["Municipio", `${mun}${L[0].barrio ? ` · ${L[0].barrio}` : ""}`], ["Suelo", L[0].clase], ...L.map((l) => [`${l.nombre}`, `${num(l.area)} m² · ${l.id.split(":")[1]}`]),
    ...(L.length > 1 ? [["Total", `${num(total)} m²`]] : []), ...(m.via_cercana ? [["Vía más cercana", `${m.via_cercana.nombre} · ≈ ${num(m.via_cercana.d)} m`]] : []),
    ["Construcciones registradas", `${num(sum(L, (l) => l.construcciones))}${sum(L, (l) => l.area_construida) ? ` · ${num(sum(L, (l) => l.area_construida))} m²` : ""}`],
    ["Predios vecinos sin construir (150 m)", `${num(m.vecinos_sin_construir?.n)} · ${num((m.vecinos_sin_construir?.m2 ?? 0) / 10000, 1)} ha`]].map(([k, v]) => `<div class="dato"><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join("")}</div>`;

  // Norma
  const NORMA = `<table class="tabla"><tr><th>Lote</th><th>Tratamiento</th><th>Altura</th><th>Índice</th><th>Densidad</th><th>Ocupación</th></tr>${L.map((l) => `<tr><td>${esc(l.nombre)}</td><td>${esc(l.norma.tratamiento ?? "sin dato")}${l.norma.codigo ? ` <span class="nota">(${esc(l.norma.codigo)})</span>` : ""}</td><td>${l.norma.altura ? `${num(l.norma.altura)} pisos` : "—"}</td><td>${num(l.norma.ic, 2)}${l.norma.ic_derechos && l.norma.ic_derechos !== l.norma.ic ? ` · ${num(l.norma.ic_derechos, 2)} con derechos` : ""}</td><td>${l.norma.densidad ? `${num(l.norma.densidad)} viv/ha` : "—"}</td><td>${l.norma.io ? `${num(l.norma.io * (l.norma.io <= 1 ? 100 : 1))} %` : "—"}</td></tr>`).join("")}</table>
    ${[...new Set(L.map((l) => l.advertencia).filter(Boolean))].map((a) => `<div class="aviso rojo-s">⚠️ ${esc(a)}</div>`).join("")}${[...new Set(L.map((l) => l.aviso_pot).filter(Boolean))].map((a) => `<p class="nota">${esc(a)}</p>`).join("")}`;

  // Norma vigente frente al POT 2026 (preliminar)
  const p26 = L.find((l) => l.pot2026?.frente_a_2014);
  const fila = (t: string, a: any, b: any, d = 0, suf = "") => `<tr><td>${t}</td><td>${a == null ? "—" : num(a, d) + suf}</td><td>${b == null ? "—" : num(b, d) + suf}</td><td>${a && b != null ? `${b - a > 0 ? "+" : ""}${num(((b - a) / a) * 100)} %` : "—"}</td></tr>`;
  const NORMA26 = p26 && c14 ? `<table class="tabla"><tr><th></th><th>Hoy · POT 2014</th><th>POT 2026 (preliminar)</th><th>Cambio</th></tr>
    ${fila("Índice de construcción", p26.pot2026.frente_a_2014.indice_construccion?.pot2014, p26.pot2026.frente_a_2014.indice_construccion?.pot2026, 2)}
    ${fila("Densidad (viv/ha)", p26.pot2026.frente_a_2014.densidad_viv_ha?.pot2014, p26.pot2026.frente_a_2014.densidad_viv_ha?.pot2026)}
    ${fila("Área construible", c14, c26 || null, 0, " m²")}
    ${fila("Área vendible (80 %)", sum(L, (l) => e14(l)?.area_vendible_m2 ?? 0), sum(L, (l) => e26(l)?.area_vendible_m2 ?? 0) || null, 0, " m²")}
    ${fila(`Viviendas de ≈ ${num(L[0].cabida?.supuestos?.area_unidad_m2)} m²`, u14, u26 || null)}</table>
    <p class="nota">${esc(p26.pot2026.estado)} Código ${esc(p26.pot2026.codigo ?? "")}. Fuente: <a href="${esc(p26.pot2026.fuente)}">proyecto de acuerdo</a>.</p>` : "";

  // Mercado de la zona (Fynder y proyectos anunciados): sin datos confidenciales
  const f = mer?.fynder;
  const PROY = (mer?.proyectos ?? []).length ? `<table class="tabla"><tr><th>Proyecto</th><th>Constructora</th><th>Desde</th><th>m² desde</th><th>Entrega</th><th>Distancia</th></tr>${mer.proyectos.map((q: any) => `<tr><td>${esc(q.nombre)}</td><td>${esc(q.constructora ?? "—")}</td><td>${q.precio_desde ? millones(q.precio_desde) : "—"}</td><td>${q.precio_m2_desde ? pesos(Math.round(q.precio_m2_desde / 1000) * 1000) : "—"}</td><td>${esc(q.entrega ?? "—")}</td><td>${num(q.distancia_m)} m</td></tr>`).join("")}</table>` : "";
  const CIFRAS = f ? `<div class="cifras2"><div><b class="num">${f.precio_m2_nuevo ? pesos(Math.round(f.precio_m2_nuevo / 1000) * 1000) : "—"}</b><span>por m², apartamentos nuevos o sobre planos anunciados</span></div><div><b class="num">${f.precio_m2_usado ? pesos(Math.round(f.precio_m2_usado / 1000) * 1000) : "—"}</b><span>por m², apartamentos usados (${num(f.en_venta)} en venta)</span></div><div><b class="num">${num(f.compradores_90d)}</b><span>compradores buscando en la zona (90 días)${f.presupuesto_mediana ? `, presupuesto típico ${millones(f.presupuesto_mediana)}` : ""}</span></div><div><b class="num">${num(f.meses_venta, 1)}</b><span>meses para vender la oferta al ritmo actual (${num(f.ventas_mes, 1)} salen del mercado por mes)</span></div></div>
    <p class="nota">Fynder: avisos y pedidos de compradores de los últimos 90 días a ${num(mer.radio_m / 1000, 1)} km. Precios de oferta, no de cierre.${f.baja_confianza ? " Muestra pequeña: lectura de baja confianza." : ""}</p>` : "";
  const MERCADO = mer && (f || PROY) ? `${CIFRAS}${PROY ? `<h3 style="margin-top:14px">Proyectos nuevos a ${num(mer.radio_m / 1000, 1)} km</h3>${PROY}<p class="nota">Zonario (proyectos anunciados, precios publicados).</p>` : ""}` : "";
  const INCID = constructora && vRef && c14 ? `<div class="datos">
      <div class="dato"><span>${av?.valor_total ? "Valor del avalúo" : `Valor de referencia del suelo (${pesos(ref)}/m² × ${num(total)} m²)`}</span><b class="num grande">${millones(vRef)}</b></div>
      <div class="dato"><span>Por m² construible, norma vigente (${num(c14)} m²)</span><b class="num grande">${pesos(Math.round(vRef / c14 / 1000) * 1000)}</b></div>
      ${c26 ? `<div class="dato"><span>Por m² construible, POT 2026 (${num(c26)} m²)</span><b class="num grande">${pesos(Math.round(vRef / c26 / 1000) * 1000)}</b></div>` : ""}
      ${i14 != null ? `<div class="dato"><span>Incidencia sobre ventas, norma vigente (${num(v14)} m² vendibles a ${pesos(Math.round(pNuevo! / 1000) * 1000)}/m²)</span><b class="num grande" style="color:${COL[luzInc(i14)]}">${num(i14)} %</b></div>` : ""}
      ${i14p != null ? `<div class="dato"><span>Con el precio de los proyectos vecinos (${pesos(Math.round(pProy! / 1000) * 1000)}/m², mediana)</span><b class="num grande" style="color:${COL[luzInc(i14p)]}">${num(i14p)} %</b></div>` : ""}
      ${i26 != null ? `<div class="dato"><span>Incidencia con el POT 2026 (${num(v26)} m² vendibles)</span><b class="num grande" style="color:${COL[luzInc(i26)]}">${num(i26)} %</b></div>` : ""}
    </div><p class="nota">${av?.valor_total ? "" : "El valor de referencia es el del suelo por zona (catastral o del Área Metropolitana), no el precio pedido por el lote: si el propietario pide más, la incidencia sube. "}Incidencia = valor del lote ÷ ventas del proyecto (área vendible × precio por m² de vivienda nueva). Referencia del sector: hasta 15 % sano, 15–20 % ajustado, más de 20 % difícil.</p>` : "";

  // Área útil
  const prot = new Map<string, number>(); let alta = 0;
  for (const l of L) { for (const p of l.area_util?.proteccion ?? []) prot.set(p.tipo, (prot.get(p.tipo) ?? 0) + (p.m2 ?? 0)); alta += sum(l.area_util?.amenaza_alta ?? [], (x) => x.m2); }
  const colP = (t: string) => (/h[ií]dric|quebrad|retiro|nacimiento/i.test(t) ? AZUL : /acu[ií]fer|recarga/i.test(t) ? VERDEAGUA : GRIS);
  const partes = [{ t: "Área útil", v: util, c: MORADO }, ...[...prot].map(([t, v]) => ({ t: t.charAt(0) + t.slice(1).toLowerCase(), v, c: colP(t) })), ...(alta ? [{ t: "Amenaza alta", v: alta, c: ROJO }] : [])].filter((p) => p.v > 0);

  // Cabida
  const esc0 = L[0].cabida?.escenarios ?? [];
  const CABIDA = esc0.some((e: any) => e.disponible) ? barrasH(esc0.map((e: any, i: number) => {
    const u = sum(L, (l) => l.cabida?.escenarios?.[i]?.unidades ?? 0);
    return { t: `${e.escenario}${e.pisos_sobre_rasante ? ` · ${e.pisos_sobre_rasante} pisos` : ""}`, v: u, c: /base/i.test(e.escenario) ? MORADO : LILA, fuerte: /base/i.test(e.escenario), etq: `${num(u)} viviendas` };
  })) + `<p class="nota">${num(sum(L, (l) => l.cabida?.escenarios?.find((e: any) => /base/i.test(e.escenario))?.area_construible_m2 ?? 0))} m² construibles en el escenario base, sobre el área útil. ${esc(L[0].cabida?.nota ?? "")}</p>`
    : `<p>${esc(esc0.find((e: any) => e.motivo)?.motivo ?? "Sin norma numérica para calcular la cabida: hay que pedir el concepto de norma del municipio.")}</p>`;
  const CI = L.map((l) => l.computo).filter((c: any) => c?.aplica).map((c: any) => `<div class="aviso">${esc(c.lectura)}</div>`).join("");

  // Terreno
  const topos = L.filter((l) => l.topo);
  const PEND = topos.length ? `<div class="pend">${av?.pendiente_grados ? arco(av.pendiente_grados, ROJO, `${num(av.pendiente_grados, 1)}°`, "lo que dice el avalúo") : ""}${topos.map((l, i) => arco(l.topo.pendiente_grados, SERIE[i % SERIE.length], `${num(l.topo.pendiente_grados, 1)}°`, `${esc(l.nombre)}<br>(${num(l.topo.pendiente_pct)} %)`)).join("")}</div>
    <p class="nota">${topos.map((l) => `${esc(l.nombre)}: ${esc(l.topo.clase)}, ${num(l.topo.desnivel_m, 1)} m de desnivel${l.topo.corte_m3 ? `, unos ${num(l.topo.corte_m3)} m³ de corte para una plataforma` : ""}`).join(". ")}. Fuente: ${esc(topos[0].topo.fuente ?? "modelo de terreno")}.</p>` : "";

  // Suelo y sismo (Medellín): microzona con su espectro, geología e historia de gestión del riesgo
  const ss = L.find((l) => l.suelo_sismo)?.suelo_sismo ?? null, mz = ss?.microzona;
  const SUELO = ss ? `<div class="grid2">${mz ? `<div class="card"><h3>Zona ${esc(mz.zona_para_diseno)} · ${esc(mz.nombre_para_diseno)}</h3>${espectroSvg(mz.espectro_diseno, mz.espectro_control)}
      <table class="tabla espec" style="margin-top:12px"><tr><th></th><th>a máx. suelo</th><th>Fa</th><th>Sa meseta</th><th>T0</th><th>Tc</th><th>α</th></tr>
      ${[["Diseño", mz.diseno], ["Control de daños", mz.control_danos]].map(([t, c]: any) => `<tr><td>${t}</td><td>${num(c.a_smax, 2)} g</td><td>${num(c.fa, 2)}</td><td>${num(c.samax_sobre_i, 2)} g</td><td>${num(c.t0_s, 2)} s</td><td>${num(c.tc_s, 2)} s</td><td>${num(c.alfa, 2)}</td></tr>`).join("")}</table>
      <p class="nota">Espectro de la microzonificación sísmica de Medellín para coeficiente de importancia I = 1 (vivienda). ${mz.transicion ? `Franja de transición: a menos de 125 m de la zona ${mz.transicion.zonas_cercanas.map((z: any) => z.zona).join(" y ")}; se usa la más exigente.` : ""}${mz.aviso ? ` ${esc(mz.aviso)}` : ""} Zonas digitalizadas del mapa del POT: preliminar.</p></div>` : `<div class="card"><h3>Microzonificación</h3><p class="nota">El lote está fuera de la microzonificación urbana de Medellín.</p></div>`}
    <div class="card"><h3>El suelo y su historia</h3><div class="datos">
      ${ss.geologia?.length ? `<div class="dato"><span>Geología</span><b>${ss.geologia.map((g: any) => `${esc(g.descripcion)}${ss.geologia.length > 1 ? ` (${num(g.pct)} %)` : ""}`).join("; ")}</b></div>` : ""}
      ${ss.susceptibilidad_sismica ? `<div class="dato"><span>Aceleración esperada (DAGRD)</span><b>${esc(ss.susceptibilidad_sismica)}</b></div>` : ""}
      <div class="dato"><span>Inspecciones del DAGRD a 100 m</span><b>${num(ss.inspecciones.a_100m)}${ss.inspecciones.movimiento_masa_100m ? ` · ${num(ss.inspecciones.movimiento_masa_100m)} por movimiento en masa` : ""}</b></div>
      <div class="dato"><span>Inspecciones a 300 m</span><b>${num(ss.inspecciones.a_300m)}${ss.inspecciones.desde ? ` · ${ss.inspecciones.desde}–${ss.inspecciones.hasta}` : ""}</b></div>
      ${ss.estudios_cercanos?.length ? `<div class="dato"><span>Estudios de riesgo a 500 m</span><b>${num(ss.estudios_cercanos.length)}</b></div>` : ""}
      ${ss.obras_mitigacion_cercanas?.length ? `<div class="dato"><span>Obras de mitigación a 500 m</span><b>${num(ss.obras_mitigacion_cercanas.length)}</b></div>` : ""}
      ${ss.monitoreo_cercano?.length ? `<div class="dato"><span>Instrumentos de monitoreo a 500 m</span><b>${num(ss.monitoreo_cercano.length)}</b></div>` : ""}
    </div>
    ${ss.inspecciones.por_tipo_300m?.length ? barrasH(ss.inspecciones.por_tipo_300m.slice(0, 5).map((x: any) => ({ t: x.tipo, v: x.n, c: /masa|desliz/i.test(x.tipo) ? ROJO : LILA, etq: num(x.n) })), 400) : ""}
    <div class="aviso ${ss.semaforo.luz === "rojo" ? "rojo-s" : ""}">${esc(ss.semaforo.lectura)}</div></div></div>
    ${ss.estudios_cercanos?.length ? `<p class="nota">Estudios del DAGRD cerca: ${ss.estudios_cercanos.slice(0, 3).map((e: any) => `${esc(e.titulo)}${e.anio ? ` (${esc(e.anio)})` : ""}, a ${num(e.d)} m`).join("; ")}.</p>` : ""}` : "";

  // Inventario
  const INV = inv ? `<div class="cifras4"><div><b class="num">${num(inv.disponibles)}</b><span>viviendas nuevas disponibles en ${num(inv.proyectos)} proyectos</span></div><div><b class="num">${num(inv.ventas_mes, 1)}</b><span>ventas por mes</span></div><div><b class="num">${num(inv.meses_inventario, 1)}</b><span>meses para venderlas</span></div><div><b class="num">${num(inv.inventario_cerrado?.unidades)}</b><span>terminadas sin vender</span></div></div>
    ${barrasH(Object.entries(inv.por_etapa ?? {}).map(([k, g]: any) => ({ t: ({ sobre_planos: "Sobre planos", construccion: "En construcción", mixto: "Etapas mixtas", terminado: "Terminado", parado: "Desistido o paralizado" } as any)[k] ?? k, v: g.disponibles, c: k === "terminado" ? AMBAR : k === "parado" ? GRIS : MORADO, etq: `${num(g.disponibles)} disp. · ${g.meses_inventario == null ? "sin ventas" : `${num(g.meses_inventario, 1)} meses`}` })))}
    <p class="nota">${esc(inv.semaforo?.lectura)} Fuente: Galería Inmobiliaria (confidencial) y Fynder.</p>` : "";

  // Avalúo
  let AVALUO = "";
  if (av && (av.precio_m2 || av.valor_total)) {
    const items = [...(av.comparables ?? []).map((c: any) => ({ t: c.nombre, v: c.precio_m2, c: GRIS, etq: pesos(c.precio_m2) })), ...(av.precio_m2 ? [{ t: "Valor adoptado en el avalúo", v: av.precio_m2, c: MORADO, fuerte: true, etq: pesos(av.precio_m2) }] : []), ...(ref ? [{ t: "Referencia del suelo (Área Metropolitana o catastro)", v: ref, c: VERDEAGUA, fuerte: true, etq: pesos(ref) }] : [])];
    const porUtil = av.valor_total && util ? av.valor_total / util : null;
    const construible = sum(cabs, (e) => e.area_construible_m2);
    AVALUO = `<div class="bloque"><div class="eyebrow">Avalúo</div><h2>Lo que dice el avalúo, en contexto</h2><p class="sub">${av.fecha ? `Avalúo del ${esc(av.fecha)}` : "Avalúo entregado"}${av.metodo ? ` · método ${esc(av.metodo)}` : ""}${av.norma_citada ? ` · cita ${esc(av.norma_citada)}` : ""}${av.vigencia_hasta ? ` · vigente hasta ${esc(av.vigencia_hasta)}` : ""}.</p>
      <div class="grid2"><div class="card"><h3>Precio por m² de lote</h3>${barrasH(items)}</div>
      <div class="card"><h3>El mismo precio, medido distinto</h3><div class="datos">
        ${av.precio_m2 ? `<div class="dato"><span>Por m² de lote</span><b class="num grande">${pesos(av.precio_m2)}</b></div>` : ""}
        ${porUtil ? `<div class="dato"><span>Por m² útil (${num(util)} m²)</span><b class="num grande">≈ ${pesos(Math.round(porUtil / 1000) * 1000)}</b></div>` : ""}
        ${av.valor_total && construible ? `<div class="dato"><span>Por m² construible (≈ ${num(construible)} m²)</span><b class="num grande" style="color:${MORADO}">≈ ${pesos(Math.round(av.valor_total / construible / 1000) * 1000)}</b></div>` : ""}
        ${av.valor_total ? `<div class="dato"><span>Valor total</span><b class="num grande">${millones(av.valor_total)}</b></div>` : ""}
      </div></div></div>
      ${textos.observaciones_avaluo?.length ? `<div class="obs">${textos.observaciones_avaluo.map((o) => `<div class="ob">${o.cifra ? `<div class="num">${esc(o.cifra)}</div>` : ""}<h3>${esc(o.titulo)}</h3><p>${esc(o.texto)}</p></div>`).join("")}</div>` : ""}</div>`;
  }

  // Qué verificar
  const auto: string[] = [];
  if (L.some((l) => l.advertencia) || !cabs.length) auto.push("<b>Concepto de norma del municipio</b>: confirmar la norma vigente del lote (usos, alturas, índices).");
  if (L.some((l) => l.restricciones?.hidrico?.faja_referencia_m2 > 1 || l.restricciones?.hidrico?.cauces?.some((c: any) => c.cruza_el_lote))) auto.push("<b>Plano topográfico con la quebrada dibujada</b>, para medir el retiro real y el área útil.");
  if (L.some((l) => SIN_AMENAZA.has(l.municipio_dane)) || sems.some((s) => s.cat === "Amenaza y riesgo" && s.luz !== "verde")) auto.push("<b>Estudio o plano de amenazas</b> del municipio para el lote.");
  if (L.some((l) => l.restricciones?.planificacion?.instrumentos?.length)) auto.push("<b>Plan parcial o instrumento</b> que cubre el lote: estado, cargas y obligaciones.");
  if (ss && ss.semaforo.luz !== "verde") auto.push("<b>Estudio geotécnico temprano</b> con exploración en la ladera, diseño de contenciones y, si hace falta, medición de vibración ambiental para el período del suelo.");
  auto.push("<b>Certificados de tradición</b> recientes y <b>estudio de títulos</b>.", "<b>Afectaciones viales</b> en la curaduría (la capa de vías proyectadas no está cargada).");
  const conNegrita = (s: string) => esc(s).replace(/&lt;(\/?)b&gt;/g, "<$1b>"); // solo se permite <b>
  const VER = (textos.verificar?.length ? textos.verificar.map(conNegrita) : auto).map((x) => `<div class="paso">${x}</div>`).join("");
  const FUENTES = [...(textos.fuentes ?? []), "Catastro y norma del municipio (GeoMedellín, Área Metropolitana, GeoAntioquia, Cornare)", "Red hídrica, retiros y amenazas de los POT; OpenStreetMap", "Modelo de terreno del Valle de Aburrá (AMVA) e IGAC", ...(inv ? ["Galería Inmobiliaria (confidencial) y Fynder"] : []), ...(MERCADO && (constructora || !inv) ? ["Fynder (avisos y pedidos de compradores) y Zonario (proyectos anunciados)"] : []), ...(NORMA26 ? ["Proyecto de Acuerdo 104 de 2026, revisión del POT de Medellín (preliminar)"] : []), ...(ss ? ["Microzonificación sísmica de Medellín (Grupo de Sismología de Medellín; DAP 2011; mapa de zonas homogéneas del POT) y gestión del riesgo del DAGRD"] : [])];

  const titular = textos.titular ?? (L.length > 1 ? `${L.length} lotes en ${mun}` : `${L[0].nombre}, ${mun}`);
  const bajada = textos.bajada ?? `${L[0].barrio ? `${L[0].barrio}, ` : ""}${mun}. Norma, restricciones, terreno${inv ? ", mercado de la zona" : ""}${av ? " y lectura del avalúo" : ""}, con datos públicos al ${fecha}.`;

  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(r.nombre)} · Reporte de lote</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet"><style>${CSS}</style></head><body>
<section class="hero"><div class="wrap"><div class="top">${mk ? `<div class="co">${mk.logo_oscuro || mk.logo ? `<img class="cli" src="${mk.logo_oscuro ?? mk.logo}" alt="${esc(mk.cliente)}">` : `<b style="font-size:22px">${esc(mk.cliente)}</b>`}<span class="x"></span><small>Preparado por<br><b>irrelevant · Inteligencia de suelo</b></small></div><span class="chip"><b>Reporte de lote</b> · ${esc(fecha)}</span>` : `<img src="/marca/irrelevant-blanco.png" alt="irrelevant"><span class="chip">Inteligencia de suelo · <b>Reporte de lote</b> · ${esc(fecha)}</span>`}</div>
<h1>${esc(titular)}</h1><p class="lead">${esc(bajada)}</p><div class="kpis">${kpis.slice(0, 4).join("")}</div></div></section>
<main class="wrap">${SIMPLE}
<div class="bloque"><div class="eyebrow">01 · Semáforo</div><h2>Qué pesa y qué ayuda</h2><p class="sub">Rojo cambia la decisión; ámbar hay que verificarlo; gris no hay dato público.</p><div class="sems">${SEM}</div></div>
<div class="bloque"><div class="eyebrow">02 · El lote en el mapa</div><h2>Dónde está y qué lo restringe</h2><p class="sub">Predios del catastro, suelo de protección, retiros, quebradas y amenaza alta y media, a escala real.</p><div class="grid2"><div class="card">${mapaSvg(m, L)}</div><div class="card"><h3>Identificación</h3>${ID}</div></div></div>
<div class="bloque"><div class="eyebrow">03 · Norma</div><h2>Qué permite la norma</h2>${NORMA}${NORMA26 ? `<h3 style="margin:22px 0 8px;font-size:18px">Hoy frente al POT 2026</h3>${NORMA26}` : ""}</div>
<div class="bloque"><div class="eyebrow">04 · Área y cabida</div><h2>Cuánto se puede usar y cuánto cabe</h2><div class="card"><h3>Composición del área · ${num(total)} m²</h3>${barraApilada(partes)}<p class="nota">Área útil = lote menos suelo de protección, retiro de quebradas y amenaza alta. No descuenta aún vías proyectadas.</p></div>
<div class="grid2b" style="margin-top:18px"><div class="card"><h3>Viviendas aproximadas por escenario</h3>${CABIDA}</div><div class="card"><h3>Áreas que no cuentan en el índice</h3>${CI || '<p class="nota">La regla de áreas fuera del índice solo está cargada para Medellín.</p>'}</div></div></div>
${topos.length ? `<div class="bloque"><div class="eyebrow">05 · Terreno</div><h2>Cómo es el terreno</h2><div class="grid2"><div class="card"><h3>Perfil en la dirección de la pendiente</h3>${perfilSvg(L)}</div><div class="card"><h3>Pendiente</h3>${PEND}</div></div></div>` : ""}
${SUELO ? `<div class="bloque"><div class="eyebrow">${topos.length ? "05b" : "05"} · Suelo y sismo</div><h2>Qué hay debajo</h2><p class="sub">Microzonificación sísmica, geología y lo que el DAGRD ha registrado alrededor: la primera pista sobre cimentación y contenciones.</p>${SUELO}</div>` : ""}
${INV ? `<div class="bloque"><div class="eyebrow">06 · Mercado</div><h2>Vivienda nueva en la zona</h2><div class="card">${INV}</div></div>` : ""}
${MERCADO && (constructora || !INV) ? `<div class="bloque"><div class="eyebrow">${INV ? "07" : "06"} · Mercado y competencia</div><h2>${constructora ? "A cuánto se vende y quién compite" : "Mercado de la zona"}</h2>${INCID ? `<div class="grid2b"><div class="card"><h3>Lo que pesa el suelo</h3>${INCID}</div><div class="card"><h3>La zona en cifras</h3>${CIFRAS}</div></div>${PROY ? `<div class="card" style="margin-top:18px"><h3>Proyectos nuevos a ${num(mer.radio_m / 1000, 1)} km</h3>${PROY}<p class="nota">Zonario (proyectos anunciados, precios publicados). Precios de oferta, no de cierre.</p></div>` : ""}` : `<div class="card">${MERCADO}</div>`}</div>` : ""}
${AVALUO}
<div class="bloque"><div class="eyebrow">Próximos pasos</div><h2>Qué verificar antes de decidir</h2><div class="pasos">${VER}</div></div>
</main><footer><div class="wrap">${mk ? `<div class="pie">${mk.logo ? `<img class="cli" src="${mk.logo}" alt="${esc(mk.cliente)}">` : ""}<img class="irr" src="/marca/irrelevant-negro.png" alt="irrelevant co."></div>` : `<img src="/marca/irrelevant-negro.png" alt="irrelevant co.">`}<p><b>Fuentes:</b> ${FUENTES.map(esc).join("; ")}.<br>Análisis previo con información pública. No reemplaza el concepto de norma del municipio, un estudio de títulos ni un avalúo. ${mk ? `Preparado por irrelevant para ${esc(mk.cliente)}. Confidencial.` : "Uso interno."}</p></div></footer></body></html>`;
  return aplicarMarca(html, mk);
}

const CSS = `:root{--morado:#5e55fe;--lila:#a59fff;--lila-f:#eeecff;--oscuro:#1a1a1f;--crema:#F4F3EE;--texto:#2a2a33;--gris:#6f6c80;--linea:#e7e5ef;--rojo:#e11d48;--rojo-f:#ffe4ea;--ambar:#d97706;--verde:#059669}
*{box-sizing:border-box}body{margin:0;background:var(--crema);color:var(--texto);font:15.5px/1.6 Inter,-apple-system,"Segoe UI",Roboto,sans-serif}h1,h2,h3,.num{font-family:Poppins,Inter,sans-serif}.wrap{max-width:1040px;margin:0 auto;padding:0 20px}
.hero{background:radial-gradient(1200px 500px at 85% -10%,rgba(94,85,254,.55),transparent 60%),radial-gradient(700px 400px at -10% 120%,rgba(165,159,255,.25),transparent 60%),var(--oscuro);color:#fff;padding:28px 0 0;overflow:hidden}
.top{display:flex;align-items:center;justify-content:space-between;gap:16px}.top img{height:34px}.chip{border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.06);padding:6px 12px;border-radius:999px;font-size:12.5px;color:#d9d7ff}.chip b{color:#fff}
.hero h1{font-size:clamp(30px,4.6vw,48px);line-height:1.1;margin:44px 0 12px;font-weight:800;letter-spacing:-.5px}.hero .lead{max-width:720px;color:#cfcde0;font-size:17px;margin:0}
.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin:34px 0 0;padding-bottom:40px}.kpi{background:#fff;color:var(--texto);border-radius:18px;padding:18px;box-shadow:0 14px 40px rgba(26,26,31,.18)}.kpi .num{font-size:28px;font-weight:800;color:var(--oscuro);line-height:1.1}.kpi .num small{font-size:15px;font-weight:600;color:var(--gris)}.kpi p{margin:6px 0 0;font-size:13px;color:var(--gris);line-height:1.4}.kpi.alerta{background:var(--morado)}.kpi.alerta .num,.kpi.alerta .num small{color:#fff}.kpi.alerta p{color:#e6e4ff}
main{padding:36px 0 40px}.simple{background:#fff;border-radius:22px;padding:28px 30px;border:1px solid var(--linea)}.simple h2{margin:0 0 4px;font-size:24px;color:var(--oscuro)}.simple .intro{color:var(--gris);margin:0 0 18px}.simple ol{list-style:none;padding:0;margin:0;display:grid;gap:14px}.simple li{display:grid;grid-template-columns:42px 1fr;gap:14px}.simple .ic{width:42px;height:42px;border-radius:12px;display:grid;place-items:center;font-size:20px;background:var(--lila-f)}.simple li b{display:block;font-family:Poppins;font-size:16px;color:var(--oscuro);margin-bottom:2px}.simple li p{margin:0}.simple .cierre{margin-top:20px;background:var(--oscuro);color:#fff;border-radius:16px;padding:18px 20px}.simple .cierre b{color:var(--lila);font-family:Poppins}
.bloque{margin-top:46px}.eyebrow{font-size:12px;text-transform:uppercase;letter-spacing:1.6px;color:var(--morado);font-weight:700}.bloque>h2{font-size:28px;margin:4px 0 6px;color:var(--oscuro);letter-spacing:-.3px}.bloque>.sub{color:var(--gris);margin:0 0 18px;max-width:760px}
.card{background:#fff;border-radius:20px;padding:22px;border:1px solid var(--linea)}.card h3{margin:0 0 8px;font-size:17px;color:var(--oscuro)}.nota{font-size:12.8px;color:var(--gris)}.grid2{display:grid;grid-template-columns:1.35fr 1fr;gap:18px}.grid2b{display:grid;grid-template-columns:1fr 1fr;gap:18px}
svg.mapa{width:100%;height:auto;display:block;border-radius:14px}.mt1{font:700 14px Poppins,sans-serif;fill:#fff}.mt2{font:500 11.5px Inter,sans-serif;fill:var(--lila)}.mesc{font:600 11px Inter,sans-serif;fill:var(--oscuro)}
.ley-mapa{display:flex;flex-wrap:wrap;gap:8px 14px;margin-top:12px;font-size:12.5px}.ley-mapa span{display:inline-flex;align-items:center;gap:7px}.ley-mapa i{width:16px;height:12px;border-radius:3px;display:inline-block}
.datos{display:grid;gap:4px}.dato{display:flex;justify-content:space-between;gap:12px;border-bottom:1px dashed var(--linea);padding:8px 0;font-size:14px}.dato span{color:var(--gris);white-space:nowrap}.dato b{word-break:break-word}.dato b{text-align:right;color:var(--oscuro)}.grande{font-size:20px}
.aviso{background:var(--lila-f);border-radius:12px;padding:12px 14px;font-size:13.5px;color:#3b3670;margin-top:12px}.aviso.rojo-s{background:var(--rojo-f);color:#9f1239}
svg.graf{width:100%;height:auto;display:block}.bl{font:500 12.5px Inter,sans-serif;fill:var(--texto)}.bv{font:700 12.5px Poppins,sans-serif;fill:var(--oscuro)}.sv{font:700 13px Poppins,sans-serif;fill:#fff}.ax{font:500 11px Inter,sans-serif;fill:var(--gris)}
svg.barra{width:100%;height:auto;display:block;margin-top:8px}.leyenda{display:flex;flex-wrap:wrap;gap:8px 18px;margin-top:12px;font-size:13.5px}.leyenda span{display:inline-flex;align-items:center;gap:7px}.leyenda i{width:12px;height:12px;border-radius:50%;display:inline-block}
.tabla{width:100%;border-collapse:separate;border-spacing:0;font-size:14px;overflow:hidden;border-radius:14px;border:1px solid var(--linea);background:#fff}.tabla th{background:var(--oscuro);color:#fff;text-align:left;padding:11px 14px;font:600 13px Poppins,sans-serif}.tabla td{padding:11px 14px;border-top:1px solid var(--linea);vertical-align:top}.tabla td:first-child{font-weight:600;color:var(--oscuro)}
.pend{display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px;text-align:center;margin:18px 0 8px}.pend-v{font:800 24px Poppins,sans-serif;margin-top:-4px}.pend-s{font-size:12.5px;color:var(--gris);line-height:1.35}
.sems{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}.sem{background:#fff;border-radius:16px;padding:16px;border:1px solid var(--linea);border-top:5px solid var(--c)}.sem.rojo{--c:var(--rojo)}.sem.ambar{--c:var(--ambar)}.sem.verde{--c:var(--verde)}.sem.gris{--c:#9ca3af}.sem-h{display:flex;align-items:center;gap:8px;font:600 15px Poppins,sans-serif;color:var(--oscuro)}.sem-h i{width:10px;height:10px;border-radius:50%;background:var(--c);flex:none}.sem p{margin:8px 0 0;font-size:13.5px}
.dato b.grande{white-space:nowrap}.tabla.espec td,.tabla.espec th{white-space:nowrap;padding:10px 9px}.cifras2{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:6px}.cifras2 div{background:var(--lila-f);border-radius:14px;padding:14px}.cifras2 b{display:block;font-size:21px;color:var(--oscuro)}.cifras2 span{font-size:12.5px;color:var(--gris);line-height:1.35;display:block}
.cifras4{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:16px}.cifras4 div{background:var(--lila-f);border-radius:14px;padding:14px}.cifras4 b{display:block;font-size:24px;color:var(--oscuro)}.cifras4 span{font-size:12.5px;color:var(--gris)}
.obs{display:grid;grid-template-columns:repeat(2,1fr);gap:14px;margin-top:18px}.ob{background:#fff;border-radius:16px;padding:18px;border:1px solid var(--linea)}.ob .num{font-size:30px;font-weight:800;color:var(--morado);line-height:1}.ob h3{margin:8px 0 4px;font-size:15.5px;color:var(--oscuro)}.ob p{margin:0;font-size:13.8px}
.pasos{counter-reset:p;display:grid;grid-template-columns:repeat(2,1fr);gap:12px}.paso{background:#fff;border-radius:16px;padding:16px 16px 16px 58px;position:relative;border:1px solid var(--linea);font-size:14px}.paso::before{counter-increment:p;content:counter(p);position:absolute;left:16px;top:16px;width:28px;height:28px;border-radius:50%;background:var(--oscuro);color:#fff;display:grid;place-items:center;font:700 13px Poppins}.paso b{color:var(--oscuro)}
footer{background:#fff;border-top:1px solid var(--linea);margin-top:50px;padding:28px 0}footer .wrap{display:flex;gap:22px;align-items:center;justify-content:space-between;flex-wrap:wrap}footer img{height:64px}footer p{margin:0;font-size:12.5px;color:var(--gris);max-width:680px}
@media(max-width:860px){.kpis,.cifras4{grid-template-columns:repeat(2,1fr)}.grid2,.grid2b,.obs,.pasos{grid-template-columns:1fr}.sems{grid-template-columns:1fr 1fr}}
@media(max-width:560px){.sems,.kpis,.cifras4{grid-template-columns:1fr}.top .chip{display:none}}
@media print{body{background:#fff}.card,.sem,.ob,.paso{break-inside:avoid}}`;
