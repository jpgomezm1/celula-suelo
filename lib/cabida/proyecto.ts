// Anteproyecto esquemático de un lote: implanta torres de crujía doble según la norma volumétrica, distribuye los
// apartamentos (mezcla editable), dimensiona el punto fijo, arma el primer piso (lobby, portería, basuras) y los
// sótanos (rampa, parqueaderos, depósitos y cuartos técnicos), y calcula el cuadro de áreas.
// Prefactibilidad: el arquitecto revisa, ajusta y desarrolla.
import { encontrarPredio } from "../ficha";
import { sql } from "../db";
import { analizarLote } from "../analisis_lote";
import { marcoLote, edificable, rect, rectDentro, solapa, caja, area, r2, type Pt, type MarcoLote } from "./lote";
import { plantaTorre, type PlantaTorre } from "./torre";
import { plantaSotano, type PlantaSotano } from "./sotano";
import { MEZCLA_DEFECTO, PLANTILLAS, type Mezcla } from "./tipologias";
import { normaVolumetrica, puntoFijo, parqueaderos, rampa, obligaciones, type NormaVol } from "./norma";

export type OpcionesProyecto = {
  escenario?: "conservador" | "base" | "maximo";
  mezcla?: Mezcla;
  crujia_m?: number;          // profundidad de apartamento (fachada a pasillo)
  pasillo_m?: number;
  largo_max_torre_m?: number;
  max_torres?: number;
  pisos_plataforma?: number;  // 0: primer piso de vivienda con lobby; 1–3: plataforma (comercio / zonas comunes)
  altura_piso_m?: number;
  altura_primer_piso_m?: number;
  // Sobrescriben la norma cargada (para probar alternativas)
  retiro_frontal_m?: number; retiro_lateral_m?: number; retiro_fondo_m?: number; separacion_torres_m?: number;
  estrato?: number;           // si no se da, se estima con los inmuebles en venta cercanos
  parqueo_privados_viv?: number;   // objetivo de la constructora (sin pasar el tope de la norma); defecto 1
  parqueo_visitantes_viv?: number; // defecto 0,2
};

export type Torre = { id: string; origen: Pt; rotada: boolean; planta: PlantaTorre; huella: Pt[] };

/** Transformación del marco de la torre (s, q) al marco local del lote. */
/** Marco de la torre (s, q) → marco del lote. Girada = rotación de 90° (no reflejo), para no invertir la planta. */
export const aLote = (t: { origen: Pt; rotada: boolean; planta: { D: number } }) => ([s, q]: Pt): Pt =>
  (t.rotada ? [r2(t.origen[0] + t.planta.D - q), r2(t.origen[1] + s)] : [r2(t.origen[0] + s), r2(t.origen[1] + q)]);

