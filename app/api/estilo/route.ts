// Perfiles de estilo de arquitectos: lista y crea/actualiza. Protegido por el proxy (sesión del workspace).
import { guardarEstilo, listarEstilos } from "@/lib/estilo";

export async function GET() {
  return Response.json(await listarEstilos());
}

export async function POST(req: Request) {
  const b = await req.json().catch(() => null);
  if (!b) return Response.json({ error: "Cuerpo no válido" }, { status: 400 });
  const r: any = await guardarEstilo(b);
  return Response.json(r, { status: r?.error ? 400 : 200 });
}
