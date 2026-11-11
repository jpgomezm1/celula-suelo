// Sincroniza Fynder → célula leyendo SOLO las vistas celula_export con el rol de solo lectura.
//   npm run sync:fynder
// Volumen pequeño (~15 mil avisos, ~5 mil pedidos): refresco completo en cada corrida, en una transacción.

import pg from "pg";

let src: pg.Client;
let db: pg.Client;

const norm = (s: unknown) =>
  String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

/** Nombre → código DANE: municipios del alcance + alias frecuentes en los avisos y pedidos. */
async function mapaMunicipios(): Promise<Map<string, string>> {
  const m = new Map<string, string>();
  for (const r of (await db.query("SELECT dane, nombre FROM municipio")).rows) m.set(norm(r.nombre), r.dane);
  for (const [alias, d] of Object.entries({
    itagui: "05360", "el poblado": "05001", poblado: "05001", laureles: "05001", belen: "05001", "santa elena": "05001",
    "san antonio de prado": "05001", "la ceja del tambo": "05376", retiro: "05607", "carmen de viboral": "05148",
    llanogrande: "05615", "llano grande": "05615",
  })) m.set(alias, d);
  return m;
}

async function insertJson(sql: string, rows: unknown[]) {
  for (let i = 0; i < rows.length; i += 2000) await db.query(sql, [JSON.stringify(rows.slice(i, i + 2000))]);
}

export async function sincronizarFynder(): Promise<string> {
  src = new pg.Client({ connectionString: process.env.FYNDER_READ_URL });
  db = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await src.connect();
  await db.connect();
  try {
    return await sincronizar();
  } catch (e) {
    try { await db.query("ROLLBACK"); } catch {}
    throw e;
  } finally {
    await src.end().catch(() => {});
    await db.end().catch(() => {});
  }
}

