// Sube un referente (imagen en base64, ya reducida en el navegador para no pasar el límite de 4,5 MB por petición).
import { agregarReferente } from "@/lib/estilo";

export const maxDuration = 60;

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const b = await req.json().catch(() => null);
  if (!b?.b64 && !b?.url) return Response.json({ error: "Falta la imagen" }, { status: 400 });
  const r: any = await agregarReferente(id, b);
  return Response.json(r, { status: r?.error ? 400 : 200 });
}
