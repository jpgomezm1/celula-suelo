// Cabida arquitectónica esquemática de un lote: ubica torres rectangulares dentro del área edificable (lote menos
// retiros), distribuye en cada piso tipo un núcleo, el pasillo y los apartamentos, y dibuja la plataforma, los sótanos
// con sus parqueaderos y la rampa. Produce un modelo neutro (niveles, polígonos y volúmenes en metros, en un marco
// local alineado con la vía) que se exporta a DXF y se ve en 3D en la plataforma.
// Es un ejercicio de prefactibilidad: los retiros, separaciones y dimensiones son supuestos editables, no la norma
// específica de cada predio, y no reemplaza el diseño arquitectónico.
import { sql } from "./db";
import { encontrarPredio } from "./ficha";
import { analizarLote } from "./analisis_lote";

export type Pt = [number, number];
export type Opciones = {
  escenario?: "conservador" | "base" | "maximo";
  area_unidad_m2?: number;          // área privada por apartamento
  retiro_frontal_m?: number;        // antejardín / retiro a la vía
  retiro_lateral_m?: number;        // laterales y fondo
  separacion_torres_m?: number;     // entre torres
  profundidad_torre_m?: number;     // crujía doble típica
  largo_max_torre_m?: number;
  pisos_plataforma?: number;        // 0 = sin plataforma; 1–3 = comercio / lobby / parqueo en altura
  altura_piso_m?: number;
  altura_plataforma_m?: number;
  altura_sotano_m?: number;
  max_torres?: number;
};

const DEF = { area_unidad_m2: 65, retiro_frontal_m: 5, retiro_lateral_m: 3, separacion_torres_m: 12, profundidad_torre_m: 18,
  largo_max_torre_m: 42, pisos_plataforma: 0, altura_piso_m: 2.9, altura_plataforma_m: 4.5, altura_sotano_m: 3.0, max_torres: 6 };

// ---------- geometría 2D (marco local, metros) ----------
const dentro = (p: Pt, poly: Pt[]) => {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > p[1]) !== (yj > p[1]) && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
};
const cruza = (a: Pt, b: Pt, c: Pt, d: Pt) => {
  const o = (p: Pt, q: Pt, r: Pt) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  const d1 = o(c, d, a), d2 = o(c, d, b), d3 = o(a, b, c), d4 = o(a, b, d);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
};
export const rect = (x0: number, y0: number, x1: number, y1: number): Pt[] => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
const rectDentro = (r: Pt[], poly: Pt[]) => {
  if (!r.every((p) => dentro(p, poly))) return false;
  for (let i = 0; i < 4; i++) for (let j = 0, k = poly.length - 1; j < poly.length; k = j++) if (cruza(r[i], r[(i + 1) % 4], poly[k], poly[j])) return false;
  return true;
};
const solapa = (a: Pt[], b: Pt[], margen = 0) =>
  !(a[1][0] + margen <= b[0][0] || b[1][0] + margen <= a[0][0] || a[2][1] + margen <= b[0][1] || b[2][1] + margen <= a[0][1]);
export const area = (p: Pt[]) => Math.abs(p.reduce((s, q, i) => { const r = p[(i + 1) % p.length]; return s + q[0] * r[1] - r[0] * q[1]; }, 0)) / 2;
const r2 = (x: number) => Math.round(x * 100) / 100;

export type Elemento = { capa: string; poligono: Pt[]; etiqueta?: string; z: number; altura?: number };
export type Nivel = { nombre: string; tipo: "sotano" | "plataforma" | "tipo"; z: number; altura: number; elementos: Elemento[] };

