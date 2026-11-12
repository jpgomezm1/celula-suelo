// Fachada del lote (Street View): /api/fachada?id=…  → JSON;  &img=1 → imagen JPG.
import { fachadaLote, imagenFachada } from "@/lib/fachada";

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const id = String(q.get("id") ?? "");
  const f: any = await fachadaLote(id);
  if (!q.get("img")) return Response.json(f);
  if (!f.disponible) return new Response(f.motivo, { status: 404 });
  const img = await imagenFachada(f.pano, Number(q.get("heading") ?? f.heading), Number(q.get("w") ?? 640), Number(q.get("h") ?? 400));
  if (!img) return new Response("No se pudo traer la imagen", { status: 502 });
  return new Response(img, { headers: { "content-type": "image/jpeg", "cache-control": "private, max-age=3600" } });
}
