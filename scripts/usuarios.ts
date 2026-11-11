// Gestión de usuarios:  npm run usuarios -- crear <correo> <clave> [nombre]  |  npm run usuarios -- desactivar <correo>  |  npm run usuarios -- listar
import { sql } from "../lib/db";
import { crearUsuario } from "../lib/usuarios";

const [accion, email, clave, ...nombre] = process.argv.slice(2);
if (accion === "crear" && email && clave) {
  console.log(`creado o actualizado: ${await crearUsuario(email, clave, nombre.join(" ") || undefined)}`);
} else if (accion === "desactivar" && email) {
  await sql`UPDATE app_usuario SET activo = false WHERE email = ${email.toLowerCase()}`;
  console.log(`desactivado: ${email}`);
} else {
  const rows = await sql`SELECT email, activo, to_char(creado_en, 'YYYY-MM-DD') AS creado, to_char(ultimo_ingreso, 'YYYY-MM-DD HH24:MI') AS ultimo_ingreso FROM app_usuario ORDER BY email`;
  console.table(rows);
}
