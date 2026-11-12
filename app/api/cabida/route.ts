// Anteproyecto esquemático (cabida arquitectónica): GET /api/cabida?id=…&formato=json|zip|pdf|dxf|dxf3d|xlsx|svg(&plancha=n)
// Opciones: escenario, estrato, pisos_plataforma, crujia_m, mezcla ("1A:20,2A:55,3A:25"), retiro_frontal_m, retiro_lateral_m,
// retiro_fondo_m, separacion_torres_m, max_torres, largo_max_torre_m.
import { anteproyecto, type OpcionesProyecto } from "@/lib/cabida/proyecto";
import { planchas } from "@/lib/cabida/planos";
import { aDxf, aPdf, aSvg } from "@/lib/cabida/lienzo";
import { excelAreas, geojsonMapa, modelo3dDxf, paquete, vista3d } from "@/lib/cabida/entregables";

export const maxDuration = 120;

export function opcionesDe(q: URLSearchParams): OpcionesProyecto {
  const n = (k: string) => (q.get(k) !== null && q.get(k) !== "" ? Number(q.get(k)) : undefined);
  const mezcla = q.get("mezcla") ? String(q.get("mezcla")).split(",").map((x) => { const [t, p] = x.split(":"); return { tipologia: t.trim(), pct: Number(p) }; }).filter((x) => x.pct > 0) : undefined;
  return { escenario: (q.get("escenario") as any) ?? undefined, estrato: n("estrato"), pisos_plataforma: n("pisos_plataforma"), crujia_m: n("crujia_m"), mezcla,
    retiro_frontal_m: n("retiro_frontal_m"), retiro_lateral_m: n("retiro_lateral_m"), retiro_fondo_m: n("retiro_fondo_m"), separacion_torres_m: n("separacion_torres_m"),
    max_torres: n("max_torres"), largo_max_torre_m: n("largo_max_torre_m") };
}

const archivo = (buf: Uint8Array | Buffer | string, tipo: string, nombre: string) =>
  new Response(typeof buf === "string" ? buf : new Uint8Array(buf), { headers: { "content-type": tipo, "content-disposition": `attachment; filename="${nombre.replace(/[^\w\- .()]+/g, "")}"` } });

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const m: any = await anteproyecto(String(q.get("id") ?? ""), opcionesDe(q));
  if (!m.encontrado) return Response.json(m, { status: 404 });
  const formato = q.get("formato") ?? "json";
  if (!m.disponible) return Response.json(m, { status: formato === "json" ? 200 : 422 });
  const base = `Anteproyecto ${String(m.predio).replace(":", "-")}`;
  if (formato === "json") {
    const pl = planchas(m);
    return Response.json({ encontrado: true, disponible: true, predio: m.predio, barrio: m.barrio, municipio: m.municipio, resumen: m.resumen, norma: m.norma,
      torres: m.torres.map((t: any) => ({ id: t.id, largo: t.planta.L, ancho: t.planta.D, aptos_por_piso: t.planta.aptos.length, rotada: t.rotada })),
      primer_piso: m.primer_piso.map((x: any) => ({ torre: x.torre, lobby: x.lobby, equipamiento: x.equipamiento.map((e: any) => e.id), adaptables: x.adaptables })),
      planchas: pl.map((p) => ({ numero: p.numero, titulo: p.titulo, escala: p.escala })), vista3d: vista3d(m), mapa: await geojsonMapa(m), opciones: m.opciones, aviso: m.aviso });
  }
  if (formato === "svg") {
    const pl = planchas(m); const n = Math.min(pl.length, Math.max(1, Number(q.get("plancha") ?? 1)));
    return new Response(aSvg(pl[n - 1], Number(q.get("ancho") ?? 2000)), { headers: { "content-type": "image/svg+xml", "cache-control": "private, max-age=600" } });
  }
  if (formato === "zip") { const z = await paquete(m); return archivo(z.buffer, "application/zip", `${z.nombre}.zip`); }
  if (formato === "pdf") return archivo(await aPdf(planchas(m), base), "application/pdf", `${base} - Planchas.pdf`);
  if (formato === "dxf") return archivo(aDxf(planchas(m)), "application/dxf", `${base} - Planos.dxf`);
  if (formato === "dxf3d") return archivo(modelo3dDxf(m), "application/dxf", `${base} - Modelo 3D.dxf`);
  if (formato === "xlsx") return archivo(await excelAreas(m), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", `${base} - Cuadro de areas.xlsx`);
  return Response.json({ error: "Formato desconocido" }, { status: 400 });
}
