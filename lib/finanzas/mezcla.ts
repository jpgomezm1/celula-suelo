// Mezcla óptima de producto: prueba mezclas de apartamentos sobre el mismo lote (anteproyecto + números) y ordena
// por lo que más le sirve a la constructora: el valor máximo que puede pagar por el lote o, si ya hay precio, la utilidad.
// Búsqueda en dos pasos: grilla gruesa (pasos de 20 %) y ajuste fino (±10 %) alrededor de la mejor.
import { anteproyecto, type OpcionesProyecto } from "../cabida/proyecto";
import { modeloFinanciero } from "./modelo";
import type { PerfilConstructora } from "../constructora/perfil";

type Mezcla = Record<"estudio" | "1A" | "2A" | "3A", number>;
const TIPOS = ["estudio", "1A", "2A", "3A"] as const;
const clave = (x: Mezcla) => TIPOS.map((t) => x[t]).join("/");
const aLista = (x: Mezcla) => TIPOS.filter((t) => x[t] > 0).map((t) => ({ tipologia: t, pct: x[t] }));
export const textoMezcla = (x: Mezcla) => TIPOS.filter((t) => x[t] > 0).map((t) => `${t === "estudio" ? "Estudio" : t} ${x[t]} %`).join(" · ");

export type OpcionesMezcla = { costo_lote?: number; max_estudio_pct?: number; max_por_tipo_pct?: number; estrato?: number; segundos?: number };

