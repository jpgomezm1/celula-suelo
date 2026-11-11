// Carga una exportación de Galería Inmobiliaria.
// · Desde el workspace: el navegador lee el Excel y envía JSON { filas, corte, nombre } (Vercel limita las peticiones a 4,5 MB).
// · Desde scripts: POST /api/galeria?corte=YYYY-MM-DD&nombre=archivo.xlsx con el .xlsx como cuerpo (solo archivos pequeños en Vercel).
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { importarFilasGaleria, importarGaleria } from "@/ingest/galeria";

export const maxDuration = 300;

const corteValido = (c: unknown) => (typeof c === "string" && /^\d{4}-\d{2}-\d{2}$/.test(c) ? c : new Date().toISOString().slice(0, 8) + "01");

export async function POST(req: Request) {
  try {
    if ((req.headers.get("content-type") ?? "").includes("application/json")) {
      const b = await req.json();
      if (!Array.isArray(b.filas) || !b.filas.length) return Response.json({ error: "No encontré proyectos en el archivo (se busca una fila con 'Código' y 'Proyecto')." }, { status: 400 });
      if (b.filas.length > 5000) return Response.json({ error: "Demasiadas filas" }, { status: 400 });
      return Response.json(await importarFilasGaleria(b.filas, corteValido(b.corte), String(b.nombre ?? "galeria.xlsx").slice(0, 120)));
    }
    const q = new URL(req.url).searchParams;
    const nombre = (q.get("nombre") || "galeria.xlsx").replace(/[^\w.\-]+/g, "_");
    const datos = Buffer.from(await req.arrayBuffer());
    if (datos.length < 100 || datos.subarray(0, 2).toString() !== "PK") {
      return Response.json({ error: "El cuerpo no es un archivo .xlsx" }, { status: 400 });
    }
    const ruta = join(tmpdir(), `galeria-${Date.now()}-${nombre}`);
    writeFileSync(ruta, datos);
    return Response.json(await importarGaleria(ruta, corteValido(q.get("corte"))));
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
