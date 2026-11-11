// Usuarios con correo y clave (tabla app_usuario, hash scrypt). Además se acepta el usuario de APP_USER / APP_PASSWORD.
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { sql } from "./db";
import { credencialesValidas } from "./auth";

const scrypt = promisify(scryptCb) as (clave: string, sal: Buffer, largo: number) => Promise<Buffer>;

export async function hashClave(clave: string) {
  const sal = randomBytes(16);
  const h = await scrypt(clave, sal, 64);
  return `scrypt$${sal.toString("base64")}$${h.toString("base64")}`;
}

async function claveCoincide(clave: string, guardado: string) {
  const [alg, sal, hash] = guardado.split("$");
  if (alg !== "scrypt" || !sal || !hash) return false;
  const esperado = Buffer.from(hash, "base64");
  const h = await scrypt(clave, Buffer.from(sal, "base64"), esperado.length);
  return timingSafeEqual(h, esperado);
}

/** Devuelve el identificador del usuario si el correo (o usuario) y la clave son válidos. */
export async function validarUsuario(usuario: string, clave: string): Promise<string | null> {
  const id = usuario.trim().toLowerCase();
  if (!id || !clave) return null;
  if (credencialesValidas(usuario, clave)) return usuario.trim();
  const [u] = await sql`SELECT email, clave_hash FROM app_usuario WHERE email = ${id} AND activo`;
  if (!u || !(await claveCoincide(clave, u.clave_hash))) return null;
  await sql`UPDATE app_usuario SET ultimo_ingreso = now() WHERE email = ${id}`;
  return u.email;
}

export async function crearUsuario(email: string, clave: string, nombre?: string) {
  const id = email.trim().toLowerCase();
  await sql`INSERT INTO app_usuario (email, nombre, clave_hash) VALUES (${id}, ${nombre ?? null}, ${await hashClave(clave)})
            ON CONFLICT (email) DO UPDATE SET clave_hash = EXCLUDED.clave_hash, nombre = COALESCE(EXCLUDED.nombre, app_usuario.nombre), activo = true`;
  return id;
}
