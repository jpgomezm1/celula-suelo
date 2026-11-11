// Catálogo de fuentes v2: 17 municipios. Agregar una fuente = agregar una entrada.
// Cada fuente declara su capa, filtro y cómo traducir sus campos a claves canónicas (ingest/canon.ts).

import { dane, get, gradoAmenaza, num, originales, str, tipoAmenaza, type Props } from "./canon";

export type Target = "parcel" | "building" | "zoning" | "licence";

export type Source = {
  key: string;
  nombre: string;
  url: string;
  target: Target;
  /** Municipio fijo de la capa; si falta, `map` debe devolver municipio_dane. */
  municipio?: string;
  where?: string;
  capa?: string;
  subtipo?: string;
  licencia: string;
  notas?: string;
  /** Tamaño de página (para servidores que fallan con páginas grandes). */
  pageSize?: number;
  /** Prefijo del id de construcciones (para partir una fuente grande en rangos sin duplicar). */
  idPrefix?: string;
  /** Capa WFS (GeoServer) en vez de ArcGIS REST. */
  wfsType?: string;
  /** Traduce los atributos de la fuente a la fila canónica (sin geometría). null = descartar. */
  map: (p: Props) => Record<string, unknown> | null;
  grupo: string[]; // etiquetas para correr por lotes: suelo, valle, oriente, medellin, <dane>
};

const GEOMED = "https://www.medellin.gov.co/servidormapas/rest/services";
const IDEM = "https://portalidem.metropol.gov.co/server/rest/services";
const GEOANT = "https://geodatos.antioquia.gov.co/server/rest/services/Catastro/BCGS_Catastro_Publico/MapServer";
const CORNARE = "https://geoportal.cornare.gov.co/arcgis/rest/services/CATASTRO/Catastro_Valle_San_Nicolas/MapServer";
const CORNARE_WFS = "https://geoportal.cornare.gov.co/geoserver/ows";

const LIC_GEOMED = "Servicio público de GeoMedellín; sin licencia de reutilización declarada";
const LIC_IDEM = "Servicio público IDEM, Área Metropolitana del Valle de Aburrá; sin licencia de reutilización declarada";
const LIC_GEOANT = "Servicio público GeoAntioquia, Gobernación de Antioquia; sin licencia de reutilización declarada";
const LIC_CORNARE = "Servicio público Cornare; sin licencia de reutilización declarada";

// ───────── mapeos reutilizables ─────────

const amenaza = (defecto: string | null) => (p: Props) => ({
  attrs: { grado: gradoAmenaza(p), tipo: tipoAmenaza(p, defecto), src: originales(p) },
});
const proteccion = (p: Props) => ({
  attrs: { categoria: str(get(p, "PROT_2018", "DESCRIPCION", "subcategoria_proteccion", "categoria", "SIMBOLOGIA")), src: originales(p) },
});
const uso = (p: Props) => ({
  attrs: { uso: str(get(p, "USO", "DESCRIPCION", "areagraluso", "USO_ACTUAL", "USOS", "SIMBOLOGIA")), src: originales(p) },
});
/** Tratamiento sin números (grupo C): la norma sale de norma_tratamiento por código o nombre. */
const tratamientoCodigo = (codigo: string, nombre: string) => (p: Props) => ({
  attrs: { codigo: str(get(p, codigo)), tratamiento: str(get(p, nombre)), src: originales(p) },
});

// ───────── Medellín (GeoMedellín) ─────────

