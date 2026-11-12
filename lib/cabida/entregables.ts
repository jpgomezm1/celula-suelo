// Entregables del anteproyecto: cuadro de áreas en Excel, modelo 3D en DXF (georreferenciado), vista para el visor
// web y el paquete ZIP con planos DXF, planchas PDF, modelo 3D y Excel.
import ExcelJS from "exceljs";
import JSZip from "jszip";
import earcut from "earcut";
import { aGlobal, type Pt } from "./lote";
import { aLote } from "./proyecto";
import { planchas } from "./planos";
import { aDxf, aPdf } from "./lienzo";

type Proyecto = any;
const transformar = (t: any, poly: Pt[]) => poly.map(aLote(t));

/** Unidades (apartamento por apartamento y piso) con su nomenclatura: piso × 100 + número. */
export function unidadesDetalle(m: Proyecto) {
  const conv = new Set<string>(m.primer_piso.flatMap((x: any) => [x.lobby, ...x.equipamiento.map((e: any) => e.id)].filter(Boolean)));
  const adapt = new Set<string>(m.primer_piso.flatMap((x: any) => x.adaptables));
  const filas: any[] = [];
  for (const n of m.niveles.filter((x: any) => x.tipo === "primero" || x.tipo === "tipo")) {
    const piso = Number(String(n.nombre).replace(/\D/g, ""));
    for (const t of m.torres) for (const a of t.planta.aptos) {
      if (n.tipo === "primero" && conv.has(a.id)) continue;
      const num = Number(a.id.replace(/\D/g, ""));
      filas.push({ torre: t.id, piso, unidad: `${t.id}-${piso}${String(num).padStart(2, "0")}`, tipologia: a.nombre, alcobas: a.alcobas, banos: a.banos, area_privada_m2: a.area_privada,
        fachada: a.lado === "sur" ? "Frente" : "Fondo", adaptable: n.tipo === "primero" && adapt.has(a.id) ? "Sí" : "" });
    }
  }
  return filas;
}

