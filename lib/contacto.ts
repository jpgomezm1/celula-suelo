// Ruta de contacto y señales de venta de un predio. No se guardan ni se muestran nombres, cédulas ni teléfonos de
// personas naturales: la plataforma entrega el inmueble (matrícula, dirección, señales) y el camino legal para llegar al dueño.
import { croma } from "./croma";
import { sql } from "./db";
import { encontrarPredio, type FichaInput } from "./ficha";

const CERTIFICADO_URL = "https://certificados.supernotariado.gov.co/";
const AVISO_LEGAL =
  "Ley 1581 de 2012: el certificado de tradición y el registro mercantil son públicos, pero usar datos de personas naturales para " +
  "prospección requiere base legal o autorización. Canal recomendado con personas: carta física al predio o intermediario.";

const fecha = (d: unknown) => (d ? new Date(d as any).toISOString().slice(0, 10) : null);
const anios = (d: string | Date | null) => (d ? Math.floor((Date.now() - new Date(d).getTime()) / (365.25 * 864e5)) : null);

/** Señales del folio interpretadas en lenguaje de negocio. */
export function interpretarSenales(s: any) {
  if (!s) return { disponible: false, motivo: "Sin matrícula enlazada o sin historia consultada para este predio." };
  const lista: { señal: string; lectura: string; efecto: "favorable" | "riesgo" | "neutral" }[] = [];
  const embargoVigente = s.ultimo_embargo && (!s.ultima_cancelacion || new Date(s.ultima_cancelacion) < new Date(s.ultimo_embargo));
  if (s.sucesion) lista.push({ señal: `Adjudicado en sucesión (${fecha(s.sucesion)})`, lectura: "Herederos: es frecuente que quieran vender o repartir.", efecto: "favorable" });
  if (s.derechos_de_cuota) lista.push({ señal: "Copropiedad por derechos de cuota", lectura: "Varios dueños; la venta exige acuerdo entre ellos, pero suele haber alguno con interés en salir.", efecto: "neutral" });
  if (embargoVigente) lista.push({ señal: `Embargo sin cancelación registrada (${s.embargos})`, lectura: "Posible presión financiera del propietario; revisar en el certificado si sigue vigente.", efecto: "favorable" });
  if (s.dacion_en_pago) lista.push({ señal: "Dación en pago", lectura: "El lote pasó a un acreedor; los acreedores suelen querer liquidar.", efecto: "favorable" });
  if (s.señal_empresa) lista.push({ señal: "Actos societarios (aporte a sociedad, fusión, escisión o cambio de razón social)", lectura: "El titular probable es una empresa: contacto por registro mercantil.", efecto: "favorable" });
  if (s.fiducia) lista.push({ señal: "En fiducia mercantil", lectura: "Probablemente ya está vinculado a un proyecto; la titular es la fiduciaria.", efecto: "riesgo" });
  if (s.loteo_o_englobe) lista.push({ señal: "Loteo, englobe o fusión de predios", lectura: "Hubo actividad de desarrollo reciente sobre el lote.", efecto: "neutral" });
  if (s.litigio) lista.push({ señal: "Demanda registrada (pertenencia o proceso verbal)", lectura: "Riesgo jurídico: título en disputa.", efecto: "riesgo" });
  if (s.oferta_compra_publica) lista.push({ señal: "Oferta de compra de una entidad pública", lectura: "Posible adquisición pública o expropiación (obra o vía).", efecto: "riesgo" });
  if (s.hipoteca) lista.push({ señal: "Hipoteca registrada", lectura: "Tiene deuda garantizada con el lote.", efecto: "neutral" });
  const sinVenta = !s.ultima_compraventa;
  lista.push(sinVenta
    ? { señal: "Sin compraventas registradas 2015–2023", lectura: `Dueño de largo plazo${s.folio_abierto ? ` (folio abierto en ${fecha(s.folio_abierto)?.slice(0, 4)})` : ""}: lote 'dormido'.`, efecto: "neutral" }
    : { señal: `Última compraventa ${fecha(s.ultima_compraventa)}${s.valor_ultima_compraventa ? ` por $${Math.round(s.valor_ultima_compraventa / 1e6).toLocaleString("es-CO")} millones (valor declarado)` : ""}`,
        lectura: (anios(s.ultima_compraventa) ?? 99) < 3 ? "Comprado hace poco: el dueño actual probablemente no vende pronto." : "Referencia de precio para negociar.", efecto: "neutral" });
  const puntaje = lista.reduce((a, x) => a + (x.efecto === "favorable" ? 1 : x.efecto === "riesgo" ? -1 : 0), 0);
  return {
    disponible: true,
    matricula: s.registro, folio_abierto: fecha(s.folio_abierto), actos_2015_2023: Number(s.actos_2015_2023),
    probabilidad_venta: puntaje >= 2 ? "alta" : puntaje === 1 ? "media" : puntaje < 0 ? "baja (riesgo)" : "sin señal clara",
    senales: lista,
    fuente: "Actos registrados del folio (IGAC, datos 2015–2023) vía Croma; inferencia para priorizar, confirmar con certificado de tradición.",
  };
}