const medellin: Source[] = [
  {
    key: "geomed_lotes", nombre: "Lotes catastrales · GeoMedellín", municipio: "05001", target: "parcel",
    url: `${GEOMED}/ServiciosCatastro/Base_Catastral/MapServer/3`, licencia: LIC_GEOMED, grupo: ["suelo", "medellin", "05001"],
    map: (p) => ({
      clave: str(get(p, "cbml")), area_lote: num(get(p, "area_lote"), { ceroEsNull: true }), tipo_lote: str(get(p, "tipo_lote")),
      clase: [1, 5].includes(Number(get(p, "subtipo_lote"))) ? "U" : "R",
    }),
  },
  {
    key: "geomed_construcciones", nombre: "Construcciones catastrales · GeoMedellín", municipio: "05001", target: "building",
    url: `${GEOMED}/ServiciosCatastro/Base_Catastral/MapServer/5`, licencia: LIC_GEOMED, grupo: ["suelo", "medellin", "05001"],
    map: (p) => ({ oid: get(p, "objectid"), pisos: num(get(p, "numero_pisos")), area_construida: num(get(p, "area_construida")), uso: str(get(p, "tipo_construccion")) }),
  },
  {
    key: "geomed_tratamientos", nombre: "Tratamientos, alturas, densidades e índices · POT 48 Medellín", municipio: "05001", target: "zoning", capa: "tratamiento",
    url: `${GEOMED}/ordenamiento_ter/VM_22_Tratamientos_Urbanos/MapServer/0`, licencia: LIC_GEOMED, grupo: ["suelo", "medellin", "05001"],
    notas: "POT 48 de 2014 (Acuerdo 48), vigente; orientativo, validar con Planeación",
    map: (p) => ({
      attrs: {
        tratamiento: str(get(p, "tratamiento")), codigo: str(get(p, "codigo_tramiento")), clase_suelo: str(get(p, "clase_suelo")),
        altura_max: num(get(p, "alturanormativa"), { ceroEsNull: true }), altura_texto: str(get(p, "alturanormativa")),
        ic_max: num(get(p, "indiceconstruccmax"), { ceroEsNull: true }), ic_total: num(get(p, "ictotal"), { ceroEsNull: true }),
        densidad_max: num(get(p, "densidadmax"), { ceroEsNull: true }), norma_fuente: "servicio", src: originales(p),
      },
    }),
  },
  {
    key: "geomed_usos", nombre: "Usos generales del suelo urbano · POT 48 Medellín", municipio: "05001", target: "zoning", capa: "uso",
    url: `${GEOMED}/ordenamiento_ter/VM_23_Uso_General_Suelo_Urbano/MapServer/2`, licencia: LIC_GEOMED, grupo: ["suelo", "medellin", "05001"], map: uso,
  },
  {
    key: "geomed_valor_suelo", nombre: "Valor del suelo por m² (ZGE, vigencia 2026) · Catastro Medellín", municipio: "05001", target: "zoning", capa: "valor_suelo",
    url: `${GEOMED}/ServiciosCatastro/Base_Catastral/MapServer/12`, licencia: LIC_GEOMED, grupo: ["suelo", "medellin", "05001"],
    map: (p) => ({ attrs: { valor_m2: num(get(p, "valor_m2")), tipo_valor: "Valor catastral (ZGE)", vigencia: num(get(p, "vigencia")), src: originales(p) } }),
  },
  ...([["masa", "VM_05_Amenazas_Movimientos_Masa", "movimientos_masa"], ["inundacion", "VM_06_Amenazas_Inundaciones", "inundacion"],
       ["torrencial", "VM_07_Amenazas_Avenidas_Torrenciales", "avenidas_torrenciales"]] as const).map(([k, svc, tipo]): Source => ({
    key: `geomed_amenaza_${k}`, nombre: `Amenaza (${tipo.replace("_", " ")}) · POT 48 Medellín`, municipio: "05001", target: "zoning", capa: "amenaza",
    url: `${GEOMED}/ordenamiento_ter/${svc}/MapServer/2`, licencia: LIC_GEOMED, grupo: ["suelo", "medellin", "05001"],
    map: (p) => ({ attrs: { grado: str(get(p, "grado_amenaza")) ?? gradoAmenaza(p), tipo, src: originales(p) } }),
  })),
  {
    key: "geomed_proteccion", nombre: "Áreas de conservación y protección ambiental · POT 48 Medellín", municipio: "05001", target: "zoning", capa: "proteccion",
    url: `${GEOMED}/ordenamiento_ter/VM_03_Cat_Suelo_Protecc_Producc_Suburb/MapServer/1`, licencia: LIC_GEOMED, grupo: ["suelo", "medellin", "05001"], map: proteccion,
  },
  {
    key: "geomed_retiros_hidricos", nombre: "Retiros a la red hídrica · POT 48 Medellín", municipio: "05001", target: "zoning", capa: "proteccion", subtipo: "retiro_hidrico",
    url: `${GEOMED}/ordenamiento_ter/VM_04_Estructura_Ecologica_Principal/MapServer/8`, licencia: LIC_GEOMED, grupo: ["suelo", "medellin", "05001"],
    map: (p) => ({ attrs: { categoria: "Retiro a la red hídrica", faja_m: num(get(p, "faja_retiro")), src: originales(p) } }),
  },
  {
    key: "geomed_barrios", nombre: "Barrios y veredas · Catastro Medellín", municipio: "05001", target: "zoning", capa: "barrio",
    url: `${GEOMED}/ServiciosCatastro/Base_Catastral/MapServer/1`, licencia: LIC_GEOMED, grupo: ["suelo", "medellin", "05001"],
    map: (p) => ({ attrs: { nombre: str(get(p, "nombre_barrio")), comuna: str(get(p, "nombre_comuna")), src: originales(p) } }),
  },
  {
    key: "geomed_licencias", nombre: "Licencias urbanísticas históricas · curadurías (archivo GeoMedellín)", municipio: "05001", target: "licence",
    url: `${GEOMED}/vivienda_ciudad_terri/VM_Licencias/MapServer/2`, licencia: LIC_GEOMED, grupo: ["suelo", "medellin", "05001"],
    notas: "Archivo histórico de licencias; no incluye necesariamente las más recientes",
    map: (p) => ({
      oid: get(p, "objectid"), clave: str(get(p, "g__cbml")), curaduria: str(get(p, "curaduria")), anio: (() => { const a = num(get(p, "anio")); return a ? Math.floor(a) : null; })(),
      objeto: str(get(p, "objeto")), nombre_proyecto: str(get(p, "nombre_proyecto")), radicado: str(get(p, "n_radicado")),
      resolucion: str(get(p, "n_resolucion__licencia")), direccion: str(get(p, "placa_principal")),
    }),
  },
];

