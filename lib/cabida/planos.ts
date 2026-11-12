// Planchas del anteproyecto (A1 horizontal, rótulo a la derecha): localización, sótanos, primer piso, planta tipo,
// torre ampliada con cotas, apartamentos tipo, corte y fachada, y cuadro de áreas.
import type { Op, P, Plancha } from "./lienzo";
import { aLote } from "./proyecto";
import { PLANTILLAS, instanciar } from "./tipologias";
import { plantaTorre, type PlantaTorre } from "./torre";

type Proyecto = any; // resultado de anteproyecto()
const A1: [number, number] = [841, 594], MARGEN = 10, ROTULO = 175;
const ESCALAS = [50, 75, 100, 125, 150, 200, 250, 300, 400, 500, 750, 1000, 1500, 2000];
const f1 = (x: number, d = 1) => x.toLocaleString("es-CO", { maximumFractionDigits: d, minimumFractionDigits: d });
const f0 = (x: number) => Math.round(x).toLocaleString("es-CO");

type Xf = (q: P) => P;
const caja = (ops: Op[]) => {
  const xs: number[] = [], ys: number[] = [];
  const add = (q: P) => { xs.push(q[0]); ys.push(q[1]); };
  for (const o of ops) {
    if (o.t === "linea") { add(o.a); add(o.b); } else if (o.t === "poli" || o.t === "relleno") o.pts.forEach(add);
    else if (o.t === "circulo" || o.t === "arco") { add([o.c[0] - o.r, o.c[1] - o.r]); add([o.c[0] + o.r, o.c[1] + o.r]); } else add(o.p);
  }
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
};
const mover = (ops: Op[], dx: number, dy: number): Op[] => ops.map((o) => {
  const m = (q: P): P => [q[0] + dx, q[1] + dy];
  if (o.t === "linea") return { ...o, a: m(o.a), b: m(o.b) };
  if (o.t === "poli" || o.t === "relleno") return { ...o, pts: o.pts.map(m) };
  if (o.t === "circulo" || o.t === "arco") return { ...o, c: m(o.c) };
  return { ...o, p: m(o.p) };
});

/** Texto en mm de papel → metros del modelo. */
const mmM = (mm: number, esc: number) => (mm * esc) / 1000;

/** Cota lineal: de a a b, desplazada `off` metros a la izquierda de la dirección a→b. */
function cota(a: P, b: P, off: number, esc: number, texto?: string): Op[] {
  const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy); if (L < 0.05) return [];
  const nx = -dy / L, ny = dx / L, ux = dx / L, uy = dy / L;
  const A: P = [a[0] + nx * off, a[1] + ny * off], B: P = [b[0] + nx * off, b[1] + ny * off];
  const t = mmM(1.2, esc), ext = mmM(1.5, esc);
  const ang = (Math.atan2(dy, dx) * 180) / Math.PI;
  const rot = ang > 90 || ang <= -90 ? ang + 180 : ang;
  return [
    { t: "linea", a: [a[0] + nx * (off - Math.sign(off) * mmM(1, esc)), a[1] + ny * (off - Math.sign(off) * mmM(1, esc))], b: [A[0] + nx * ext * Math.sign(off), A[1] + ny * ext * Math.sign(off)], capa: "A-COTA" },
    { t: "linea", a: [b[0] + nx * (off - Math.sign(off) * mmM(1, esc)), b[1] + ny * (off - Math.sign(off) * mmM(1, esc))], b: [B[0] + nx * ext * Math.sign(off), B[1] + ny * ext * Math.sign(off)], capa: "A-COTA" },
    { t: "linea", a: A, b: B, capa: "A-COTA" },
    { t: "linea", a: [A[0] - (ux + nx) * t / 2, A[1] - (uy + ny) * t / 2], b: [A[0] + (ux + nx) * t / 2, A[1] + (uy + ny) * t / 2], capa: "A-COTA" },
    { t: "linea", a: [B[0] - (ux + nx) * t / 2, B[1] - (uy + ny) * t / 2], b: [B[0] + (ux + nx) * t / 2, B[1] + (uy + ny) * t / 2], capa: "A-COTA" },
    { t: "texto", p: [(A[0] + B[0]) / 2 + nx * mmM(1, esc), (A[1] + B[1]) / 2 + ny * mmM(1, esc)], alto: mmM(2, esc), txt: texto ?? f1(L, 2), capa: "A-COTA", alin: "centro", rot },
  ];
}

const centro = (pts: P[]): P => [pts.reduce((s, q) => s + q[0], 0) / pts.length, pts.reduce((s, q) => s + q[1], 0) / pts.length];

