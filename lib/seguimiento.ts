// Seguimiento de lotes en negociación (CRM de suelo) por constructora: estado, precios, próxima acción e historial.
// No guarda datos personales de propietarios (Ley 1581): las notas se limpian de teléfonos y correos, y la UI lo advierte.
import { sql } from "./db";

export const ESTADOS = [
  ["identificado", "Identificado"], ["en_estudio", "En estudio"], ["contacto", "Contacto iniciado"], ["oferta", "Oferta enviada"],
  ["negociacion", "En negociación"], ["promesa", "Promesa firmada"], ["comprado", "Comprado"], ["descartado", "Descartado"],
] as const;
export type Estado = (typeof ESTADOS)[number][0];
const VALIDOS = new Set<string>(ESTADOS.map((e) => e[0]));
export const nombreEstado = (e: string) => ESTADOS.find((x) => x[0] === e)?.[1] ?? e;

let lista = false;
async function asegurar() {
  if (lista) return;
  await sql`CREATE TABLE IF NOT EXISTS lote_seguimiento (id bigserial PRIMARY KEY, constructora_id text NOT NULL, predio text NOT NULL, estado text NOT NULL DEFAULT 'identificado',
    prioridad int NOT NULL DEFAULT 2, precio_pedido numeric, precio_ofertado numeric, precio_acordado numeric, responsable text, proxima_accion text, proxima_fecha date,
    motivo_descarte text, creado_en timestamptz NOT NULL DEFAULT now(), actualizado_en timestamptz NOT NULL DEFAULT now(), UNIQUE (constructora_id, predio))`;
  await sql`CREATE TABLE IF NOT EXISTS lote_seguimiento_evento (id bigserial PRIMARY KEY, seguimiento_id bigint NOT NULL REFERENCES lote_seguimiento(id) ON DELETE CASCADE,
    tipo text NOT NULL, texto text NOT NULL, usuario text, fecha timestamptz NOT NULL DEFAULT now())`;
  await sql`CREATE TABLE IF NOT EXISTS escenario_lote (id bigserial PRIMARY KEY, predio text NOT NULL, constructora_id text NOT NULL, nombre text NOT NULL, parametros text NOT NULL, resultado jsonb NOT NULL, creado_por text, creado_en timestamptz NOT NULL DEFAULT now())`;
  lista = true;
}

/** Quita teléfonos, correos y cédulas de un texto libre. */
export function limpiarTexto(t: string) {
  return String(t ?? "").slice(0, 2000)
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, "[correo omitido]")
    .replace(/(\+?57[\s-]?)?(\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}\b/g, "[teléfono omitido]")
    .replace(/\b\d{1,3}(\.\d{3}){2,3}\b(?!\s*(m|millones|M|\$))/g, (m) => (m.replace(/\./g, "").length >= 7 && m.replace(/\./g, "").length <= 10 ? "[número omitido]" : m))
    .replace(/\b\d{7,10}\b/g, "[número omitido]");
}

const millones = (v: any) => (v == null ? "—" : `$${Math.round(Number(v) / 1e6).toLocaleString("es-CO")} M`);

export async function listarSeguimiento(constructora: string) {
  await asegurar();
  const rs = await sql`
    SELECT s.*, p.municipio, p.barrio_catastral barrio, p.area_lote::float area_lote, ST_Y(ST_PointOnSurface(q.geom)) lat, ST_X(ST_PointOnSurface(q.geom)) lon,
      (SELECT jsonb_build_object('nombre', e.nombre, 'valor_maximo_lote', (e.resultado->>'valor_maximo_lote')::numeric, 'veredicto', e.resultado->>'veredicto', 'fecha', e.creado_en)
         FROM escenario_lote e WHERE e.constructora_id = s.constructora_id AND e.predio = s.predio ORDER BY e.creado_en DESC LIMIT 1) ultima_version,
      (SELECT count(*)::int FROM lote_seguimiento_evento v WHERE v.seguimiento_id = s.id) eventos
    FROM lote_seguimiento s LEFT JOIN parcel_profile p ON p.id = s.predio LEFT JOIN parcel q ON q.id = s.predio
    WHERE s.constructora_id = ${constructora} ORDER BY s.prioridad, s.proxima_fecha NULLS LAST, s.actualizado_en DESC`;
  const hoy = new Date().toISOString().slice(0, 10);
  return (rs as any[]).map((r) => ({ ...r, id: Number(r.id), precio_pedido: r.precio_pedido != null ? Number(r.precio_pedido) : null, precio_ofertado: r.precio_ofertado != null ? Number(r.precio_ofertado) : null,
    precio_acordado: r.precio_acordado != null ? Number(r.precio_acordado) : null, estado_nombre: nombreEstado(r.estado),
    vencida: r.proxima_fecha && new Date(r.proxima_fecha).toISOString().slice(0, 10) < hoy && !["comprado", "descartado"].includes(r.estado),
    brecha_pct: r.precio_pedido && r.ultima_version?.valor_maximo_lote ? Math.round((Number(r.precio_pedido) / Number(r.ultima_version.valor_maximo_lote) - 1) * 1000) / 10 : null }));
}

