// Verifica que celula_reader lee las vistas y NO lee las tablas de Fynder.
import pg from "pg";
const c = new pg.Client({ connectionString: process.env.FYNDER_READ_URL });
await c.connect();
const ok = await c.query("SELECT count(*)::int n FROM celula_export.v_listing WHERE activa");
console.log(`v_listing activos: ${ok.rows[0].n}`);
for (const t of ["public.propiedades", "public.pedidos", "public.chat_users"]) {
  try { await c.query(`SELECT 1 FROM ${t} LIMIT 1`); console.log(`✗ PUEDE leer ${t}`); }
  catch (e) { console.log(`✓ sin acceso a ${t}: ${(e as Error).message}`); }
}
try { await c.query("CREATE TABLE celula_export.x(i int)"); console.log("✗ PUEDE escribir"); }
catch (e) { console.log(`✓ no puede escribir: ${(e as Error).message}`); }
await c.end();
