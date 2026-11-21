import { borrarEstilo, verEstilo } from "@/lib/estilo";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const e = await verEstilo(id, false);
  return e ? Response.json(e) : Response.json({ error: "No encontrado" }, { status: 404 });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return Response.json(await borrarEstilo(id));
}
