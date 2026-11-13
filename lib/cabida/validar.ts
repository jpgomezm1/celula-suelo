// Revisión arquitectónica automática de las tipologías (lo que revisaría un arquitecto antes de firmar una planta):
// circulación (todo recinto se alcanza desde la entrada; ninguna alcoba se cruza para llegar a otra; los baños no
// obligan a pasar por una alcoba ajena), iluminación y ventilación natural de los recintos habitables, áreas y lados
// mínimos, anchos de puerta y que cada puerta quede dentro del muro que comparte con el recinto vecino.
import { PLANTILLAS, instanciar, type Plantilla, type R } from "./tipologias";

export type Problema = { tipologia: string; regla: string; detalle: string };

// Mínimos de habitabilidad usados como referencia de diseño (práctica usual y normas de habitabilidad locales).
export const MINIMOS = {
  alcoba_principal: { area: 9.0, lado: 2.7 }, alcoba: { area: 7.0, lado: 2.4 }, estancia: { area: 15, lado: 3.0 }, sala: { area: 12, lado: 2.8 },
  cocina: { area: 4.5, lado: 1.5 }, bano: { area: 2.4, lado: 1.2 }, ropas: { area: 1.8, lado: 1.1 }, hall: { area: 0, lado: 0.9 },
  puerta_entrada: 0.9, puerta_alcoba: 0.8, puerta_servicio: 0.7, ventana_habitable: 1.0,
} as const;

const HABITABLES = new Set(["alcoba", "alcoba_principal", "sala", "estancia"]);
const eps = 0.02;