export async function contactoPredio(f: FichaInput) {
  const p = await encontrarPredio(f);
  if (!p) return { encontrado: false, mensaje: "Predio no encontrado." };
  const [direcciones, folios, senal, avisos] = await Promise.all([
    sql`SELECT direccion, codigo_postal FROM parcel_address WHERE parcel_id = ${p.id} ORDER BY direccion LIMIT 10`,
    sql`SELECT matricula, registro, por_derecho, uso_predial FROM parcel_folio WHERE parcel_id = ${p.id} ORDER BY por_derecho DESC NULLS LAST LIMIT 20`,
    sql`SELECT * FROM parcel_senales WHERE parcel_id = ${p.id}`,
    sql`SELECT l.id AS fynder_id, l.titulo, l.precio, l.area, l.area_lote, l.barrio,
               round(ST_Distance(l.geom::geography, ST_SetSRID(ST_MakePoint(${Number(p.lon)}, ${Number(p.lat)}), 4326)::geography)) AS distancia_m
        FROM listing l WHERE l.activa AND l.negocio = 'venta' AND (l.tipo LIKE 'lote%' OR l.tipo LIKE 'casa%')
          AND (l.parcel_id = ${p.id} OR ST_DWithin(l.geom::geography, ST_SetSRID(ST_MakePoint(${Number(p.lon)}, ${Number(p.lat)}), 4326)::geography, 300))
        ORDER BY distancia_m LIMIT 5`,
  ]);
  const totalFolios = (await sql`SELECT count(*)::int n FROM parcel_folio WHERE parcel_id = ${p.id}`)[0].n;
  const principal = folios[0];
  const s = senal[0] ?? null;
  const senales = interpretarSenales(s);
  const titular = !s ? "desconocido" : s.fiducia ? "fiduciaria (patrimonio autónomo)" : s.señal_empresa ? "probablemente una empresa"
    : s.derechos_de_cuota ? "varios copropietarios" : s.sucesion ? "herederos (adjudicación en sucesión)" : "no determinable con los actos 2015–2023";
  const registro = principal?.registro ?? (principal ? `(oficina por confirmar)-${principal.matricula}` : null);

  return {
    encontrado: true,
    predio: { id: p.id, municipio: p.municipio, barrio: p.barrio_catastral, area_lote_m2: Number(p.area_lote), tratamiento: p.tratamiento },
    inmueble: {
      direcciones: direcciones.map((d: any) => d.direccion + (d.codigo_postal && d.codigo_postal !== "0" ? ` (CP ${d.codigo_postal})` : "")),
      matricula_principal: registro,
      folios_en_el_predio: totalFolios,
      propiedad_horizontal: totalFolios > 5 ? "sí (muchas unidades: negociar con la copropiedad)" : "no aparente",
    },
    titular_probable: titular,
    senales_de_venta: senales,
    rutas_de_contacto: [
      registro && {
        paso: "1. Saber quién es el dueño",
        como: `Comprar el certificado de tradición y libertad de la matrícula ${registro} en ${CERTIFICADO_URL} (pago en línea, entrega inmediata). Trae el nombre y documento de los titulares y todos los gravámenes vigentes.`,
      },
      {
        paso: "2a. Si el titular es una empresa",
        como: "Con el NIT del certificado, usar la herramienta empresa_propietaria: razón social, estado, representantes legales, procesos judiciales y enlace al certificado de cámara de comercio (que trae dirección y correo de notificación).",
      },
      direcciones.length && {
        paso: "2b. Si el titular es una persona",
        como: `Carta física dirigida al propietario a ${direcciones[0].direccion}, Medellín, o a través de un broker/agente. No usar teléfonos ni correos personales sin autorización.`,
      },
      avisos.length && {
        paso: "Atajo: hay oferta publicada en Fynder cerca",
        como: `${avisos.length} aviso(s) de lote o casa a ≤300 m (ubicación aproximada). El contacto del anunciante se obtiene en Fynder con una llave (ver_contacto).`,
        avisos,
      },
    ].filter(Boolean),
    aviso_legal: AVISO_LEGAL,
  };
}