/** Dibuja la planta de una torre transformada al marco del lote. */
function dibujarTorre(pl: PlantaTorre, T: Xf, rotBloque: number, esc: number, o: { detalle: boolean; convertidos?: Record<string, string>; adaptables?: string[]; textos?: boolean }): Op[] {
  const ops: Op[] = [];
  const tp = (pts: P[]) => pts.map(T);
  // Espacios convertidos (lobby, salón social): se dibujan como un solo recinto, sin muros internos, puertas ni muebles.
  const cajasConv = pl.aptos.filter((a) => o.convertidos?.[a.id]).map((a) => { const xs = a.poly.map((q) => q[0]), ys = a.poly.map((q) => q[1]); return [Math.min(...xs) + 0.2, Math.min(...ys) + 0.2, Math.max(...xs) - 0.2, Math.max(...ys) - 0.2]; });
  const enConv = (q: P) => cajasConv.some(([x0, y0, x1, y1]) => q[0] > x0 && q[0] < x1 && q[1] > y0 && q[1] < y1);
  for (const c of pl.circulacion) ops.push({ t: "relleno", pts: tp(c), capa: "A-CIRCULACION" });
  // Muros (las fachadas se cortan en las ventanas)
  const ventanas = pl.ventanas;
  for (const m of pl.muros) {
    if (m.tipo === "interior" && enConv(centro(m.poly))) continue;
    let piezas: P[][] = [m.poly];
    if (m.tipo === "fachada") {
      const ys = m.poly.map((q) => q[1]), y0 = Math.min(...ys), y1 = Math.max(...ys);
      if (y1 - y0 < 0.5) {
        const lado = ventanas.filter((v) => Math.abs(v.a[1] - (y0 < 0 ? 0 : pl.D)) < 0.05).map((v) => [Math.min(v.a[0], v.b[0]), Math.max(v.a[0], v.b[0])] as [number, number]).sort((a, b) => a[0] - b[0]);
        const x0 = Math.min(...m.poly.map((q) => q[0])), x1 = Math.max(...m.poly.map((q) => q[0]));
        piezas = []; let x = x0;
        for (const [a, b] of lado) { if (a - x > 0.02) piezas.push([[x, y0], [a, y0], [a, y1], [x, y1]]); x = Math.max(x, b); }
        if (x1 - x > 0.02) piezas.push([[x, y0], [x1, y0], [x1, y1], [x, y1]]);
      }
    }
    for (const pz of piezas) {
      ops.push({ t: "relleno", pts: tp(pz), capa: "A-RELLENO-MURO" });
      ops.push({ t: "poli", pts: tp(pz), capa: m.tipo === "interior" ? "A-MURO-INT" : "A-MURO" });
    }
  }
  for (const v of ventanas) {
    const d = v.a[1] < pl.D / 2 ? -1 : 1, t = 0.15;
    for (const off of [0, t / 2, t]) ops.push({ t: "linea", a: T([v.a[0], v.a[1] + d * off]), b: T([v.b[0], v.b[1] + d * off]), capa: "A-VENTANA" });
  }
  for (const pu of pl.puertas) if (pu.tipo === "entrada" || !enConv([pu.x, pu.y])) ops.push({ t: "bloque", nombre: "PUERTA", p: T([pu.x, pu.y]), rot: pu.rot + rotBloque, sx: pu.ancho, sy: pu.espejo ? -pu.ancho : pu.ancho, capa: "A-PUERTA" });
  // Núcleo
  const n = pl.nucleo;
  for (const e of n.escaleras) {
    ops.push({ t: "poli", pts: tp(e), capa: "A-ESCALERA" });
    const xs = e.map((q) => q[0]), ys = e.map((q) => q[1]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys), xm = (x0 + x1) / 2;
    ops.push({ t: "linea", a: T([xm, y0 + 1.2]), b: T([xm, y1 - 1.2]), capa: "A-ESCALERA" });
    for (let y = y0 + 1.2; y <= y1 - 1.2 + 0.01; y += 0.28) ops.push({ t: "linea", a: T([x0, y]), b: T([x1, y]), capa: "A-ESCALERA" });
    if (o.textos !== false) ops.push({ t: "texto", p: T([xm, y0 + 0.5]), alto: mmM(1.8, esc), txt: "Escalera", capa: "A-ESPACIO", alin: "centro" });
  }
  for (const v of n.vestibulos ?? []) { ops.push({ t: "poli", pts: tp(v), capa: "A-ESCALERA" }); if (o.textos !== false) ops.push({ t: "texto", p: T(centro(v)), alto: mmM(1.5, esc), txt: "Vestíbulo", capa: "A-ESPACIO", alin: "centro" }); }
  for (const a of n.ascensores) { const q = tp(a); ops.push({ t: "poli", pts: q, capa: "A-ASCENSOR" }, { t: "linea", a: q[0], b: q[2], capa: "A-ASCENSOR" }, { t: "linea", a: q[1], b: q[3], capa: "A-ASCENSOR" }); }
  ops.push({ t: "relleno", pts: tp(n.shut), capa: "A-DUCTO" }); for (const d of n.ductos) ops.push({ t: "poli", pts: tp(d), capa: "A-DUCTO" });
  if (o.textos !== false && Math.abs(n.shut[2][0] - n.shut[0][0]) > 0.1) ops.push({ t: "texto", p: T(centro(n.shut)), alto: mmM(1.4, esc), txt: "Shut", capa: "A-TEXTO", alin: "centro" });
  // Espacios, muebles y rótulos de apartamentos
  const conv = o.convertidos ?? {};
  for (const e of pl.espacios) {
    if (conv[e.apto]) continue;
    if (o.detalle && o.textos !== false && e.area > 2.5) {
      const c = T(centro(e.poly));
      ops.push({ t: "texto", p: [c[0], c[1] + mmM(0.6, esc)], alto: mmM(1.8, esc), txt: e.nombre, capa: "A-ESPACIO", alin: "centro" });
      ops.push({ t: "texto", p: [c[0], c[1] - mmM(2.2, esc)], alto: mmM(1.5, esc), txt: `${f1(e.area)} m²`, capa: "A-ESPACIO", alin: "centro" });
    }
  }
  if (o.detalle) for (const m of pl.muebles) {
    const ap = pl.espacios.find((e) => { const xs = e.poly.map((q) => q[0]), ys = e.poly.map((q) => q[1]); return m.x >= Math.min(...xs) && m.x <= Math.max(...xs) && m.y >= Math.min(...ys) && m.y <= Math.max(...ys); });
    if ((ap && conv[ap.apto]) || enConv([m.x, m.y])) continue;
    ops.push({ t: "bloque", nombre: m.bloque, p: T([m.x, m.y]), rot: m.rot + rotBloque, capa: "A-MOBILIARIO" });
  }
  for (const a of pl.aptos) {
    const c = T(centro(a.poly));
    if (conv[a.id]) {
      ops.push({ t: "poli", pts: tp(a.poly), capa: "A-APTO" });
      ops.push({ t: "texto", p: c, alto: mmM(2.6, esc), txt: conv[a.id], capa: "A-APTO", alin: "centro", negrita: true });
      ops.push({ t: "texto", p: [c[0], c[1] - mmM(3.4, esc)], alto: mmM(1.8, esc), txt: `${f1(a.area_privada)} m²`, capa: "A-APTO", alin: "centro" });
      continue;
    }
    if (o.textos === false) continue;
    const q = T([centro(a.poly)[0], a.lado === "sur" ? 0.9 : pl.D - 0.9]);
    ops.push({ t: "texto", p: q, alto: mmM(o.detalle ? 2.2 : 2.6, esc), txt: `${a.id} · ${a.nombre}${o.adaptables?.includes(a.id) ? " · adaptable" : ""}`, capa: "A-APTO", alin: "centro", negrita: true });
    if (!o.detalle) ops.push({ t: "texto", p: [q[0], q[1] - mmM(3.2, esc)], alto: mmM(2, esc), txt: `${f1(a.area_privada)} m²`, capa: "A-APTO", alin: "centro" });
  }
  return ops;
}

