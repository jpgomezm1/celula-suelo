// Lienzo de planos: las planchas se componen como una lista de primitivas en metros (escala real) y se traducen a
// DXF (con bloques, rellenos y capas), PDF (planchas para imprimir) y SVG (vista en la plataforma).
import { DxfWriter, point3d, point2d, HatchBoundaryPaths, HatchPolylineBoundary, HatchPredefinedPatterns, pattern, Units, LWPolylineFlags, TextHorizontalAlignment, TextVerticalAlignment } from "@tarikjabiri/dxf";
import { PDFDocument, StandardFonts, rgb, degrees, type PDFPage, type PDFFont } from "pdf-lib";

export type P = [number, number];
export type Alin = "izq" | "centro" | "der";
export type Op =
  | { t: "linea"; a: P; b: P; capa: string }
  | { t: "poli"; pts: P[]; capa: string; cerrada?: boolean }
  | { t: "relleno"; pts: P[]; capa: string }
  | { t: "arco"; c: P; r: number; a0: number; a1: number; capa: string }
  | { t: "circulo"; c: P; r: number; capa: string }
  | { t: "texto"; p: P; alto: number; txt: string; capa: string; alin?: Alin; rot?: number; negrita?: boolean }
  | { t: "bloque"; nombre: string; p: P; rot?: number; sx?: number; sy?: number; capa: string };

export type Plancha = { numero: number; titulo: string; escala: number; ancho_m: number; alto_m: number; ops: Op[] };

// Capas estándar (nombre, color ACI, color para PDF/SVG, grosor de línea en mm)
export const CAPAS: Record<string, { aci: number; rgb: [number, number, number]; mm: number }> = {
  "A-MURO": { aci: 7, rgb: [0.1, 0.1, 0.1], mm: 0.35 }, "A-MURO-INT": { aci: 8, rgb: [0.3, 0.3, 0.3], mm: 0.25 }, "A-RELLENO-MURO": { aci: 8, rgb: [0.35, 0.35, 0.35], mm: 0 },
  "A-PUERTA": { aci: 3, rgb: [0.18, 0.42, 0.31], mm: 0.18 }, "A-VENTANA": { aci: 5, rgb: [0.23, 0.56, 0.84], mm: 0.25 }, "A-MOBILIARIO": { aci: 6, rgb: [0.6, 0.56, 0.75], mm: 0.13 },
  "A-ESCALERA": { aci: 1, rgb: [0.75, 0.22, 0.17], mm: 0.18 }, "A-ASCENSOR": { aci: 1, rgb: [0.75, 0.22, 0.17], mm: 0.18 }, "A-DUCTO": { aci: 8, rgb: [0.4, 0.4, 0.4], mm: 0.18 },
  "A-ESPACIO": { aci: 7, rgb: [0.2, 0.2, 0.2], mm: 0.13 }, "A-APTO": { aci: 30, rgb: [0.3, 0.18, 0.72], mm: 0.13 }, "A-CIRCULACION": { aci: 9, rgb: [0.85, 0.83, 0.78], mm: 0 },
  "A-COTA": { aci: 2, rgb: [0.55, 0.45, 0.1], mm: 0.13 }, "A-TEXTO": { aci: 7, rgb: [0.1, 0.1, 0.1], mm: 0.18 }, "A-NIVEL": { aci: 4, rgb: [0.1, 0.45, 0.5], mm: 0.18 },
  "A-LOTE": { aci: 2, rgb: [0.85, 0.6, 0.0], mm: 0.5 }, "A-RETIRO": { aci: 8, rgb: [0.5, 0.5, 0.5], mm: 0.18 }, "A-PARQUEO": { aci: 3, rgb: [0.25, 0.55, 0.29], mm: 0.13 },
  "A-RAMPA": { aci: 6, rgb: [0.76, 0.09, 0.36], mm: 0.25 }, "A-DEPOSITO": { aci: 4, rgb: [0.4, 0.4, 0.6], mm: 0.13 }, "A-TECNICO": { aci: 1, rgb: [0.7, 0.3, 0.2], mm: 0.18 },
  "A-CORTE": { aci: 7, rgb: [0.1, 0.1, 0.1], mm: 0.5 }, "A-FACHADA": { aci: 7, rgb: [0.15, 0.15, 0.15], mm: 0.25 }, "A-TERRENO": { aci: 32, rgb: [0.55, 0.4, 0.25], mm: 0.35 },
  "A-SENDERO": { aci: 41, rgb: [0.62, 0.55, 0.42], mm: 0.18 }, "A-ACCESO": { aci: 1, rgb: [0.42, 0.3, 0.9], mm: 0.35 },
  "A-PLANCHA": { aci: 7, rgb: [0, 0, 0], mm: 0.5 }, "A-ROTULO": { aci: 7, rgb: [0.03, 0.02, 0.1], mm: 0.25 }, "A-TABLA": { aci: 7, rgb: [0.2, 0.2, 0.2], mm: 0.13 },
};

