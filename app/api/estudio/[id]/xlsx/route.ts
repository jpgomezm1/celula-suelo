// Descarga del estudio en Excel (formato de estudio de competencia, Etapa 1). Protegido por el proxy (clave del workspace).
import { obtenerEstudio } from "@/lib/estudios";
import { carteraAExcel, estudioAExcel, perfilAExcel } from "@/lib/estudio_excel";

export const maxDuration = 60;

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const e = await obtenerEstudio(id);
  if (!e) return new Response("Estudio no encontrado", { status: 404 });
  const buf = e.resultado?.tipo === "perfil" ? await perfilAExcel(e.resultado) : e.resultado?.tipo === "cartera" ? await carteraAExcel(e.resultado) : await estudioAExcel(e.resultado, e.textos);
  const nombre = `${(e.nombre ?? "estudio").replace(/[^\w\- ]+/g, "").trim() || "estudio"} - ${e.resultado?.tipo === "perfil" ? "oportunidades" : e.resultado?.tipo === "cartera" ? "cartera" : "competencia"}.xlsx`;
  return new Response(new Uint8Array(buf), {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="${nombre}"`,
    },
  });
}