// ───────── Valle de Aburrá (IDEM) ─────────

type Catastro = { nombre: string; dane: string; svc: string; predios: [number, number]; construcciones: [number, number]; esquema: "PK" | "LADM" };
const CATASTROS: Catastro[] = [
  { nombre: "Envigado", dane: "05266", svc: "Envigado_Catastro", predios: [6, 7], construcciones: [4, 5], esquema: "PK" },
  { nombre: "Sabaneta", dane: "05631", svc: "Sabaneta_Catastro", predios: [6, 7], construcciones: [4, 5], esquema: "PK" },
  { nombre: "Itagüí", dane: "05360", svc: "Itag%C3%BC%C3%AD_Catastro", predios: [6, 7], construcciones: [4, 5], esquema: "PK" },
  { nombre: "Caldas", dane: "05129", svc: "Caldas_Catastro", predios: [7, 8], construcciones: [5, 6], esquema: "PK" },
  { nombre: "Girardota", dane: "05308", svc: "Girardota_Catastro", predios: [6, 7], construcciones: [4, 5], esquema: "PK" },
  { nombre: "Barbosa", dane: "05079", svc: "Barbosa_Catastro", predios: [7, 8], construcciones: [5, 6], esquema: "PK" },
  { nombre: "Bello", dane: "05088", svc: "Bello_Catastro", predios: [7, 8], construcciones: [5, 6], esquema: "LADM" },
  { nombre: "Copacabana", dane: "05212", svc: "Copacabana_Catastro", predios: [7, 8], construcciones: [5, 6], esquema: "LADM" },
  { nombre: "La Estrella", dane: "05380", svc: "La_Estrella_Catastro", predios: [8, 9], construcciones: [6, 7], esquema: "LADM" },
];

const valleCatastro: Source[] = CATASTROS.flatMap((c) => {
  const slug = c.nombre.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, "_");
  const grupo = ["suelo", "valle", c.dane];
  // LADM: el código de terreno a veces viene basura ("0001", "0000"); entonces se usa LOCAL_ID.
  const clave = (p: Props) => {
    if (c.esquema === "PK") return str(get(p, "PK_PREDIOS"));
    const t = str(get(p, "TERRENO_CO", "TERRENO_CODIGO"));
    return t && t.length >= 20 ? t : str(get(p, "LOCAL_ID"));
  };
  return ([["U", 0], ["R", 1]] as const).flatMap(([clase, i]): Source[] => [
    {
      key: `idem_${slug}_predios_${clase.toLowerCase()}`, nombre: `Predios ${clase === "U" ? "urbanos" : "rurales"} · Catastro ${c.nombre} (IDEM)`,
      municipio: c.dane, target: "parcel", url: `${IDEM}/${c.svc}/MapServer/${c.predios[i]}`, licencia: LIC_IDEM, grupo,
      map: (p) => ({ clave: clave(p), clase, area_lote: num(get(p, "AREA_M2"), { ceroEsNull: true }), tipo_lote: str(get(p, "TIPO")) }),
    },
    {
      key: `idem_${slug}_construcciones_${clase.toLowerCase()}`, nombre: `Construcciones ${clase === "U" ? "urbanas" : "rurales"} · Catastro ${c.nombre} (IDEM)`,
      municipio: c.dane, target: "building", url: `${IDEM}/${c.svc}/MapServer/${c.construcciones[i]}`, licencia: LIC_IDEM, grupo,
      map: (p) => ({
        oid: get(p, "OBJECTID"), pisos: num(get(p, "NO_PISOS", "NUMERO_PIS", "NUMERO_PISOS")),
        area_construida: num(get(p, "AREA_M2")), uso: str(get(p, "USO", "TIPO_CONST")),
      }),
    },
  ]);
});