export function revisarPlantilla(p: Plantilla): Problema[] {
  const out: Problema[] = [];
  const mal = (regla: string, detalle: string) => out.push({ tipologia: `${p.clave} (${p.W.toFixed(2)} × ${p.F.toFixed(2)})`, regla, detalle });
  const E = p.espacios;
  // 1) Cobertura sin huecos ni traslapes
  const suma = E.reduce((s, e) => s + (e.r[2] - e.r[0]) * (e.r[3] - e.r[1]), 0);
  if (Math.abs(suma - p.W * p.F) > 0.05) mal("cobertura", `los recintos suman ${suma.toFixed(2)} m² y el apartamento tiene ${(p.W * p.F).toFixed(2)} m²`);
  // 2) Áreas y lados mínimos
  for (const e of E) {
    const m = (MINIMOS as any)[e.tipo]; if (!m) continue;
    const w = e.r[2] - e.r[0], h = e.r[3] - e.r[1];
    if (w * h < m.area - eps) mal("área mínima", `${e.nombre}: ${(w * h).toFixed(1)} m² (mínimo ${m.area})`);
    if (Math.min(w, h) < m.lado - eps) mal("lado mínimo", `${e.nombre}: ${Math.min(w, h).toFixed(2)} m (mínimo ${m.lado})`);
  }
  // 3) Grafo de circulación: nodos = recintos + pasillo (−1); aristas = puertas y pasos
  const ady = new Map<number, Set<number>>(); const unir = (a: number, b: number) => { (ady.get(a) ?? ady.set(a, new Set()).get(a)!).add(b); (ady.get(b) ?? ady.set(b, new Set()).get(b)!).add(a); };
  const lado = (r: R, eje: "x" | "y", en: number, t: number, cual: 0 | 1) => eje === "y"
    ? Math.abs((cual ? r[1] : r[3]) - en) < eps && t > r[0] + eps && t < r[2] - eps
    : Math.abs((cual ? r[0] : r[2]) - en) < eps && t > r[1] + eps && t < r[3] - eps;
  let entradas = 0;
  for (const v of p.vanos) {
    const t = (v.a + v.b) / 2, w = v.b - v.a;
    const ia = E.findIndex((e) => lado(e.r, v.eje, v.en, t, 0)), ib = E.findIndex((e) => lado(e.r, v.eje, v.en, t, 1));
    if (v.tipo === "entrada") {
      entradas++;
      if (w < MINIMOS.puerta_entrada - eps) mal("puerta", `entrada de ${w.toFixed(2)} m (mínimo ${MINIMOS.puerta_entrada})`);
      if (ib < 0 || v.en > eps) { mal("entrada", "la puerta de entrada no da desde el pasillo a un recinto"); continue; }
      const dest = E[ib];
      if (!["cocina", "hall", "sala", "estancia"].includes(dest.tipo)) mal("entrada", `la entrada da a ${dest.nombre}: debe llegar a una zona social o a un hall`);
      unir(-1, ib); continue;
    }
    if (ia < 0 || ib < 0) { mal("vano", `${v.tipo} en ${v.eje}=${v.en} no está entre dos recintos`); continue; }
    // La puerta debe caber en el muro común
    const A = E[ia].r, B = E[ib].r;
    const [c0, c1] = v.eje === "y" ? [Math.max(A[0], B[0]), Math.min(A[2], B[2])] : [Math.max(A[1], B[1]), Math.min(A[3], B[3])];
    if (v.a < c0 - eps || v.b > c1 + eps) mal("vano", `${v.tipo} entre ${E[ia].nombre} y ${E[ib].nombre} se sale del muro común`);
    if (v.tipo === "puerta") {
      const tipos = [E[ia].tipo, E[ib].tipo];
      const min = tipos.some((x) => x.startsWith("alcoba")) && !tipos.some((x) => ["vestier", "bano"].includes(x)) ? MINIMOS.puerta_alcoba : MINIMOS.puerta_servicio;
      if (w < min - eps) mal("puerta", `${E[ia].nombre}–${E[ib].nombre}: ${w.toFixed(2)} m (mínimo ${min})`);
    }
    unir(ia, ib);
  }
  if (entradas !== 1) mal("entrada", `el apartamento tiene ${entradas} puertas de entrada`);
  const alcanzables = (desde: number, prohibidos: Set<number>) => {
    const vis = new Set([desde]), cola = [desde];
    while (cola.length) { const x = cola.shift()!; for (const y of ady.get(x) ?? []) if (!vis.has(y) && !prohibidos.has(y)) { vis.add(y); cola.push(y); } }
    return vis;
  };
  const todos = alcanzables(-1, new Set());
  E.forEach((e, i) => { if (!todos.has(i)) mal("circulación", `${e.nombre} no se alcanza desde la entrada`); });
  // Ninguna alcoba ni baño social se alcanza solo cruzando una alcoba (salvo vestier y baño propios de la principal)
  const alcobas = E.map((e, i) => (e.tipo.startsWith("alcoba") ? i : -1)).filter((i) => i >= 0);
  E.forEach((e, i) => {
    if (!(e.tipo.startsWith("alcoba") || (e.tipo === "bano" && !/principal/i.test(e.nombre)) || ["cocina", "sala", "ropas"].includes(e.tipo))) return;
    const vis = alcanzables(-1, new Set(alcobas.filter((j) => j !== i)));
    if (!vis.has(i)) mal("circulación", `para llegar a ${e.nombre} hay que cruzar una alcoba`);
  });
  // 4) Luz y ventilación natural de habitables
  E.forEach((e) => {
    if (!HABITABLES.has(e.tipo)) return;
    if (Math.abs(e.r[3] - p.F) > eps) { mal("iluminación", `${e.nombre} no tiene fachada`); return; }
    const luz = p.ventanas.filter((w) => Math.abs(w.y - p.F) < eps).reduce((s, w) => s + Math.max(0, Math.min(w.b, e.r[2]) - Math.max(w.a, e.r[0])), 0);
    if (luz < MINIMOS.ventana_habitable - eps) mal("iluminación", `${e.nombre}: ${luz.toFixed(2)} m de ventana (mínimo ${MINIMOS.ventana_habitable})`);
  });
  if (E.some((e) => e.tipo === "estudio")) mal("habitabilidad", "hay un estudio: debe tener ventana o llamarse depósito");
  return out;
}

/** Revisa todas las tipologías en el rango de estiramientos y crujías que usa el generador. */
export function revisarTodas(crujias = [7.0, 7.6, 8.4], factores = [0.85, 1, 1.2]) {
  const out: Problema[] = [];
  for (const t of Object.values(PLANTILLAS)) for (const F of crujias) for (const k of factores) out.push(...revisarPlantilla(instanciar(t, Math.round(t.W * k * 100) / 100, F)));
  return out;
}
