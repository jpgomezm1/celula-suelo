// Plantillas paramétricas de apartamentos (crujía de un lado del pasillo). Marco del apartamento: x a lo largo del
// frente (0..W), y desde el pasillo (y = 0) hasta la fachada (y = F). Las alcobas y la sala van sobre la fachada
// (luz y ventilación natural); baños, cocina y ropas hacia el pasillo (ventilan por ducto, práctica usual en Medellín).
// Las plantillas se dibujan a un tamaño base y se escalan al área objetivo (ancho) y a la profundidad de la crujía.

export type R = [number, number, number, number]; // x0, y0, x1, y1
export type TipoEspacio = "alcoba" | "alcoba_principal" | "sala" | "cocina" | "bano" | "ropas" | "hall" | "vestier" | "estudio" | "deposito" | "estancia";
export type Espacio = { nombre: string; tipo: TipoEspacio; r: R };
/** Puerta en el borde compartido de dos espacios: pared vertical (x fija) u horizontal (y fija), desde a hasta b. */
export type Vano = { eje: "x" | "y"; en: number; a: number; b: number; tipo: "puerta" | "paso" | "entrada" };
export type Ventana = { y: number; a: number; b: number; tipo: "ventana" | "ventanal" };
export type Mueble = { bloque: string; x: number; y: number; rot: number };
export type Plantilla = { clave: string; nombre: string; alcobas: number; banos: number; W: number; F: number; espacios: Espacio[]; vanos: Vano[]; ventanas: Ventana[]; muebles: Mueble[] };

const F0 = 7.6;

/** Apartaestudio (≈ 35 m²). */
const ESTUDIO: Plantilla = { clave: "estudio", nombre: "Apartaestudio", alcobas: 0, banos: 1, W: 4.6, F: F0,
  espacios: [
    { nombre: "Estancia-alcoba", tipo: "estancia", r: [0, 3.0, 4.6, F0] },
    { nombre: "Cocina", tipo: "cocina", r: [1.9, 0, 4.6, 3.0] },
    { nombre: "Baño", tipo: "bano", r: [0, 1.2, 1.9, 3.0] },
    { nombre: "Ropas", tipo: "ropas", r: [0, 0, 1.9, 1.2] },
  ],
  vanos: [
    { eje: "y", en: 0, a: 2.4, b: 3.35, tipo: "entrada" },
    { eje: "y", en: 3.0, a: 2.1, b: 4.4, tipo: "paso" },
    { eje: "y", en: 3.0, a: 0.4, b: 1.15, tipo: "puerta" },
    { eje: "x", en: 1.9, a: 0.15, b: 0.95, tipo: "puerta" },
  ],
  ventanas: [{ y: F0, a: 0.5, b: 4.1, tipo: "ventanal" }],
  muebles: [{ bloque: "CAMA_DOBLE", x: 1.2, y: 6.4, rot: 0 }, { bloque: "SOFA", x: 3.6, y: 4.0, rot: 0 }, { bloque: "MESON_COCINA", x: 3.25, y: 0.35, rot: 0 },
    { bloque: "SANITARIO", x: 0.45, y: 2.5, rot: 0 }, { bloque: "LAVAMANOS", x: 1.4, y: 2.7, rot: 0 }, { bloque: "LAVADERO", x: 0.5, y: 0.35, rot: 0 }] };