export async function anteproyecto(id: string, o: OpcionesProyecto = {}) {
  const p = await encontrarPredio({ id });
  if (!p) return { encontrado: false as const, mensaje: "Predio no encontrado" };
  const an: any = await analizarLote(p, { con_mercado: false });
  const clave = o.escenario ?? "base";
  const esc = (an.cabida.escenarios as any[]).find((e) => (clave === "conservador" ? /conservador/i : clave === "maximo" ? /m[aá]ximo/i : /^base/i).test(e.escenario))
    ?? (an.cabida.escenarios as any[]).find((e) => e.disponible);
  if (!esc?.disponible) return { encontrado: true as const, disponible: false as const, mensaje: "La norma de este predio no permite calcular una cabida." };
  const marco = await marcoLote(id);
  if (!marco) return { encontrado: true as const, disponible: false as const, mensaje: "Sin geometría del lote." };

  const mezcla = o.mezcla?.length ? o.mezcla : MEZCLA_DEFECTO;
  const F = o.crujia_m ?? 7.6, pas = o.pasillo_m ?? 1.6;
  const hPiso = o.altura_piso_m ?? 2.9, hPrimero = o.altura_primer_piso_m ?? 3.4;
  const pp = Math.max(0, Math.min(3, o.pisos_plataforma ?? 0));
  const tope = p.altura_max ? Number(p.altura_max) : null;

  // La norma volumétrica depende de la altura y la altura de la implantación: se itera hasta estabilizar.
  let pisos = Math.max(3, Number(esc.pisos_sobre_rasante) || 5);
  let res: Awaited<ReturnType<typeof implantar>> | null = null;
  let norma: NormaVol = normaVolumetrica(p.municipio_dane ?? "05001", pisos, o, { cbml: p.clave_local, area_lote: marco.area });
  for (let it = 0; it < 4; it++) {
    norma = normaVolumetrica(p.municipio_dane ?? "05001", pisos, o, { cbml: p.clave_local, area_lote: marco.area });
    const pf = puntoFijo({ pisos, altura_m: pisos * hPiso, viviendas_torre: 60, alcobas_torre: 120, area_piso_m2: 700 });
    res = await implantar(marco, norma, { F, pas, largo_max: o.largo_max_torre_m ?? 45, max_torres: o.max_torres ?? 6, mezcla, pf: { escaleras: pf.escaleras, ascensores: pf.ascensores, vestibulo: pf.a_prueba_de_humo } });
    if (!res.torres.length) break;
    // Cuántas torres conviene: con densidad limitante, menos torres y más altas aprovechan mejor la norma.
    const areaPlat = pp > 0 ? area(res.edificable) * pp : 0;
    let mejor: { k: number; pisos: number; area: number } | null = null;
    for (let k = 1; k <= res.torres.length; k++) {
      const sub = res.torres.slice(0, k);
      const aptosPiso = sub.reduce((s, t) => s + t.planta.aptos.length, 0);
      const areaPiso = sub.reduce((s, t) => s + t.planta.L * t.planta.D, 0);
      // Densidad: no pasar las unidades que permite la norma (el lobby del primer piso libera algunas).
      const lobbies = pp > 0 ? 0 : k;
      const porUnidades = Math.floor((Number(esc.unidades) + lobbies) / Math.max(aptosPiso, 1));
      const porArea = Math.floor(Math.max(0, Number(esc.area_construible_m2) - areaPlat) / Math.max(areaPiso, 1));
      let pk = Math.max(1, Math.min(porUnidades, Math.max(porArea, 1))) + pp;
      if (tope && pk > tope) pk = tope;
      const areaK = areaPiso * (pk - pp) + areaPlat;
      // Se prefiere la mayor área construida; con empate (±2 %), menos torres. Un solo piso de torre no es un edificio.
      if (pk - pp >= 2 && (!mejor || areaK > mejor.area * 1.02)) mejor = { k, pisos: pk, area: areaK };
    }
    if (!mejor) mejor = { k: 1, pisos: Math.max(2, Math.min(tope ?? 99, pisos)), area: 0 };
    res.torres = res.torres.slice(0, mejor.k);
    let nuevo = mejor.pisos;
    if (nuevo === pisos) break;
    pisos = nuevo;
  }
  if (!res || !res.torres.length) return { encontrado: true as const, disponible: false as const, mensaje: `Con la norma volumétrica (retiro lateral ${norma.lateral} m, frontal ${norma.frontal} m, entre torres ${norma.entre_torres} m) no cabe una torre de ${r2(2 * F + pas)} m de profundidad.` };

  // Punto fijo definitivo según pisos y unidades por torre, y nueva planta con ese núcleo.
  const pisosTorre = Math.max(1, pisos - pp);
  const torres: Torre[] = res.torres;
  const tMayor = torres.reduce((a, t) => (t.planta.aptos.length > a.planta.aptos.length ? t : a), torres[0]);
  const pf = puntoFijo({ pisos, altura_m: pisos * hPiso, viviendas_torre: tMayor.planta.aptos.length * pisosTorre,
    alcobas_torre: tMayor.planta.aptos.reduce((s, a) => s + Math.max(1, a.alcobas), 0) * pisosTorre, area_piso_m2: tMayor.planta.L * tMayor.planta.D });
  // Regenera las torres con el núcleo correcto conservando su posición.
  for (const t of torres) {
    const nueva = plantaTorre({ F, pasillo: pas, largo_max: t.planta.L, mezcla, n_escaleras: pf.escaleras, n_ascensores: pf.ascensores, vestibulo: pf.a_prueba_de_humo, esp_fachada: 0.15, esp_medianero: 0.15, esp_interior: 0.1 }, t.id);
    if (nueva && nueva.L <= t.planta.L + 0.01) t.planta = nueva;
  }
  const aptosTipo = torres.flatMap((t) => t.planta.aptos.map((a) => ({ ...a, torre: t.id })));

  // Primer piso (si no hay plataforma): en cada torre, el apartamento junto al núcleo del lado de la vía se vuelve lobby + portería + basuras.
  const cercania = (t: Torre, lado: "sur" | "norte") => {
    const nc = caja(t.planta.nucleo.poly);
    return t.planta.aptos.filter((a) => a.lado === lado).map((a) => ({ a, d: Math.min(Math.abs(caja(a.poly).x1 - nc.x0), Math.abs(caja(a.poly).x0 - nc.x1)) })).sort((x, y) => x.d - y.d).map((x) => x.a);
  };
  const aptosPiso0 = torres.reduce((s, t) => s + t.planta.aptos.length, 0);
  const u0 = aptosPiso0 * pisosTorre - (pp > 0 ? 0 : torres.length);
  const oblig = obligaciones(u0, pisos);
  // Equipamiento comunitario (1 m² por vivienda) en el primer piso junto al núcleo, hasta 2 espacios por torre; el resto se compensa.
  let faltaEquip = pp > 0 ? 0 : oblig.equipamiento_m2;
  const primerPiso = torres.map((t) => {
    const lobby = pp > 0 ? null : cercania(t, "sur")[0] ?? null;
    const equip: { id: string; poly: Pt[]; area: number }[] = [];
    for (const a of cercania(t, "norte").slice(0, 2)) { if (faltaEquip <= 0) break; equip.push({ id: a.id, poly: a.poly, area: a.area_privada }); faltaEquip -= a.area_privada; }
    return { torre: t.id, lobby: lobby?.id ?? null, lobby_poly: lobby?.poly ?? null, area_lobby: lobby ? lobby.area_privada : 0, equipamiento: equip, adaptables: [] as string[] };
  });
  const convertidos = new Set(primerPiso.flatMap((x) => [x.lobby, ...x.equipamiento.map((e) => e.id)].filter(Boolean) as string[]));
  // Viviendas adaptables (1 de cada 30): las del primer piso más cercanas al acceso.
  let nAdapt = oblig.viviendas_adaptables;
  for (const x of primerPiso) for (const a of torres.find((t) => t.id === x.torre)!.planta.aptos) { if (nAdapt > 0 && !convertidos.has(a.id) && pp === 0) { x.adaptables.push(a.id); nAdapt--; } }

  // Unidades totales
  const niveles: { nombre: string; tipo: "sotano" | "plataforma" | "primero" | "tipo"; z: number; altura: number }[] = [];
  const nPrimero = pp > 0 ? 0 : 1;
  const aptosPorPiso = aptosTipo.length;
  const unidades = aptosPorPiso * (pisosTorre - nPrimero) + (nPrimero ? aptosPorPiso - convertidos.size : 0);

  // Sótanos
  // Estrato estimado: mediana de los inmuebles en venta (Fynder) a 500 m.
  const [est] = await sql`SELECT percentile_disc(0.5) WITHIN GROUP (ORDER BY l.estrato) AS e FROM listing l, parcel q
    WHERE q.id = ${id} AND l.estrato BETWEEN 1 AND 6 AND l.geom && ST_Expand(q.geom, 0.005) AND ST_DWithin(l.geom::geography, q.geom::geography, 500)`;
  const estrato = o.estrato ?? (est?.e != null ? Number(est.e) : null);
  const parq = parqueaderos(p.municipio_dane ?? "05001", unidades, estrato);
  const nucleosLote = torres.map((t) => { const T = aLote(t); const c = caja(t.planta.nucleo.poly); return [T([c.x0, c.y0]), T([c.x1, c.y0]), T([c.x1, c.y1]), T([c.x0, c.y1])].map((q) => q) as Pt[]; })
    .map((pl) => { const c = caja(pl); return rect(c.x0, c.y0, c.x1, c.y1); });
  // Objetivo de parqueaderos: el de la constructora, sin pasar el tope de la norma (en Medellín los del art. 364 son máximos).
  const objPriv = Math.min(parq.privados, Math.ceil(unidades * (o.parqueo_privados_viv ?? 1)));
  const objVis = Math.min(parq.visitantes, Math.ceil(unidades * (o.parqueo_visitantes_viv ?? 0.2)));
  const objetivo = objPriv + objVis;
  const rp = rampa(3.0, objetivo);
  const sotanos: PlantaSotano[] = [];
  let puestos = 0;
  let areaSotanos = 0;
  for (let s = 1; s <= 6 && puestos < objetivo; s++) {
    const ps: any = plantaSotano(s, res.sotano, nucleosLote, { altura: 3.0, largo_rampa: rp.largo_m, ancho_rampa: rp.ancho_m, celda: parq.celda, calle: parq.calle, unidades, visitantes: s === 1 ? objVis : 0 });
    if (!ps.puestos.length) break;
    const faltan = objetivo - puestos, areaNivel = area(res.sotano);
    if (ps.puestos.length > faltan) {
      // Sótano parcial: solo la franja que se necesita desde la rampa (el resto no se excava)
      const usados = [...ps.puestos].sort((a: any, b: any) => a.poly[0][1] - b.poly[0][1] || a.poly[0][0] - b.poly[0][0]).slice(0, faltan);
      const yMax = Math.max(...usados.map((q: any) => q.poly[2][1])) + (parq.calle + 0.5);
      const fraccion = Math.min(1, Math.max(0.15, (yMax - caja(res.sotano).y0) / (caja(res.sotano).y1 - caja(res.sotano).y0)));
      ps.puestos = usados; ps.calles = ps.calles.filter((c: Pt[]) => caja(c).y0 < yMax); ps.depositos = ps.depositos.filter((d: Pt[]) => caja(d).y1 <= yMax);
      ps.parcial = { y_max: yMax, fraccion: Math.round(fraccion * 100) / 100 };
      areaSotanos += areaNivel * fraccion;
    } else areaSotanos += areaNivel;
    sotanos.push(ps); puestos += ps.puestos.length;
  }

  // Niveles (de abajo hacia arriba)
  sotanos.slice().reverse().forEach((s) => niveles.push({ nombre: `Sótano ${s.nivel}`, tipo: "sotano", z: -s.nivel * 3.0, altura: 3.0 }));
  let z = 0;
  for (let k = 0; k < pp; k++) { niveles.push({ nombre: `Plataforma ${k + 1}`, tipo: "plataforma", z, altura: 4.5 }); z += 4.5; }
  if (nPrimero) { niveles.push({ nombre: "Piso 1", tipo: "primero", z, altura: hPrimero }); z += hPrimero; }
  for (let k = nPrimero; k < pisosTorre; k++) { niveles.push({ nombre: `Piso ${pp + k + 1}`, tipo: "tipo", z: r2(z), altura: hPiso }); z += hPiso; }
  const altura = r2(z);

  // Cuadro de áreas
  const areaPisoTorres = torres.reduce((s, t) => s + t.planta.L * t.planta.D, 0);
  const areaPrivadaPiso = aptosTipo.reduce((s, a) => s + a.area_privada, 0);
  const areaComunPiso = areaPisoTorres - areaPrivadaPiso;
  const areaPlataforma = pp > 0 ? area(res.edificable) : 0;
  const construidaSobre = areaPisoTorres * pisosTorre + areaPlataforma * pp;
  const areaConvertida = aptosTipo.filter((a) => convertidos.has(a.id)).reduce((s, a) => s + a.area_privada, 0);
  const vendible = areaPrivadaPiso * (pisosTorre - nPrimero) + (nPrimero ? areaPrivadaPiso - areaConvertida : 0);
  const porTipologia = Object.values(PLANTILLAS).map((t) => {
    const enPiso = aptosTipo.filter((a) => a.tipologia === t.clave);
    const n = enPiso.length * (pisosTorre - nPrimero) + (nPrimero ? enPiso.filter((a) => !convertidos.has(a.id)).length : 0);
    return { tipologia: t.nombre, clave: t.clave, unidades: n, area_promedio_m2: enPiso.length ? r2(enPiso.reduce((s, a) => s + a.area_privada, 0) / enPiso.length) : 0, pct: 0 };
  }).filter((x) => x.unidades > 0);
  porTipologia.forEach((x) => (x.pct = Math.round((x.unidades / Math.max(unidades, 1)) * 100)));

  const resumen = {
    escenario: esc.escenario, torres: torres.length, pisos_totales: pisos, pisos_plataforma: pp, altura_m: altura, aptos_por_piso: aptosPorPiso, unidades,
    unidades_norma: esc.unidades, por_tipologia: porTipologia,
    area_construida_sobre_rasante_m2: Math.round(construidaSobre), area_construible_norma_m2: Math.round(Number(esc.area_construible_m2)),
    aprovechamiento_pct: Math.round((construidaSobre / Number(esc.area_construible_m2)) * 100),
    area_vendible_m2: Math.round(vendible), eficiencia_planta_pct: Math.round((areaPrivadaPiso / areaPisoTorres) * 100), area_comun_por_piso_m2: Math.round(areaComunPiso),
    indice_construccion: r2(construidaSobre / marco.area), indice_ocupacion: r2((pp > 0 ? areaPlataforma : areaPisoTorres) / marco.area),
    punto_fijo: pf, rampa: rp, obligaciones: { ...oblig, equipamiento_en_sitio_m2: Math.round(primerPiso.reduce((s, x) => s + x.equipamiento.reduce((t, e) => t + e.area, 0), 0)),
      equipamiento_a_compensar_m2: Math.max(0, Math.round(faltaEquip)) }, parqueaderos_nota: parq.nota, sotanos: sotanos.length, parqueaderos_dibujados: puestos, parqueaderos_exigidos: parq.total, parqueaderos_objetivo: objetivo, visitantes: objVis,
    depositos: sotanos.reduce((s, x) => s + x.depositos.length, 0), area_sotanos_m2: Math.round(areaSotanos), estrato: estrato,
    area_lote_m2: Math.round(marco.area), area_edificable_m2: Math.round(area(res.edificable)),
  };
  return {
    encontrado: true as const, disponible: true as const, predio: id, barrio: p.barrio_catastral ?? null, municipio: p.municipio ?? null, municipio_dane: p.municipio_dane,
    marco: { ...marco, srid: 9377 }, norma, edificable: res.edificable, sotano_poligono: res.sotano, torres, primer_piso: primerPiso, sotanos, niveles, resumen,
    opciones: { ...o, mezcla, crujia_m: F, pasillo_m: pas, altura_piso_m: hPiso, altura_primer_piso_m: hPrimero },
    aviso: "Anteproyecto esquemático generado automáticamente para prefactibilidad. La norma volumétrica cargada está digitalizada y pendiente de validar; el arquitecto debe verificar retiros, aislamientos, NSR-10 (evacuación y estructura), norma de parqueaderos y redes, y desarrollar el diseño.",
  };
}

