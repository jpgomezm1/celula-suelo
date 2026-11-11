// Crea un estudio de competencia desde el workspace (POST JSON con lote, polígono y filtros).
import { crearEstudio } from "@/lib/estudios";

export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    return Response.json(await crearEstudio(await req.json()));
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