/** Una alcoba (≈ 49 m²). */
const A1: Plantilla = { clave: "1A", nombre: "1 alcoba", alcobas: 1, banos: 1, W: 6.4, F: F0,
  espacios: [
    { nombre: "Alcoba", tipo: "alcoba_principal", r: [0, 4.0, 3.1, F0] },
    { nombre: "Sala-comedor", tipo: "sala", r: [3.1, 3.0, 6.4, F0] },
    { nombre: "Hall", tipo: "hall", r: [1.9, 2.6, 3.1, 4.0] },
    { nombre: "Baño", tipo: "bano", r: [0, 1.6, 1.9, 4.0] },
    { nombre: "Depósito", tipo: "deposito", r: [0, 0, 1.9, 1.6] },
    { nombre: "Ropas", tipo: "ropas", r: [1.9, 0, 3.1, 2.6] },
    { nombre: "Cocina", tipo: "cocina", r: [3.1, 0, 6.4, 3.0] },
  ],
  vanos: [
    { eje: "y", en: 0, a: 4.0, b: 4.95, tipo: "entrada" },
    { eje: "y", en: 4.0, a: 2.0, b: 2.85, tipo: "puerta" },
    { eje: "x", en: 3.1, a: 3.0, b: 4.0, tipo: "paso" },
    { eje: "x", en: 1.9, a: 2.75, b: 3.5, tipo: "puerta" },
    { eje: "x", en: 1.9, a: 0.4, b: 1.2, tipo: "puerta" },
    { eje: "x", en: 3.1, a: 0.6, b: 1.4, tipo: "puerta" },
  ],
  ventanas: [{ y: F0, a: 0.6, b: 2.6, tipo: "ventana" }, { y: F0, a: 3.5, b: 6.0, tipo: "ventanal" }],
  muebles: [{ bloque: "CAMA_DOBLE", x: 1.55, y: 6.4, rot: 0 }, { bloque: "SOFA", x: 4.75, y: 6.8, rot: 180 }, { bloque: "COMEDOR_4", x: 4.75, y: 4.3, rot: 0 },
    { bloque: "MESON_COCINA", x: 4.75, y: 0.35, rot: 0 }, { bloque: "SANITARIO", x: 0.45, y: 3.5, rot: 0 }, { bloque: "LAVAMANOS", x: 1.4, y: 3.7, rot: 0 },
    { bloque: "DUCHA", x: 0.6, y: 2.2, rot: 0 }, { bloque: "LAVADERO", x: 2.5, y: 0.35, rot: 0 }] };

/** Dos alcobas (≈ 73 m²). */
const A2: Plantilla = { clave: "2A", nombre: "2 alcobas", alcobas: 2, banos: 2, W: 9.6, F: F0,
  espacios: [
    { nombre: "Alcoba principal", tipo: "alcoba_principal", r: [0, 4.0, 3.3, F0] },
    { nombre: "Alcoba 2", tipo: "alcoba", r: [3.3, 4.0, 6.2, F0] },
    { nombre: "Sala-comedor", tipo: "sala", r: [6.2, 3.0, 9.6, F0] },
    { nombre: "Hall", tipo: "hall", r: [1.8, 2.8, 6.2, 4.0] },
    { nombre: "Baño principal", tipo: "bano", r: [0, 2.0, 1.8, 4.0] },
    { nombre: "Vestier", tipo: "vestier", r: [0, 0, 1.8, 2.0] },
    { nombre: "Baño social", tipo: "bano", r: [1.8, 0, 3.6, 2.8] },
    { nombre: "Estudio", tipo: "estudio", r: [3.6, 0, 4.8, 2.8] },
    { nombre: "Ropas", tipo: "ropas", r: [4.8, 0, 6.2, 2.8] },
    { nombre: "Cocina", tipo: "cocina", r: [6.2, 0, 9.6, 3.0] },
  ],
  vanos: [
    { eje: "y", en: 0, a: 7.4, b: 8.35, tipo: "entrada" },
    { eje: "y", en: 4.0, a: 2.1, b: 2.95, tipo: "puerta" },
    { eje: "y", en: 4.0, a: 4.9, b: 5.75, tipo: "puerta" },
    { eje: "y", en: 4.0, a: 0.5, b: 1.25, tipo: "puerta" },
    { eje: "y", en: 2.0, a: 0.5, b: 1.25, tipo: "puerta" },
    { eje: "y", en: 2.8, a: 2.3, b: 3.05, tipo: "puerta" },
    { eje: "y", en: 2.8, a: 3.8, b: 4.6, tipo: "puerta" },
    { eje: "x", en: 6.2, a: 3.0, b: 4.0, tipo: "paso" },
    { eje: "x", en: 6.2, a: 0.6, b: 1.4, tipo: "puerta" },
  ],
  ventanas: [{ y: F0, a: 0.6, b: 2.7, tipo: "ventana" }, { y: F0, a: 3.8, b: 5.7, tipo: "ventana" }, { y: F0, a: 6.6, b: 9.2, tipo: "ventanal" }],
  muebles: [{ bloque: "CAMA_DOBLE", x: 1.65, y: 6.4, rot: 0 }, { bloque: "CAMA_SENCILLA", x: 4.75, y: 6.5, rot: 0 }, { bloque: "SOFA", x: 7.9, y: 6.8, rot: 180 },
    { bloque: "COMEDOR_4", x: 7.9, y: 4.3, rot: 0 }, { bloque: "MESON_COCINA", x: 7.9, y: 0.35, rot: 0 }, { bloque: "SANITARIO", x: 0.45, y: 3.5, rot: 0 },
    { bloque: "LAVAMANOS", x: 1.35, y: 3.7, rot: 0 }, { bloque: "DUCHA", x: 0.6, y: 2.45, rot: 0 }, { bloque: "SANITARIO", x: 2.25, y: 0.45, rot: 180 },
    { bloque: "LAVAMANOS", x: 3.15, y: 0.3, rot: 180 }, { bloque: "LAVADERO", x: 5.5, y: 0.35, rot: 0 }] };

