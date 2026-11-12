// Exporta la cabida arquitectónica a DXF (versión R12, la más compatible: AutoCAD, BricsCAD, Revit, SketchUp, Rhino,
// LibreCAD, QGIS). Volúmenes en 3D con caras (3DFACE), plantas con polilíneas cerradas a la cota de cada piso,
// textos y capas por elemento. Unidades: metros. Georreferenciado en MAGNA-SIRGAS Origen Nacional (EPSG 9377).
import earcut from "earcut";
import { aGlobal, type Pt } from "./cabida_modelo";

// Colores ACI de AutoCAD por capa.
export const CAPAS: Record<string, { color: number; desc: string }> = {
  LOTE: { color: 2, desc: "Lindero del lote" },
  AREA_EDIFICABLE: { color: 8, desc: "Lote menos retiros" },
  SOTANO: { color: 252, desc: "Placa de sótano" },
  PARQUEADEROS: { color: 3, desc: "Puestos 2,5 x 5 m" },
  CIRCULACION_VEHICULAR: { color: 9, desc: "Calles de parqueo" },
  RAMPA: { color: 6, desc: "Rampa vehicular" },
  PLATAFORMA: { color: 30, desc: "Plataforma (comercio / lobby)" },
  TORRE: { color: 5, desc: "Contorno de torre por piso" },
  NUCLEO: { color: 1, desc: "Punto fijo (escaleras y ascensores)" },
  CIRCULACION: { color: 8, desc: "Pasillos" },
  APARTAMENTOS: { color: 4, desc: "Unidades de vivienda" },
  TEXTOS: { color: 7, desc: "Rótulos" },
  "3D_TORRE": { color: 5, desc: "Volumen de las torres" },
  "3D_PLATAFORMA": { color: 30, desc: "Volumen de la plataforma" },
  "3D_SOTANO": { color: 252, desc: "Volumen de sótanos" },
  "3D_NUCLEO": { color: 1, desc: "Volumen de puntos fijos" },
};

const f = (n: number) => (Math.round(n * 1000) / 1000).toString();

export function cabidaADxf(m: any, opts: { local?: boolean } = {}) {
  const g = opts.local ? (p: Pt) => p : aGlobal(m);
  const out: string[] = [];
  const w = (codigo: number, valor: string | number) => { out.push(String(codigo), typeof valor === "number" ? f(valor) : valor); };

  // ---- HEADER ----
  w(0, "SECTION"); w(2, "HEADER");
  w(9, "$ACADVER"); w(1, "AC1009");
  w(9, "$INSBASE"); w(10, 0); w(20, 0); w(30, 0);
  const todos: Pt[] = [...m.lote, ...m.sotano].map(g);
  w(9, "$EXTMIN"); w(10, Math.min(...todos.map((p) => p[0]))); w(20, Math.min(...todos.map((p) => p[1]))); w(30, -20);
  w(9, "$EXTMAX"); w(10, Math.max(...todos.map((p) => p[0]))); w(20, Math.max(...todos.map((p) => p[1]))); w(30, Number(m.resumen.altura_m) + 5);
  w(0, "ENDSEC");

  // ---- TABLES (capas y tipo de línea continuo) ----
  w(0, "SECTION"); w(2, "TABLES");
  w(0, "TABLE"); w(2, "LTYPE"); w(70, 1);
  w(0, "LTYPE"); w(2, "CONTINUOUS"); w(70, 0); w(3, "Solid line"); w(72, 65); w(73, 0); w(40, 0);
  w(0, "ENDTAB");
  w(0, "TABLE"); w(2, "LAYER"); w(70, Object.keys(CAPAS).length);
  for (const [nombre, c] of Object.entries(CAPAS)) { w(0, "LAYER"); w(2, nombre); w(70, 0); w(62, c.color); w(6, "CONTINUOUS"); }
  w(0, "ENDTAB");
  w(0, "ENDSEC");

  // ---- ENTITIES ----
  w(0, "SECTION"); w(2, "ENTITIES");
  const polilinea = (capa: string, pts: Pt[], z: number) => {
    w(0, "POLYLINE"); w(8, capa); w(66, 1); w(10, 0); w(20, 0); w(30, z); w(70, 1);
    for (const p of pts.map(g)) { w(0, "VERTEX"); w(8, capa); w(10, p[0]); w(20, p[1]); w(30, z); }
    w(0, "SEQEND"); w(8, capa);
  };
  const cara = (capa: string, a: number[], b: number[], c: number[], d: number[] = c) => {
    w(0, "3DFACE"); w(8, capa);
    [a, b, c, d].forEach((p, i) => { w(10 + i, p[0]); w(20 + i, p[1]); w(30 + i, p[2]); });
  };
  const volumen = (capa: string, pts: Pt[], z0: number, z1: number) => {
    const P = pts.map(g);
    for (let i = 0; i < P.length; i++) { const a = P[i], b = P[(i + 1) % P.length]; cara(capa, [a[0], a[1], z0], [b[0], b[1], z0], [b[0], b[1], z1], [a[0], a[1], z1]); }
    const tri = earcut(pts.flat());
    for (let i = 0; i < tri.length; i += 3) for (const z of [z0, z1]) cara(capa, [P[tri[i]][0], P[tri[i]][1], z], [P[tri[i + 1]][0], P[tri[i + 1]][1], z], [P[tri[i + 2]][0], P[tri[i + 2]][1], z]);
  };
  const texto = (t: string, p: Pt, z: number, alto = 0.6) => {
    const [x, y] = g(p);
    w(0, "TEXT"); w(8, "TEXTOS"); w(10, x); w(20, y); w(30, z); w(40, alto); w(1, t.replace(/[^\x20-\x7E]/g, (c) => ({ "á": "a", "é": "e", "í": "i", "ó": "o", "ú": "u", "ñ": "n", "Á": "A", "É": "E", "Í": "I", "Ó": "O", "Ú": "U", "Ñ": "N", "×": "x" } as any)[c] ?? "?"));
    w(72, 1); w(11, x); w(21, y); w(31, z);
  };
  const centro = (pts: Pt[]): Pt => [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length];

  polilinea("LOTE", m.lote, 0);
  polilinea("AREA_EDIFICABLE", m.edificable, 0);
  texto(`Lote ${m.predio} - ${Math.round(m.resumen.area_lote_m2)} m2`, centro(m.lote), 0, 1.2);
  for (const n of m.niveles) {
    for (const e of n.elementos) {
      polilinea(e.capa, e.poligono, n.z);
      if (e.altura) volumen(`3D_${e.capa}`, e.poligono, n.z, n.z + e.altura);
      if (e.etiqueta && (e.capa !== "PARQUEADEROS" || n.tipo === "sotano")) texto(e.etiqueta, centro(e.poligono), n.z + 0.05, e.capa === "PARQUEADEROS" ? 0.35 : 0.6);
    }
    texto(n.nombre, [Math.min(...m.lote.map((p: Pt) => p[0])) - 6, Math.min(...m.lote.map((p: Pt) => p[1]))], n.z, 1);
  }
  w(0, "ENDSEC"); w(0, "EOF");
  return out.join("\r\n");
}
