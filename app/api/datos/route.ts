// Datos para el workspace: /api/datos?tipo=predio&id=... | proyecto&id=... | mercado&lat&lon | oportunidades&municipio | cobertura
import { cobertura } from "@/lib/buscar";
import { fichaPredio } from "@/lib/ficha";
import { mercadoZona } from "@/lib/mercado";
import { oportunidades } from "@/lib/oportunidades";
import { fichaProyecto } from "@/lib/proyectos";
import { contactoPredio } from "@/lib/contacto";

export const maxDuration = 60;

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const num = (k: string) => (q.get(k) === null ? undefined : Number(q.get(k)));
  try {
    switch (q.get("tipo")) {
      case "predio": return Response.json(await fichaPredio({ id: q.get("id") ?? undefined, lat: num("lat"), lon: num("lon") }));
      case "contacto": return Response.json(await contactoPredio({ id: q.get("id") ?? undefined }));
      case "proyecto": return Response.json(await fichaProyecto(Number(q.get("id"))));
      case "mercado": return Response.json(await mercadoZona({ lat: num("lat"), lon: num("lon"), radio_m: num("radio") ?? 1500, municipio: q.get("municipio") ?? undefined }));
      case "oportunidades": return Response.json(await oportunidades({ municipio: q.get("municipio") ?? undefined, limite: 25 }));
      case "cobertura": return Response.json(await cobertura());
      default: return Response.json({ error: "tipo desconocido" }, { status: 400 });
    }
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
