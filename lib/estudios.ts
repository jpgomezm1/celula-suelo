import { randomBytes } from "node:crypto";
import { sql } from "./db";
import { estudioCompetencia, type EstudioInput } from "./estudio";

const base = () => process.env.PUBLIC_URL ?? "http://localhost:3077";

export async function crearEstudio(input: EstudioInput) {
  const resultado: any = await estudioCompetencia(input);
  if (resultado.error) return resultado;
  const id = `e_${new Date().toISOString().slice(0, 10).replace(/-/g, "")}_${randomBytes(4).toString("hex")}`;
  await sql`INSERT INTO estudio (id, nombre, entrada, resultado) VALUES (${id}, ${input.nombre ?? null}, ${JSON.stringify(input)}, ${JSON.stringify(resultado)})`;
  return {
    id, ...resultado,
    excel: `${base()}/api/estudio/${id}/xlsx`,
    siguiente_paso: "Redacta los textos del paso 4 (zona, referencias, vías, transporte, comercio, valorización), las recomendaciones del paso 9 y la conclusión con estos hechos, y guárdalos con completar_estudio para que queden en el Excel.",
  };
}

export async function completarEstudio(id: string, textos: Record<string, unknown>) {
  const r = await sql`UPDATE estudio SET textos = textos || ${JSON.stringify(textos)}::jsonb, actualizado = now() WHERE id = ${id} RETURNING id`;
  if (!r.length) return { ok: false, mensaje: `No existe el estudio ${id}` };
  return { ok: true, id, excel: `${base()}/api/estudio/${id}/xlsx` };
}

export async function obtenerEstudio(id: string) {
  return (await sql`SELECT * FROM estudio WHERE id = ${id}`)[0] ?? null;
}

export async function crearEstudioPerfil(perfil: import("./perfil_edificio").PerfilEdificio) {
  const { oportunidadesPorPerfil } = await import("./perfil_edificio");
  const resultado: any = await oportunidadesPorPerfil(perfil);
  if (resultado.error) return resultado;
  resultado.tipo = "perfil";
  const id = `p_${new Date().toISOString().slice(0, 10).replace(/-/g, "")}_${randomBytes(4).toString("hex")}`;
  await sql`INSERT INTO estudio (id, nombre, entrada, resultado) VALUES (${id}, ${resultado.estudio}, ${JSON.stringify(perfil)}, ${JSON.stringify(resultado)})`;
  return { id, ...resultado, excel: `${base()}/api/estudio/${id}/xlsx`, kmz_google_earth: `${base()}/api/estudio/${id}/kmz` };
}
