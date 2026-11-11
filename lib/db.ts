import { neon } from "@neondatabase/serverless";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("Falta DATABASE_URL");

/** Cliente HTTP de Neon: apto para funciones serverless (sin conexiones persistentes). */
export const sql = neon(url);

export type Procedencia = { fuente: string; nombre: string; fecha: string; tipo: string; licencia: string | null; notas: string | null };

/** Última captura de cada fuente, para adjuntar procedencia a cada bloque de una respuesta. */
export async function procedencias(): Promise<Record<string, Procedencia>> {
  const rows = await sql`
    SELECT DISTINCT ON (fuente) fuente, nombre, to_char(fetched_at, 'YYYY-MM-DD') AS fecha, tipo_dato AS tipo, licencia, notas
    FROM source_snapshot WHERE registros IS NOT NULL ORDER BY fuente, fetched_at DESC`;
  return Object.fromEntries(rows.map((r) => [r.fuente, r as Procedencia]));
}