/** Genera la cabida arquitectónica esquemática de un predio. */
export async function cabidaArquitectonica(id: string, o: Opciones = {}) {
  const op = { ...DEF, ...Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && !Number.isNaN(v))) } as typeof DEF & Opciones;
  const p = await encontrarPredio({ id });
  if (!p) return { encontrado: false as const, mensaje: "Predio no encontrado" };
  const an: any = await analizarLote(p, { area_unidad_m2: op.area_unidad_m2, con_mercado: false });
  const claveEsc = op.escenario ?? "base";
  const esc = (an.cabida.escenarios as any[]).find((e) => (claveEsc === "conservador" ? /conservador/i : claveEsc === "maximo" ? /m[aá]ximo/i : /^base/i).test(e.escenario))
    ?? (an.cabida.escenarios as any[]).find((e) => e.disponible);
  if (!esc?.disponible) return { encontrado: true as const, disponible: false, mensaje: "La norma de este predio no permite calcular una cabida." };

  // Lote en MAGNA-SIRGAS Origen Nacional (EPSG 9377), vía más cercana y su dirección para orientar el marco local.
  const [g] = await sql`
    WITH l AS (SELECT ST_Transform(geom, 9377) g, geom FROM parcel WHERE id = ${id}),
         v AS (SELECT ST_Transform(o.geom, 9377) vg FROM osm_via o, l WHERE o.geom && ST_Expand(l.geom, 0.0006) AND ST_DWithin(o.geom::geography, l.geom::geography, 40)
               ORDER BY o.geom <-> ST_Centroid(l.geom) LIMIT 1),
         e AS (SELECT ST_OrientedEnvelope(g) env FROM l)
    SELECT ST_AsGeoJSON(l.g, 3)::json AS lote, ST_X(ST_Centroid(l.g)) cx, ST_Y(ST_Centroid(l.g)) cy, ST_Area(l.g) area,
           (SELECT ST_AsGeoJSON(ST_ShortestLine(vg, l.g), 3)::json FROM v) AS a_via,
           (SELECT degrees(ST_Azimuth(ST_PointN(ST_ExteriorRing(env), 1), ST_PointN(ST_ExteriorRing(env), 2))) FROM e) AS az1,
           (SELECT degrees(ST_Azimuth(ST_PointN(ST_ExteriorRing(env), 2), ST_PointN(ST_ExteriorRing(env), 3))) FROM e) AS az2,
           (SELECT ST_Distance(ST_PointN(ST_ExteriorRing(env), 1), ST_PointN(ST_ExteriorRing(env), 2)) FROM e) AS d1,
           (SELECT ST_Distance(ST_PointN(ST_ExteriorRing(env), 2), ST_PointN(ST_ExteriorRing(env), 3)) FROM e) AS d2
    FROM l`;
  const cx = Number(g.cx), cy = Number(g.cy);
  const anillo: Pt[] = (g.lote.type === "MultiPolygon" ? g.lote.coordinates[0][0] : g.lote.coordinates[0]).slice(0, -1);
  // Eje u: lado largo del rectángulo envolvente (las torres van paralelas a él). El frente es el lado más cercano a la vía.
  const azLargo = Number(g.d1) >= Number(g.d2) ? Number(g.az1) : Number(g.az2);
  const ang = ((90 - azLargo) * Math.PI) / 180; // azimut → ángulo matemático
  const cos = Math.cos(-ang), sin = Math.sin(-ang);
  const aLocal = ([x, y]: number[]): Pt => { const dx = x - cx, dy = y - cy; return [r2(dx * cos - dy * sin), r2(dx * sin + dy * cos)]; };
  let lote = anillo.map(aLocal);
  // ¿La vía queda abajo (v negativo) o arriba? Si queda arriba se refleja para que el frente siempre esté en v mínimo.
  let reflejar = false;
  if (g.a_via) { const pv = aLocal(g.a_via.coordinates[0]); reflejar = pv[1] > 0; }
  if (reflejar) lote = lote.map(([x, y]) => [x, -y] as Pt).reverse();
  const yMin = Math.min(...lote.map((q) => q[1])), yMax = Math.max(...lote.map((q) => q[1]));
  const xMin = Math.min(...lote.map((q) => q[0])), xMax = Math.max(...lote.map((q) => q[0]));

  // Área edificable: lote menos retiro lateral (todo el borde) y retiro frontal desde el frente (v mínimo).
  const [ed] = await sql`
    WITH l AS (SELECT ST_GeomFromText(${`POLYGON((${[...lote, lote[0]].map((q) => q.join(" ")).join(",")}))`}) g)
    SELECT ST_AsGeoJSON(ST_Intersection(ST_Buffer(g, ${-op.retiro_lateral_m}, 'join=mitre'),
             ST_MakeEnvelope(-1e6, ${yMin + op.retiro_frontal_m}, 1e6, 1e6)), 2)::json AS edif,
           ST_AsGeoJSON(ST_Buffer(g, -1.0, 'join=mitre'), 2)::json AS sotano FROM l`;
  const mayor = (gj: any): Pt[] => {
    if (!gj?.coordinates?.length) return [];
    const polys: Pt[][] = gj.type === "MultiPolygon" ? gj.coordinates.map((c: any) => c[0].slice(0, -1)) : [gj.coordinates[0].slice(0, -1)];
    return polys.sort((a, b) => area(b) - area(a))[0] ?? [];
  };
  const edificable = mayor(ed.edif), sotano = mayor(ed.sotano);
  if (edificable.length < 3 || area(edificable) < 120) return { encontrado: true as const, disponible: false, mensaje: "Con estos retiros no queda área edificable suficiente para una torre." };

  // ---------- Torres: colocación voraz de rectángulos dentro del área edificable ----------
  let D = op.profundidad_torre_m;
  const torres: Pt[][] = [];
  const ex = Math.min(...edificable.map((q) => q[0])), eX = Math.max(...edificable.map((q) => q[0]));
  const ey = Math.min(...edificable.map((q) => q[1])), eY = Math.max(...edificable.map((q) => q[1]));
  const colocar = () => { for (let n = 0; n < op.max_torres; n++) {
    let mejor: Pt[] | null = null;
    for (let L = op.largo_max_torre_m; L >= 16 && !mejor; L -= 2) {
      for (const [w, h] of [[L, D], [D, L]] as [number, number][]) {
        for (let y = ey; y + h <= eY && !mejor; y += 1) for (let x = ex; x + w <= eX; x += 1) {
          const r = rect(r2(x), r2(y), r2(x + w), r2(y + h));
          if (torres.some((t) => solapa(t, r, op.separacion_torres_m))) continue;
          if (rectDentro(r, edificable)) { mejor = r; break; }
        }
        if (mejor) break;
      }
    }
    if (!mejor) break;
    torres.push(mejor);
  } };
  colocar();
  if (!torres.length && D > 11) { D = 11; colocar(); }
  if (!torres.length) return { encontrado: true as const, disponible: false, mensaje: `No cabe una torre de ${D} m de profundidad y al menos 16 m de largo con estos retiros. Pruebe una profundidad menor (p. ej. 11 m, crujía sencilla) o retiros menores.` };

  // ---------- Planta tipo de cada torre: núcleo central, pasillo y apartamentos a lado y lado ----------
  const pasillo = 1.8, nucleoAncho = 8;
  const planta = torres.map((t, ti) => {
    const horizontal = t[1][0] - t[0][0] >= t[2][1] - t[1][1];
    // Se trabaja en coordenadas de la torre (a lo largo = s, a lo ancho = q) y se devuelven al marco local.
    const [x0, y0] = t[0], largo = horizontal ? t[1][0] - x0 : t[2][1] - y0, ancho = horizontal ? t[2][1] - y0 : t[1][0] - x0;
    const P = (s0: number, q0: number, s1: number, q1: number): Pt[] => horizontal ? rect(r2(x0 + s0), r2(y0 + q0), r2(x0 + s1), r2(y0 + q1)) : rect(r2(x0 + q0), r2(y0 + s0), r2(x0 + q1), r2(y0 + s1));
    const sencilla = ancho < 14; // crujía sencilla: pasillo a un lado y apartamentos al otro
    const prof = sencilla ? ancho - pasillo : (ancho - pasillo) / 2;
    const qPas = sencilla ? 0 : prof;
    const n0 = (largo - nucleoAncho) / 2, n1 = n0 + nucleoAncho;
    const elementos: { capa: string; poligono: Pt[]; etiqueta?: string }[] = [
      { capa: "NUCLEO", poligono: P(n0, 0, n1, ancho), etiqueta: "Punto fijo" },
      { capa: "CIRCULACION", poligono: P(0, qPas, n0, qPas + pasillo) },
      { capa: "CIRCULACION", poligono: P(n1, qPas, largo, qPas + pasillo) },
    ];
    let aptos = 0;
    const anchoApto = op.area_unidad_m2 / prof;
    const filas: [number, number][] = sencilla ? [[pasillo, ancho]] : [[0, prof], [prof + pasillo, ancho]];
    for (const [s0, s1] of [[0, n0], [n1, largo]]) for (const [q0, q1] of filas) {
      const tramo = s1 - s0, k = Math.max(0, Math.floor(tramo / anchoApto + 0.15));
      for (let i = 0; i < k; i++) { aptos++; elementos.push({ capa: "APARTAMENTOS", poligono: P(s0 + (i * tramo) / k, q0, s0 + ((i + 1) * tramo) / k, q1), etiqueta: `${String.fromCharCode(65 + ti)}-${aptos}` }); }
    }
    return { torre: String.fromCharCode(65 + ti), huella: t, largo: r2(largo), ancho: r2(ancho), aptos_por_piso: aptos, elementos,
      area_apto_m2: r2(aptos ? (filas.length * (largo - nucleoAncho) * prof) / aptos : 0), crujia: sencilla ? "sencilla" : "doble", area_piso_m2: r2(largo * ancho) };
  });

  // ---------- Pisos: los que necesita la cabida de la norma, sin pasar la altura máxima ----------
  const aptosPiso = planta.reduce((s, t) => s + t.aptos_por_piso, 0);
  const areaPiso = planta.reduce((s, t) => s + t.area_piso_m2, 0);
  const tope = p.altura_max ? Number(p.altura_max) : null;
  const pp = Math.max(0, Math.min(3, op.pisos_plataforma));
  const pisosPorUnidades = Math.ceil(Number(esc.unidades) / Math.max(aptosPiso, 1));
  const areaPlataforma = pp > 0 ? area(edificable) * pp : 0;
  const pisosPorArea = Math.floor(Math.max(0, Number(esc.area_construible_m2) - areaPlataforma) / Math.max(areaPiso, 1));
  let pisosTorre = Math.max(1, Math.min(pisosPorUnidades, Math.max(pisosPorArea, 1)));
  let limitadoPor = pisosPorUnidades <= pisosPorArea ? "unidades (densidad)" : "área construible";
  if (tope && pisosTorre + pp > tope) { pisosTorre = Math.max(1, tope - pp); limitadoPor = `altura máxima (${tope} pisos)`; }
  const unidades = pisosTorre * aptosPiso;

  // ---------- Plataforma y sótanos ----------
  const plataforma = pp > 0 ? edificable : null;
  const parqReq = Math.ceil(unidades * (Number(an.cabida.supuestos.parqueaderos_por_vivienda) + Number(an.cabida.supuestos.visitantes_por_vivienda)));
  // Parqueaderos de 2,5 × 5 m en módulos de 16 m (5 + 6 de calle + 5), evitando los núcleos y la rampa en el frente.
  const sx = Math.min(...sotano.map((q) => q[0])), sX = Math.max(...sotano.map((q) => q[0]));
  const sy = Math.min(...sotano.map((q) => q[1])), sY = Math.max(...sotano.map((q) => q[1]));
  const rampa = rect(r2(sx + 1), r2(sy), r2(sx + 4.5), r2(sy + 18));
  const nucleos = planta.map((t) => t.elementos.find((e) => e.capa === "NUCLEO")!.poligono);
  const puestos: Pt[][] = [], calles: Pt[][] = [];
  for (let y = sy + 0.5; y + 16 <= sY + 0.01; y += 16) {
    const calle = rect(r2(sx), r2(y + 5), r2(sX), r2(y + 11));
    calles.push(calle);
    for (const fila of [y, y + 11]) for (let x = sx + 0.5; x + 2.5 <= sX; x += 2.5) {
      const r = rect(r2(x), r2(fila), r2(x + 2.5), r2(fila + 5));
      if (solapa(r, rampa, 0.3) || nucleos.some((n) => solapa(r, n, 0.3))) continue;
      if (rectDentro(r, sotano)) puestos.push(r);
    }
  }
  const nSotanos = puestos.length ? Math.min(6, Math.max(1, Math.ceil(parqReq / puestos.length))) : Number(esc.sotanos_aprox) || 1;

  // ---------- Niveles ----------
  const niveles: Nivel[] = [];
  for (let s = nSotanos; s >= 1; s--) {
    const z = -s * op.altura_sotano_m;
    niveles.push({ nombre: `Sótano ${s}`, tipo: "sotano", z, altura: op.altura_sotano_m, elementos: [
      { capa: "SOTANO", poligono: sotano, z, altura: op.altura_sotano_m },
      ...puestos.map((r, i) => ({ capa: "PARQUEADEROS", poligono: r, z, etiqueta: `${s}-${i + 1}` })),
      ...calles.map((r) => ({ capa: "CIRCULACION_VEHICULAR", poligono: r, z })),
      { capa: "RAMPA", poligono: rampa, z, etiqueta: "Rampa" },
      ...nucleos.map((n) => ({ capa: "NUCLEO", poligono: n, z, altura: op.altura_sotano_m })),
    ] });
  }
  for (let k = 0; k < pp; k++) {
    const z = k * op.altura_plataforma_m;
    niveles.push({ nombre: `Plataforma ${k + 1}`, tipo: "plataforma", z, altura: op.altura_plataforma_m, elementos: [
      { capa: "PLATAFORMA", poligono: plataforma!, z, altura: op.altura_plataforma_m, etiqueta: k === 0 ? "Comercio / lobby" : "Plataforma" },
      ...nucleos.map((n) => ({ capa: "NUCLEO", poligono: n, z, altura: op.altura_plataforma_m })),
    ] });
  }
  const zTorre = pp * op.altura_plataforma_m;
  for (let k = 0; k < pisosTorre; k++) {
    const z = r2(zTorre + k * op.altura_piso_m);
    niveles.push({ nombre: `Piso ${pp + k + 1}`, tipo: "tipo", z, altura: op.altura_piso_m, elementos: planta.flatMap((t) => [
      { capa: "TORRE", poligono: t.huella, z, altura: op.altura_piso_m, etiqueta: `Torre ${t.torre}` },
      ...t.elementos.map((e) => ({ ...e, z, altura: e.capa === "NUCLEO" ? op.altura_piso_m : undefined, etiqueta: e.capa === "APARTAMENTOS" ? `${pp + k + 1}0${e.etiqueta!.split("-")[1].padStart(2, "0")} T${t.torre}` : e.etiqueta })),
    ]) });
  }

  const areaSobre = areaPiso * pisosTorre + (plataforma ? area(plataforma) * pp : 0);
  const alturaTotal = r2(zTorre + pisosTorre * op.altura_piso_m);
  const resumen = {
    escenario: esc.escenario, torres: planta.length, pisos_torre: pisosTorre, pisos_plataforma: pp, pisos_totales: pisosTorre + pp, altura_m: alturaTotal,
    aptos_por_piso: aptosPiso, unidades, unidades_norma: esc.unidades, limitado_por: limitadoPor,
    area_apto_promedio_m2: r2(planta.reduce((s, t) => s + t.area_apto_m2 * t.aptos_por_piso, 0) / Math.max(aptosPiso, 1)),
    area_construida_sobre_rasante_m2: Math.round(areaSobre), area_construible_norma_m2: Math.round(Number(esc.area_construible_m2)),
    aprovechamiento_de_la_norma_pct: Math.round((areaSobre / Number(esc.area_construible_m2)) * 100),
    indice_construccion_resultante: r2(areaSobre / Number(g.area)), indice_ocupacion_resultante: r2((plataforma ? area(plataforma) : areaPiso) / Number(g.area)),
    sotanos: nSotanos, parqueaderos_por_sotano: puestos.length, parqueaderos_dibujados: puestos.length * nSotanos, parqueaderos_requeridos: parqReq,
    area_sotanos_m2: Math.round(area(sotano) * nSotanos), area_lote_m2: Math.round(Number(g.area)), area_edificable_m2: Math.round(area(edificable)),
  };
  return {
    encontrado: true as const, disponible: true as const, predio: id, barrio: p.barrio_catastral ?? null, municipio: p.municipio ?? null,
    marco: { srid: 9377, nombre: "MAGNA-SIRGAS Origen Nacional (EPSG 9377)", origen_x: r2(cx), origen_y: r2(cy), rotacion_grados: r2((ang * 180) / Math.PI), reflejado: reflejar,
      nota: "Coordenadas locales en metros: origen en el centro del lote, eje X paralelo al lado largo y la vía (frente) hacia Y negativo. El DXF se exporta georreferenciado en EPSG 9377." },
    lote, edificable, sotano, torres: planta.map(({ elementos, ...t }) => t), niveles, resumen,
    supuestos: { ...op, escenario: claveEsc, parqueaderos_por_vivienda: an.cabida.supuestos.parqueaderos_por_vivienda, visitantes_por_vivienda: an.cabida.supuestos.visitantes_por_vivienda,
      puesto_parqueo: "2,5 × 5 m, calle de 6 m", pasillo_m: pasillo, nucleo_m: `${nucleoAncho} × profundidad de torre` },
    aviso: "Cabida arquitectónica esquemática para prefactibilidad. Retiros, separación entre torres, profundidad y alturas son supuestos editables: verifique la norma específica (en Medellín, Decreto 471 de 2018 y el POT), la norma de parqueaderos por estrato y el diseño con un arquitecto.",
  };
}

/** Pasa un punto del marco local a EPSG 9377 (para exportar georreferenciado). */
export function aGlobal(m: { marco: { origen_x: number; origen_y: number; rotacion_grados: number; reflejado: boolean } }) {
  const a = (m.marco.rotacion_grados * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  return ([x, y]: Pt): Pt => { const yy = m.marco.reflejado ? -y : y; return [m.marco.origen_x + x * c - yy * s, m.marco.origen_y + x * s + yy * c]; };
}

/** Lee las opciones de cabida desde parámetros de URL. */
export function opcionesDe(q: URLSearchParams): Opciones {
  const n = (k: string) => (q.get(k) !== null && q.get(k) !== "" ? Number(q.get(k)) : undefined);
  return { escenario: (q.get("escenario") as any) ?? undefined, area_unidad_m2: n("area_unidad_m2"), retiro_frontal_m: n("retiro_frontal_m"), retiro_lateral_m: n("retiro_lateral_m"),
    separacion_torres_m: n("separacion_torres_m"), profundidad_torre_m: n("profundidad_torre_m"), largo_max_torre_m: n("largo_max_torre_m"),
    pisos_plataforma: n("pisos_plataforma"), altura_piso_m: n("altura_piso_m"), max_torres: n("max_torres") };
}