// Bloques como primitivas en coordenadas propias (m)
const R = (w: number, h: number, cx = 0, cy = 0): P[] => [[cx - w / 2, cy - h / 2], [cx + w / 2, cy - h / 2], [cx + w / 2, cy + h / 2], [cx - w / 2, cy + h / 2]];
type Prim = { t: "poli"; pts: P[] } | { t: "linea"; a: P; b: P } | { t: "arco"; c: P; r: number; a0: number; a1: number } | { t: "circulo"; c: P; r: number };
export const BLOQUES: Record<string, { capa: string; prims: Prim[] }> = {
  PUERTA: { capa: "A-PUERTA", prims: [{ t: "linea", a: [0, 0], b: [0, 1] }, { t: "arco", c: [0, 0], r: 1, a0: 0, a1: 90 }] },
  CAMA_DOBLE: { capa: "A-MOBILIARIO", prims: [{ t: "poli", pts: R(1.6, 2.0) }, { t: "poli", pts: R(0.65, 0.35, -0.38, 0.72) }, { t: "poli", pts: R(0.65, 0.35, 0.38, 0.72) }, { t: "linea", a: [-0.8, 0.45], b: [0.8, 0.45] }] },
  CAMA_SENCILLA: { capa: "A-MOBILIARIO", prims: [{ t: "poli", pts: R(1.0, 1.9) }, { t: "poli", pts: R(0.7, 0.33, 0, 0.68) }, { t: "linea", a: [-0.5, 0.4], b: [0.5, 0.4] }] },
  SOFA: { capa: "A-MOBILIARIO", prims: [{ t: "poli", pts: R(2.0, 0.85) }, { t: "linea", a: [-1.0, 0.22], b: [1.0, 0.22] }, { t: "linea", a: [-0.8, -0.42], b: [-0.8, 0.22] }, { t: "linea", a: [0.8, -0.42], b: [0.8, 0.22] }] },
  COMEDOR_4: { capa: "A-MOBILIARIO", prims: [{ t: "poli", pts: R(1.2, 0.8) }, { t: "poli", pts: R(0.42, 0.42, -0.3, -0.62) }, { t: "poli", pts: R(0.42, 0.42, 0.3, -0.62) }, { t: "poli", pts: R(0.42, 0.42, -0.3, 0.62) }, { t: "poli", pts: R(0.42, 0.42, 0.3, 0.62) }] },
  COMEDOR_6: { capa: "A-MOBILIARIO", prims: [{ t: "poli", pts: R(1.8, 0.9) }, ...[-0.6, 0, 0.6].flatMap((x) => [{ t: "poli" as const, pts: R(0.42, 0.42, x, -0.67) }, { t: "poli" as const, pts: R(0.42, 0.42, x, 0.67) }])] },
  MESON_COCINA: { capa: "A-MOBILIARIO", prims: [{ t: "poli", pts: R(2.4, 0.6) }, { t: "circulo", c: [-0.75, 0], r: 0.11 }, { t: "circulo", c: [-0.45, 0], r: 0.11 }, { t: "poli", pts: R(0.55, 0.38, 0.6, 0) }] },
  SANITARIO: { capa: "A-MOBILIARIO", prims: [{ t: "poli", pts: R(0.4, 0.18, 0, 0.26) }, { t: "circulo", c: [0, -0.05], r: 0.18 }] },
  LAVAMANOS: { capa: "A-MOBILIARIO", prims: [{ t: "poli", pts: R(0.5, 0.4) }, { t: "circulo", c: [0, -0.02], r: 0.13 }] },
  DUCHA: { capa: "A-MOBILIARIO", prims: [{ t: "poli", pts: R(0.9, 0.9) }, { t: "linea", a: [-0.45, -0.45], b: [0.45, 0.45] }, { t: "linea", a: [-0.45, 0.45], b: [0.45, -0.45] }, { t: "circulo", c: [0, 0], r: 0.05 }] },
  LAVADERO: { capa: "A-MOBILIARIO", prims: [{ t: "poli", pts: R(0.6, 0.6) }, { t: "poli", pts: R(0.45, 0.4, 0, -0.03) }] },
  NORTE: { capa: "A-TEXTO", prims: [{ t: "circulo", c: [0, 0], r: 1 }, { t: "poli", pts: [[0, 1], [0.35, -0.6], [0, -0.3], [-0.35, -0.6]] }] },
};