type Pot = { dane: string; nombre: string; svc: string; tratamiento: number; map: Source["map"]; numerico: boolean; extra: [string, number, string, Source["map"]][] };
const POTS: Pot[] = [
  {
    dane: "05266", nombre: "Envigado", svc: "POT_Envigado/MapServer", tratamiento: 9, numerico: true,
    map: (p) => ({ attrs: {
      tratamiento: str(get(p, "TRATAMIENTO_2018")), codigo: str(get(p, "ORDEN")),
      altura_max: num(get(p, "ALTURA2018"), { ceroEsNull: true }), altura_adicional: num(get(p, "ALTURAADD"), { ceroEsNull: true }),
      ic_max: num(get(p, "IC_BA2018"), { ceroEsNull: true }), ic_total: num(get(p, "IC_AD2018"), { ceroEsNull: true }),
      densidad_max: num(get(p, "DEN2018"), { ceroEsNull: true }), norma_fuente: "servicio", src: originales(p),
    } }),
    extra: [["uso", 11, "", uso], ["amenaza", 5, "", amenaza("inundacion")], ["amenaza", 6, "", amenaza("movimientos_masa")], ["proteccion", 7, "", proteccion]],
  },
  {
    dane: "05631", nombre: "Sabaneta", svc: "POT_Sabaneta/MapServer", tratamiento: 3, numerico: true,
    map: (p) => ({ attrs: {
      tratamiento: str(get(p, "TRATAMIENTO")), codigo: str(get(p, "CODIGO")),
      altura_max: num(get(p, "ALTURA"), { ceroEsNull: true }), altura_texto: str(get(p, "ALTURA")),
      ic_max: num(get(p, "I_CONSTRUC"), { ceroEsNull: true }), ic_total: num(get(p, "ICONSTOTAL"), { ceroEsNull: true }),
      densidad_max: num(get(p, "DENSIDAD"), { ceroEsNull: true }), norma_fuente: "servicio", src: originales(p),
    } }),
    extra: [["uso", 1, "", uso], ["amenaza", 5, "", amenaza(null)], ["proteccion", 7, "", proteccion]],
  },
  {
    dane: "05079", nombre: "Barbosa", svc: "Barbosa_POT/MapServer", tratamiento: 4, numerico: true,
    map: (p) => ({ attrs: {
      tratamiento: str(get(p, "TRATAMIENTO")), codigo: str(get(p, "CÓDIGO", "CODIGO")),
      altura_max: num(get(p, "ALTURA_MAX"), { ceroEsNull: true }), io_max: num(get(p, "INDICE_OCU"), { ceroEsNull: true }),
      densidad_max: num(get(p, "DENSIDAD"), { ceroEsNull: true }), norma_fuente: "servicio", src: originales(p),
    } }),
    extra: [["uso", 2, "", uso], ["amenaza", 6, "", amenaza(null)], ["amenaza", 5, "", amenaza(null)], ["proteccion", 9, "", proteccion]],
  },
  { dane: "05360", nombre: "Itagüí", svc: "POT_Itagui/MapServer", tratamiento: 4, numerico: false, map: tratamientoCodigo("CODIGO", "TIPO"),
    extra: [["uso", 2, "", uso], ["amenaza", 7, "", amenaza("movimientos_masa")], ["amenaza", 8, "", amenaza("inundacion")], ["proteccion", 6, "", proteccion]] },
  { dane: "05088", nombre: "Bello", svc: "Bello_POT_EB/FeatureServer", tratamiento: 4, numerico: false, map: tratamientoCodigo("COD_POLIGO", "TRATAMIENT"),
    extra: [["uso", 6, "", uso], ["amenaza", 7, "", amenaza(null)], ["proteccion", 5, "", proteccion]] },
  { dane: "05380", nombre: "La Estrella", svc: "POT_La_Estrella/MapServer", tratamiento: 2, numerico: false, map: tratamientoCodigo("CODIGO", "DESCRIPCION"),
    extra: [["uso", 1, "", uso], ["amenaza", 6, "", amenaza(null)]] },
  { dane: "05129", nombre: "Caldas", svc: "POT_Caldas/MapServer", tratamiento: 5, numerico: false, map: tratamientoCodigo("CODIGO", "TRATAMIENTO"),
    extra: [["uso", 6, "", uso], ["amenaza", 2, "", amenaza(null)], ["proteccion", 3, "", proteccion]] },
  { dane: "05212", nombre: "Copacabana", svc: "POT_COPACABANA/MapServer", tratamiento: 5, numerico: false, map: tratamientoCodigo("NAME", "FOLDERPATH"),
    extra: [["uso", 3, "", uso], ["proteccion", 6, "", proteccion]] },
  { dane: "05308", nombre: "Girardota", svc: "Girardota_POT/MapServer", tratamiento: 5, numerico: false, map: tratamientoCodigo("LAYER", "TRATAMIENTO"),
    extra: [["proteccion", 3, "", proteccion]] },
];

