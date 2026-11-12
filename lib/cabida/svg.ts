// Dibuja una planta (torre o piso) en SVG: muros rellenos, espacios con nombre y área, puertas con su giro,
// ventanas, amoblamiento simplificado y núcleo. Sirve para ver los planos en la plataforma y revisar el diseño.
import type { PlantaTorre, Poly } from "./torre";

const pts = (p: Poly, k: number, H: number) => p.map(([x, y]) => `${(x * k).toFixed(1)},${(H - y * k).toFixed(1)}`).join(" ");
const COL: Record<string, string> = { alcoba: "#efe9ff", alcoba_principal: "#e6ddff", sala: "#fff4e0", cocina: "#e8f6ec", bano: "#e3f1fb", ropas: "#eef5e0",
  hall: "#f7f5f0", vestier: "#f1ecfa", estudio: "#fbf0e8", deposito: "#f0f0f0", estancia: "#fff4e0" };

// Muebles: rectángulos simples con su tamaño real (m).
const MUEBLES: Record<string, [number, number]> = { CAMA_DOBLE: [1.6, 2.0], CAMA_SENCILLA: [1.0, 1.9], SOFA: [2.0, 0.85], COMEDOR_4: [1.2, 0.8], COMEDOR_6: [1.8, 0.9],
  MESON_COCINA: [2.4, 0.6], SANITARIO: [0.4, 0.7], LAVAMANOS: [0.5, 0.4], DUCHA: [0.9, 0.9], LAVADERO: [0.6, 0.6] };