async function sincronizar(): Promise<string> {
  const mun = await mapaMunicipios();
  const daneDe = (s: unknown) => mun.get(norm(s)) ?? null;

  // ── Barrios de Fynder (puntos) ──
  const barrios = (await src.query("SELECT * FROM celula_export.v_barrio")).rows;
  const barrioMun = new Map<number, string | null>();
  const nombreAMun = new Map<string, string>(); // barrio o comuna de Fynder → municipio
  for (const b of barrios) {
    const d = daneDe(b.municipio) ?? daneDe(b.municipio_clave);
    barrioMun.set(b.id, d);
    if (d) {
      nombreAMun.set(norm(b.nombre), d);
      if (b.comuna) nombreAMun.set(norm(b.comuna), d);
    }
  }

  // ── Avisos ──
  const avisos = (await src.query("SELECT * FROM celula_export.v_listing")).rows;
  const salidas = new Map((await src.query("SELECT * FROM celula_export.v_listing_exit")).rows.map((r) => [r.propiedad_id, r.fecha_salida]));
  const huellas = new Map((await src.query("SELECT * FROM celula_export.v_huella")).rows.map((r) => [r.propiedad_id, r.grupo]));
  const cambios = (await src.query("SELECT * FROM celula_export.v_price_change")).rows;
  const pedidos = (await src.query("SELECT * FROM celula_export.v_demand")).rows;
  const indice = (await src.query("SELECT * FROM celula_export.v_indice_mensual")).rows;

  await db.query("BEGIN");
  await db.query("DELETE FROM fynder_barrio");
  await insertJson(
    `INSERT INTO fynder_barrio (id, municipio_texto, municipio_dane, comuna, nombre, tipo, pt)
     SELECT r.id, r.municipio, r.dane, r.comuna, r.nombre, r.tipo,
            CASE WHEN r.lat IS NOT NULL AND r.lng IS NOT NULL THEN ST_SetSRID(ST_MakePoint(r.lng, r.lat), 4326) END
     FROM jsonb_to_recordset($1::jsonb) r(id int, municipio text, dane text, comuna text, nombre text, tipo text, lat float8, lng float8)`,
    barrios.map((b) => ({ ...b, dane: barrioMun.get(b.id) })),
  );

  await db.query("DELETE FROM listing");
  const filas = avisos.map((a) => {
    const area = a.area ? Number(a.area) : null;
    const precio = a.precio ? Number(a.precio) : null;
    return {
      id: a.id,
      municipio_dane: daneDe(a.municipio_texto) ?? (a.barrio_id ? barrioMun.get(a.barrio_id) : null) ?? nombreAMun.get(norm(a.barrio_texto)) ?? null,
      municipio_texto: a.municipio_texto, barrio: a.barrio_texto, barrio_id: a.barrio_id, comuna: a.comuna,
      tipo: a.tipo ? norm(a.tipo).replace(/ /g, "_") : null, negocio: a.negocio ? norm(a.negocio) : null,
      estado_inmueble: a.estado_inmueble, precio, area, area_lote: a.area_lote_m2,
      precio_m2: precio && area && area >= 15 ? Math.round(precio / area) : null,
      habitaciones: a.habitaciones, banos: a.banos, parqueaderos: a.parqueaderos, estrato: a.estrato,
      ano_construccion: a.ano_construccion, titulo: a.titulo,
      lat: a.latitud ? Number(a.latitud) : null, lon: a.longitud ? Number(a.longitud) : null,
      ubicacion_aproximada: a.ubicacion_aproximada, activa: a.activa, portal: a.portal, constructora_id: a.constructora_id,
      grupo_duplicado: huellas.get(a.id) ?? null, publicado_en: a.fecha_creacion, actualizado_en: a.fecha_actualizacion,
      salio_en: salidas.get(a.id) ?? null,
    };
  });
  await insertJson(
    `INSERT INTO listing (id, municipio_dane, municipio_texto, barrio, barrio_id, comuna, tipo, negocio, estado_inmueble, precio, area,
       area_lote, precio_m2, habitaciones, banos, parqueaderos, estrato, ano_construccion, titulo, geom, ubicacion_aproximada, activa,
       portal, constructora_id, grupo_duplicado, publicado_en, actualizado_en, salio_en)
     SELECT r.id, r.municipio_dane, r.municipio_texto, r.barrio, r.barrio_id, r.comuna, r.tipo, r.negocio, r.estado_inmueble, r.precio,
       r.area, r.area_lote, r.precio_m2, r.habitaciones, r.banos, r.parqueaderos, r.estrato, r.ano_construccion, r.titulo,
       CASE WHEN r.lat BETWEEN -5 AND 15 AND r.lon BETWEEN -80 AND -66 THEN ST_SetSRID(ST_MakePoint(r.lon, r.lat), 4326) END,
       r.ubicacion_aproximada, r.activa, r.portal, r.constructora_id, r.grupo_duplicado, r.publicado_en, r.actualizado_en, r.salio_en
     FROM jsonb_to_recordset($1::jsonb) r(id int, municipio_dane text, municipio_texto text, barrio text, barrio_id int, comuna text,
       tipo text, negocio text, estado_inmueble text, precio bigint, area numeric, area_lote numeric, precio_m2 numeric, habitaciones int,
       banos int, parqueaderos int, estrato int, ano_construccion int, titulo text, lat float8, lon float8, ubicacion_aproximada boolean,
       activa boolean, portal text, constructora_id int, grupo_duplicado int, publicado_en timestamptz, actualizado_en timestamptz,
       salio_en timestamptz)`,
    filas,
  );
  // Aviso con coordenada exacta → predio que la contiene.
  await db.query(
    `UPDATE listing l SET parcel_id = p.id FROM parcel p
     WHERE l.geom IS NOT NULL AND NOT l.ubicacion_aproximada AND p.municipio_dane = l.municipio_dane AND ST_Contains(p.geom, l.geom)`,
  );

  await db.query("DELETE FROM listing_price_change");
  await insertJson(
    `INSERT INTO listing_price_change (id, listing_id, precio_antes, precio_nuevo, aplicado, origen, fecha)
     SELECT r.id, r.propiedad_id, r.precio_anterior, r.precio_nuevo, r.aplicado, r.origen, r.created_at
     FROM jsonb_to_recordset($1::jsonb) r(id bigint, propiedad_id int, precio_anterior bigint, precio_nuevo bigint, aplicado boolean,
       origen text, created_at timestamptz)`,
    cambios,
  );

  // ── Demanda: municipio por barrio_ids, ciudades, ubicaciones y zonas ──
  await db.query("DELETE FROM demand_request");
  const demanda = pedidos.map((p) => {
    const c = p.criterios ?? {};
    const nombres: string[] = [
      ...(c.ciudades ?? []), ...(c.zonas ?? []),
      ...((c.ubicaciones ?? []) as any[]).flatMap((u) => [u?.nombre, u?.dentro_de]),
    ].filter(Boolean);
    const dane = new Set<string>();
    for (const id of p.barrio_ids ?? []) { const d = barrioMun.get(id); if (d) dane.add(d); }
    for (const n of nombres) { const d = daneDe(n) ?? nombreAMun.get(norm(n)); if (d) dane.add(d); }
    const presMax = c.presupuesto_max ?? p.presupuesto_estimado ?? null;
    return {
      id: p.id, fecha: p.fecha_captura, presupuesto: p.presupuesto_estimado ?? presMax,
      presupuesto_min: c.presupuesto_min ?? null, presupuesto_max: presMax,
      negocio: c.negocio ? norm(c.negocio) : null, tipos: c.tipos ?? [], habitaciones_min: c.habitaciones_min ?? null,
      area_min: c.area_min ?? null, zonas_texto: c.zonas ?? [], municipios_dane: [...dane], barrio_ids: p.barrio_ids ?? [],
      estado: p.estado, canal: p.canal,
    };
  });
  await insertJson(
    `INSERT INTO demand_request (id, fecha, presupuesto, presupuesto_min, presupuesto_max, negocio, tipos, habitaciones_min, area_min,
       zonas_texto, municipios_dane, barrio_ids, estado, canal)
     SELECT r.id, r.fecha, r.presupuesto, r.presupuesto_min, r.presupuesto_max, r.negocio, r.tipos, r.habitaciones_min, r.area_min,
       r.zonas_texto, r.municipios_dane, r.barrio_ids, r.estado, r.canal
     FROM jsonb_to_recordset($1::jsonb) r(id int, fecha timestamptz, presupuesto bigint, presupuesto_min bigint, presupuesto_max bigint,
       negocio text, tipos text[], habitaciones_min int, area_min numeric, zonas_texto text[], municipios_dane text[], barrio_ids int[],
       estado text, canal text)`,
    demanda,
  );

  await db.query("DELETE FROM market_index");
  await insertJson(
    `INSERT INTO market_index SELECT * FROM jsonb_populate_recordset(NULL::market_index, $1::jsonb) ON CONFLICT DO NOTHING`,
    indice,
  );

  for (const [tabla, n] of [["listing", filas.length], ["demand_request", demanda.length], ["listing_price_change", cambios.length],
    ["fynder_barrio", barrios.length], ["market_index", indice.length]] as const) {
    await db.query(
      `INSERT INTO fynder_sync (tabla, filas, synced_at) VALUES ($1, $2, now())
       ON CONFLICT (tabla) DO UPDATE SET filas = $2, synced_at = now()`, [tabla, n]);
  }
  await db.query(
    `INSERT INTO source_snapshot (fuente, nombre, url, filtro, tipo_dato, licencia, esperado, registros, notas)
     VALUES ('fynder', 'Mercado Fynder: avisos, pedidos de compradores, cambios de precio e índice mensual',
             'celula_export (Fynder, solo lectura)', 'vistas sin datos personales', 'anunciado',
             'Datos internos de Fynder; uso interno de la célula', $1, $1, $2)`,
    [filas.length, `${demanda.length} pedidos · ${cambios.length} cambios de precio · ${barrios.length} barrios`],
  );
  await db.query("COMMIT");

  const s = (await db.query(
    `SELECT count(*) FILTER (WHERE activa) activos, count(*) FILTER (WHERE activa AND municipio_dane IS NULL) sin_mun,
            count(*) FILTER (WHERE parcel_id IS NOT NULL) con_predio,
            (SELECT count(*) FROM demand_request WHERE cardinality(municipios_dane) > 0) pedidos_ubicados,
            (SELECT count(*) FROM demand_request) pedidos
     FROM listing`)).rows[0];
  return `Avisos activos ${s.activos} (sin municipio ${s.sin_mun}) · enlazados a predio ${s.con_predio} · pedidos ${s.pedidos} (ubicados ${s.pedidos_ubicados})`;
}

if (process.argv[1]?.endsWith("fynder.ts")) {
  sincronizarFynder().then((m) => console.log(m)).catch((e) => { console.error(e); process.exit(1); });
}
