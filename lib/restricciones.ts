// Restricciones físicas y de planificación que no salen de los índices del POT y pueden dejar un lote inviable:
//  · Red hídrica: cauces cercanos (natural o canalizado), retiro oficial del POT y, donde el municipio no publica la
//    capa de retiros, la faja de referencia de ley (30 m a cada lado del cauce natural, Decreto 1076 de 2015,
//    art. 2.2.1.1.18.2, mientras la autoridad ambiental no acote la ronda hídrica). Los retiros aplican también al sótano.
//  · Planes parciales y otros instrumentos de planificación complementaria que cubren el lote.
//  · Árboles: patrimoniales (no se pueden talar) y del censo urbano (exigen permiso de aprovechamiento y compensación).
import { sql } from "./db";

export const FAJA_REFERENCIA_M = 30;
const MUNICIPIOS_CON_RETIRO_OFICIAL = new Set(["05001", "05380"]);
const r0 = (x: any) => (x == null ? null : Math.round(Number(x)));
const r1 = (x: any) => (x == null ? null : Math.round(Number(x) * 10) / 10);
type Luz = "verde" | "amarillo" | "rojo" | "gris";

export async function restriccionesLote(id: string) {
  const [l] = await sql`SELECT id, municipio_dane, ST_Area(ST_Transform(geom, 9377)) area FROM parcel WHERE id = ${id}`;
  if (!l) return null;
  const area = Number(l.area) || 1;
  const oficial = MUNICIPIOS_CON_RETIRO_OFICIAL.has(l.municipio_dane);

  const [cauces, retiro, faja, planes, arboles] = await Promise.all([
    // Cauces a menos de 60 m; si un tramo OSM entubado pasa a menos de 10 m del punto más cercano, se marca canalizado
    sql`WITH l AS (SELECT geom, ST_Transform(geom, 9377) g FROM parcel WHERE id = ${id})
      SELECT c.fuente, c.nombre, c.jerarquia, ST_Distance(ST_Transform(c.geom, 9377), l.g) d, ST_Intersects(c.geom, l.geom) cruza,
             COALESCE(c.canalizado, EXISTS (SELECT 1 FROM hidro_cauce o WHERE o.fuente = 'osm_waterway' AND o.canalizado AND o.geom && ST_Expand(c.geom, 0.0003)
               AND ST_DWithin(ST_Transform(o.geom, 9377), ST_ClosestPoint(ST_Transform(c.geom, 9377), l.g), 10))) canalizado,
             ST_Length(ST_Intersection(ST_Transform(c.geom, 9377), l.g)) largo_dentro
      FROM hidro_cauce c, l WHERE c.geom && ST_Expand(l.geom, 0.0008) AND ST_DWithin(c.geom::geography, l.geom::geography, 60)
      ORDER BY d LIMIT 30`,
    // Retiro oficial (POT) dentro del lote
    sql`WITH l AS (SELECT geom, ST_Transform(geom, 9377) g FROM parcel WHERE id = ${id})
      SELECT ST_Area(ST_Intersection(ST_Union(ST_Transform(r.geom, 9377)), l.g)) m2, max(r.faja_m) faja, string_agg(DISTINCT r.nombre, ', ') nombres,
             ST_AsGeoJSON(ST_Intersection(ST_Union(ST_Transform(r.geom, 9377)), l.g), 2)::json geom
      FROM hidro_retiro r, l WHERE r.geom && l.geom AND ST_Intersects(r.geom, l.geom) GROUP BY l.g`,
    // Faja de referencia de 30 m a cauces naturales (solo donde no hay capa oficial de retiros)
    oficial ? Promise.resolve([]) : sql`WITH l AS (SELECT geom, ST_Transform(geom, 9377) g FROM parcel WHERE id = ${id}),
        c AS (SELECT ST_Union(ST_Buffer(ST_Transform(c.geom, 9377), ${FAJA_REFERENCIA_M})) b FROM hidro_cauce c, l
              WHERE NOT COALESCE(c.canalizado, false) AND c.geom && ST_Expand(l.geom, 0.0008) AND ST_DWithin(c.geom::geography, l.geom::geography, ${FAJA_REFERENCIA_M}))
      SELECT ST_Area(ST_Intersection(c.b, l.g)) m2, ST_AsGeoJSON(ST_Intersection(c.b, l.g), 2)::json geom FROM c, l WHERE c.b IS NOT NULL`,
    sql`WITH l AS (SELECT geom, ST_Transform(geom, 9377) g FROM parcel WHERE id = ${id})
      SELECT p.instrumento, p.nombre, p.codigo, p.estado, p.nivel, p.categoria, p.fuente, ST_Area(ST_Intersection(ST_Transform(p.geom, 9377), l.g)) m2
      FROM instrumento_plan p, l WHERE p.geom && l.geom AND ST_Intersects(p.geom, l.geom) ORDER BY (p.fuente = 'idem_amva_planes_parciales'), m2 DESC`,
    sql`WITH l AS (SELECT geom FROM parcel WHERE id = ${id})
      SELECT a.especie, a.nombre_comun, a.patrimonial, a.estado, ST_Intersects(a.geom, l.geom) dentro, ST_Distance(a.geom::geography, l.geom::geography) d
      FROM arbol a, l WHERE a.geom && ST_Expand(l.geom, 0.0002) AND ST_DWithin(a.geom::geography, l.geom::geography, 10)`,
  ]);

  // ---------- Red hídrica ----------
  const vistos = new Set<string>();
  const lista = (cauces as any[]).filter((c) => {
    const k = `${(c.nombre ?? "").toLowerCase()}|${Math.round(Number(c.d) / 5)}`;
    if (vistos.has(k)) return false; vistos.add(k); return true;
  }).slice(0, 6).map((c) => ({ nombre: c.nombre ?? "Cauce sin nombre", fuente: c.fuente, tipo: c.jerarquia, distancia_m: r1(c.d), cruza_el_lote: !!c.cruza, canalizado: !!c.canalizado, largo_dentro_m: r0(c.largo_dentro) }));
  const ro = (retiro as any[])[0], fj = (faja as any[])[0];
  const m2Oficial = Number(ro?.m2) || 0, m2Faja = Number(fj?.m2) || 0;
  const natural = lista.filter((c) => !c.canalizado), canal = lista.filter((c) => c.canalizado);
  const cruzaNatural = natural.some((c) => c.cruza_el_lote), canalCerca = canal.find((c) => (c.distancia_m ?? 99) <= 5);
  const m2Retiro = oficial ? m2Oficial : Math.max(m2Oficial, m2Faja);
  const pctRetiro = (m2Retiro / area) * 100;
  let luzH: Luz = "verde", lecturaH = lista.length ? `Cauce más cercano: ${lista[0].nombre} a ${lista[0].distancia_m} m${lista[0].canalizado ? " (canalizado)" : ""}; no afecta el lote.` : "Sin cauces a menos de 60 m.";
  if (pctRetiro > 30 || cruzaNatural) { luzH = "rojo"; lecturaH = `${cruzaNatural ? `La quebrada ${natural.find((c) => c.cruza_el_lote)!.nombre} cruza el lote. ` : ""}${Math.round(pctRetiro)} % del lote (${r0(m2Retiro)} m²) en retiro hídrico: no se construye ni en superficie ni en sótano.`; }
  else if (m2Retiro > 1) { luzH = "amarillo"; lecturaH = `${r1(pctRetiro)} % del lote (${r0(m2Retiro)} m²) en retiro ${oficial || m2Oficial ? "del POT" : `de referencia (${FAJA_REFERENCIA_M} m)`} de ${natural[0]?.nombre ?? ro?.nombres ?? "un cauce"}: se descuenta del área útil y del sótano.`; }
  else if (canalCerca) { luzH = "amarillo"; lecturaH = `${canalCerca.nombre} pasa canalizada a ${canalCerca.distancia_m} m${canalCerca.cruza_el_lote ? " (por debajo del lote)" : ""}: verificar servidumbre de la canalización y la cota del sótano con la autoridad ambiental y la empresa de servicios.`; }
  else if (natural.some((c) => (c.distancia_m ?? 99) <= FAJA_REFERENCIA_M + 15) && oficial) { luzH = "amarillo"; lecturaH = `${natural[0].nombre} a ${natural[0].distancia_m} m: el POT no marca retiro en el lote, pero conviene verificar el cauce en sitio (el trazado oficial puede diferir).`; }
  const hidrico = {
    luz: luzH, lectura: lecturaH, cauces: lista,
    retiro_oficial_m2: r0(m2Oficial), faja_oficial_m: ro?.faja != null ? Number(ro.faja) : null,
    faja_referencia_m2: oficial ? null : r0(m2Faja), area_en_retiro_m2: r0(m2Retiro), pct_lote: r1(pctRetiro),
    criterio: oficial ? "Retiro oficial a la red hídrica del POT del municipio." : `El municipio no publica la capa de retiros: se usa la faja de referencia de ${FAJA_REFERENCIA_M} m a cada lado del cauce natural (Decreto 1076 de 2015, art. 2.2.1.1.18.2) hasta que la autoridad ambiental acote la ronda hídrica.`,
    geometria_9377: (m2Oficial >= m2Faja ? ro?.geom : fj?.geom) ?? null,
    fuentes: "Red hídrica POT 48 y quebradas del catastro (Medellín), retiros oficiales (Medellín y La Estrella), OpenStreetMap (cauces del Valle de Aburrá y tramos canalizados).",
  };

  // ---------- Planes parciales e instrumentos ----------
  const generico = (x: any) => !x || /^planes? parcial(es)?$|^planes maestros$/i.test(String(x).trim());
  const municipales = (planes as any[]).some((p) => p.fuente !== 'idem_amva_planes_parciales' && Number(p.m2) / area > 0.05);
  const pl = (planes as any[]).filter((p) => Number(p.m2) / area > 0.05 && !(municipales && p.fuente === 'idem_amva_planes_parciales')).map((p) => ({ instrumento: p.instrumento, nombre: generico(p.nombre) ? (p.codigo ? `polígono ${p.codigo}` : null) : p.nombre, codigo: p.codigo, estado: p.estado, nivel: p.nivel, categoria: p.categoria, pct_lote: r1((Number(p.m2) / area) * 100) }));
  const pp = pl.find((p) => /parcial/i.test(`${p.instrumento} ${p.nombre}`));
  const otros = pl.filter((p) => p !== pp);
  const planificacion = {
    luz: (pp ? "amarillo" : otros.some((p) => /API|preservaci/i.test(`${p.codigo} ${p.categoria}`)) ? "rojo" : otros.length ? "amarillo" : "verde") as Luz,
    lectura: pp ? `Dentro del plan parcial${pp.nombre ? ` ${pp.nombre}` : ""}${pp.estado ? ` (${pp.estado.toLowerCase()})` : ""}: el lote no se licencia solo; aplica el reparto de cargas y beneficios y las obligaciones del plan${/aprob|adopt/i.test(pp.estado ?? "") ? " ya adoptado" : "; si no está adoptado, hay que formularlo (o sumarse a su formulación) antes de licenciar"}.`
      : otros.length ? `Cubierto por ${otros.map((o) => `${o.instrumento ?? "instrumento"}${o.codigo ? ` ${o.codigo}` : ""}`).join(", ")}: revisar sus condiciones antes de licenciar.`
      : "Sin plan parcial ni otro instrumento de planificación complementaria sobre el lote.",
    instrumentos: pl,
  };

  // ---------- Árboles ----------
  const ab = arboles as any[];
  const patDentro = ab.filter((a) => a.patrimonial && a.dentro), patCerca = ab.filter((a) => a.patrimonial && !a.dentro), comunes = ab.filter((a) => !a.patrimonial && a.dentro);
  const nombreArbol = (a: any) => { const c = String(a.nombre_comun ?? "").split(",")[0].trim(); return c.length > 2 ? c : a.especie && String(a.especie).length > 2 ? a.especie : "sin identificar"; };
  const especies = Object.entries(comunes.reduce((m: Record<string, number>, a) => ((m[nombreArbol(a)] = (m[nombreArbol(a)] ?? 0) + 1), m), {})).sort((a, b) => b[1] - a[1]).slice(0, 4);
  const conCenso = l.municipio_dane === "05001";
  const arbolado = {
    luz: (!conCenso ? "gris" : patDentro.length ? "rojo" : patCerca.length || comunes.length ? "amarillo" : "verde") as Luz,
    lectura: !conCenso ? "Sin censo de arbolado público para este municipio: verificar árboles en sitio." :
      patDentro.length ? `${patDentro.length} árbol(es) de patrimonio cultural dentro del lote (${patDentro.map(nombreArbol).join(", ")}): no se pueden talar; el diseño debe conservarlos.` :
      patCerca.length ? `${patCerca.length} árbol(es) patrimonial(es) a menos de 10 m del lote: proteger durante la obra.${comunes.length ? ` Además ${comunes.length} árboles censados dentro del lote.` : ""}` :
      comunes.length ? `${comunes.length} árboles del censo dentro del lote (${especies.map(([e, n]) => `${n} ${e}`).join(", ")}): tala o traslado con permiso de aprovechamiento forestal y compensación.` :
      "Sin árboles del censo público dentro del lote (el censo cubre sobre todo espacio público; verificar en sitio).",
    patrimoniales_dentro: patDentro.length, patrimoniales_cerca: patCerca.length, censados_dentro: comunes.length, especies: especies.map(([e, n]) => ({ especie: e, n })),
  };

  return { hidrico, planificacion, arbolado };
}