const transfTorre = (t: any): { T: Xf; rot: number } => ({ T: aLote(t), rot: t.rotada ? 90 : 0 });

/** Contexto común: lote, área edificable y vía. */
function contexto(m: Proyecto, esc: number, conRetiros = true): Op[] {
  const ops: Op[] = [{ t: "poli", pts: m.marco.lote, capa: "A-LOTE" }];
  if (conRetiros && m.edificable?.length) ops.push({ t: "poli", pts: m.edificable, capa: "A-RETIRO" });
  const xs = m.marco.lote.map((q: P) => q[0]), ys = m.marco.lote.map((q: P) => q[1]);
  ops.push({ t: "texto", p: [(Math.min(...xs) + Math.max(...xs)) / 2, Math.min(...ys) - mmM(8, esc)], alto: mmM(3, esc), txt: `VÍA${m.marco.via?.nombre ? ` · ${m.marco.via.nombre}` : ""} (frente del lote)`, capa: "A-TEXTO", alin: "centro", negrita: true });
  return ops;
}

/** Arma una plancha: elige la escala para que el dibujo quepa, lo centra, agrega marco, rótulo y norte. */
function plancha(numero: number, total: number, titulo: string, subtitulo: string, dibujo: (esc: number) => Op[], m: Proyecto, escFija?: number, girarNorte = true): Plancha {
  const anchoU = A1[0] - 2 * MARGEN - ROTULO - 10, altoU = A1[1] - 2 * MARGEN - 20;
  let esc = escFija ?? ESCALAS[ESCALAS.length - 1];
  if (!escFija) for (const e of ESCALAS) { const b = caja(dibujo(e)); if (((b.x1 - b.x0) * 1000) / e <= anchoU && ((b.y1 - b.y0) * 1000) / e <= altoU) { esc = e; break; } }
  const ops0 = dibujo(esc), b = caja(ops0);
  const W = mmM(A1[0], esc), H = mmM(A1[1], esc), mg = mmM(MARGEN, esc), ro = mmM(ROTULO, esc);
  const cx = mg + (W - 2 * mg - ro) / 2, cy = mg + mmM(10, esc) + (H - 2 * mg - mmM(10, esc)) / 2;
  const ops = mover(ops0, cx - (b.x0 + b.x1) / 2, cy - (b.y0 + b.y1) / 2);
  // Marco y rótulo
  ops.push({ t: "poli", pts: [[mg, mg], [W - mg, mg], [W - mg, H - mg], [mg, H - mg]], capa: "A-PLANCHA" });
  const rx = W - mg - ro;
  ops.push({ t: "linea", a: [rx, mg], b: [rx, H - mg], capa: "A-PLANCHA" });
  const tx = rx + mmM(6, esc);
  let ty = H - mg - mmM(16, esc);
  const lin = (txt: string, mm = 3, neg = false, gap = 6) => { ops.push({ t: "texto", p: [tx, ty], alto: mmM(mm, esc), txt, capa: "A-ROTULO", negrita: neg }); ty -= mmM(gap, esc); };
  const sep = () => { ty -= mmM(1, esc); ops.push({ t: "linea", a: [rx, ty + mmM(3, esc)], b: [W - mg, ty + mmM(3, esc)], capa: "A-ROTULO" }); ty -= mmM(4, esc); };
  lin("irrelevant", 7, true, 8); lin("INTELIGENCIA DE SUELO", 2.5, false, 8); sep();
  lin("PROYECTO", 2.2, true, 5); lin(`Anteproyecto esquemático ${m.barrio ?? ""}`, 3.2, false, 6); lin(`${m.municipio ?? ""} · predio ${m.predio}`, 2.6, false, 5);
  lin(`Lote ${f0(m.resumen.area_lote_m2)} m² · ${m.resumen.escenario}`, 2.6, false, 6); sep();
  lin("CONTENIDO", 2.2, true, 5); lin(titulo, 4, true, 7); if (subtitulo) for (const s of subtitulo.split("\n")) lin(s, 2.6, false, 5); sep();
  lin("DATOS GENERALES", 2.2, true, 5);
  const r = m.resumen;
  for (const s of [`${r.torres} torre(s) · ${r.pisos_totales} pisos · ${f1(r.altura_m)} m`, `${r.unidades} viviendas · ${r.aptos_por_piso} por piso tipo`,
    `Construido sobre rasante ${f0(r.area_construida_sobre_rasante_m2)} m²`, `Vendible ${f0(r.area_vendible_m2)} m² · eficiencia ${r.eficiencia_planta_pct} %`,
    `IC ${f1(r.indice_construccion, 2)} · IO ${f1(r.indice_ocupacion, 2)}`, `${r.sotanos} sótano(s) · ${r.parqueaderos_dibujados} parqueaderos`]) lin(s, 2.4, false, 4.6);
  sep();
  lin("NOTAS", 2.2, true, 5);
  for (const s of ["Anteproyecto esquemático generado", "automáticamente para prefactibilidad.", "No apto para construcción ni licencia.", "Verificar norma específica, NSR-10,", "parqueaderos, redes y estructura.", "Cotas en metros."]) lin(s, 2.2, false, 4);
  // Pie del rótulo
  const py = mg + mmM(30, esc);
  ops.push({ t: "linea", a: [rx, py], b: [W - mg, py], capa: "A-ROTULO" });
  ops.push({ t: "texto", p: [tx, py - mmM(8, esc)], alto: mmM(2.4, esc), txt: `Escala 1:${esc}`, capa: "A-ROTULO", negrita: true });
  ops.push({ t: "texto", p: [tx, py - mmM(14, esc)], alto: mmM(2.4, esc), txt: `Fecha ${new Date().toLocaleDateString("es-CO", { timeZone: "America/Bogota" })}`, capa: "A-ROTULO" });
  ops.push({ t: "texto", p: [W - mg - mmM(6, esc), py - mmM(14, esc)], alto: mmM(7, esc), txt: `${numero}/${total}`, capa: "A-ROTULO", alin: "der", negrita: true });
  ops.push({ t: "texto", p: [tx, py - mmM(22, esc)], alto: mmM(2, esc), txt: "MAGNA-SIRGAS Origen Nacional (EPSG 9377)", capa: "A-ROTULO" });
  // Norte (el eje Y local apunta en la dirección rotada: se indica con la flecha girada)
  if (girarNorte) {
    const rotN = m.marco.reflejado ? (m.marco.rot ?? 0) - 180 : -(m.marco.rot ?? 0);
    ops.push({ t: "bloque", nombre: "NORTE", p: [rx - mmM(18, esc), H - mg - mmM(18, esc)], rot: rotN, sx: mmM(8, esc), sy: mmM(8, esc), capa: "A-TEXTO" });
    ops.push({ t: "texto", p: [rx - mmM(18, esc), H - mg - mmM(31, esc)], alto: mmM(2.5, esc), txt: "N", capa: "A-TEXTO", alin: "centro", negrita: true });
  }
  return { numero, titulo, escala: esc, ancho_m: W, alto_m: H, ops };
}