/** Tres alcobas (≈ 96 m²). */
const A3: Plantilla = { clave: "3A", nombre: "3 alcobas", alcobas: 3, banos: 2, W: 12.6, F: F0,
  espacios: [
    { nombre: "Alcoba principal", tipo: "alcoba_principal", r: [0, 4.0, 3.3, F0] },
    { nombre: "Alcoba 2", tipo: "alcoba", r: [3.3, 4.0, 6.2, F0] },
    { nombre: "Alcoba 3", tipo: "alcoba", r: [6.2, 4.0, 9.0, F0] },
    { nombre: "Sala-comedor", tipo: "sala", r: [9.0, 3.0, 12.6, F0] },
    { nombre: "Hall", tipo: "hall", r: [1.8, 2.8, 9.0, 4.0] },
    { nombre: "Baño principal", tipo: "bano", r: [0, 2.0, 1.8, 4.0] },
    { nombre: "Vestier", tipo: "vestier", r: [0, 0, 1.8, 2.0] },
    { nombre: "Baño social", tipo: "bano", r: [1.8, 0, 3.6, 2.8] },
    { nombre: "Estudio", tipo: "estudio", r: [3.6, 0, 7.6, 2.8] },
    { nombre: "Ropas", tipo: "ropas", r: [7.6, 0, 9.0, 2.8] },
    { nombre: "Cocina", tipo: "cocina", r: [9.0, 0, 12.6, 3.0] },
  ],
  vanos: [
    { eje: "y", en: 0, a: 10.0, b: 10.95, tipo: "entrada" },
    { eje: "y", en: 4.0, a: 2.1, b: 2.95, tipo: "puerta" },
    { eje: "y", en: 4.0, a: 4.9, b: 5.75, tipo: "puerta" },
    { eje: "y", en: 4.0, a: 7.6, b: 8.45, tipo: "puerta" },
    { eje: "y", en: 4.0, a: 0.5, b: 1.25, tipo: "puerta" },
    { eje: "y", en: 2.0, a: 0.5, b: 1.25, tipo: "puerta" },
    { eje: "y", en: 2.8, a: 2.3, b: 3.05, tipo: "puerta" },
    { eje: "y", en: 2.8, a: 5.2, b: 6.05, tipo: "puerta" },
    { eje: "x", en: 9.0, a: 3.0, b: 4.0, tipo: "paso" },
    { eje: "x", en: 9.0, a: 0.6, b: 1.4, tipo: "puerta" },
  ],
  ventanas: [{ y: F0, a: 0.6, b: 2.7, tipo: "ventana" }, { y: F0, a: 3.8, b: 5.7, tipo: "ventana" }, { y: F0, a: 6.6, b: 8.6, tipo: "ventana" }, { y: F0, a: 9.4, b: 12.2, tipo: "ventanal" }],
  muebles: [{ bloque: "CAMA_DOBLE", x: 1.65, y: 6.4, rot: 0 }, { bloque: "CAMA_SENCILLA", x: 4.75, y: 6.5, rot: 0 }, { bloque: "CAMA_SENCILLA", x: 7.6, y: 6.5, rot: 0 },
    { bloque: "SOFA", x: 10.8, y: 6.8, rot: 180 }, { bloque: "COMEDOR_6", x: 10.8, y: 4.3, rot: 0 }, { bloque: "MESON_COCINA", x: 10.8, y: 0.35, rot: 0 },
    { bloque: "SANITARIO", x: 0.45, y: 3.5, rot: 0 }, { bloque: "LAVAMANOS", x: 1.35, y: 3.7, rot: 0 }, { bloque: "DUCHA", x: 0.6, y: 2.45, rot: 0 },
    { bloque: "SANITARIO", x: 2.25, y: 0.45, rot: 180 }, { bloque: "LAVAMANOS", x: 3.15, y: 0.3, rot: 180 }, { bloque: "LAVADERO", x: 8.3, y: 0.35, rot: 0 }] };

