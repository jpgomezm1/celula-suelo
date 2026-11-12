// Cron diario de Vercel: monitor normativo (documentos nuevos del POT y normas en el portal de la Alcaldía de Medellín).
import { revisarNovedades } from "@/lib/monitor_normativo";

export const maxDuration = 300;

export async function GET(req: Request) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("No autorizado", { status: 401 });
  }
  return Response.json(await revisarNovedades());
}
