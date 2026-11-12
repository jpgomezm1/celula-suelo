// Consulta de norma desde el workspace: un lote (cbml, id, matricula, direccion, lat/lon) o varios ({ kml } o { lotes }).
import { consultaNorma, consultaNormaLotes } from "@/lib/consulta_norma";

export const maxDuration = 120;

export async function POST(req: Request) {
  try {
    const b = await req.json();
    if (b.kml || Array.isArray(b.lotes)) return Response.json(await consultaNormaLotes(b));
    return Response.json(await consultaNorma(b));
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