export function plantaSvg(t: PlantaTorre, opts: { escala?: number; titulo?: string } = {}) {
  const k = opts.escala ?? 22, m = 1.2;
  const W = (t.L + 2 * m) * k, H = (t.D + 2 * m) * k;
  const g: string[] = [];
  const T = (p: Poly) => pts(p.map(([x, y]) => [x + m, y + m]), k, H);
  for (const e of t.espacios) {
    g.push(`<polygon points="${T(e.poly)}" fill="${COL[e.tipo] ?? "#fafafa"}" stroke="none"/>`);
    const cx = e.poly.reduce((s, p) => s + p[0], 0) / 4 + m, cy = e.poly.reduce((s, p) => s + p[1], 0) / 4 + m;
    const ancho = Math.abs(e.poly[1][0] - e.poly[0][0]) || Math.abs(e.poly[2][0] - e.poly[1][0]);
    if (ancho > 1.0 && e.area > 2.2) g.push(`<text x="${(cx * k).toFixed(1)}" y="${(H - cy * k).toFixed(1)}" font-size="${Math.min(10, k * 0.42)}" text-anchor="middle" fill="#333">${e.nombre}<tspan x="${(cx * k).toFixed(1)}" dy="1.15em" fill="#777">${e.area.toFixed(1)} m²</tspan></text>`);
  }
  for (const c of t.circulacion) g.push(`<polygon points="${T(c)}" fill="#f2f0ea"/>`);
  const n = t.nucleo;
  g.push(`<polygon points="${T(n.hall)}" fill="#ece8df"/>`);
  for (const e of n.escaleras) {
    g.push(`<polygon points="${T(e)}" fill="#fff" stroke="#c0392b" stroke-width="1"/>`);
    const [x0, y0] = e[0], [x1, y1] = e[2];
    for (let y = y0 + 0.3; y < y1 - 0.3; y += 0.28) g.push(`<line x1="${((x0 + m) * k).toFixed(1)}" x2="${((x1 + m) * k).toFixed(1)}" y1="${(H - (y + m) * k).toFixed(1)}" y2="${(H - (y + m) * k).toFixed(1)}" stroke="#d98880" stroke-width="0.6"/>`);
  }
  for (const a of n.ascensores) g.push(`<polygon points="${T(a)}" fill="#fff" stroke="#c0392b"/><line x1="${((a[0][0] + m) * k).toFixed(1)}" y1="${(H - (a[0][1] + m) * k).toFixed(1)}" x2="${((a[2][0] + m) * k).toFixed(1)}" y2="${(H - (a[2][1] + m) * k).toFixed(1)}" stroke="#c0392b" stroke-width="0.6"/><line x1="${((a[1][0] + m) * k).toFixed(1)}" y1="${(H - (a[1][1] + m) * k).toFixed(1)}" x2="${((a[3][0] + m) * k).toFixed(1)}" y2="${(H - (a[3][1] + m) * k).toFixed(1)}" stroke="#c0392b" stroke-width="0.6"/>`);
  g.push(`<polygon points="${T(n.shut)}" fill="#555"/>`);
  for (const d of n.ductos) g.push(`<polygon points="${T(d)}" fill="#999"/>`);
  for (const mu of t.muebles) {
    const [w, h] = MUEBLES[mu.bloque] ?? [0.5, 0.5];
    const cx = (mu.x + m) * k, cy = H - (mu.y + m) * k;
    g.push(`<rect x="${(cx - (w * k) / 2).toFixed(1)}" y="${(cy - (h * k) / 2).toFixed(1)}" width="${(w * k).toFixed(1)}" height="${(h * k).toFixed(1)}" fill="none" stroke="#9a8fc0" stroke-width="0.7" transform="rotate(${-mu.rot} ${cx.toFixed(1)} ${cy.toFixed(1)})"/>`);
  }
  for (const mu of t.muros) g.push(`<polygon points="${T(mu.poly)}" fill="${mu.tipo === "interior" ? "#555" : "#111"}"/>`);
  for (const v of t.ventanas) g.push(`<line x1="${((v.a[0] + m) * k).toFixed(1)}" y1="${(H - (v.a[1] + m) * k).toFixed(1)}" x2="${((v.b[0] + m) * k).toFixed(1)}" y2="${(H - (v.b[1] + m) * k).toFixed(1)}" stroke="#3a8fd6" stroke-width="${(0.15 * k).toFixed(1)}"/>`);
  for (const d of t.puertas) {
    const a = (d.rot * Math.PI) / 180, s = d.espejo ? -1 : 1;
    const hx = (d.x + m) * k, hy = H - (d.y + m) * k, r = d.ancho * k;
    const ex = hx + Math.cos(a) * r, ey = hy - Math.sin(a) * r;                 // extremo del vano
    const ox = hx - Math.sin(a) * r * s, oy = hy - Math.cos(a) * r * s;         // hoja abierta (perpendicular)
    g.push(`<line x1="${hx.toFixed(1)}" y1="${hy.toFixed(1)}" x2="${ox.toFixed(1)}" y2="${oy.toFixed(1)}" stroke="#2d6a4f" stroke-width="1.2"/>`);
    g.push(`<path d="M ${ox.toFixed(1)} ${oy.toFixed(1)} A ${r.toFixed(1)} ${r.toFixed(1)} 0 0 ${s > 0 ? 1 : 0} ${ex.toFixed(1)} ${ey.toFixed(1)}" fill="none" stroke="#2d6a4f" stroke-width="0.6" stroke-dasharray="2 2"/>`);
  }
  for (const a of t.aptos) {
    const cx = a.poly.reduce((s, p) => s + p[0], 0) / 4 + m, cy = (a.lado === "sur" ? 0.35 : t.D - 0.35) + m;
    g.push(`<text x="${(cx * k).toFixed(1)}" y="${(H - cy * k).toFixed(1)}" font-size="${k * 0.5}" font-weight="700" text-anchor="middle" fill="#4b2fb8">${a.id} · ${a.nombre} · ${a.area_privada.toFixed(1)} m²</text>`);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W.toFixed(0)} ${H.toFixed(0)}" width="${W.toFixed(0)}" height="${H.toFixed(0)}" font-family="Inter, Arial, sans-serif"><rect width="100%" height="100%" fill="#fff"/>${opts.titulo ? `<text x="10" y="18" font-size="14" font-weight="700">${opts.titulo}</text>` : ""}${g.join("")}</svg>`;
}