const sinTildes = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/²/g, "2").replace(/×/g, "x").replace(/[–—]/g, "-").replace(/[“”]/g, '"').replace(/·/g, "-").replace(/≈/g, "~").replace(/≥/g, ">=").replace(/≤/g, "<=");

/** Aplica rotación, escala y traslado a un punto del bloque. */
const tr = (p: P, o: { p: P; rot?: number; sx?: number; sy?: number }): P => {
  const a = ((o.rot ?? 0) * Math.PI) / 180, x = p[0] * (o.sx ?? 1), y = p[1] * (o.sy ?? 1);
  return [o.p[0] + x * Math.cos(a) - y * Math.sin(a), o.p[1] + x * Math.sin(a) + y * Math.cos(a)];
};

// ---------------- DXF ----------------
export function aDxf(planchas: Plancha[], separacion = 20) {
  const d = new DxfWriter();
  d.setUnits(Units.Meters);
  for (const [n, c] of Object.entries(CAPAS)) d.addLayer(n, c.aci, "CONTINUOUS");
  for (const [n, b] of Object.entries(BLOQUES)) {
    const bl = d.addBlock(n);
    for (const pr of b.prims) {
      const o = { layerName: "0" };
      if (pr.t === "linea") bl.addLine(point3d(...pr.a), point3d(...pr.b), o);
      else if (pr.t === "poli") bl.addLWPolyline(pr.pts.map((q) => ({ point: point2d(...q) })), { ...o, flags: LWPolylineFlags.Closed });
      else if (pr.t === "arco") bl.addArc(point3d(...pr.c), pr.r, pr.a0, pr.a1, o);
      else bl.addCircle(point3d(...pr.c), pr.r, o);
    }
  }
  let x0 = 0;
  for (const pl of planchas) {
    const T = (q: P) => point3d(q[0] + x0, q[1]);
    const T2 = (q: P) => point2d(q[0] + x0, q[1]);
    for (const op of pl.ops) {
      const o = { layerName: op.capa };
      if (op.t === "linea") d.addLine(T(op.a), T(op.b), o);
      else if (op.t === "poli") d.addLWPolyline(op.pts.map((q) => ({ point: T2(q) })), { ...o, flags: op.cerrada === false ? LWPolylineFlags.None : LWPolylineFlags.Closed });
      else if (op.t === "relleno") {
        const bp = new HatchBoundaryPaths(), pb = new HatchPolylineBoundary();
        op.pts.forEach((q) => pb.add({ x: q[0] + x0, y: q[1] }));
        bp.addPolylineBoundary(pb);
        d.addHatch(bp, pattern({ name: HatchPredefinedPatterns.SOLID }), o);
      } else if (op.t === "arco") d.addArc(T(op.c), op.r, op.a0, op.a1, o);
      else if (op.t === "circulo") d.addCircle(T(op.c), op.r, o);
      else if (op.t === "texto") {
        const h = op.alin === "centro" ? TextHorizontalAlignment.Center : op.alin === "der" ? TextHorizontalAlignment.Right : TextHorizontalAlignment.Left;
        d.addText(T(op.p), op.alto, sinTildes(op.txt), { ...o, rotation: op.rot ?? 0, horizontalAlignment: h, verticalAlignment: TextVerticalAlignment.BaseLine, secondAlignmentPoint: T(op.p) });
      } else if (op.t === "bloque") d.addInsert(op.nombre, T(op.p), { ...o, rotationAngle: op.rot ?? 0, scaleFactor: { x: op.sx ?? 1, y: op.sy ?? 1, z: 1 } });
    }
    x0 += pl.ancho_m + separacion;
  }
  return d.stringify();
}