/** Tabla simple: filas de celdas; anchos en mm. */
function tabla(x: number, y: number, anchos: number[], filas: string[][], esc: number, alto = 8): Op[] {
  const ops: Op[] = [];
  const W = anchos.reduce((s, a) => s + a, 0);
  filas.forEach((f, i) => {
    const yy = y - mmM(alto * i, esc);
    ops.push({ t: "linea", a: [x, yy], b: [x + mmM(W, esc), yy], capa: "A-TABLA" });
    let xx = x;
    f.forEach((c, j) => {
      ops.push({ t: "texto", p: [xx + mmM(j === 0 ? 2 : anchos[j] - 2, esc), yy - mmM(alto - 2.4, esc)], alto: mmM(3, esc), txt: c, capa: "A-TABLA", alin: j === 0 ? "izq" : "der", negrita: i === 0 });
      xx += mmM(anchos[j], esc);
    });
  });
  const yb = y - mmM(alto * filas.length, esc);
  ops.push({ t: "linea", a: [x, yb], b: [x + mmM(W, esc), yb], capa: "A-TABLA" });
  let xx = x;
  for (const a of [0, ...anchos]) { xx += mmM(a, esc); ops.push({ t: "linea", a: [xx - mmM(a, esc) + (a === 0 ? 0 : mmM(a, esc)) - (a === 0 ? 0 : 0), y], b: [xx, yb], capa: "A-TABLA" }); }
  return ops;
}

