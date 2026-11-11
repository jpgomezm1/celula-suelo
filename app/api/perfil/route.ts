// Estudio general de oportunidades por perfil de edificio (POST JSON con el perfil).
import { crearEstudioPerfil } from "@/lib/estudios";

export const maxDuration = 120;

export async function POST(req: Request) {
  try {
    return Response.json(await crearEstudioPerfil(await req.json()));
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