const vallePot: Source[] = POTS.flatMap((pot) => {
  const slug = pot.nombre.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, "_");
  const grupo = ["suelo", "valle", pot.dane];
  const notas = pot.numerico ? "Norma numérica publicada por el municipio en IDEM; orientativa" : "El servicio solo trae el código del tratamiento; la norma numérica viene de norma_tratamiento (digitalizada)";
  return [
    { key: `idem_${slug}_tratamientos`, nombre: `Tratamientos urbanos · POT ${pot.nombre} (IDEM)`, municipio: pot.dane, target: "zoning", capa: "tratamiento",
      url: `${IDEM}/${pot.svc}/${pot.tratamiento}`, licencia: LIC_IDEM, notas, grupo, map: pot.map } satisfies Source,
    ...pot.extra.map(([capa, layer, , map], i): Source => ({
      key: `idem_${slug}_${capa}_${i}`, nombre: `${capa[0].toUpperCase()}${capa.slice(1)} · POT ${pot.nombre} (IDEM)`, municipio: pot.dane,
      target: "zoning", capa, url: `${IDEM}/${pot.svc}/${layer}`, licencia: LIC_IDEM, grupo, map,
    })),
  ];
});

const valleValores: Source = {
  key: "idem_valores_suelo", nombre: "Valor del suelo por m² por zona · Área Metropolitana (IDEM)", target: "zoning", capa: "valor_suelo",
  url: `${IDEM}/Valores_Usos_Suelo_Metropolitano/MapServer/0`, licencia: LIC_IDEM, grupo: ["suelo", "valle"],
  notas: "Zonas de valor sin vigencia declarada; Medellín se toma de su propio catastro",
  map: (p) => {
    const d = dane(get(p, "CODIGO_MUN"));
    if (!d || d === "05001") return null;
    return { municipio_dane: d, attrs: { valor_m2: num(get(p, "VALOR_M2")), tipo_valor: str(get(p, "TIPO_VALOR")), vigencia: null, src: originales(p) } };
  },
};

// ───────── Oriente (GeoAntioquia, Cornare) ─────────

