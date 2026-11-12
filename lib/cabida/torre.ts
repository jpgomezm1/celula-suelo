// Planta tipo de una torre de crujía doble: apartamentos a lado y lado de un pasillo central según la mezcla de
// tipologías, punto fijo (escaleras, ascensores, shut de basuras y ductos) y muros con sus vanos.
// Marco de la torre: s a lo largo (0..L), q a lo ancho (0..D). Lado "sur": fachada en q = 0; lado "norte": fachada en q = D.
import { PLANTILLAS, anchoPara, instanciar, type Mezcla, type Plantilla, type R } from "./tipologias";

export type P2 = [number, number];
export type Poly = P2[];
export type EspacioT = { apto: string; nombre: string; tipo: string; poly: Poly; area: number };
export type MuroT = { tipo: "fachada" | "medianero" | "pasillo" | "interior" | "nucleo"; poly: Poly };
export type PuertaT = { x: number; y: number; ancho: number; rot: number; espejo: boolean; tipo: string };
export type VentanaT = { a: P2; b: P2; tipo: string };
export type MuebleT = { bloque: string; x: number; y: number; rot: number };
export type AptoT = { id: string; tipologia: string; nombre: string; alcobas: number; banos: number; area_privada: number; poly: Poly; lado: "sur" | "norte" };
export type NucleoT = { poly: Poly; escaleras: Poly[]; vestibulos: Poly[]; ascensores: Poly[]; shut: Poly; ductos: Poly[]; hall: Poly; n_escaleras: number; n_ascensores: number };
export type PlantaTorre = { L: number; D: number; F: number; pasillo: number; aptos: AptoT[]; espacios: EspacioT[]; muros: MuroT[]; puertas: PuertaT[]; ventanas: VentanaT[];
  muebles: MuebleT[]; nucleo: NucleoT; circulacion: Poly[] };

export type ParamTorre = { F: number; pasillo: number; largo_max: number; mezcla: Mezcla; areas?: Record<string, number>; n_escaleras: number; n_ascensores: number; vestibulo?: boolean;
  esp_fachada: number; esp_medianero: number; esp_interior: number };

const rr = (x: number) => Math.round(x * 100) / 100;
const rectP = (x0: number, y0: number, x1: number, y1: number): Poly => [[rr(x0), rr(y0)], [rr(x1), rr(y0)], [rr(x1), rr(y1)], [rr(x0), rr(y1)]];

/** Dimensiones del punto fijo (a lo largo de la torre). Escalera de dos tramos ≈ 2,8 × 5,8 m; ascensor ≈ 2,2 m de frente. */
export function anchoNucleo(nEsc: number, nAsc: number) {
  const ladoEsc = nEsc * 3.0;               // lado sur: escaleras
  const ladoAsc = nAsc * 2.25 + 1.5;        // lado norte: ascensores + shut de basuras y ductos
  return rr(Math.max(ladoEsc, ladoAsc, 5.5));
}

/** Elige cuántos apartamentos de cada tipología caben por lado para acercarse a la mezcla sin pasar el largo máximo. */
export function secuenciaLado(p: ParamTorre, largoDisponible: number): { t: Plantilla; W: number }[] {
  const tipos = p.mezcla.filter((m) => PLANTILLAS[m.tipologia] && m.pct > 0);
  const tot = tipos.reduce((s, m) => s + m.pct, 0) || 1;
  let mejor: { t: Plantilla; W: number }[] = [];
  for (let n = 1; n <= 20; n++) {
    // Reparto por mayor resto
    const exacto = tipos.map((m) => (m.pct / tot) * n);
    const cant = exacto.map(Math.floor);
    let falta = n - cant.reduce((s, c) => s + c, 0);
    exacto.map((e, i) => [e - Math.floor(e), i] as [number, number]).sort((a, b) => b[0] - a[0]).forEach(([, i]) => { if (falta-- > 0) cant[i]++; });
    const seq = tipos.flatMap((m, i) => Array.from({ length: cant[i] }, () => { const t = PLANTILLAS[m.tipologia]; return { t, W: rr(anchoPara(t, m.area_m2 ?? p.areas?.[m.tipologia], p.F)) }; }));
    const largo = seq.reduce((s, a) => s + a.W, 0);
    if (largo <= largoDisponible) mejor = seq; else break;
  }
  // Intercala tipologías (grandes en las puntas: mejor fachada en esquinas).
  return mejor.sort((a, b) => b.t.W - a.t.W);
}