// ---------------- Transformación a papel (PDF / SVG) ----------------
const MM_PT = 72 / 25.4;
/** Expande bloques a primitivas para los formatos sin bloques. */
function expandir(ops: Op[]): Op[] {
  const out: Op[] = [];
  for (const op of ops) {
    if (op.t !== "bloque") { out.push(op); continue; }
    const b = BLOQUES[op.nombre]; if (!b) continue;
    const capa = op.capa || b.capa;
    for (const pr of b.prims) {
      if (pr.t === "linea") out.push({ t: "linea", a: tr(pr.a, op), b: tr(pr.b, op), capa });
      else if (pr.t === "poli") out.push({ t: "poli", pts: pr.pts.map((q) => tr(q, op)), capa });
      else if (pr.t === "circulo") out.push({ t: "circulo", c: tr(pr.c, op), r: pr.r * Math.abs(op.sx ?? 1), capa });
      else {
        // Arco: se aproxima con segmentos para respetar espejos y rotaciones
        const n = 10; let prev: P | null = null;
        for (let i = 0; i <= n; i++) {
          const ang = ((pr.a0 + ((pr.a1 - pr.a0) * i) / n) * Math.PI) / 180;
          const q = tr([pr.c[0] + pr.r * Math.cos(ang), pr.c[1] + pr.r * Math.sin(ang)], op);
          if (prev) out.push({ t: "linea", a: prev, b: q, capa });
          prev = q;
        }
      }
    }
  }
  return out;
}

// ---------------- PDF ----------------
export async function aPdf(planchas: Plancha[], titulo: string) {
  const doc = await PDFDocument.create();
  doc.setTitle(titulo); doc.setAuthor("irrelevant · Inteligencia de suelo");
  const f = await doc.embedFont(StandardFonts.Helvetica), fb = await doc.embedFont(StandardFonts.HelveticaBold);
  for (const pl of planchas) {
    const k = (1000 / pl.escala) * MM_PT; // m → pt
    const page: PDFPage = doc.addPage([pl.ancho_m * k, pl.alto_m * k]);
    const X = (q: P) => ({ x: q[0] * k, y: q[1] * k });
    const col = (capa: string) => { const c = CAPAS[capa]?.rgb ?? [0, 0, 0]; return rgb(c[0], c[1], c[2]); };
    const gro = (capa: string) => Math.max(0.25, (CAPAS[capa]?.mm ?? 0.18) * MM_PT);
    for (const op of expandir(pl.ops)) {
      if (op.t === "linea") page.drawLine({ start: X(op.a), end: X(op.b), thickness: gro(op.capa), color: col(op.capa) });
      else if (op.t === "poli" || op.t === "relleno") {
        const pts = op.pts.map(X);
        const path = `M ${pts.map((q) => `${q.x.toFixed(2)} ${(-q.y).toFixed(2)}`).join(" L ")}${op.t === "relleno" || op.cerrada !== false ? " Z" : ""}`;
        if (op.t === "relleno") page.drawSvgPath(path, { x: 0, y: 0, color: col(op.capa), borderWidth: 0 });
        else page.drawSvgPath(path, { x: 0, y: 0, borderColor: col(op.capa), borderWidth: gro(op.capa) });
      } else if (op.t === "circulo") page.drawCircle({ x: op.c[0] * k, y: op.c[1] * k, size: op.r * k, borderColor: col(op.capa), borderWidth: gro(op.capa) });
      else if (op.t === "arco") {
        let prev: P | null = null;
        for (let i = 0; i <= 12; i++) { const a = ((op.a0 + ((op.a1 - op.a0) * i) / 12) * Math.PI) / 180; const q: P = [op.c[0] + op.r * Math.cos(a), op.c[1] + op.r * Math.sin(a)]; if (prev) page.drawLine({ start: X(prev), end: X(q), thickness: gro(op.capa), color: col(op.capa) }); prev = q; }
      } else if (op.t === "texto") {
        const font: PDFFont = op.negrita ? fb : f;
        const txt = sinTildes(op.txt).replace(/[^\x20-\x7E]/g, "?");
        const size = op.alto * k * 1.35;
        const w = font.widthOfTextAtSize(txt, size);
        const dx = op.alin === "centro" ? -w / 2 : op.alin === "der" ? -w : 0;
        const a = ((op.rot ?? 0) * Math.PI) / 180;
        page.drawText(txt, { x: op.p[0] * k + dx * Math.cos(a), y: op.p[1] * k + dx * Math.sin(a), size, font, color: col(op.capa), rotate: degrees(op.rot ?? 0) });
      }
    }
  }
  return doc.save();
}