/** Ficha pública de una empresa propietaria por NIT (RUES y Rama Judicial vía Croma). */
export async function empresaPropietaria(nit: string) {
  const limpio = nit.replace(/\D/g, "").slice(0, 15);
  const d = await croma<any>("/co/rues/entity-by-nit/v1", { document_number: limpio.length === 10 ? limpio.slice(0, 9) : limpio });
  if (!d?.found) return { encontrada: false, mensaje: `El NIT ${limpio} no aparece en el RUES.` };
  const e = d.entity;
  let procesos: any = null;
  try {
    const r = await croma<any>("/co/rama-judicial/cases-by-entity/v1", { name: e.name.replace(/[^\p{L}\p{N} .,'&-]/gu, " ").slice(0, 120), entity_type: "juridical" });
    const lista = r?.cases ?? r?.results ?? [];
    procesos = { total: r?.total ?? lista.length, recientes: lista.slice(0, 5).map((c: any) => ({ radicado: c.radicado ?? c.case_number, despacho: c.court ?? c.court_name, fecha: c.last_action_date ?? c.date, clase: c.class ?? c.process_class })) };
  } catch (err) {
    procesos = { error: (err as Error).message };
  }
  return {
    encontrada: true,
    empresa: {
      nit: e.nit, razon_social: e.name, sigla: e.acronym, estado: e.registration_status, organizacion: e.legal_organization,
      camara: e.chamber_name, matricula_mercantil: e.registration_number, constituida: e.registration_date, ultima_renovacion: e.last_renewed_year,
      actividad: e.primary_activity?.description, en_liquidacion: /LIQUIDACI/i.test(`${e.name} ${e.registration_status}`),
      contacto_publicado: { direccion: e.commercial_address, municipio: e.commercial_municipality, telefonos: e.commercial_phones, correo: e.commercial_email },
      certificado_camara_url: e.certificates_sale_url,
    },
    representantes_legales: (() => {
      const reps = (d.related_parties ?? []).filter((r: any) => /representante/i.test(r.role)).map((r: any) => ({ nombre: r.name, cargo: r.role }));
      return reps.length ? reps : "No vinieron en esta consulta (el RUES no siempre los entrega); están en el certificado de cámara de comercio.";
    })(),
    procesos_judiciales: procesos,
    nota: "Datos del registro mercantil (públicos). Si el contacto publicado viene vacío, el certificado de existencia y representación (enlace) trae dirección y correo de notificación judicial.",
    fuente: "RUES y Rama Judicial vía Croma",
  };
}