export async function mezclaOptima(id: string, base: OpcionesProyecto, perfil: PerfilConstructora, o: OpcionesMezcla = {}) {
  const maxEst = o.max_estudio_pct ?? 20, maxTipo = o.max_por_tipo_pct ?? 60;
  const fin = Date.now() + (o.segundos ?? 80) * 1000;
  const vistos = new Map<string, any>();
  const evaluar = async (x: Mezcla) => {
    const k = clave(x);
    if (vistos.has(k)) return vistos.get(k);
    const m: any = await anteproyecto(id, { ...base, mezcla: aLista(x) });
    if (!m.disponible) { vistos.set(k, null); return null; }
    const f: any = await modeloFinanciero(m, perfil, { costo_lote: o.costo_lote, estrato: o.estrato ?? m.resumen.estrato, sin_sensibilidades: true });
    const real = (m.resumen.por_tipologia as any[]).map((t) => `${t.tipologia} ${t.pct} %`).join(" · ");
    const r = { mezcla: x, pedida: textoMezcla(x), texto: real, firma: (m.resumen.por_tipologia as any[]).map((t) => `${t.tipologia}:${t.unidades}`).join(",") + `|${m.resumen.torres}|${m.resumen.pisos_totales}`, unidades: m.resumen.unidades, torres: m.resumen.torres, pisos: m.resumen.pisos_totales, area_vendible_m2: m.resumen.area_vendible_m2,
      aprovechamiento_pct: m.resumen.aprovechamiento_pct, ventas: f.resultado.ventas, utilidad: f.resultado.utilidad, margen_pct: f.resultado.margen_pct, tir_ea_pct: f.resultado.tir_ea_pct,
      meses_de_ventas: f.resultado.meses_de_ventas, exposicion_maxima: f.resultado.exposicion_maxima, valor_maximo_lote: f.lote.valor_maximo, veredicto: f.veredicto };
    vistos.set(k, r); return r;
  };
  // Con precio de lote: la utilidad; sin precio: lo máximo que se puede pagar por el lote (desempata la utilidad).
  const puntaje = (r: any) => (r == null ? -Infinity : o.costo_lote != null ? r.utilidad : r.valor_maximo_lote * 1e3 + r.utilidad / 1e3);
  const valida = (x: Mezcla) => TIPOS.every((t) => x[t] >= 0) && x.estudio <= maxEst && TIPOS.every((t) => x[t] <= maxTipo) && TIPOS.reduce((s, t) => s + x[t], 0) === 100;

  // Mezcla actual (la del perfil o la pedida) como referencia
  const actual: Mezcla = { estudio: 0, "1A": 0, "2A": 0, "3A": 0 };
  const lb = base.mezcla?.length ? base.mezcla : perfil.diseno.mezcla;
  const tot = lb.reduce((s, x) => s + x.pct, 0) || 100;
  for (const x of lb) if ((TIPOS as readonly string[]).includes(x.tipologia)) actual[x.tipologia as keyof Mezcla] = Math.round((x.pct / tot) * 10) * 10;
  const dif = 100 - TIPOS.reduce((s, t) => s + actual[t], 0); actual["2A"] += dif;
  const ref = await evaluar(actual);

  // 1) Grilla gruesa
  const grilla: Mezcla[] = [];
  for (let e = 0; e <= maxEst; e += 20) for (let a = 0; a <= 100; a += 20) for (let b = 0; b <= 100; b += 20) { const c = 100 - e - a - b; const x = { estudio: e, "1A": a, "2A": b, "3A": c }; if (c >= 0 && valida(x)) grilla.push(x); }
  for (const x of grilla) { if (Date.now() > fin) break; await evaluar(x); }
  // 2) Ajuste fino: mover 10 puntos entre dos tipologías mientras mejore
  let mejor = [...vistos.values()].filter(Boolean).sort((a, b) => puntaje(b) - puntaje(a))[0];
  for (let it = 0; it < 4 && mejor && Date.now() < fin; it++) {
    let mejoro = false;
    for (const de of TIPOS) for (const a of TIPOS) {
      if (de === a || Date.now() > fin) continue;
      const x = { ...mejor.mezcla, [de]: mejor.mezcla[de] - 10, [a]: mejor.mezcla[a] + 10 } as Mezcla;
      if (!valida(x)) continue;
      const r = await evaluar(x);
      if (puntaje(r) > puntaje(mejor)) { mejor = r; mejoro = true; }
    }
    if (!mejoro) break;
  }
  const unicos = new Map<string, any>();
  for (const r of [...vistos.values()].filter(Boolean).sort((a, b) => puntaje(b) - puntaje(a))) if (!unicos.has(r.firma)) unicos.set(r.firma, r);
  const ranking = [...unicos.values()];
  const top = ranking[0];
  const criterio = o.costo_lote != null ? "utilidad con el precio de lote dado" : "valor máximo que se puede pagar por el lote";
  const ganancia = top && ref ? (o.costo_lote != null ? top.utilidad - ref.utilidad : top.valor_maximo_lote - ref.valor_maximo_lote) : 0;
  return {
    criterio, evaluadas: vistos.size, edificios_distintos: unicos.size, actual: ref, mejor: top, ranking: ranking.slice(0, 8), ganancia,
    lectura: top && ref
      ? top.firma === ref.firma ? `La mezcla actual (${ref.texto}) ya es la que más rinde entre ${vistos.size} probadas.`
        : `Cambiar a ${top.texto} ${o.costo_lote != null ? `sube la utilidad en $${Math.round(ganancia / 1e6).toLocaleString("es-CO")} M` : `permite pagar $${Math.round(ganancia / 1e6).toLocaleString("es-CO")} M más por el lote`} frente a la mezcla actual (${ref.texto}), con ${top.unidades} viviendas y ${top.meses_de_ventas} meses de ventas.`
      : "No se pudo evaluar la mezcla.",
    advertencias: [
      `Se limitó a ${maxTipo} % por tipología y ${maxEst} % de apartaestudios para no concentrar el riesgo comercial en un solo producto.`,
      "La velocidad de ventas es la del mercado en unidades por mes: una mezcla con más unidades pequeñas tarda más en venderse, y eso ya entra en la TIR.",
      "El edificio reparte los apartamentos por planta (las esquinas favorecen los de 3 alcobas), así que la mezcla real puede diferir de la pedida; se muestra la real.",
      "El precio por m² según el área sale de los comparables de Galería; si hay pocos comparables, confirmar la demanda por tipología con el área comercial.",
    ],
  };
}