// ---------------- SVG ----------------
export function aSvg(pl: Plancha, anchoPx = 1600) {
  const k = anchoPx / pl.ancho_m, H = pl.alto_m * k;
  const X = (q: P) => `${(q[0] * k).toFixed(1)},${(H - q[1] * k).toFixed(1)}`;
  const css = (capa: string) => { const c = CAPAS[capa]?.rgb ?? [0, 0, 0]; return `rgb(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)})`; };
  const sw = (capa: string) => Math.max(0.4, ((CAPAS[capa]?.mm ?? 0.18) / 1000) * pl.escala * k);
  const g: string[] = [];
  let capaActual = "";
  for (const op of expandir(pl.ops)) {
    if (op.capa !== capaActual) { if (capaActual) g.push("</g>"); g.push(`<g class="capa" data-capa="${op.capa}">`); capaActual = op.capa; }
    if (op.t === "linea") g.push(`<line x1="${(op.a[0] * k).toFixed(1)}" y1="${(H - op.a[1] * k).toFixed(1)}" x2="${(op.b[0] * k).toFixed(1)}" y2="${(H - op.b[1] * k).toFixed(1)}" stroke="${css(op.capa)}" stroke-width="${sw(op.capa).toFixed(2)}"/>`);
    else if (op.t === "relleno") g.push(`<polygon points="${op.pts.map(X).join(" ")}" fill="${css(op.capa)}"/>`);
    else if (op.t === "poli") g.push(`<${op.cerrada === false ? "polyline" : "polygon"} points="${op.pts.map(X).join(" ")}" fill="none" stroke="${css(op.capa)}" stroke-width="${sw(op.capa).toFixed(2)}"/>`);
    else if (op.t === "circulo") g.push(`<circle cx="${(op.c[0] * k).toFixed(1)}" cy="${(H - op.c[1] * k).toFixed(1)}" r="${(op.r * k).toFixed(1)}" fill="none" stroke="${css(op.capa)}" stroke-width="${sw(op.capa).toFixed(2)}"/>`);
    else if (op.t === "arco") {
      const a0 = (op.a0 * Math.PI) / 180, a1 = (op.a1 * Math.PI) / 180;
      const p0: P = [op.c[0] + op.r * Math.cos(a0), op.c[1] + op.r * Math.sin(a0)], p1: P = [op.c[0] + op.r * Math.cos(a1), op.c[1] + op.r * Math.sin(a1)];
      g.push(`<path d="M ${X(p0)} A ${(op.r * k).toFixed(1)} ${(op.r * k).toFixed(1)} 0 ${op.a1 - op.a0 > 180 ? 1 : 0} 0 ${X(p1)}" fill="none" stroke="${css(op.capa)}" stroke-width="${sw(op.capa).toFixed(2)}"/>`);
    } else if (op.t === "texto") {
      const anchor = op.alin === "centro" ? "middle" : op.alin === "der" ? "end" : "start";
      const x = op.p[0] * k, y = H - op.p[1] * k;
      g.push(`<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" font-size="${(op.alto * k * 1.35).toFixed(1)}" text-anchor="${anchor}" fill="${css(op.capa)}"${op.negrita ? ' font-weight="700"' : ""}${op.rot ? ` transform="rotate(${-op.rot} ${x.toFixed(1)} ${y.toFixed(1)})"` : ""}>${op.txt.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</text>`);
    }
  }
  if (capaActual) g.push("</g>");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${anchoPx} ${H.toFixed(0)}" font-family="Arial, Helvetica, sans-serif"><rect width="100%" height="100%" fill="#fff"/>${g.join("")}</svg>`;
}