const GEOANT_MUN: [string, string][] = [["05376", "La Ceja"], ["05318", "Guarne"], ["05148", "El Carmen de Viboral"], ["05400", "La Unión"]];
const oriente: Source[] = [
  ...GEOANT_MUN.flatMap(([d, nombre]): Source[] => {
    const slug = nombre.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, "_");
    const grupo = ["suelo", "oriente", d];
    return [
      ...([["U", 11], ["R", 10]] as const).map(([clase, layer]): Source => ({
        key: `geoant_${slug}_predios_${clase.toLowerCase()}`, nombre: `Predios ${clase === "U" ? "urbanos" : "rurales"} · Catastro ${nombre} (GeoAntioquia)`,
        municipio: d, target: "parcel", url: `${GEOANT}/${layer}`, where: `NPN LIKE '${d}%'`, licencia: LIC_GEOANT, grupo,
        map: (p) => ({ clave: str(get(p, "NPN", "TERRENO_CODIGO")), clase, area_lote: null, tipo_lote: str(get(p, "CARACTERISTICA")) }),
      })),
      ...([["U", 0], ["R", 3]] as const).map(([clase, layer]): Source => ({
        key: `geoant_${slug}_construcciones_${clase.toLowerCase()}`, nombre: `Construcciones ${clase === "U" ? "urbanas" : "rurales"} · Catastro ${nombre} (GeoAntioquia)`,
        municipio: d, target: "building", url: `${GEOANT}/${layer}`, where: `CODIGO_CONSTRUCCION LIKE '${d}%'`, licencia: LIC_GEOANT, grupo,
        map: (p) => ({ oid: get(p, "OBJECTID"), pisos: num(get(p, "NUMERO_PISOS")), area_construida: null, uso: str(get(p, "OBSERVACIONES")) }),
      })),
    ];
  }),
  ...([["05615", "Rionegro", 4, 3], ["05607", "El Retiro", 9, 8], ["05440", "Marinilla", 19, 18]] as const).flatMap(([d, nombre, u, r]): Source[] => {
    const slug = nombre.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, "_");
    return ([["U", u], ["R", r]] as const).map(([clase, layer]): Source => ({
      key: `cornare_${slug}_predios_${clase.toLowerCase()}`, nombre: `Predios ${clase === "U" ? "urbanos" : "rurales"} · Catastro ${nombre} (Cornare)`,
      municipio: d, target: "parcel", url: `${CORNARE}/${layer}`, licencia: LIC_CORNARE, grupo: ["suelo", "oriente", d],
      notas: d === "05615" ? "Corte 2024" : "Corte 2019",
      map: (p) => ({ clave: str(get(p, "PK_PREDIOS")), clase, area_lote: num(get(p, "Area_Predio"), { ceroEsNull: true }), tipo_lote: str(get(p, "TIPO")) }),
    }));
  }),
  ...([["masa", "amenazamovmasaurbana_mpio", "movimientos_masa"], ["inundacion", "amenazainundacionurbana_mpio", "inundacion"]] as const).map(([k, layer, tipo]): Source => ({
    key: `cornare_amenaza_${k}`, nombre: `Amenaza urbana (${tipo.replace("_", " ")}) · Oriente (Cornare)`, target: "zoning", capa: "amenaza",
    url: CORNARE_WFS, wfsType: `ws_sc_t_oat_y_gr:${layer}`, licencia: LIC_CORNARE, grupo: ["suelo", "oriente"],
    map: (p) => {
      const nombre = String(get(p, "nombre") ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
      const d = ORIENTE_POR_NOMBRE[nombre];
      if (!d) return null;
      return { municipio_dane: d, attrs: { grado: str(get(p, "categoria")) ?? gradoAmenaza(p), tipo, src: originales(p) } };
    },
  })),
];

const ORIENTE_POR_NOMBRE: Record<string, string> = {
  rionegro: "05615", "el retiro": "05607", retiro: "05607", "la ceja": "05376", "la ceja del tambo": "05376", guarne: "05318",
  marinilla: "05440", "el carmen de viboral": "05148", "carmen de viboral": "05148", "la union": "05400",
};

// Construcciones de Medellín (1,09 M) partidas en 6 rangos de objectid para descargar en paralelo.
const geomedConstruccionesPartes: Source[] = Array.from({ length: 6 }, (_, i) => {
  const base = medellin.find((s) => s.key === "geomed_construcciones")!;
  const paso = 580_000, a = i * paso, b = (i + 1) * paso;
  return { ...base, key: `geomed_construcciones_p${i + 1}`, idPrefix: "geomed_construcciones",
    where: `objectid >= ${a} AND objectid < ${b}`, grupo: ["medellin_construcciones"] };
});

export const SOURCES: Source[] = [...medellin, ...geomedConstruccionesPartes, ...valleCatastro, ...vallePot, valleValores, ...oriente];

// Capas pesadas que fallan con páginas grandes: páginas pequeñas.
for (const s of SOURCES) {
  if (["geomed_usos", "geomed_retiros_hidricos", "idem_sabaneta_proteccion_2", "cornare_el_retiro_predios_r"].includes(s.key)) s.pageSize = 100;
}
