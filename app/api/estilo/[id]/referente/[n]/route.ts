// Imagen de un referente. Con sesión del workspace, o con un token firmado de 7 días (?t=) para usarla como referencia en otra herramienta.
import { sql } from "@/lib/db";
import { borrarReferente, esquemaEstilo } from "@/lib/estilo";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string; n: string }> }) {
  const { id, n } = await ctx.params;
  await esquemaEstilo();
  const [r]: any = await sql`SELECT mime, datos FROM estilo_referente WHERE estilo_id = ${id} AND n = ${Number(n)}`;
  if (!r) return new Response("No encontrado", { status: 404 });
  return new Response(new Uint8Array(r.datos), { headers: { "content-type": r.mime, "cache-control": "private, max-age=3600" } });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string; n: string }> }) {
  const { id, n } = await ctx.params;
  return Response.json(await borrarReferente(id, Number(n)));
}
