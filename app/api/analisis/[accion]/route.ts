// Herramientas de análisis para el workspace (las mismas del MCP): comparar, cartera, zona, cambio de POT, novedades y capa de Galería.
import { analizarCartera, analizarZona, cambioPot, compararLotes, novedadesNormativas, resumenLote } from "@/lib/herramientas";
import { sql } from "@/lib/db";
import { volumenesLote } from "@/lib/volumen";
import { topografiaLote } from "@/lib/topografia";
import { entornoLote } from "@/lib/entorno";

export const maxDuration = 300;

export async function POST(req: Request, ctx: { params: Promise<{ accion: string }> }) {
  const { accion } = await ctx.params;
  try {
    const b = await req.json().catch(() => ({}));
    if (accion === "comparar") return Response.json(await compararLotes(b.lotes ?? [], b));
    if (accion === "cartera") return Response.json(await analizarCartera(b));
    if (accion === "zona") return Response.json(await analizarZona(b.poligono, b.nombre));
    if (accion === "cambio_pot") return Response.json(await cambioPot(b));
    return Response.json({ error: "Acción desconocida" }, { status: 404 });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function GET(req: Request, ctx: { params: Promise<{ accion: string }> }) {
  const { accion } = await ctx.params;
  if (accion === "volumen") {
    const q = new URL(req.url).searchParams;
    const v: any = await volumenesLote(String(q.get("id") ?? ""), { ocupacion: q.get("ocupacion") ? Number(q.get("ocupacion")) : undefined });
    if (!v.encontrado) return Response.json(v, { status: 404 });
    const { analisis, ...resto } = v;
    return Response.json(resto);
  }
  if (accion === "topografia") {
    const q = new URL(req.url).searchParams;
    return Response.json(await topografiaLote(String(q.get("id") ?? ""), { recalcular: q.get("recalcular") === "1" }));
  }
  if (accion === "entorno") {
    const q = new URL(req.url).searchParams;
    return Response.json(await entornoLote(String(q.get("id") ?? ""), Math.min(400, Number(q.get("radio") ?? 150))));
  }
  if (accion === "resumen") return Response.json(await resumenLote(String(new URL(req.url).searchParams.get("id") ?? "")));
  if (accion === "novedades") return Response.json(await novedadesNormativas(Number(new URL(req.url).searchParams.get("dias") ?? 60)));
  if (accion === "galeria") {
    const rows = await sql`SELECT codigo, proyecto, construye, sub_zona, precio_m2_oferta, ventas_prom_semestre_un, unidades_disponibles, unidades_por_lanzar, pct_vendido,
                                  ubicacion_metodo, ST_X(geom) AS lon, ST_Y(geom) AS lat FROM galeria_vigente WHERE geom IS NOT NULL AND (tipo IS NULL OR tipo ILIKE 'Apto%')`;
    return Response.json({ type: "FeatureCollection", features: rows.map((r: any) => ({ type: "Feature", geometry: { type: "Point", coordinates: [Number(r.lon), Number(r.lat)] },
      properties: { codigo: r.codigo, proyecto: r.proyecto, construye: r.construye, zona: r.sub_zona, precio_m2: Number(r.precio_m2_oferta) || 0,
        ventas_mes: Number(r.ventas_prom_semestre_un) || 0, oferta: Number(r.unidades_disponibles) || 0, por_lanzar: Number(r.unidades_por_lanzar) || 0,
        vendido: Number(r.pct_vendido) || 0, aprox: ["barrio", "municipio", "sector"].includes(r.ubicacion_metodo) } })) });
  }
  return Response.json({ error: "Acción desconocida" }, { status: 404 });
}