/** Genera la planta tipo de una torre. Devuelve null si no cabe ni un apartamento por lado. */
export function plantaTorre(p: ParamTorre, prefijo = "A"): PlantaTorre | null {
  const F = p.F, pas = p.pasillo, D = rr(2 * F + pas);
  const Lc = anchoNucleo(p.n_escaleras, p.n_ascensores);
  const disp = Math.max(0, p.largo_max - Lc);
  const sur = secuenciaLado(p, disp), norte = secuenciaLado(p, disp);
  if (!sur.length || !norte.length) return null;
  // Reparte cada lado en dos alas (izquierda y derecha del núcleo) lo más parejas posible.
  const partir = (seq: { t: Plantilla; W: number }[]) => {
    const izq: typeof seq = [], der: typeof seq = [];
    let li = 0, ld = 0;
    for (const a of seq) { if (li <= ld) { izq.push(a); li += a.W; } else { der.push(a); ld += a.W; } }
    return { izq, der, li, ld };
  };
  const ps = partir(sur), pn = partir(norte);
  // Igualar las alas de ambos lados: se estiran los anchos del ala más corta (hasta +12 %) y el resto queda como área común.
  const Li = Math.max(ps.li, pn.li), Ld = Math.max(ps.ld, pn.ld);
  const estirar = (ala: { t: Plantilla; W: number }[], largo: number, objetivo: number) => {
    const k = largo > 0 ? Math.min(1.12, objetivo / largo) : 1;
    return ala.map((a) => ({ ...a, W: rr(a.W * k) }));
  };
  const alas = { surI: estirar(ps.izq, ps.li, Li), surD: estirar(ps.der, ps.ld, Ld), norI: estirar(pn.izq, pn.li, Li), norD: estirar(pn.der, pn.ld, Ld) };
  const L = rr(Li + Lc + Ld);
  const c0 = Li, c1 = rr(Li + Lc);

  const out: PlantaTorre = { L, D, F, pasillo: pas, aptos: [], espacios: [], muros: [], puertas: [], ventanas: [], muebles: [], circulacion: [],
    nucleo: null as any };
  let n = 0;
  const colocar = (ala: { t: Plantilla; W: number }[], lado: "sur" | "norte", s0: number, haciaIzq: boolean) => {
    let s = s0;
    ala.forEach((a, i) => {
      const x0 = haciaIzq ? s - a.W : s;
      s = haciaIzq ? s - a.W : s + a.W;
      const ap = instanciar(a.t, a.W, F);
      const espejo = (i % 2 === 1) !== haciaIzq; // espejo alterno: baños contra baños
      n++;
      const id = `${prefijo}${String(n).padStart(2, "0")}`;
      // Transformación apartamento → torre
      const T = ([x, y]: P2): P2 => {
        const xx = espejo ? a.W - x : x;
        return lado === "sur" ? [rr(x0 + xx), rr(F - y)] : [rr(x0 + xx), rr(F + pas + y)];
      };
      const TR = (r: R): Poly => { const pts = [T([r[0], r[1]]), T([r[2], r[1]]), T([r[2], r[3]]), T([r[0], r[3]])]; return pts; };
      out.aptos.push({ id, tipologia: a.t.clave, nombre: a.t.nombre, alcobas: a.t.alcobas, banos: a.t.banos, area_privada: rr(a.W * F), poly: TR([0, 0, a.W, F]), lado });
      for (const e of ap.espacios) out.espacios.push({ apto: id, nombre: e.nombre, tipo: e.tipo, poly: TR(e.r), area: rr((e.r[2] - e.r[0]) * (e.r[3] - e.r[1])) });
      // Muros interiores: bordes compartidos entre espacios, menos los vanos.
      const lineas = new Map<string, [number, number][]>();
      const agregar = (k: string, a0: number, a1: number) => { const l = lineas.get(k) ?? []; l.push([Math.min(a0, a1), Math.max(a0, a1)]); lineas.set(k, l); };
      for (const e of ap.espacios) {
        const [x0e, y0e, x1e, y1e] = e.r;
        if (y0e > 0.01) agregar(`y:${y0e}`, x0e, x1e);
        if (y1e < F - 0.01) agregar(`y:${y1e}`, x0e, x1e);
        if (x0e > 0.01) agregar(`x:${x0e}`, y0e, y1e);
        if (x1e < a.W - 0.01) agregar(`x:${x1e}`, y0e, y1e);
      }
      for (const [k, ints] of lineas) {
        const [eje, valS] = k.split(":"), val = Number(valS);
        // unión de intervalos
        ints.sort((u, v) => u[0] - v[0]);
        const union: [number, number][] = [];
        for (const it of ints) { const last = union[union.length - 1]; if (last && it[0] <= last[1] + 0.01) last[1] = Math.max(last[1], it[1]); else union.push([...it]); }
        const vanos = ap.vanos.filter((v) => v.eje === eje && Math.abs(v.en - val) < 0.01);
        for (const [u0, u1] of union) {
          let cortes: [number, number][] = [[u0, u1]];
          for (const v of vanos) cortes = cortes.flatMap(([c0_, c1_]) => (v.b <= c0_ || v.a >= c1_ ? [[c0_, c1_]] : [[c0_, v.a], [v.b, c1_]].filter(([m0, m1]) => m1 - m0 > 0.05) as [number, number][]));
          const t = p.esp_interior / 2;
          for (const [m0, m1] of cortes) out.muros.push({ tipo: "interior", poly: eje === "y" ? TR([m0, val - t, m1, val + t]) : TR([val - t, m0, val + t, m1]) });
        }
      }
      // Puertas (las de entrada se abren hacia adentro del apartamento).
      for (const v of ap.vanos) {
        if (v.tipo === "paso") continue;
        const ancho = rr(v.b - v.a);
        const [hx, hy] = v.eje === "y" ? T([v.a, v.en]) : T([v.en, v.a]);
        // Dirección de giro en coordenadas del apartamento: hacia +y (o +x); se transforma con el lado y el espejo.
        const dirApto: P2 = v.eje === "y" ? [0, 1] : [1, 0];
        const dir: P2 = [espejo ? -dirApto[0] : dirApto[0], lado === "sur" ? -dirApto[1] : dirApto[1]];
        const largoApto: P2 = v.eje === "y" ? [1, 0] : [0, 1];
        const largo: P2 = [espejo ? -largoApto[0] : largoApto[0], lado === "sur" ? -largoApto[1] : largoApto[1]];
        out.puertas.push({ x: hx, y: hy, ancho, rot: rr((Math.atan2(largo[1], largo[0]) * 180) / Math.PI), espejo: largo[0] * dir[1] - largo[1] * dir[0] < 0, tipo: v.tipo });
      }
      for (const w of ap.ventanas) out.ventanas.push({ a: T([w.a, w.y]), b: T([w.b, w.y]), tipo: w.tipo });
      for (const m of ap.muebles) {
        const [mx, my] = T([m.x, m.y]);
        const rot = (lado === "sur" ? 180 - m.rot : m.rot) * (espejo ? -1 : 1);
        out.muebles.push({ bloque: m.bloque, x: mx, y: my, rot: ((rot % 360) + 360) % 360 });
      }
    });
  };
  colocar(alas.surI, "sur", c0, true); colocar(alas.surD, "sur", c1, false);
  colocar(alas.norI, "norte", c0, true); colocar(alas.norD, "norte", c1, false);

  // Punto fijo: escaleras en el lado sur, ascensores + shut de basuras + ductos en el lado norte, hall sobre el pasillo.
  const escaleras: Poly[] = [], ascensores: Poly[] = [], ductos: Poly[] = [];
  const vestibulos: Poly[] = [];
  const v = p.vestibulo ? 1.6 : 0; // escalera a prueba de humo: vestíbulo previo entre el hall y la escalera
  for (let i = 0; i < p.n_escaleras; i++) {
    escaleras.push(rectP(c0 + i * 3.0 + 0.1, Math.max(0.1, F - v - 5.8), c0 + i * 3.0 + 2.9, F - v));
    if (v) vestibulos.push(rectP(c0 + i * 3.0 + 0.1, F - v, c0 + i * 3.0 + 2.9, F));
  }
  for (let i = 0; i < p.n_ascensores; i++) ascensores.push(rectP(c0 + i * 2.25 + 0.1, F + pas, c0 + i * 2.25 + 2.15, F + pas + 2.3));
  const xs = c0 + p.n_ascensores * 2.25 + 0.1;
  const shut = rectP(xs, F + pas, xs + 1.2, F + pas + 1.2);
  ductos.push(rectP(xs, F + pas + 1.3, xs + 1.2, F + pas + 2.3));
  const hall = rectP(c0, F, c1, F + pas);
  out.nucleo = { poly: rectP(c0, 0, c1, D), escaleras, vestibulos, ascensores, shut, ductos, hall, n_escaleras: p.n_escaleras, n_ascensores: p.n_ascensores };
  // Pasillos (alas) y espacios sobrantes del núcleo como área común
  out.circulacion.push(rectP(0, F, c0, F + pas), rectP(c1, F, L, F + pas), hall);
  // Muros perimetrales: fachadas (con vanos de ventana), pasillos (con puertas de entrada), medianeros entre apartamentos y núcleo.
  const tf = p.esp_fachada, tm = p.esp_medianero;
  out.muros.push({ tipo: "fachada", poly: rectP(0, -tf, L, 0) }, { tipo: "fachada", poly: rectP(0, D, L, D + tf) });
  out.muros.push({ tipo: "fachada", poly: rectP(-tf, -tf, 0, D + tf) }, { tipo: "fachada", poly: rectP(L, -tf, L + tf, D + tf) });
  for (const q of [F, F + pas]) {
    // muro de pasillo cortado por las puertas de entrada
    const entradas = out.puertas.filter((d) => d.tipo === "entrada" && Math.abs(d.y - q) < 0.01).map((d) => [Math.min(d.x, d.x + Math.cos((d.rot * Math.PI) / 180) * d.ancho), Math.max(d.x, d.x + Math.cos((d.rot * Math.PI) / 180) * d.ancho)] as [number, number]).sort((a, b) => a[0] - b[0]);
    for (const [a0, a1] of [[0, c0], [c1, L]] as [number, number][]) {
      let x = a0;
      for (const [e0, e1] of entradas.filter(([e0]) => e0 >= a0 && e0 < a1)) { if (e0 - x > 0.05) out.muros.push({ tipo: "pasillo", poly: rectP(x, q - tm / 2, e0, q + tm / 2) }); x = e1; }
      if (a1 - x > 0.05) out.muros.push({ tipo: "pasillo", poly: rectP(x, q - tm / 2, a1, q + tm / 2) });
    }
  }
  for (const a of out.aptos) {
    const xsA = a.poly.map((pt) => pt[0]); const qA = a.poly.map((pt) => pt[1]);
    const y0 = Math.min(...qA), y1 = Math.max(...qA);
    for (const x of [Math.min(...xsA), Math.max(...xsA)]) if (x > 0.01 && x < L - 0.01) out.muros.push({ tipo: "medianero", poly: rectP(x - tm / 2, y0, x + tm / 2, y1) });
  }
  for (const x of [c0, c1]) for (const [y0, y1] of [[0, F], [F + pas, D]]) out.muros.push({ tipo: "nucleo", poly: rectP(x - tm / 2, y0, x + tm / 2, y1) });
  return out;
}
