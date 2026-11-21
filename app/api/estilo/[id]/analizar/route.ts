import { analizarEstilo } from "@/lib/estilo";

export const maxDuration = 120;

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const r: any = await analizarEstilo(id);
  return Response.json(r, { status: r?.error ? 400 : 200 });
}