export const PLANTILLAS: Record<string, Plantilla> = { estudio: ESTUDIO, "1A": A1, "2A": A2, "3A": A3 };

export type Mezcla = { tipologia: keyof typeof PLANTILLAS | string; pct: number; area_m2?: number }[];
export const MEZCLA_DEFECTO: Mezcla = [{ tipologia: "1A", pct: 20 }, { tipologia: "2A", pct: 55 }, { tipologia: "3A", pct: 25 }];

/** Área privada de la plantilla a su tamaño base. */
export const areaBase = (p: Plantilla) => p.W * p.F;

/** Ancho (frente) que necesita una tipología para un área objetivo con la profundidad de crujía dada. */
export function anchoPara(p: Plantilla, area: number | undefined, F: number) {
  const a = area ?? areaBase(p) * (F / p.F);
  // Se limita el estiramiento a ±20 % del frente base para no deformar la distribución.
  return Math.min(p.W * 1.2, Math.max(p.W * 0.85, a / F));
}

/** Instancia una plantilla a un frente W y profundidad F (escala afín de la planta base). */
export function instanciar(p: Plantilla, W: number, F: number) {
  const kx = W / p.W, ky = F / p.F;
  const X = (x: number) => Math.round(x * kx * 100) / 100, Y = (y: number) => Math.round(y * ky * 100) / 100;
  return {
    ...p, W, F,
    espacios: p.espacios.map((e) => ({ ...e, r: [X(e.r[0]), Y(e.r[1]), X(e.r[2]), Y(e.r[3])] as R })),
    vanos: p.vanos.map((v) => (v.eje === "x" ? { ...v, en: X(v.en), a: Y(v.a), b: Y(v.b) } : { ...v, en: Y(v.en), a: X(v.a), b: X(v.b) })),
    ventanas: p.ventanas.map((v) => ({ ...v, y: Y(v.y), a: X(v.a), b: X(v.b) })),
    muebles: p.muebles.map((m) => ({ ...m, x: X(m.x), y: Y(m.y) })),
  };
}

/** Comprobación interna: los espacios cubren todo el rectángulo sin traslaparse. */
export function validarPlantilla(p: Plantilla) {
  const suma = p.espacios.reduce((s, e) => s + (e.r[2] - e.r[0]) * (e.r[3] - e.r[1]), 0);
  return { suma: Math.round(suma * 100) / 100, total: Math.round(p.W * p.F * 100) / 100, ok: Math.abs(suma - p.W * p.F) < 0.01 };
}