export function planchas(m: Proyecto): Plancha[] {
  const torres = m.torres as any[];
  const conv: Record<string, string> = {};
  const adapt: string[] = [];
  for (const x of m.primer_piso) { if (x.lobby) conv[x.lobby] = "Lobby y portería"; for (const e of x.equipamiento) conv[e.id] = "Salón social"; adapt.push(...x.adaptables); }
  const lista: { t: string; s: string; f: (e: number) => Op[]; esc?: number }[] = [];

  // 1. Localización
  lista.push({ t: "Localización e implantación", s: `Retiro frontal ${m.norma.frontal} m · lateral ${m.norma.lateral} m · fondo ${m.norma.fondo} m\nSeparación entre torres ${m.norma.entre_torres} m`, f: (e) => {
    const ops = contexto(m, e);
    for (const t of torres) {
      const { T } = transfTorre(t);
      const h = [T([0, 0]), T([t.planta.L, 0]), T([t.planta.L, t.planta.D]), T([0, t.planta.D])];
      ops.push({ t: "relleno", pts: h, capa: "A-CIRCULACION" }, { t: "poli", pts: h, capa: "A-MURO" });
      ops.push({ t: "texto", p: centro(h), alto: mmM(4, e), txt: `TORRE ${t.id}`, capa: "A-TEXTO", alin: "centro", negrita: true });
      ops.push({ t: "texto", p: [centro(h)[0], centro(h)[1] - mmM(5.5, e)], alto: mmM(2.6, e), txt: `${m.resumen.pisos_totales} pisos · ${f1(t.planta.L)} × ${f1(t.planta.D)} m`, capa: "A-TEXTO", alin: "centro" });
      ops.push(...cota(h[0], h[1], -mmM(4, e), e), ...cota(h[1], h[2], -mmM(4, e), e));
    }
    if (m.sotano_poligono?.length) ops.push({ t: "poli", pts: m.sotano_poligono, capa: "A-RETIRO" });
    // Cotas del lote (caja envolvente)
    const xs = m.marco.lote.map((q: P) => q[0]), ys = m.marco.lote.map((q: P) => q[1]);
    ops.push(...cota([Math.min(...xs), Math.min(...ys)], [Math.max(...xs), Math.min(...ys)], -mmM(14, e), e), ...cota([Math.max(...xs), Math.min(...ys)], [Math.max(...xs), Math.max(...ys)], -mmM(10, e), e));
    return ops;
  } });

  // 2. Sótanos
  for (const s of m.sotanos as any[]) lista.push({ t: `Planta sótano ${s.nivel}`, s: `${s.puestos.length} parqueaderos${s.nivel === 1 ? ` (${s.puestos.filter((q: any) => q.visitante).length} visitantes)` : ""} · ${s.depositos.length} depósitos\n${m.resumen.rampa.nota}`, f: (e) => {
    const ops = contexto(m, e, false);
    ops.push({ t: "poli", pts: s.poligono, capa: "A-MURO" });
    for (const c of s.calles) ops.push({ t: "relleno", pts: c, capa: "A-CIRCULACION" });
    ops.push({ t: "relleno", pts: s.espina, capa: "A-CIRCULACION" });
    ops.push({ t: "poli", pts: s.rampa, capa: "A-RAMPA" });
    const rc = centro(s.rampa), ry = s.rampa.map((q: P) => q[1]);
    ops.push({ t: "linea", a: [rc[0], Math.min(...ry) + 1], b: [rc[0], Math.max(...ry) - 1], capa: "A-RAMPA" }, { t: "texto", p: [rc[0] + mmM(2, e), rc[1]], alto: mmM(2.5, e), txt: `Rampa ${Math.round(m.resumen.rampa.pendiente * 100)} %`, capa: "A-RAMPA", rot: 90 });
    for (const q of s.puestos) {
      ops.push({ t: "poli", pts: q.poly, capa: "A-PARQUEO" });
      ops.push({ t: "texto", p: centro(q.poly), alto: mmM(1.6, e), txt: q.visitante ? `V${q.n}` : String(q.n), capa: "A-PARQUEO", alin: "centro" });
    }
    for (const d of s.depositos) { ops.push({ t: "poli", pts: d, capa: "A-DEPOSITO" }); }
    if (s.depositos.length) ops.push({ t: "texto", p: centro(s.depositos[0]), alto: mmM(1.6, e), txt: "Dep.", capa: "A-DEPOSITO", alin: "centro" });
    for (const t of s.tecnicos) { ops.push({ t: "poli", pts: t.poly, capa: "A-TECNICO" }, { t: "texto", p: centro(t.poly), alto: mmM(1.8, e), txt: `${t.nombre} ${f0(t.area)} m²`, capa: "A-TECNICO", alin: "centro" }); }
    for (const n of s.nucleos) { ops.push({ t: "relleno", pts: n, capa: "A-DUCTO" }, { t: "texto", p: [centro(n)[0], centro(n)[1]], alto: mmM(2, e), txt: "Punto fijo", capa: "A-TEXTO", alin: "centro" }); }
    return ops;
  } });

  // 3. Primer piso
  if (m.resumen.pisos_plataforma === 0) lista.push({ t: "Planta primer piso", s: "Lobby, portería y cuarto de basuras por torre;\nequipamiento comunitario y viviendas adaptables", f: (e) => {
    const ops = contexto(m, e);
    for (const t of torres) { const { T, rot } = transfTorre(t); ops.push(...dibujarTorre(t.planta, T, rot, e, { detalle: false, convertidos: conv, adaptables: adapt })); }
    return ops;
  } });

  // 4. Planta tipo general
  lista.push({ t: "Planta piso tipo", s: `${m.resumen.aptos_por_piso} apartamentos por piso\n${m.resumen.por_tipologia.map((x: any) => `${x.tipologia} ${x.pct} %`).join(" · ")}`, f: (e) => {
    const ops = contexto(m, e);
    for (const t of torres) { const { T, rot } = transfTorre(t); ops.push(...dibujarTorre(t.planta, T, rot, e, { detalle: e <= 200 })); }
    return ops;
  } });

  // 5. Torre ampliada con cotas
  const tA = torres[0];
  lista.push({ t: `Planta tipo torre ${tA.id} (ampliada)`, s: `Punto fijo: ${m.resumen.punto_fijo.escaleras} escalera(s)${m.resumen.punto_fijo.a_prueba_de_humo ? " a prueba de humo" : ""}, ${m.resumen.punto_fijo.ascensores} ascensor(es)`, f: (e) => {
    const T: Xf = (q) => q;
    const ops = dibujarTorre(tA.planta, T, 0, e, { detalle: true });
    const pl: PlantaTorre = tA.planta;
    ops.push(...cota([0, -0.15], [pl.L, -0.15], -mmM(14, e), e), ...cota([pl.L + 0.15, 0], [pl.L + 0.15, pl.D], -mmM(8, e), e));
    // Cotas parciales por apartamento (lado sur) y profundidad de crujía
    for (const a of pl.aptos.filter((x) => x.lado === "sur")) { const xs = a.poly.map((q) => q[0]); ops.push(...cota([Math.min(...xs), -0.15], [Math.max(...xs), -0.15], -mmM(7, e), e)); }
    ops.push(...cota([-0.15, 0], [-0.15, pl.F], mmM(7, e), e), ...cota([-0.15, pl.F], [-0.15, pl.F + pl.pasillo], mmM(7, e), e), ...cota([-0.15, pl.F + pl.pasillo], [-0.15, pl.D], mmM(7, e), e));
    return ops;
  }, esc: 100 });

  // 6. Apartamentos tipo
  const tiposUsados = [...new Set((torres.flatMap((t: any) => t.planta.aptos.map((a: any) => a.tipologia))) as string[])];
  lista.push({ t: "Apartamentos tipo", s: tiposUsados.map((k) => PLANTILLAS[k]?.nombre).join(" · "), f: (e) => {
    const ops: Op[] = []; let x = 0;
    for (const k of tiposUsados) {
      const ej = torres.flatMap((t: any) => t.planta.aptos).find((a: any) => a.tipologia === k);
      const W = ej ? Math.abs(ej.poly[1][0] - ej.poly[0][0]) || Math.abs(ej.poly[2][0] - ej.poly[1][0]) : PLANTILLAS[k].W;
      // Planta de una torre mínima con un solo apartamento de esa tipología, para reutilizar el dibujo
      const solo = plantaTorre({ F: m.opciones.crujia_m, pasillo: m.opciones.pasillo_m, largo_max: W + 6, mezcla: [{ tipologia: k, pct: 100 }], n_escaleras: 1, n_ascensores: 0, esp_fachada: 0.15, esp_medianero: 0.15, esp_interior: 0.1 }, k);
      const ap = instanciar(PLANTILLAS[k], W, m.opciones.crujia_m);
      const sub: Op[] = [];
      if (solo) {
        const a0 = solo.aptos.find((a) => a.lado === "norte")!;
        const xs = a0.poly.map((q) => q[0]), x0 = Math.min(...xs);
        const filtro = (o: Op) => true;
        const T: Xf = (q) => [q[0] - x0 + x, q[1] - (solo.F + solo.pasillo)];
        const parcial: PlantaTorre = { ...solo, aptos: [a0], espacios: solo.espacios.filter((s) => s.apto === a0.id), muebles: solo.muebles.filter((mu) => mu.x >= x0 && mu.x <= x0 + W && mu.y > solo.F),
          puertas: solo.puertas.filter((d) => d.x >= x0 - 0.01 && d.x <= x0 + W + 0.01 && d.y >= solo.F + solo.pasillo - 0.01),
          ventanas: solo.ventanas.filter((v) => v.a[1] > solo.F && Math.min(v.a[0], v.b[0]) >= x0 - 0.01 && Math.max(v.a[0], v.b[0]) <= x0 + W + 0.01),
          muros: solo.muros.filter((mu) => { const c = centro(mu.poly); return c[1] >= solo.F + solo.pasillo - 0.2; })
            .map((mu) => ({ ...mu, poly: mu.poly.map(([px, py]) => [Math.min(x0 + W + 0.075, Math.max(x0 - 0.075, px)), py] as P) }))
            .filter((mu) => Math.abs(mu.poly[1][0] - mu.poly[0][0]) + Math.abs(mu.poly[2][0] - mu.poly[1][0]) > 0.05),
          circulacion: [], nucleo: { ...solo.nucleo, escaleras: [], vestibulos: [], ascensores: [], ductos: [], shut: [[0, 0], [0, 0], [0, 0], [0, 0]] } };
        sub.push(...dibujarTorre(parcial, T, 0, e, { detalle: true }).filter(filtro));
        sub.push(...cota([x, -0.3], [x + W, -0.3], -mmM(6, e), e), ...cota([x + W + 0.3, 0], [x + W + 0.3, ap.F], -mmM(6, e), e));
        sub.push({ t: "texto", p: [x + W / 2, ap.F + mmM(14, e)], alto: mmM(4, e), txt: `${PLANTILLAS[k].nombre.toUpperCase()} · ${f1(W * ap.F)} m²`, capa: "A-TEXTO", alin: "centro", negrita: true });
        // Cuadro de espacios
        let yy = -mmM(18, e);
        for (const esp of ap.espacios) { sub.push({ t: "texto", p: [x, yy], alto: mmM(2.2, e), txt: esp.nombre, capa: "A-TABLA" }, { t: "texto", p: [x + W, yy], alto: mmM(2.2, e), txt: `${f1((esp.r[2] - esp.r[0]) * (esp.r[3] - esp.r[1]))} m²`, capa: "A-TABLA", alin: "der" }); yy -= mmM(4, e); }
      }
      ops.push(...sub);
      x += W + mmM(40, e);
    }
    return ops;
  } });

  // 7. Corte y fachada (torre A)
  lista.push({ t: "Corte transversal y fachada", s: `Torre ${tA.id} · niveles en metros sobre el piso 1`, f: (e) => {
    const ops: Op[] = [];
    const pl: PlantaTorre = tA.planta;
    const niv = m.niveles as any[];
    const zMin = Math.min(...niv.map((n) => n.z)), zMax = Math.max(...niv.map((n) => n.z + n.altura));
    // Corte (eje q): terreno, sótanos y pisos
    const ancho = pl.D + 16;
    ops.push({ t: "linea", a: [-8, 0], b: [ancho - 8, 0], capa: "A-TERRENO" });
    for (const n of niv) {
      const enTorre = n.tipo !== "sotano";
      const x0 = enTorre ? 0 : -6, x1 = enTorre ? pl.D : pl.D + 6;
      ops.push({ t: "relleno", pts: [[x0, n.z - 0.15], [x1, n.z - 0.15], [x1, n.z], [x0, n.z]], capa: "A-RELLENO-MURO" });
      ops.push({ t: "linea", a: [x0, n.z], b: [x0, n.z + n.altura], capa: "A-CORTE" }, { t: "linea", a: [x1, n.z], b: [x1, n.z + n.altura], capa: "A-CORTE" });
      if (enTorre) ops.push({ t: "linea", a: [pl.F, n.z], b: [pl.F, n.z + n.altura - 0.3], capa: "A-MURO-INT" }, { t: "linea", a: [pl.F + pl.pasillo, n.z], b: [pl.F + pl.pasillo, n.z + n.altura - 0.3], capa: "A-MURO-INT" });
      ops.push({ t: "texto", p: [x1 + mmM(4, e), n.z + 0.05], alto: mmM(2.2, e), txt: `${n.nombre}  N ${n.z >= 0 ? "+" : ""}${f1(n.z, 2)}`, capa: "A-NIVEL" });
    }
    ops.push({ t: "relleno", pts: [[0, zMax], [pl.D, zMax], [pl.D, zMax + 0.15], [0, zMax + 0.15]], capa: "A-RELLENO-MURO" });
    ops.push({ t: "texto", p: [pl.D + mmM(4, e), zMax + 0.1], alto: mmM(2.2, e), txt: `Cubierta  N +${f1(zMax, 2)}`, capa: "A-NIVEL" });
    ops.push(...cota([-0.5, 0], [-0.5, zMax], mmM(10, e), e, `${f1(zMax, 2)} m`), ...cota([0, zMin - 0.5], [pl.D, zMin - 0.5], -mmM(6, e), e));
    ops.push({ t: "texto", p: [pl.D / 2, zMax + mmM(14, e)], alto: mmM(3.5, e), txt: "CORTE TRANSVERSAL", capa: "A-TEXTO", alin: "centro", negrita: true });
    // Fachada sur (eje s), a la derecha del corte
    const fx = ancho + mmM(40, e);
    for (const n of niv.filter((x) => x.tipo !== "sotano")) {
      ops.push({ t: "poli", pts: [[fx, n.z], [fx + pl.L, n.z], [fx + pl.L, n.z + n.altura], [fx, n.z + n.altura]], capa: "A-FACHADA" });
      for (const v of pl.ventanas.filter((w) => w.a[1] < pl.D / 2)) {
        const a = Math.min(v.a[0], v.b[0]), b = Math.max(v.a[0], v.b[0]), hz = v.tipo === "ventanal" ? 0.1 : 0.9;
        ops.push({ t: "poli", pts: [[fx + a, n.z + hz], [fx + b, n.z + hz], [fx + b, n.z + 2.2], [fx + a, n.z + 2.2]], capa: "A-VENTANA" });
      }
    }
    ops.push({ t: "linea", a: [fx - 4, 0], b: [fx + pl.L + 4, 0], capa: "A-TERRENO" });
    ops.push(...cota([fx, -0.4], [fx + pl.L, -0.4], -mmM(6, e), e));
    ops.push({ t: "texto", p: [fx + pl.L / 2, zMax + mmM(14, e)], alto: mmM(3.5, e), txt: "FACHADA PRINCIPAL (lado sur de la torre)", capa: "A-TEXTO", alin: "centro", negrita: true });
    return ops;
  } });

  // 8. Cuadro de áreas
  lista.push({ t: "Cuadro de áreas y norma", s: "Áreas en m² · prefactibilidad", f: (e) => {
    const r = m.resumen;
    const ops: Op[] = [];
    ops.push(...tabla(0, 0, [90, 32, 42, 36], [["Tipología", "Unidades", "Área prom.", "% mezcla"], ...r.por_tipologia.map((x: any) => [x.tipologia, String(x.unidades), f1(x.area_promedio_m2), `${x.pct} %`]), ["Total", String(r.unidades), "", "100 %"]], e));
    const y2 = -mmM(8 * (r.por_tipologia.length + 4.5), e);
    const filasAreas = [["Concepto", "Valor"], ["Área del lote", f0(r.area_lote_m2)], ["Área edificable (después de retiros)", f0(r.area_edificable_m2)],
      ["Área construida sobre rasante", f0(r.area_construida_sobre_rasante_m2)], ["Área construible según norma", f0(r.area_construible_norma_m2)], ["Aprovechamiento de la norma", `${r.aprovechamiento_pct} %`],
      ["Área vendible (privada)", f0(r.area_vendible_m2)], ["Eficiencia de planta (privada / construida)", `${r.eficiencia_planta_pct} %`], ["Área común por piso tipo", f0(r.area_comun_por_piso_m2)],
      ["Índice de construcción resultante", f1(r.indice_construccion, 2)], ["Índice de ocupación resultante", f1(r.indice_ocupacion, 2)], ["Área de sótanos", f0(r.area_sotanos_m2)],
      ["Parqueaderos dibujados / exigidos", `${r.parqueaderos_dibujados} / ${r.parqueaderos_exigidos}`], ["Depósitos", String(r.depositos)],
      ["Equipamiento exigido / en sitio (m²)", `${f0(r.obligaciones.equipamiento_m2)} / ${f0(r.obligaciones.equipamiento_en_sitio_m2)}`], ["Viviendas adaptables", String(r.obligaciones.viviendas_adaptables)]];
    ops.push(...tabla(0, y2, [150, 50], filasAreas, e));
    // Norma y punto fijo
    let yy = 0; const nx = mmM(225, e);
    const t = (s: string, neg = false, mm = 2.8) => { ops.push({ t: "texto", p: [nx, yy], alto: mmM(mm, e), txt: s, capa: "A-TEXTO", negrita: neg }); yy -= mmM(neg ? 6.5 : 5.2, e); };
    t("NORMA VOLUMÉTRICA APLICADA", true, 3);
    t(`Retiro frontal ${m.norma.frontal} m · lateral ${m.norma.lateral} m · fondo ${m.norma.fondo} m · entre torres ${m.norma.entre_torres} m`);
    t(`Fuente: ${m.norma.fuente}`);
    yy -= mmM(3, e); t("PUNTO FIJO Y SEGURIDAD (NSR-10 / Decreto 471 de 2018)", true, 3);
    for (const s of m.resumen.punto_fijo.notas) for (const parte of s.match(/.{1,95}(\s|$)/g) ?? [s]) t(parte.trim(), false, 2.2);
    yy -= mmM(3, e); t("PARQUEADEROS Y RAMPA", true, 3);
    for (const s of [m.resumen.parqueaderos_nota, m.resumen.rampa.nota]) for (const parte of s.match(/.{1,95}(\s|$)/g) ?? [s]) t(parte.trim(), false, 2.2);
    yy -= mmM(3, e); t("AVISO", true, 3);
    for (const parte of m.aviso.match(/.{1,95}(\s|$)/g) ?? [m.aviso]) t(parte.trim(), false, 2.2);
    return ops;
  }, esc: 100 });

  const total = lista.length;
  return lista.map((p, i) => plancha(i + 1, total, p.t, p.s, p.f, m, p.esc));
}