/** Ubica torres iguales dentro del área edificable, probando de la más larga a la más corta y ambas orientaciones. */
async function implantar(m: MarcoLote, n: NormaVol, o: { F: number; pas: number; largo_max: number; max_torres: number; mezcla: Mezcla; pf: { escaleras: number; ascensores: number; vestibulo: boolean } }) {
  // Torre normal (eje largo en X): sus culatas cerradas miran a los linderos laterales y las fachadas abiertas al frente y al fondo.
  // Torre girada: las fachadas abiertas miran a los linderos laterales. Se calcula un área edificable para cada caso.
  const { edificable: E, sotano } = await edificable(m.lote, Math.min(n.cabecera, n.lateral), n.frontal, n.fondo);
  const { edificable: Eg } = await edificable(m.lote, n.lateral, n.frontal, n.fondo);
  const torres: Torre[] = [];
  if (E.length < 3) return { torres, edificable: E, sotano };
  const b = caja(E);
  // Separación según qué caras se enfrentan: larga-larga (abiertas) 12 m, culata-culata 3 m, mixta 6 m.
  const sepOk = (a: Torre, r: Pt[], rotada: boolean) => {
    const A = caja(a.huella), B = caja(r);
    const dx = Math.max(0, Math.max(A.x0, B.x0) - Math.min(A.x1, B.x1)), dy = Math.max(0, Math.max(A.y0, B.y0) - Math.min(A.y1, B.y1));
    const sepX = !a.rotada && !rotada ? n.entre_cabeceras : a.rotada && rotada ? n.entre_torres : n.entre_abierta_cerrada;
    const sepY = !a.rotada && !rotada ? n.entre_torres : a.rotada && rotada ? n.entre_cabeceras : n.entre_abierta_cerrada;
    return dx >= sepX - 0.01 || dy >= sepY - 0.01;
  };
  for (let largo = o.largo_max; largo >= 14 && torres.length < o.max_torres; largo -= 3) {
    const planta = plantaTorre({ F: o.F, pasillo: o.pas, largo_max: largo, mezcla: o.mezcla, n_escaleras: o.pf.escaleras, n_ascensores: o.pf.ascensores, vestibulo: o.pf.vestibulo, esp_fachada: 0.15, esp_medianero: 0.15, esp_interior: 0.1 });
    if (!planta) continue;
    for (const rotada of [false, true]) {
      const w = rotada ? planta.D : planta.L, h = rotada ? planta.L : planta.D;
      for (let y = b.y0; y + h <= b.y1 && torres.length < o.max_torres; y += 1) for (let x = b.x0; x + w <= b.x1 && torres.length < o.max_torres; x += 1) {
        const r = rect(x, y, x + w, y + h);
        if (!torres.every((t) => sepOk(t, r, rotada))) continue;
        if (!rectDentro(r, rotada ? Eg : E)) continue;
        const id = String.fromCharCode(65 + torres.length);
        const pl = plantaTorre({ F: o.F, pasillo: o.pas, largo_max: largo, mezcla: o.mezcla, n_escaleras: o.pf.escaleras, n_ascensores: o.pf.ascensores, vestibulo: o.pf.vestibulo, esp_fachada: 0.15, esp_medianero: 0.15, esp_interior: 0.1 }, id)!;
        torres.push({ id, origen: [r2(x), r2(y)], rotada, planta: pl, huella: r });
      }
    }
  }
  return { torres, edificable: E, sotano };
}
