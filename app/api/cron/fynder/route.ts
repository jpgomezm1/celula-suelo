// Cron diario de Vercel: sincroniza Fynder (vistas celula_export, solo lectura) → célula.
import { sincronizarFynder } from "@/sync/fynder";

export const maxDuration = 300;

export async function GET(req: Request) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("No autorizado", { status: 401 });
  }
  try {
    return Response.json({ ok: true, resultado: await sincronizarFynder() });
  } catch (e) {
    return Response.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