export async function excelAreas(m: Proyecto) {
  const wb = new ExcelJS.Workbook(); wb.creator = "irrelevant · Inteligencia de suelo";
  const morado = "FF6C4DE7", encabezado = (ws: ExcelJS.Worksheet) => { const r = ws.getRow(1); r.font = { bold: true, color: { argb: "FFFFFFFF" } }; r.fill = { type: "pattern", pattern: "solid", fgColor: { argb: morado } }; };
  const r = m.resumen;
  const ws = wb.addWorksheet("Resumen");
  ws.columns = [{ header: "Concepto", key: "c", width: 52 }, { header: "Valor", key: "v", width: 22 }, { header: "Nota", key: "n", width: 70 }];
  const filas: [string, any, string?][] = [
    ["Predio", m.predio], ["Barrio · municipio", `${m.barrio ?? ""} · ${m.municipio ?? ""}`], ["Escenario de norma", r.escenario],
    ["Área del lote (m²)", r.area_lote_m2], ["Área edificable después de retiros (m²)", r.area_edificable_m2, `Frontal ${m.norma.frontal} m · lateral ${m.norma.lateral} m · fondo ${m.norma.fondo} m`],
    ["Torres", r.torres], ["Pisos", r.pisos_totales], ["Altura (m)", r.altura_m], ["Apartamentos por piso tipo", r.aptos_por_piso], ["Unidades de vivienda", r.unidades, `La norma permite ${r.unidades_norma}`],
    ["Área construida sobre rasante (m²)", r.area_construida_sobre_rasante_m2], ["Área construible según norma (m²)", r.area_construible_norma_m2], ["Aprovechamiento de la norma", r.aprovechamiento_pct / 100],
    ["Área vendible privada (m²)", r.area_vendible_m2], ["Eficiencia de planta", r.eficiencia_planta_pct / 100], ["Área común por piso tipo (m²)", r.area_comun_por_piso_m2],
    ["Índice de construcción resultante", r.indice_construccion], ["Índice de ocupación resultante", r.indice_ocupacion],
    ["Sótanos", r.sotanos], ["Área de sótanos (m²)", r.area_sotanos_m2], ["Parqueaderos dibujados", r.parqueaderos_dibujados], ["Parqueaderos según norma", r.parqueaderos_exigidos, r.parqueaderos_nota], ["Visitantes", r.visitantes],
    ["Depósitos", r.depositos], ["Rampa", `${Math.round(r.rampa.pendiente * 100)} % · ${r.rampa.largo_m} m`, r.rampa.nota],
    ["Escaleras · ascensores", `${r.punto_fijo.escaleras} · ${r.punto_fijo.ascensores}`, r.punto_fijo.notas.join(" ")],
    ["Equipamiento comunitario exigido (m²)", r.obligaciones.equipamiento_m2, "1 m² construido por vivienda"], ["Equipamiento en sitio (m²)", r.obligaciones.equipamiento_en_sitio_m2],
    ["Equipamiento a compensar (m²)", r.obligaciones.equipamiento_a_compensar_m2], ["Viviendas adaptables", r.obligaciones.viviendas_adaptables, "1 de cada 30 (Decreto 471, art. 225)"],
  ];
  for (const [c, v, n] of filas) ws.addRow({ c, v, n: n ?? "" });
  ws.getColumn("v").numFmt = "#,##0.##";
  for (const i of [13, 15]) ws.getRow(i + 1).getCell(2).numFmt = "0%";
  encabezado(ws);
  ws.addRow({}); ws.addRow({ c: "Aviso", n: m.aviso });

  const wt = wb.addWorksheet("Por tipología");
  wt.columns = [{ header: "Tipología", key: "t", width: 20 }, { header: "Unidades", key: "u", width: 12 }, { header: "Área promedio (m²)", key: "a", width: 18 }, { header: "% de la mezcla", key: "p", width: 15 }, { header: "Área total (m²)", key: "at", width: 16 }];
  for (const x of r.por_tipologia) wt.addRow({ t: x.tipologia, u: x.unidades, a: x.area_promedio_m2, p: x.pct / 100, at: Math.round(x.unidades * x.area_promedio_m2) });
  wt.getColumn("p").numFmt = "0%"; encabezado(wt);

  const wu = wb.addWorksheet("Unidades");
  wu.columns = [{ header: "Torre", key: "torre", width: 8 }, { header: "Piso", key: "piso", width: 7 }, { header: "Unidad", key: "unidad", width: 12 }, { header: "Tipología", key: "tipologia", width: 14 },
    { header: "Alcobas", key: "alcobas", width: 9 }, { header: "Baños", key: "banos", width: 8 }, { header: "Área privada (m²)", key: "area_privada_m2", width: 18 }, { header: "Fachada", key: "fachada", width: 10 }, { header: "Adaptable", key: "adaptable", width: 11 }];
  for (const f of unidadesDetalle(m)) wu.addRow(f);
  encabezado(wu); wu.autoFilter = { from: "A1", to: "I1" }; wu.views = [{ state: "frozen", ySplit: 1 }];

  const wn = wb.addWorksheet("Niveles");
  wn.columns = [{ header: "Nivel", key: "n", width: 16 }, { header: "Uso", key: "u", width: 14 }, { header: "Cota (m)", key: "z", width: 10 }, { header: "Altura (m)", key: "h", width: 10 }];
  for (const n of [...m.niveles].reverse()) wn.addRow({ n: n.nombre, u: n.tipo, z: n.z, h: n.altura });
  encabezado(wn);

  const wo = wb.addWorksheet("Norma");
  wo.columns = [{ header: "Regla aplicada", key: "r", width: 120 }];
  for (const c of [m.norma.fuente, ...m.norma.citas, ...r.punto_fijo.notas, r.parqueaderos_nota, r.rampa.nota]) wo.addRow({ r: c });
  encabezado(wo);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** Modelo 3D en DXF R12 (3DFACE), georreferenciado en EPSG 9377: placas, fachadas con vanos, núcleos, sótanos. */
export function modelo3dDxf(m: Proyecto) {
  const g = aGlobal(m.marco);
  const out: string[] = [];
  const w = (c: number, v: string | number) => out.push(String(c), typeof v === "number" ? (Math.round(v * 1000) / 1000).toString() : v);
  const capas: [string, number][] = [["3D-LOSA", 8], ["3D-FACHADA", 5], ["3D-VIDRIO", 4], ["3D-NUCLEO", 1], ["3D-SOTANO", 252], ["3D-LOTE", 2], ["3D-APTO", 30]];
  w(0, "SECTION"); w(2, "HEADER"); w(9, "$ACADVER"); w(1, "AC1009"); w(0, "ENDSEC");
  w(0, "SECTION"); w(2, "TABLES"); w(0, "TABLE"); w(2, "LAYER"); w(70, capas.length);
  for (const [n, c] of capas) { w(0, "LAYER"); w(2, n); w(70, 0); w(62, c); w(6, "CONTINUOUS"); }
  w(0, "ENDTAB"); w(0, "ENDSEC"); w(0, "SECTION"); w(2, "ENTITIES");
  const cara = (capa: string, pts: number[][]) => { const q = pts.length === 3 ? [...pts, pts[2]] : pts; w(0, "3DFACE"); w(8, capa); q.forEach((p, i) => { w(10 + i, p[0]); w(20 + i, p[1]); w(30 + i, p[2]); }); };
  const placa = (capa: string, poly: Pt[], z: number) => { const P = poly.map(g); const t = earcut(poly.flat()); for (let i = 0; i < t.length; i += 3) cara(capa, [[...P[t[i]], z], [...P[t[i + 1]], z], [...P[t[i + 2]], z]]); };
  const pared = (capa: string, a: Pt, b: Pt, z0: number, z1: number) => { const A = g(a), B = g(b); cara(capa, [[A[0], A[1], z0], [B[0], B[1], z0], [B[0], B[1], z1], [A[0], A[1], z1]]); };
  const prisma = (capa: string, poly: Pt[], z0: number, z1: number) => { placa(capa, poly, z0); placa(capa, poly, z1); poly.forEach((p, i) => pared(capa, p, poly[(i + 1) % poly.length], z0, z1)); };
  // Lote
  const L = m.marco.lote as Pt[]; L.forEach((p, i) => { const A = g(p), B = g(L[(i + 1) % L.length]); w(0, "LINE"); w(8, "3D-LOTE"); w(10, A[0]); w(20, A[1]); w(30, 0); w(11, B[0]); w(21, B[1]); w(31, 0); });
  // Sótanos
  for (const s of m.sotanos) { const z = -s.nivel * 3; prisma("3D-SOTANO", s.poligono, z, z + 0.2); }
  // Torres por piso: losa, fachadas con vanos de ventana (antepecho 0,9 m, dintel 2,2 m) y núcleo
  for (const n of m.niveles.filter((x: any) => x.tipo !== "sotano")) {
    for (const t of m.torres) {
      const T = aLote(t), pl = t.planta;
      const huella: Pt[] = [T([0, 0]), T([pl.L, 0]), T([pl.L, pl.D]), T([0, pl.D])];
      placa("3D-LOSA", huella, n.z);
      for (const [q, lado] of [[0, "sur"], [pl.D, "norte"]] as [number, string][]) {
        const vs = pl.ventanas.filter((v: any) => Math.abs(v.a[1] - q) < 0.05).map((v: any) => [Math.min(v.a[0], v.b[0]), Math.max(v.a[0], v.b[0]), v.tipo] as [number, number, string]).sort((a: any, b: any) => a[0] - b[0]);
        let s = 0;
        for (const [a, b, tipo] of vs) {
          if (a > s) pared("3D-FACHADA", T([s, q]), T([a, q]), n.z, n.z + n.altura);
          const antepecho = tipo === "ventanal" ? 0 : 0.9;
          if (antepecho) pared("3D-FACHADA", T([a, q]), T([b, q]), n.z, n.z + antepecho);
          pared("3D-FACHADA", T([a, q]), T([b, q]), n.z + 2.2, n.z + n.altura);
          pared("3D-VIDRIO", T([a, q]), T([b, q]), n.z + antepecho, n.z + 2.2);
          s = b;
        }
        if (pl.L > s) pared("3D-FACHADA", T([s, q]), T([pl.L, q]), n.z, n.z + n.altura);
        void lado;
      }
      pared("3D-FACHADA", T([0, 0]), T([0, pl.D]), n.z, n.z + n.altura); pared("3D-FACHADA", T([pl.L, 0]), T([pl.L, pl.D]), n.z, n.z + n.altura);
      for (const e of [...pl.nucleo.escaleras, ...pl.nucleo.ascensores]) prisma("3D-NUCLEO", transformar(t, e), n.z, n.z + n.altura);
    }
  }
  const zTop = Math.max(...m.niveles.map((x: any) => x.z + x.altura));
  for (const t of m.torres) { const T = aLote(t), pl = t.planta; placa("3D-LOSA", [T([0, 0]), T([pl.L, 0]), T([pl.L, pl.D]), T([0, pl.D])], zTop); }
  w(0, "ENDSEC"); w(0, "EOF");
  return out.join("\r\n");
}

/** Vista para el visor 3D de la plataforma (marco local del lote). */
export function vista3d(m: Proyecto) {
  const conv = new Set<string>(m.primer_piso.flatMap((x: any) => [x.lobby, ...x.equipamiento.map((e: any) => e.id)].filter(Boolean)));
  const niveles = m.niveles.map((n: any) => {
    const elementos: any[] = [];
    if (n.tipo === "sotano") {
      const s = m.sotanos.find((x: any) => -x.nivel * 3 === n.z);
      if (s) {
        elementos.push({ capa: "SOTANO", poligono: s.poligono, altura: n.altura });
        for (const q of s.puestos) elementos.push({ capa: "PARQUEADEROS", poligono: q.poly, etiqueta: q.visitante ? `Visitantes ${q.n}` : `Parqueadero ${q.n}` });
        for (const c of s.calles) elementos.push({ capa: "CIRCULACION_VEHICULAR", poligono: c });
        elementos.push({ capa: "RAMPA", poligono: s.rampa, etiqueta: "Rampa" });
        for (const nn of s.nucleos) elementos.push({ capa: "NUCLEO", poligono: nn, altura: n.altura, etiqueta: "Punto fijo" });
      }
    } else {
      for (const t of m.torres) {
        const T = aLote(t), pl = t.planta;
        elementos.push({ capa: "TORRE", poligono: [T([0, 0]), T([pl.L, 0]), T([pl.L, pl.D]), T([0, pl.D])], altura: n.altura, etiqueta: `Torre ${t.id}` });
        for (const a of pl.aptos) {
          const nombre = n.tipo === "primero" && conv.has(a.id) ? (m.primer_piso.find((x: any) => x.lobby === a.id) ? "Lobby y portería" : "Equipamiento comunitario") : `${a.nombre} · ${a.area_privada} m²`;
          elementos.push({ capa: "APARTAMENTOS", poligono: transformar(t, a.poly), etiqueta: `${t.id}-${n.nombre.replace(/\D/g, "")}${a.id.replace(/\D/g, "").padStart(2, "0")} · ${nombre}` });
        }
        for (const c of pl.circulacion) elementos.push({ capa: "CIRCULACION", poligono: transformar(t, c) });
        for (const mu of pl.muros) elementos.push({ capa: "MURO", poligono: transformar(t, mu.poly), altura: n.altura });
        for (const e of [...pl.nucleo.escaleras, ...pl.nucleo.ascensores]) elementos.push({ capa: "NUCLEO", poligono: transformar(t, e), altura: n.altura, etiqueta: "Punto fijo" });
      }
    }
    return { nombre: n.nombre, tipo: n.tipo === "primero" ? "tipo" : n.tipo, z: n.z, altura: n.altura, elementos };
  });
  return { predio: m.predio, barrio: m.barrio, lote: m.marco.lote, edificable: m.edificable, niveles,
    resumen: { ...m.resumen, pisos_totales: m.resumen.pisos_totales, sotanos: m.resumen.sotanos } };
}

/** Paquete ZIP con todo. */
export async function paquete(m: Proyecto) {
  const pl = planchas(m);
  const nombre = `Anteproyecto ${String(m.predio).replace(":", "-")}`;
  const zip = new JSZip();
  zip.file(`${nombre} - Planos.dxf`, aDxf(pl));
  zip.file(`${nombre} - Planchas.pdf`, await aPdf(pl, nombre));
  zip.file(`${nombre} - Modelo 3D (EPSG 9377).dxf`, modelo3dDxf(m));
  zip.file(`${nombre} - Cuadro de areas.xlsx`, await excelAreas(m));
  zip.file("LEEME.txt", [
    `${nombre} · ${m.barrio ?? ""}, ${m.municipio ?? ""}`, "",
    "Contenido:",
    "- Planos.dxf: planchas A1 en espacio modelo (1 unidad = 1 m) con capas estándar A-*, bloques de puertas y mobiliario, rellenos y cotas.",
    "- Planchas.pdf: las mismas planchas para imprimir o revisar.",
    "- Modelo 3D (EPSG 9377).dxf: volumetría georreferenciada en MAGNA-SIRGAS Origen Nacional (losas, fachadas con vanos, núcleos y sótanos).",
    "- Cuadro de areas.xlsx: resumen, tipologías, unidad por unidad, niveles y norma aplicada.", "",
    "Para DWG: abrir el DXF en AutoCAD o BricsCAD y Guardar como DWG.", "", m.aviso,
  ].join("\r\n"));
  return { nombre, buffer: Buffer.from(await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" })) };
}
