// Lee las opciones del anteproyecto desde parámetros de URL.
import type { OpcionesProyecto } from "./proyecto";

export function opcionesDe(q: URLSearchParams): OpcionesProyecto {
  const n = (k: string) => (q.get(k) !== null && q.get(k) !== "" ? Number(q.get(k)) : undefined);
  const mezcla = q.get("mezcla") ? String(q.get("mezcla")).split(",").map((x) => { const [t, p] = x.split(":"); return { tipologia: t.trim(), pct: Number(p) }; }).filter((x) => x.pct > 0) : undefined;
  return { escenario: (q.get("escenario") as any) ?? undefined, estrato: n("estrato"), pisos_plataforma: n("pisos_plataforma"), crujia_m: n("crujia_m"), mezcla,
    retiro_frontal_m: n("retiro_frontal_m"), retiro_lateral_m: n("retiro_lateral_m"), retiro_fondo_m: n("retiro_fondo_m"), separacion_torres_m: n("separacion_torres_m"),
    max_torres: n("max_torres"), largo_max_torre_m: n("largo_max_torre_m") };
}