export async function obtenerSeguimiento(constructora: string, predio: string) {
  await asegurar();
  const [s] = await sql`SELECT * FROM lote_seguimiento WHERE constructora_id = ${constructora} AND predio = ${predio}`;
  if (!s) return null;
  const ev = await sql`SELECT tipo, texto, usuario, fecha FROM lote_seguimiento_evento WHERE seguimiento_id = ${s.id} ORDER BY fecha DESC LIMIT 100`;
  return { ...s, id: Number(s.id), estado_nombre: nombreEstado(s.estado), eventos: ev };
}

type Cambios = Partial<{ estado: string; prioridad: number; precio_pedido: number | null; precio_ofertado: number | null; precio_acordado: number | null;
  responsable: string | null; proxima_accion: string | null; proxima_fecha: string | null; motivo_descarte: string | null; nota: string }>;

export async function actualizarSeguimiento(constructora: string, predio: string, c: Cambios, usuario: string | null) {
  await asegurar();
  if (c.estado && !VALIDOS.has(c.estado)) throw new Error(`Estado no válido: ${c.estado}`);
  const antes: any = await obtenerSeguimiento(constructora, predio);
  const [s] = await sql`INSERT INTO lote_seguimiento (constructora_id, predio, estado) VALUES (${constructora}, ${predio}, ${c.estado ?? "identificado"})
    ON CONFLICT (constructora_id, predio) DO UPDATE SET actualizado_en = now() RETURNING id`;
  const id = Number(s.id);
  const eventos: [string, string][] = [];
  if (!antes) eventos.push(["estado", `Lote agregado como "${nombreEstado(c.estado ?? "identificado")}"`]);
  const num = (v: any) => (v === "" || v == null ? null : Number(v));
  const campos: [keyof Cambios, any][] = [];
  if (c.estado !== undefined && antes && c.estado !== antes.estado) { campos.push(["estado", c.estado]); eventos.push(["estado", `${nombreEstado(antes.estado)} → ${nombreEstado(c.estado)}`]); }
  for (const k of ["precio_pedido", "precio_ofertado", "precio_acordado"] as const) if (c[k] !== undefined && num(c[k]) !== (antes?.[k] != null ? Number(antes[k]) : null)) {
    campos.push([k, num(c[k])]); eventos.push(["precio", `${k === "precio_pedido" ? "Precio pedido" : k === "precio_ofertado" ? "Oferta" : "Precio acordado"}: ${millones(num(c[k]))}`]);
  }
  if (c.prioridad !== undefined) campos.push(["prioridad", Math.max(1, Math.min(3, Number(c.prioridad) || 2))]);
  if (c.responsable !== undefined) campos.push(["responsable", c.responsable ? String(c.responsable).slice(0, 80) : null]);
  if (c.proxima_accion !== undefined) campos.push(["proxima_accion", c.proxima_accion ? limpiarTexto(c.proxima_accion).slice(0, 200) : null]);
  if (c.proxima_fecha !== undefined) campos.push(["proxima_fecha", c.proxima_fecha || null]);
  if (c.motivo_descarte !== undefined) campos.push(["motivo_descarte", c.motivo_descarte ? limpiarTexto(c.motivo_descarte).slice(0, 300) : null]);
  for (const [k, v] of campos) {
    // Columnas fijas de una lista conocida: se actualizan una a una con parámetros.
    if (k === "estado") await sql`UPDATE lote_seguimiento SET estado = ${v} WHERE id = ${id}`;
    else if (k === "prioridad") await sql`UPDATE lote_seguimiento SET prioridad = ${v} WHERE id = ${id}`;
    else if (k === "precio_pedido") await sql`UPDATE lote_seguimiento SET precio_pedido = ${v} WHERE id = ${id}`;
    else if (k === "precio_ofertado") await sql`UPDATE lote_seguimiento SET precio_ofertado = ${v} WHERE id = ${id}`;
    else if (k === "precio_acordado") await sql`UPDATE lote_seguimiento SET precio_acordado = ${v} WHERE id = ${id}`;
    else if (k === "responsable") await sql`UPDATE lote_seguimiento SET responsable = ${v} WHERE id = ${id}`;
    else if (k === "proxima_accion") await sql`UPDATE lote_seguimiento SET proxima_accion = ${v} WHERE id = ${id}`;
    else if (k === "proxima_fecha") await sql`UPDATE lote_seguimiento SET proxima_fecha = ${v} WHERE id = ${id}`;
    else if (k === "motivo_descarte") await sql`UPDATE lote_seguimiento SET motivo_descarte = ${v} WHERE id = ${id}`;
  }
  if (c.nota) eventos.push(["nota", limpiarTexto(c.nota)]);
  for (const [tipo, texto] of eventos) await sql`INSERT INTO lote_seguimiento_evento (seguimiento_id, tipo, texto, usuario) VALUES (${id}, ${tipo}, ${texto}, ${usuario})`;
  return obtenerSeguimiento(constructora, predio);
}

export async function quitarSeguimiento(constructora: string, predio: string) {
  await asegurar();
  const rs = await sql`DELETE FROM lote_seguimiento WHERE constructora_id = ${constructora} AND predio = ${predio} RETURNING id`;
  return rs.length > 0;
}
