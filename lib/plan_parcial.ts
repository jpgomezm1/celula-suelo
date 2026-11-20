// Norma de un plan parcial adoptado para un predio: unidad de actuación (UAU), viviendas, altura, suelo útil, cargas y la parte
// que le corresponde al predio. Cuando existe, manda sobre la norma general del POT.
import { sql } from "./db";

const r1 = (x: number) => Math.round(x * 10) / 10;

export type PlanParcialLote = Awaited<ReturnType<typeof planParcialLote>>;

export async function planParcialLote(id: string) {
  const [row]: any = await sql`SELECT pp.plan_id, pp.uau, pp.area_m2, p.nombre, p.estado, p.actos, p.normas, p.datos pdatos, p.fuente, p.verificado, u.datos udatos
    FROM plan_parcial_predio pp JOIN plan_parcial p ON p.id = pp.plan_id JOIN plan_parcial_uau u ON u.plan_id = pp.plan_id AND u.uau = pp.uau
    WHERE pp.parcel_id = ${id} LIMIT 1`.catch(() => [] as any[]);
  if (!row) return null;
  const u = row.udatos, clave = id.split(":")[1];
  const otros: any = await sql`SELECT pp.parcel_id, pp.area_m2::float a FROM plan_parcial_predio pp WHERE pp.plan_id = ${row.plan_id} AND pp.uau = ${row.uau} AND pp.parcel_id <> ${id} ORDER BY pp.area_m2 DESC`;
  const area = Number(row.area_m2) || 0, areaUau = Number(u.area_bruta_m2) || 0;
  const comp = (u.compensaciones ?? []).filter((c: any) => c.catastro === clave).reduce((s: number, c: any) => s + Number(c.viviendas || 0), 0);
  const compTotal = (u.compensaciones ?? []).reduce((s: number, c: any) => s + Number(c.viviendas || 0), 0);
  const participacion = areaUau ? area / areaUau : 0;
  // Las viviendas "base" de la UAU (sin compensaciones) se reparten por área; las compensaciones van al predio que las ganó.
  const baseUau = Math.max(0, Number(u.viviendas) - compTotal);
  const viviendasLote = Math.round(baseUau * participacion + comp);
  const m2Viv = Number(u.m2_vivienda_modelo) || null;
  const m2Lote = m2Viv ? Math.round(m2Viv * (viviendasLote / Number(u.viviendas))) : null;
  const actos = (row.actos ?? []).map((a: any) => `${a.tipo} ${a.numero} de ${String(a.fecha).slice(0, 4)}`).join(" y ");
  return {
    disponible: true as const,
    plan: { id: row.plan_id, nombre: row.nombre, estado: row.estado, actos: row.actos, actos_texto: actos, ambito: row.pdatos?.ambito ?? null, viviendas_total: row.pdatos?.viviendas_total ?? null,
      area_intervencion_m2: row.pdatos?.area_intervencion_m2 ?? null, soporte: row.pdatos?.soporte ?? [], fuente: row.fuente, verificado: row.verificado },
    normas: row.normas,
    uau: { id: row.uau, area_bruta_m2: areaUau, suelo_util_m2: u.suelo_util_m2, viviendas: u.viviendas, viviendas_por_densidad: u.viviendas_por_densidad,
      altura_pisos: u.altura_pisos, altura_pisos_max_con_visto_bueno: u.altura_pisos_max_con_visto_bueno, m2_vivienda_modelo: m2Viv, cargas: u.cargas, compensaciones: u.compensaciones ?? [],
      otros_predios: otros.map((o: any) => ({ id: o.parcel_id, area_m2: o.a })) },
    lote: { area_en_plan_m2: area, participacion_pct: r1(participacion * 100), viviendas_compensacion: comp || 0, viviendas_estimadas: viviendasLote, m2_vivienda_estimados: m2Lote,
      calculo: `${baseUau} viviendas base de la UAU × ${r1(participacion * 100)} % del área${comp ? ` + ${comp} de compensación de este predio` : ""} ≈ ${viviendasLote}` },
    lectura: `${row.nombre}, ${row.estado}${actos ? ` (${actos})` : ""}. El lote está en la UAU ${row.uau} con ${otros.length} predio(s) más (${Math.round(areaUau).toLocaleString("es-CO")} m²): la UAU tiene ${u.viviendas} viviendas y ${u.altura_pisos} pisos${u.altura_pisos_max_con_visto_bueno ? ` (hasta ${u.altura_pisos_max_con_visto_bueno} con visto bueno)` : ""}, y se licencia con una sola licencia de urbanización. Al lote le corresponderían unas ${viviendasLote} viviendas.`,
    aviso: "Norma transcrita del decreto de adopción y su documento técnico. El reparto de viviendas entre los propietarios de la UAU se pacta entre ellos; aquí se estima por área más las compensaciones asignadas a cada predio.",
  };
}

