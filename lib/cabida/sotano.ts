// Planta de sótano: rampa con pendiente real desde el frente, calle principal (espina) de 6 m con calles de parqueo
// perpendiculares cada 16 m (5 + 6 + 5), puestos de 2,5 × 5 m, visitantes marcados, depósitos en las franjas sobrantes,
// cuartos técnicos en el sótano 1 y los puntos fijos de las torres que bajan.
import { caja, dentro, rect, rectDentro, solapa, r2, area, type Pt } from "./lote";

export type ParamSotano = { altura: number; largo_rampa: number; ancho_rampa: number; celda: [number, number]; calle: number; unidades: number; visitantes: number };
export type PlantaSotano = {
  nivel: number; poligono: Pt[]; rampa: Pt[]; espina: Pt[]; calles: Pt[][]; puestos: { poly: Pt[]; n: number; visitante: boolean }[];
  depositos: Pt[][]; tecnicos: { nombre: string; poly: Pt[]; area: number }[]; nucleos: Pt[][];
};

/** Cuartos técnicos según el número de unidades (práctica usual; el diseñador de redes los ajusta). */
export function programaTecnico(unidades: number) {
  const tanques = Math.max(20, Math.ceil(unidades * 0.6 / 2.5)); // reserva de 1 día: 0,6 m³ por vivienda, 2,5 m de altura útil
  return [
    { nombre: "Tanques de agua", area: tanques },
    { nombre: "Cuarto de bombas", area: 15 },
    { nombre: "Planta eléctrica", area: 25 },
    { nombre: "Subestación", area: 25 },
  ];
}

export function plantaSotano(nivel: number, S: Pt[], nucleos: Pt[][], p: ParamSotano): PlantaSotano {
  const b = caja(S);
  const [cw, cd] = p.celda;
  const largoRampa = r2(p.largo_rampa);
  // Espina: calle principal paralela a Y, cerca del extremo izquierdo, que arranca en la rampa.
  // La rampa (y el arranque de la espina) debe quedar completa dentro del sótano: con lotes irregulares no basta la
  // caja envolvente. Se busca la primera posición, desde la esquina del frente, donde cabe entera.
  let xs = b.x0 + 0.5, yr = b.y0;
  buscar: for (let x = b.x0 + 0.5; x < b.x0 + (b.x1 - b.x0) * 0.6; x += 0.5)
    for (let y = b.y0; y < b.y0 + 8; y += 0.25)
      if (rectDentro(rect(x, y, x + Math.max(p.ancho_rampa, p.calle), y + largoRampa), S)) { xs = x; yr = y; break buscar; }
  const rampa = rect(xs, yr, xs + p.ancho_rampa, yr + largoRampa);
  const espina = rect(xs, yr, xs + p.calle, b.y1);
  const libres = nucleos.map((n) => { const c = caja(n); return rect(c.x0 - 0.6, c.y0 - 0.6, c.x1 + 0.6, c.y1 + 0.6); });
  const out: PlantaSotano = { nivel, poligono: S, rampa, espina, calles: [], puestos: [], depositos: [], tecnicos: [], nucleos };
  // Cuartos técnicos (solo sótano 1): franja frente a la rampa, del lado de la espina.
  const tecnicosZona: Pt[][] = [];
  if (nivel === 1) {
    let x = xs + p.calle + 0.3;
    for (const t of programaTecnico(p.unidades)) {
      const largo = r2(t.area / 5);
      const r = rect(x, yr + 0.3, x + largo, yr + 5.3);
      if (rectDentro(r, S)) { out.tecnicos.push({ nombre: t.nombre, poly: r, area: r2(largo * 5) }); tecnicosZona.push(r); x += largo + 0.2; }
    }
  }
  const bloqueado = (r: Pt[]) => solapa(r, espina, 0.05) || libres.some((n) => solapa(r, n)) || tecnicosZona.some((t) => solapa(r, t, 0.1)) || !rectDentro(r, S);
  // Módulos de parqueo: [puestos 5][calle 6][puestos 5] desde el frente hacia el fondo.
  const xIni = xs + p.calle;
  let y = b.y0 + 0.3, n = 0;
  const modulo = 2 * cd + p.calle;
  while (y + cd <= b.y1) {
    const completo = y + modulo <= b.y1 + 0.01;
    const calleY0 = y + cd, calleY1 = y + cd + p.calle;
    if (completo || y + cd + p.calle <= b.y1) {
      const calle = rect(xs + p.calle, calleY0, b.x1, Math.min(calleY1, b.y1));
      // Recorta la calle a la parte dentro del sótano
      out.calles.push(calle);
    }
    for (const fila of completo ? [y, y + cd + p.calle] : [y]) {
      for (let x = xIni + 0.2; x + cw <= b.x1; x += cw) {
        const r = rect(x, fila, x + cw, fila + cd);
        if (bloqueado(r)) continue;
        n++;
        out.puestos.push({ poly: r, n, visitante: false });
      }
    }
    if (!completo) { y = calleY1; break; }
    y += modulo;
  }
  // Franja sobrante al fondo: depósitos de 1,6 × 2,2 m.
  const yd = out.puestos.length ? Math.max(...out.puestos.map((q) => q.poly[2][1])) + (out.calles.length ? 0 : 0) : b.y0;
  for (let fy = Math.max(y, yd) + 0.2; fy + 2.2 <= b.y1; fy += 2.4) {
    for (let x = xIni + 0.2; x + 1.6 <= b.x1; x += 1.7) {
      const r = rect(x, fy, x + 1.6, fy + 2.2);
      if (!bloqueado(r)) out.depositos.push(r);
    }
  }
  // Visitantes: los más cercanos a la rampa en el sótano 1.
  if (nivel === 1 && p.visitantes > 0) {
    const orden = [...out.puestos].sort((a, b2) => (a.poly[0][1] + a.poly[0][0]) - (b2.poly[0][1] + b2.poly[0][0]));
    orden.slice(0, p.visitantes).forEach((q) => (q.visitante = true));
  }
  return out;
}

export const resumenSotano = (s: PlantaSotano) => ({ puestos: s.puestos.length, visitantes: s.puestos.filter((q) => q.visitante).length, depositos: s.depositos.length,
  area_m2: Math.round(area(s.poligono)), tecnicos: s.tecnicos.map((t) => `${t.nombre} ${t.area} m²`) });

export { dentro };