/** Escenarios de cabida con la norma del plan parcial: lo del lote y la UAU completa. */
export function cabidaPlanParcial(pp: NonNullable<PlanParcialLote>) {
  const efic = 0.8;
  const esc = (nombre: string, unidades: number, m2: number | null, pisos: number) => ({
    escenario: nombre, disponible: true, densidad_viv_ha: null, area_construible_m2: m2 ? Math.round(m2 / efic) : null, area_vendible_m2: m2,
    unidades, limita: "reparto del plan parcial", pisos_sobre_rasante: pisos, limitado_por_altura: false,
    parqueaderos: Math.ceil(unidades + unidades / 3), sotanos_aprox: null as number | null, huella_m2: null as number | null,
  });
  return [
    esc(`Base: lo que le corresponde al lote en el plan parcial (UAU ${pp.uau.id})`, pp.lote.viviendas_estimadas, pp.lote.m2_vivienda_estimados, pp.uau.altura_pisos),
    esc(`Máximo: la UAU ${pp.uau.id} completa (${pp.uau.otros_predios.length + 1} predios)`, pp.uau.viviendas, pp.uau.m2_vivienda_modelo, pp.uau.altura_pisos),
  ];
}

export async function esquemaPlanParcial() {
  await sql`CREATE TABLE IF NOT EXISTS plan_parcial (id text PRIMARY KEY, municipio_dane text NOT NULL, nombre text NOT NULL, estado text NOT NULL,
    actos jsonb, normas jsonb, datos jsonb NOT NULL, fuente text, verificado date, geom geometry(MultiPolygon, 4326), cargado_en timestamptz NOT NULL DEFAULT now())`;
  await sql`CREATE TABLE IF NOT EXISTS plan_parcial_uau (plan_id text NOT NULL REFERENCES plan_parcial(id) ON DELETE CASCADE, uau text NOT NULL, datos jsonb NOT NULL,
    geom geometry(MultiPolygon, 4326), PRIMARY KEY (plan_id, uau))`;
  await sql`CREATE TABLE IF NOT EXISTS plan_parcial_predio (plan_id text NOT NULL REFERENCES plan_parcial(id) ON DELETE CASCADE, uau text NOT NULL, parcel_id text NOT NULL,
    area_m2 numeric, PRIMARY KEY (plan_id, parcel_id))`;
  await sql`CREATE INDEX IF NOT EXISTS plan_parcial_predio_parcel ON plan_parcial_predio (parcel_id)`;
  await sql`CREATE INDEX IF NOT EXISTS plan_parcial_geom ON plan_parcial USING gist (geom)`;
}


/** Guarda (o reemplaza) un plan parcial con sus UAU y predios. Devuelve conteos y predios que no están en el catastro. */
export async function guardarPlanParcial(p: any) {
  if (!p?.id || !p?.municipio_dane || !p?.nombre || !p?.estado || !Array.isArray(p?.uaus) || !p.uaus.length) return { error: "Faltan campos: id, municipio_dane, nombre, estado y uaus (con uau, viviendas, altura_pisos y predios)." };
  await esquemaPlanParcial();
  const { uaus, actos, normas, ...resto } = p;
  await sql`DELETE FROM plan_parcial WHERE id = ${p.id}`;
  await sql`INSERT INTO plan_parcial (id, municipio_dane, nombre, estado, actos, normas, datos, fuente, verificado)
    VALUES (${p.id}, ${p.municipio_dane}, ${p.nombre}, ${p.estado}, ${JSON.stringify(actos ?? [])}, ${JSON.stringify(normas ?? {})}, ${JSON.stringify(resto)}, ${p.fuente ?? null}, ${p.verificado ?? null})`;
  const faltan: string[] = [];
  let n = 0;
  for (const u of uaus) {
    const { predios, ...du } = u;
    await sql`INSERT INTO plan_parcial_uau (plan_id, uau, datos) VALUES (${p.id}, ${String(u.uau)}, ${JSON.stringify(du)})`;
    for (const q of predios ?? []) {
      const pid = String(q.catastro).includes(":") ? String(q.catastro) : `${p.municipio_dane}:${q.catastro}`;
      const [ex]: any = await sql`SELECT 1 x FROM parcel WHERE id = ${pid}`;
      if (!ex) faltan.push(String(q.catastro));
      await sql`INSERT INTO plan_parcial_predio (plan_id, uau, parcel_id, area_m2) VALUES (${p.id}, ${String(u.uau)}, ${pid}, ${q.area_m2 ?? null}) ON CONFLICT DO NOTHING`; n++;
    }
    await sql`UPDATE plan_parcial_uau u SET geom = (SELECT ST_Multi(ST_CollectionExtract(ST_MakeValid(ST_Union(x.geom)), 3)) FROM parcel x JOIN plan_parcial_predio pp ON pp.parcel_id = x.id WHERE pp.plan_id = ${p.id} AND pp.uau = ${String(u.uau)})
      WHERE u.plan_id = ${p.id} AND u.uau = ${String(u.uau)}`;
  }
  await sql`UPDATE plan_parcial SET geom = (SELECT ST_Multi(ST_CollectionExtract(ST_MakeValid(ST_Union(geom)), 3)) FROM plan_parcial_uau WHERE plan_id = ${p.id}) WHERE id = ${p.id}`;
  return { id: p.id, nombre: p.nombre, uaus: uaus.length, predios: n, predios_sin_catastro: faltan };
}

export async function listarPlanesParciales(municipio_dane?: string) {
  const rs: any = await sql`SELECT p.id, p.nombre, p.municipio_dane, p.estado, p.actos, (p.datos->>'viviendas_total')::int viviendas, count(u.uau)::int uaus, p.verificado
    FROM plan_parcial p LEFT JOIN plan_parcial_uau u ON u.plan_id = p.id WHERE (${municipio_dane ?? null}::text IS NULL OR p.municipio_dane = ${municipio_dane ?? null})
    GROUP BY p.id ORDER BY p.municipio_dane, p.nombre`.catch(() => []);
  return rs;
}
