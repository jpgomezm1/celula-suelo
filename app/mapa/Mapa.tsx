"use client";

import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

const MUNICIPIOS: [string, number, number][] = [
  ["Medellín", -75.5736, 6.2442], ["Envigado", -75.5906, 6.1716], ["Sabaneta", -75.6159, 6.1515], ["Itagüí", -75.6115, 6.1846],
  ["Bello", -75.5585, 6.3373], ["La Estrella", -75.6436, 6.1576], ["Caldas", -75.6342, 6.0911], ["Copacabana", -75.5091, 6.3488],
  ["Girardota", -75.4446, 6.3772], ["Barbosa", -75.3315, 6.4389], ["Rionegro", -75.3747, 6.1550], ["El Retiro", -75.5025, 6.0603],
  ["La Ceja", -75.4316, 6.0300], ["Guarne", -75.4436, 6.2795], ["Marinilla", -75.3364, 6.1736], ["El Carmen de Viboral", -75.3346, 6.0826],
  ["La Unión", -75.3610, 5.9734],
];

const C = { petroleo: "#006272", turquesa: "#009cb6", lima: "#84bd00", gris: "#979797", ambar: "#f2a900" };

const millones = (v?: number | null) => (v ? `$${(v / 1e6).toLocaleString("es-CO", { maximumFractionDigits: v < 1e8 ? 1 : 0 })} M` : "—");
const m2 = (v?: number | null) => (v ? `${Math.round(v).toLocaleString("es-CO")} m²` : "—");
const num = (v?: number | null, d = 0) => (v === null || v === undefined ? "—" : Number(v).toLocaleString("es-CO", { maximumFractionDigits: d }));
const pct = (v?: number | null) => (v === null || v === undefined ? "—" : `${Math.round(v * 100)}%`);

type Pestana = "estudio" | "detalle" | "oportunidades" | "galeria";

function Cifra({ v, k }: { v: React.ReactNode; k: string }) {
  return <div className="cifra"><div className="v">{v}</div><div className="k">{k}</div></div>;
}

export default function Mapa() {
  const contenedor = useRef<HTMLDivElement>(null);
  const mapa = useRef<maplibregl.Map | null>(null);
  const [pestana, setPestana] = useState<Pestana>("estudio");
  const [detalle, setDetalle] = useState<{ tipo: "predio" | "proyecto"; datos: any } | null>(null);
  const [oportunidades, setOportunidades] = useState<any>(null);
  const [cargando, setCargando] = useState<string | null>(null);
  const [municipio, setMunicipio] = useState("Medellín");
  const [contacto, setContacto] = useState<any>(null);
  const [dibujando, setDibujando] = useState(false);
  const dibujandoRef = useRef(false);
  const [vertices, setVertices] = useState<[number, number][]>([]);
  const [lote, setLote] = useState<{ id: string; nombre?: string } | null>(null);
  const [form, setForm] = useState({ nombre: "", tipo_vivienda: "todos", vocacion: "ambos", min_unidades: 100, radio_m: 3000 });
  const [estudio, setEstudio] = useState<any>(null);
  const [galeria, setGaleria] = useState<{ archivo: File | null; corte: string; msg: string; ok?: boolean }>({ archivo: null, corte: "", msg: "" });
  const [sobre, setSobre] = useState(false);
  const [modoOp, setModoOp] = useState<"perfil" | "rapidas">("perfil");
  const [perfil, setPerfil] = useState({ tipo_vivienda: "NO VIS", unidades_min: 150, unidades_max: 300, area_unidad_m2: 65, pisos_min: 12, area_lote_min: "", precio_m2_objetivo: "", barrios: "" });
  const [resPerfil, setResPerfil] = useState<any>(null);

  const rankingRef = useRef<any[]>([]);
  function pintarRanking(lista: any[]) {
    rankingRef.current = lista;
    const src = mapa.current?.getSource("ranking") as maplibregl.GeoJSONSource | undefined;
    if (!src) return; // el mapa aún carga: el manejador de "load" lo pinta al terminar
    src?.setData({ type: "FeatureCollection", features: lista.map((o, i) => ({ type: "Feature", properties: { n: i + 1, id: o.id },
      geometry: { type: "Point", coordinates: [Number(o.lon), Number(o.lat)] } })) } as any);
    if (lista.length && mapa.current) {
      const b = new maplibregl.LngLatBounds();
      lista.forEach((o) => b.extend([Number(o.lon), Number(o.lat)]));
      mapa.current.fitBounds(b, { padding: 80, maxZoom: 15 });
    }
  }

  async function estudioPerfil() {
    setCargando("Recorriendo todos los lotes del municipio…"); setResPerfil(null);
    const n = (v: any) => (v === "" || v === null || v === undefined ? undefined : Number(v));
    const body = { municipio, tipo_vivienda: perfil.tipo_vivienda, unidades_min: n(perfil.unidades_min), unidades_max: n(perfil.unidades_max),
      area_unidad_m2: n(perfil.area_unidad_m2), pisos_min: n(perfil.pisos_min), area_lote_min: n(perfil.area_lote_min),
      precio_m2_objetivo: perfil.precio_m2_objetivo ? Number(perfil.precio_m2_objetivo) * 1e6 : undefined,
      barrios: perfil.barrios ? perfil.barrios.split(",").map((x) => x.trim()).filter(Boolean) : undefined, limite: 30 };
    try {
      const r = await fetch("/api/perfil", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json();
      setResPerfil(j);
      if (!j.error) pintarRanking(j.oportunidades ?? []);
    } catch (e) { setResPerfil({ error: (e as Error).message }); } finally { setCargando(null); }
  }

  function pintarZona(vs: [number, number][]) {
    const src = mapa.current?.getSource("zona") as maplibregl.GeoJSONSource | undefined;
    if (!src) return;
    const anillo = vs.length >= 3 ? [...vs, vs[0]] : vs;
    src.setData({ type: "FeatureCollection", features: [
      ...(vs.length >= 2 ? [{ type: "Feature", properties: {}, geometry: vs.length >= 3 ? { type: "Polygon", coordinates: [anillo] } : { type: "LineString", coordinates: anillo } }] : []),
      ...vs.map((v) => ({ type: "Feature", properties: { vertice: true }, geometry: { type: "Point", coordinates: v } })),
    ] } as any);
  }

  function marcarLote(id: string | null) {
    mapa.current?.setFilter("lote-sel", ["==", ["get", "id"], id ?? "__ninguno__"]);
  }

  async function generarEstudio() {
    if (!lote && vertices.length < 3) return;
    setCargando("Armando el estudio de competencia…"); setEstudio(null);
    const centro = vertices.length >= 3 ? [vertices.reduce((a, v) => a + v[0], 0) / vertices.length, vertices.reduce((a, v) => a + v[1], 0) / vertices.length] : null;
    const body: any = { nombre: form.nombre || undefined, tipo_vivienda: form.tipo_vivienda, vocacion: form.vocacion, min_unidades: Number(form.min_unidades),
      lote: lote ? { id: lote.id } : { lon: centro![0], lat: centro![1] } };
    if (vertices.length >= 3) body.poligono = { type: "Polygon", coordinates: [[...vertices, vertices[0]]] };
    else body.radio_m = Number(form.radio_m);
    try {
      const r = await fetch("/api/estudio", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      setEstudio(await r.json());
    } catch (e) { setEstudio({ error: (e as Error).message }); } finally { setCargando(null); }
  }

  async function subirGaleria() {
    if (!galeria.archivo) return;
    setGaleria((g) => ({ ...g, msg: "Leyendo el Excel en tu navegador…", ok: undefined }));
    try {
      // El Excel se lee aquí y solo viajan las filas: así funciona con archivos de 30 MB aunque el servidor acepte 4,5 MB.
      const [{ default: ExcelJS }, { leerLibroGaleria }] = await Promise.all([import("exceljs"), import("@/lib/galeria_parse")]);
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(await galeria.archivo.arrayBuffer());
      const filas = leerLibroGaleria(wb);
      if (!filas.length) { setGaleria((g) => ({ ...g, ok: false, msg: "No encontré proyectos: el archivo debe tener una fila de encabezado con 'Código' y 'Proyecto'." })); return; }
      setGaleria((g) => ({ ...g, msg: `${filas.length} proyectos leídos. Cargando y ubicando en el mapa…` }));
      const r = await fetch("/api/galeria", { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ filas, corte: galeria.corte || undefined, nombre: galeria.archivo.name }) });
      const j = await r.json();
      setGaleria((g) => ({ ...g, ok: !j.error, msg: j.error ? j.error : `${j.proyectos} proyectos cargados · ${j.ubicados} ubicados en el mapa` }));
    } catch (e) { setGaleria((g) => ({ ...g, ok: false, msg: (e as Error).message })); }
  }

  async function abrir(tipo: "predio" | "proyecto", qs: string) {
    setCargando(tipo === "predio" ? "Cargando ficha del lote…" : "Cargando proyecto…");
    setContacto(null); setPestana("detalle");
    try {
      const r = await fetch(`/api/datos?tipo=${tipo}&${qs}`);
      setDetalle({ tipo, datos: await r.json() });
    } finally { setCargando(null); }
  }

  async function verOportunidades() {
    setCargando("Buscando oportunidades…");
    try {
      const r = await fetch(`/api/datos?tipo=oportunidades&municipio=${encodeURIComponent(municipio)}`);
      setOportunidades(await r.json());
    } finally { setCargando(null); }
  }

  useEffect(() => {
    if (!contenedor.current || mapa.current) return;
    const origen = window.location.origin;
    const m = new maplibregl.Map({ container: contenedor.current, style: "https://tiles.openfreemap.org/styles/positron", center: [-75.5736, 6.2442], zoom: 12 });
    mapa.current = m;
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    m.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-right");
    m.on("load", () => {
      for (const capa of ["predios", "proyectos", "avisos"]) {
        m.addSource(capa, { type: "vector", tiles: [`${origen}/api/tiles/${capa}/{z}/{x}/{y}`], minzoom: capa === "predios" ? 14 : 8, maxzoom: 16 });
      }
      m.addLayer({ id: "predios-relleno", type: "fill", source: "predios", "source-layer": "predios",
        paint: { "fill-color": ["case", ["get", "potencial"], C.lima, ["get", "amenaza"], C.gris, C.turquesa],
                 "fill-opacity": ["case", ["get", "potencial"], 0.5, 0.08] } });
      m.addLayer({ id: "predios-borde", type: "line", source: "predios", "source-layer": "predios",
        paint: { "line-color": C.petroleo, "line-width": ["interpolate", ["linear"], ["zoom"], 14, 0.2, 18, 0.8], "line-opacity": 0.45 } });
      m.addLayer({ id: "lote-sel", type: "line", source: "predios", "source-layer": "predios", filter: ["==", ["get", "id"], "__ninguno__"],
        paint: { "line-color": C.petroleo, "line-width": 3 } });
      m.addLayer({ id: "avisos", type: "circle", source: "avisos", "source-layer": "avisos",
        paint: { "circle-radius": 3, "circle-color": C.ambar, "circle-opacity": ["case", ["get", "aprox"], 0.35, 0.85] } });
      m.addLayer({ id: "proyectos", type: "circle", source: "proyectos", "source-layer": "proyectos",
        paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 4, 16, 8], "circle-color": C.petroleo, "circle-stroke-color": "#fff", "circle-stroke-width": 2 } });
      m.addSource("zona", { type: "geojson", data: { type: "FeatureCollection", features: [] } as any });
      m.addLayer({ id: "zona-relleno", type: "fill", source: "zona", filter: ["==", ["geometry-type"], "Polygon"], paint: { "fill-color": C.turquesa, "fill-opacity": 0.12 } });
      m.addLayer({ id: "zona-borde", type: "line", source: "zona", filter: ["!=", ["geometry-type"], "Point"], paint: { "line-color": C.turquesa, "line-width": 2.5, "line-dasharray": [2, 1] } });
      m.addLayer({ id: "zona-vertices", type: "circle", source: "zona", filter: ["==", ["geometry-type"], "Point"],
        paint: { "circle-radius": 5, "circle-color": "#fff", "circle-stroke-color": C.turquesa, "circle-stroke-width": 2.5 } });
      m.addSource("ranking", { type: "geojson", data: { type: "FeatureCollection", features: [] } as any });
      if (rankingRef.current.length) setTimeout(() => pintarRanking(rankingRef.current), 0);
      m.addLayer({ id: "ranking", type: "circle", source: "ranking",
        paint: { "circle-radius": 11, "circle-color": C.lima, "circle-stroke-color": "#fff", "circle-stroke-width": 2 } });
      m.addLayer({ id: "ranking-n", type: "symbol", source: "ranking",
        layout: { "text-field": ["to-string", ["get", "n"]], "text-size": 11, "text-font": ["Noto Sans Bold"], "text-allow-overlap": true },
        paint: { "text-color": "#fff" } });
      m.on("click", "ranking", (e) => {
        const f = e.features?.[0]; if (!f || dibujandoRef.current) return;
        const id = String(f.properties.id); setLote({ id }); marcarLote(id); abrir("predio", `id=${encodeURIComponent(id)}`);
      });
      m.on("click", (e) => {
        if (!dibujandoRef.current) return;
        setVertices((vs) => { const n = [...vs, [e.lngLat.lng, e.lngLat.lat] as [number, number]]; pintarZona(n); return n; });
      });
      m.on("click", "proyectos", (e) => { if (dibujandoRef.current) return; const f = e.features?.[0]; if (f) abrir("proyecto", `id=${f.properties.id}`); });
      m.on("click", "predios-relleno", (e) => {
        if (dibujandoRef.current) return;
        if (m.queryRenderedFeatures(e.point, { layers: ["proyectos"] }).length) return;
        const f = e.features?.[0];
        if (!f) return;
        const id = String(f.properties.id);
        setLote({ id }); marcarLote(id);
        abrir("predio", `id=${encodeURIComponent(id)}`);
      });
      for (const l of ["proyectos", "predios-relleno"]) {
        m.on("mouseenter", l, () => { if (!dibujandoRef.current) m.getCanvas().style.cursor = "pointer"; });
        m.on("mouseleave", l, () => { if (!dibujandoRef.current) m.getCanvas().style.cursor = ""; });
      }
    });
  }, []);

  function empezarDibujo() {
    setVertices([]); pintarZona([]); setDibujando(true); dibujandoRef.current = true;
    if (mapa.current) mapa.current.getCanvas().style.cursor = "crosshair";
    setPestana("estudio");
  }
  function terminarDibujo() {
    setDibujando(false); dibujandoRef.current = false;
    if (mapa.current) mapa.current.getCanvas().style.cursor = "";
  }
  function borrarZona() { setVertices([]); pintarZona([]); }

  function irA(nombre: string) {
    setMunicipio(nombre);
    const c = MUNICIPIOS.find((x) => x[0] === nombre);
    if (c) mapa.current?.flyTo({ center: [c[1], c[2]], zoom: 14 });
  }

  const zonaLista = vertices.length >= 3;
  const puedeGenerar = !!lote || zonaLista;

  return (
    <>
      <header className="barra">
        <img src="/marca/Logo-Menu-Sup.png" alt="Conaltura" />
        <div className="sep" />
        <div className="producto">Inteligencia de suelo<small>Estudios de competencia · Valle de Aburrá</small></div>
        <div className="derecha"><a href="/como-funciona.html" target="_blank" style={{ color: "#fff" }}>Cómo funciona</a><a href="/api/logout" style={{ color: "#fff", marginLeft: 14 }}>Salir</a></div>
        <div className="franja" />
      </header>

      <div className="workspace">
        <div className="lienzo">
          <div ref={contenedor} className="mapa" />

          <div className="herramientas">
            <select className="entrada" style={{ width: 170 }} value={municipio} onChange={(e) => irA(e.target.value)}>
              {MUNICIPIOS.map(([n]) => <option key={n}>{n}</option>)}
            </select>
            {!dibujando
              ? <button className="btn btn-petroleo" onClick={empezarDibujo}>✎ Dibujar zona</button>
              : <button className="btn btn-activo" onClick={terminarDibujo} disabled={vertices.length > 0 && vertices.length < 3}>✓ Terminar zona ({vertices.length})</button>}
            {vertices.length > 0 && !dibujando && <button className="btn btn-borde" onClick={borrarZona}>Borrar zona</button>}
            <button className="btn btn-borde" onClick={() => setPestana("oportunidades")}>★ Oportunidades</button>
          </div>

          {dibujando && <div className="aviso-dibujo">Haz clic en el mapa para marcar los vértices de la zona. Mínimo 3 puntos.</div>}
          {cargando && <div className="cargando-mapa"><span className="giro" />{cargando}</div>}

          <div className="leyenda">
            <b>Convenciones</b>
            <span><i className="cuadro" style={{ background: C.lima, opacity: 0.7 }} /> Lote con potencial</span>
            <span><i className="cuadro" style={{ border: `1.5px solid ${C.petroleo}`, background: "rgba(0,156,182,.1)" }} /> Predio</span>
            <span><i className="punto" style={{ background: C.petroleo, border: "2px solid #fff", boxShadow: "0 0 0 1px #0002" }} /> Proyecto nuevo</span>
            <span><i className="punto" style={{ background: C.ambar, width: 8, height: 8 }} /> Inmueble en venta</span>
            <span><i className="cuadro" style={{ border: `2px dashed ${C.turquesa}` }} /> Zona del estudio</span>
            <span><i className="punto" style={{ background: C.lima, border: "2px solid #fff", boxShadow: "0 0 0 1px #0002" }} /> Lote recomendado</span>
          </div>
        </div>

        <aside className="panel">
          <nav className="pestanas">
            {([["estudio", "Estudio"], ["detalle", "Lote / proyecto"], ["oportunidades", "Oportunidades"], ["galeria", "Galería"]] as [Pestana, string][]).map(([k, t]) => (
              <button key={k} className={pestana === k ? "on" : ""} onClick={() => setPestana(k)}>{t}</button>
            ))}
          </nav>

          <div className="contenido">
            {pestana === "estudio" && (
              <>
                <div className="titulo">
                  <h2>Estudio de competencia</h2>
                  <div className="sub">Etapa 1 · Concepción de producto, pasos 3 a 9</div>
                </div>

                <div className="tarjeta">
                  <h4>1 · Lote y zona</h4>
                  <div className="etiquetas">
                    <span className={`etiqueta ${lote ? "lima" : ""}`}>{lote ? `Lote ${lote.id}` : "Sin lote: haz clic en un predio"}</span>
                    <span className={`etiqueta ${zonaLista ? "lima" : ""}`}>{zonaLista ? `Zona de ${vertices.length} vértices` : "Sin zona dibujada"}</span>
                  </div>
                  {!zonaLista && (
                    <div className="campo">
                      <label>Radio alrededor del lote</label>
                      <div className="segmento">
                        {[1500, 3000, 5000].map((r) => <button key={r} className={form.radio_m === r ? "on" : ""} onClick={() => setForm({ ...form, radio_m: r })}>{r / 1000} km</button>)}
                      </div>
                    </div>
                  )}
                </div>

                <div className="tarjeta">
                  <h4>2 · Objetivo</h4>
                  <div className="campo">
                    <label>Nombre del lote</label>
                    <input className="entrada" placeholder="p. ej. BONEM" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
                  </div>
                  <div className="campo">
                    <label>Tipo de vivienda</label>
                    <div className="segmento">
                      {[["todos", "VIS y NO VIS"], ["VIS", "VIS"], ["NO VIS", "NO VIS"]].map(([v, t]) => <button key={v} className={form.tipo_vivienda === v ? "on" : ""} onClick={() => setForm({ ...form, tipo_vivienda: v })}>{t}</button>)}
                    </div>
                  </div>
                  <div className="campo">
                    <label>Vocación</label>
                    <div className="segmento">
                      {[["ambos", "Ambas"], ["vivienda", "Vivienda"], ["rentas_cortas", "Rentas cortas"]].map(([v, t]) => <button key={v} className={form.vocacion === v ? "on" : ""} onClick={() => setForm({ ...form, vocacion: v })}>{t}</button>)}
                    </div>
                  </div>
                  <div className="campo">
                    <label>Proyectos de más de</label>
                    <input className="entrada" type="number" min={0} value={form.min_unidades} onChange={(e) => setForm({ ...form, min_unidades: Number(e.target.value) })} />
                  </div>
                </div>

                <button className="btn btn-primario btn-bloque" disabled={!puedeGenerar || !!cargando} onClick={generarEstudio}>
                  {cargando?.startsWith("Armando") ? "Generando…" : "Generar estudio"}
                </button>
                {!puedeGenerar && <div className="nota" style={{ textAlign: "center" }}>Selecciona un lote en el mapa (acércate a nivel de manzana) o dibuja una zona.</div>}

                {estudio?.error && <div className="error">{estudio.error}</div>}
                {estudio && !estudio.error && <ResultadoEstudio e={estudio} />}
              </>
            )}

            {pestana === "detalle" && (
              <>
                {!detalle && (
                  <div className="vacio"><div className="icono">⌖</div><b>Selecciona un lote o un proyecto</b>Acércate en el mapa hasta ver los predios y haz clic en uno.</div>
                )}
                {detalle?.datos?.error && <div className="error">{detalle.datos.error}</div>}
                {detalle?.tipo === "predio" && detalle.datos?.encontrado && (
                  <FichaPredio d={detalle.datos} contacto={contacto}
                    pedirContacto={async () => { const r = await fetch(`/api/datos?tipo=contacto&id=${encodeURIComponent(detalle.datos.id)}`); setContacto(await r.json()); }}
                    usarEnEstudio={() => setPestana("estudio")} />
                )}
                {detalle?.tipo === "proyecto" && detalle.datos?.encontrado && <FichaProyecto d={detalle.datos} />}
              </>
            )}

            {pestana === "oportunidades" && (
              <>
                <div className="titulo">
                  <h2>Oportunidades · {municipio}</h2>
                  <div className="sub">Recorre todos los lotes del municipio y deja los que sirven para tu producto</div>
                </div>
                <div className="segmento">
                  <button className={modoOp === "perfil" ? "on" : ""} onClick={() => setModoOp("perfil")}>Por perfil de edificio</button>
                  <button className={modoOp === "rapidas" ? "on" : ""} onClick={() => setModoOp("rapidas")}>Ranking general</button>
                </div>

                {modoOp === "perfil" && (
                  <>
                    <div className="tarjeta">
                      <h4>Perfil del edificio</h4>
                      <div className="campo">
                        <label>Tipo de vivienda</label>
                        <div className="segmento">
                          {[["NO VIS", "NO VIS"], ["VIS", "VIS"], ["todos", "Ambos"]].map(([v, t]) => (
                            <button key={v} className={perfil.tipo_vivienda === v ? "on" : ""}
                              onClick={() => setPerfil({ ...perfil, tipo_vivienda: v, area_unidad_m2: v === "VIS" ? 50 : perfil.area_unidad_m2 === 50 ? 65 : perfil.area_unidad_m2 })}>{t}</button>
                          ))}
                        </div>
                      </div>
                      <div className="fila">
                        <div className="campo"><label>Unidades mínimas</label><input className="entrada" type="number" value={perfil.unidades_min} onChange={(e) => setPerfil({ ...perfil, unidades_min: Number(e.target.value) })} /></div>
                        <div className="campo"><label>Unidades máximas</label><input className="entrada" type="number" value={perfil.unidades_max} onChange={(e) => setPerfil({ ...perfil, unidades_max: Number(e.target.value) })} /></div>
                      </div>
                      <div className="fila">
                        <div className="campo"><label>Área por unidad (m²)</label><input className="entrada" type="number" value={perfil.area_unidad_m2} onChange={(e) => setPerfil({ ...perfil, area_unidad_m2: Number(e.target.value) })} /></div>
                        <div className="campo"><label>Pisos mínimos</label><input className="entrada" type="number" value={perfil.pisos_min} onChange={(e) => setPerfil({ ...perfil, pisos_min: Number(e.target.value) })} /></div>
                      </div>
                      <div className="fila">
                        <div className="campo"><label>Lote mínimo (m²)</label><input className="entrada" type="number" placeholder="opcional" value={perfil.area_lote_min} onChange={(e) => setPerfil({ ...perfil, area_lote_min: e.target.value })} /></div>
                        <div className="campo"><label>Precio objetivo ($M/m²)</label><input className="entrada" type="number" step="0.1" placeholder="p. ej. 9,5" value={perfil.precio_m2_objetivo} onChange={(e) => setPerfil({ ...perfil, precio_m2_objetivo: e.target.value })} /></div>
                      </div>
                      <div className="campo"><label>Barrios (opcional, separados por coma)</label><input className="entrada" placeholder="p. ej. Guayabal, Belén" value={perfil.barrios} onChange={(e) => setPerfil({ ...perfil, barrios: e.target.value })} /></div>
                    </div>
                    <button className="btn btn-primario btn-bloque" disabled={!!cargando} onClick={estudioPerfil}>Buscar lotes para este edificio</button>
                    {resPerfil?.error && <div className="error">{resPerfil.error}</div>}
                    {resPerfil && !resPerfil.error && (
                      <>
                        <div className="tarjeta destacada">
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: 10 }}>
                            <div>
                              <h3 style={{ fontSize: 17 }}>{resPerfil.resumen.lotes_que_cumplen_la_norma} lotes sirven</h3>
                              <div style={{ fontSize: 12, opacity: 0.85 }}>{resPerfil.perfil.tipo_vivienda} · {resPerfil.perfil.unidades_min}{resPerfil.perfil.unidades_max ? `–${resPerfil.perfil.unidades_max}` : "+"} unidades de {resPerfil.perfil.area_unidad_m2} m²</div>
                            </div>
                            <a className="btn btn-primario" href={`/api/estudio/${resPerfil.id}/xlsx`}>⤓ Excel</a>
                          </div>
                          <div className="cifras">
                            <Cifra v={num(resPerfil.resumen.con_norma_base)} k="con la norma base" />
                            <Cifra v={num(resPerfil.resumen.solo_comprando_derechos)} k="comprando derechos" />
                          </div>
                        </div>
                        <div className="tarjeta">
                          <h4>Barrios con más lotes</h4>
                          <table className="tabla">
                            <thead><tr><th>Barrio</th><th>Lotes</th><th>Área</th><th>Unidades</th></tr></thead>
                            <tbody>{resPerfil.resumen.barrios_con_mas_lotes.slice(0, 8).map((b: any) => (
                              <tr key={b.barrio}><td>{b.barrio}</td><td>{b.lotes}</td><td>{num(b.area_lote_total / 10000, 1)} ha</td><td>{num(b.unidades_posibles)}</td></tr>
                            ))}</tbody>
                          </table>
                        </div>
                        <div className="tarjeta">
                          <h4>Mejores lotes ({resPerfil.oportunidades.length})</h4>
                          <ul className="lista">
                            {resPerfil.oportunidades.map((o: any, i: number) => (
                              <li key={o.id} className="clicable" onClick={() => {
                                mapa.current?.flyTo({ center: [Number(o.lon), Number(o.lat)], zoom: 17 });
                                setLote({ id: o.id }); marcarLote(o.id); abrir("predio", `id=${encodeURIComponent(o.id)}`);
                              }}>
                                <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                                  <span className="n">{i + 1}. {o.barrio ?? o.municipio}</span>
                                  <span className="etiqueta lima">{o.puntaje} pts</span>
                                </div>
                                <span className="sub">{m2(o.area_lote_m2)} · ≈ {o.unidades_posibles} unidades{o.requiere_compra_derechos ? " (con derechos)" : ""} · {o.tratamiento}</span>
                                <span className="nota">{o.por_que.slice(1, 3).join(" · ")}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                        <div className="nota">{resPerfil.metodo}</div>
                      </>
                    )}
                  </>
                )}

                {modoOp === "rapidas" && (
                  <>
                    {!oportunidades && <button className="btn btn-petroleo btn-bloque" onClick={verOportunidades}>Ver ranking general de {municipio}</button>}
                    {oportunidades?.error && <div className="error">{oportunidades.error}</div>}
                    {oportunidades && !oportunidades.error && (
                      <>
                        <div className="nota">{oportunidades.metodo}</div>
                        <div className="tarjeta">
                          <ul className="lista">
                            {(oportunidades.oportunidades ?? []).map((o: any, i: number) => (
                              <li key={o.id} className="clicable" onClick={() => {
                                mapa.current?.flyTo({ center: [Number(o.lon), Number(o.lat)], zoom: 17 });
                                setLote({ id: o.id }); marcarLote(o.id); abrir("predio", `id=${encodeURIComponent(o.id)}`);
                              }}>
                                <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                                  <span className="n">{i + 1}. {o.barrio ?? o.municipio}</span>
                                  <span className="etiqueta lima">{o.puntaje} pts</span>
                                </div>
                                <span className="sub">{m2(Number(o.area_lote))} · {o.por_que.join(" · ")}</span>
                              </li>
                            ))}
                          </ul>
                          {(oportunidades.oportunidades ?? []).length === 0 && <div className="nota">No hay lotes con potencial calculado en este municipio.</div>}
                        </div>
                      </>
                    )}
                  </>
                )}
              </>
            )}

            {pestana === "galeria" && (
              <>
                <div className="titulo">
                  <h2>Datos de Galería Inmobiliaria</h2>
                  <div className="sub">Carga la exportación mensual para alimentar los estudios</div>
                </div>
                <label className={`soltar ${sobre ? "sobre" : ""}`}
                  onDragOver={(e) => { e.preventDefault(); setSobre(true); }} onDragLeave={() => setSobre(false)}
                  onDrop={(e) => { e.preventDefault(); setSobre(false); const f = e.dataTransfer.files?.[0]; if (f) setGaleria((g) => ({ ...g, archivo: f, msg: "" })); }}>
                  <input type="file" accept=".xlsx" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) setGaleria((g) => ({ ...g, archivo: f, msg: "" })); }} />
                  <b>{galeria.archivo ? galeria.archivo.name : "Arrastra el Excel aquí o haz clic"}</b>
                  <span className="nota">{galeria.archivo ? `${(galeria.archivo.size / 1e6).toFixed(1)} MB` : "Formato .xlsx exportado de G.A.I.N."}</span>
                </label>
                <div className="campo">
                  <label>Fecha de corte</label>
                  <input className="entrada" type="date" value={galeria.corte} onChange={(e) => setGaleria((g) => ({ ...g, corte: e.target.value }))} />
                </div>
                <button className="btn btn-primario btn-bloque" disabled={!galeria.archivo} onClick={subirGaleria}>Cargar a la plataforma</button>
                {galeria.msg && <div className={galeria.ok === false ? "error" : "alerta"} style={galeria.ok ? { background: "rgba(132,189,0,.12)", borderLeftColor: C.lima } : {}}>{galeria.msg}</div>}
                <div className="nota">Los datos de Galería son confidenciales y de uso interno de Conaltura. No se comparten con terceros.</div>
              </>
            )}
          </div>
        </aside>
      </div>
    </>
  );
}

function ResultadoEstudio({ e }: { e: any }) {
  const mz = e.metricas_zona ?? {};
  const i9 = e.paso9_insumos_recomendacion ?? {};
  const pr = e.paso4_territorio?.predio;
  return (
    <>
      <div className="tarjeta destacada">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: 10 }}>
          <div>
            <h3 style={{ fontSize: 17 }}>{e.estudio}</h3>
            <div style={{ fontSize: 12, opacity: 0.85 }}>Galería corte {e.corte_galeria ?? "—"}{pr?.tratamiento ? ` · ${pr.tratamiento}` : ""}</div>
          </div>
          <a className="btn btn-primario" href={`/api/estudio/${e.id}/xlsx`}>⤓ Excel</a>
        </div>
        <div className="cifras">
          <Cifra v={num(mz.proyectos_en_zona)} k="proyectos en la zona" />
          <Cifra v={num(mz.ventas_mes_zona_promedio_semestre, 1)} k="unidades vendidas al mes" />
          <Cifra v={`${num(mz.oferta_disponible)} + ${num(mz.oferta_por_lanzar)}`} k="oferta actual + por lanzar" />
          <Cifra v={num(mz.meses_de_inventario_con_futura, 1)} k="meses de inventario (con futura)" />
        </div>
      </div>

      <div className="tarjeta">
        <h4>Competencia directa</h4>
        <table className="tabla">
          <thead><tr><th>Proyecto</th><th>$/m²</th><th>Und/mes</th><th>Vendido</th><th>Oferta</th></tr></thead>
          <tbody>
            {(e.paso8_tabla_resumen ?? []).map((x: any) => (
              <tr key={x.proyecto}>
                <td title={x.proyecto}>{x.proyecto}<div className="nota" style={{ fontWeight: 400 }}>{x.zona} · {x.constructor}</div></td>
                <td>{millones(x.precio_m2)}</td>
                <td>{num(x.ventas_mes_promedio_semestre, 1)}</td>
                <td>{pct(x.pct_vendido)}<div className="barra-pct" style={{ marginTop: 3 }}><i style={{ width: pct(x.pct_vendido) }} /></div></td>
                <td>{num(x.oferta_actual)}<span className="nota"> +{num(x.oferta_futura)}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="tarjeta">
        <h4>Insumos para recomendar</h4>
        <div className="cifras">
          <Cifra v={i9.area_promedio_objetivo ? `${num(i9.area_promedio_objetivo, 1)} m²` : "—"} k="área promedio objetivo" />
          <Cifra v={`${millones(i9.precio_m2_objetivo_rango?.[0])}–${millones(i9.precio_m2_objetivo_rango?.[1])}`} k="precio por m² objetivo" />
          <Cifra v={num(i9.ritmo_ventas_referencia_mes, 1)} k="ritmo de referencia (und/mes)" />
          <Cifra v={num(i9.unidades_posibles_por_norma)} k="unidades posibles por norma" />
        </div>
        {i9.entrega_predominante && <div className="sub">Entrega predominante en la zona: <b>{i9.entrega_predominante}</b></div>}
      </div>

      {pr && (
        <div className="tarjeta">
          <h4>Norma del lote</h4>
          <div className="cifras tres">
            <Cifra v={m2(pr.area_lote_m2)} k="área del lote" />
            <Cifra v={num(pr.indice_construccion, 1)} k="índice de construcción" />
            <Cifra v={m2(pr.area_construible_m2)} k="área construible" />
          </div>
          <div className="sub">{pr.uso ?? ""}{pr.densidad_max_viv_ha ? ` · densidad ${pr.densidad_max_viv_ha} viv/ha` : ""}</div>
        </div>
      )}

      <div className="nota">La redacción del territorio, las recomendaciones y la conclusión se completan desde Claude y salen en el Excel.</div>
    </>
  );
}

function FichaPredio({ d, contacto, pedirContacto, usarEnEstudio }: { d: any; contacto: any; pedirContacto: () => void; usarEnEstudio: () => void }) {
  const pf = d.prefactibilidad_rapida ?? {};
  const veredictoClase = pf.veredicto === "VA" ? "lima" : pf.veredicto === "NO VA" ? "riesgo" : "aviso";
  return (
    <>
      <div className="titulo">
        <h2>{d.ubicacion.barrio ?? d.ubicacion.municipio}</h2>
        <div className="sub">{d.ubicacion.municipio} · {d.id} · {m2(d.lote.area_lote_m2)}</div>
        <div className="etiquetas" style={{ marginTop: 4 }}>
          {d.potencial.potencial_preliminar ? <span className="etiqueta lima">Con potencial</span> : <span className="etiqueta">Sin potencial marcado</span>}
          {d.norma.tratamiento && <span className="etiqueta">{d.norma.tratamiento}</span>}
          <span className="etiqueta">{d.nivel_dato}</span>
        </div>
      </div>
      <button className="btn btn-primario btn-bloque" onClick={usarEnEstudio}>Usar este lote en un estudio de competencia</button>
      {d.norma.advertencia && <div className="alerta">{d.norma.advertencia}</div>}

      <div className="tarjeta">
        <h4>Norma y potencial</h4>
        <div className="cifras">
          <Cifra v={d.norma.altura_max_pisos ?? d.norma.altura_texto ?? "—"} k="altura máxima (pisos)" />
          <Cifra v={num(d.norma.indice_construccion_max, 1)} k="índice de construcción" />
          <Cifra v={m2(d.potencial.area_construible_m2)} k="área construible" />
          <Cifra v={num(d.potencial.viviendas_max_por_densidad)} k="viviendas máx. por densidad" />
        </div>
        <div className="nota">Potencial calculado por inferencia sobre la norma; validar con estructuración.</div>
      </div>

      <div className="tarjeta">
        <h4>Prefactibilidad rápida</h4>
        {pf.disponible ? (
          <>
            <div className="etiquetas"><span className={`etiqueta ${veredictoClase}`}>{pf.veredicto}</span></div>
            <div className="cifras">
              <Cifra v={pf.lote_maximo_legible} k="lote máximo pagable" />
              <Cifra v={pf.indice_tension ? `${pf.indice_tension}x` : "—"} k="tensión demanda / oferta" />
            </div>
            <div className="sub">Supone {pf.producto_supuesto?.unidades} unidades de {pf.producto_supuesto?.area_unidad_m2} m².</div>
          </>
        ) : <div className="sub">{pf.motivo}</div>}
      </div>

      <div className="tarjeta">
        <h4>Mercado a 1,5 km</h4>
        <div className="cifras">
          <Cifra v={num(d.mercado_1500m.apartamentos_en_venta)} k="apartamentos en venta" />
          <Cifra v={millones(d.mercado_1500m.precio_m2_mediana)} k="precio por m² típico" />
          <Cifra v={millones(d.mercado_1500m.precio_mediana)} k="precio típico" />
          <Cifra v={num(d.mercado_1500m.pedidos_compradores_90d)} k="compradores buscando (90 días)" />
        </div>
      </div>

      <div className="tarjeta">
        <h4>Proyectos nuevos cerca ({d.proyectos_nuevos_1500m.length})</h4>
        <ul className="lista">
          {d.proyectos_nuevos_1500m.map((p: any) => (
            <li key={p.id}><span className="n">{p.nombre}</span><span className="sub">{p.constructora} · desde {millones(p.precio_desde)} · entrega {p.entrega ?? "—"} · a {num(p.distancia_m)} m</span></li>
          ))}
        </ul>
        {d.proyectos_nuevos_1500m.length === 0 && <div className="sub">No hay proyectos registrados a menos de 1,5 km.</div>}
      </div>

      <div className="tarjeta">
        <h4>Restricciones</h4>
        <div className="etiquetas">
          {d.restricciones.amenazas.length === 0 && <span className="etiqueta lima">Sin amenazas cruzadas</span>}
          {d.restricciones.amenazas.map((a: any, i: number) => <span key={i} className={`etiqueta ${/alta/i.test(a.grado) ? "riesgo" : "aviso"}`}>{a.tipo.replace(/_/g, " ")}: {a.grado}</span>)}
          {d.restricciones.protecciones.map((p: any, i: number) => <span key={`p${i}`} className="etiqueta riesgo">Protección: {p.categoria}</span>)}
        </div>
      </div>

      <div className="tarjeta">
        <h4>¿Cómo llegar al dueño?</h4>
        {!contacto && <button className="btn btn-borde" onClick={pedirContacto}>Ver señales y ruta de contacto</button>}
        {contacto?.encontrado && (
          <>
            <div className="cifras">
              <Cifra v={contacto.senales_de_venta.probabilidad_venta ?? "—"} k="probabilidad de venta" />
              <Cifra v={contacto.titular_probable} k="titular probable" />
            </div>
            <div className="sub">Matrícula {contacto.inmueble.matricula_principal ?? "—"} · {contacto.inmueble.folios_en_el_predio} folio(s) · PH: {contacto.inmueble.propiedad_horizontal}</div>
            {contacto.inmueble.direcciones.length > 0 && <div className="sub">Dirección: {contacto.inmueble.direcciones.slice(0, 3).join(" · ")}</div>}
            {contacto.senales_de_venta.senales && (
              <ul className="lista">
                {contacto.senales_de_venta.senales.map((x: any, i: number) => (
                  <li key={i}><span className="n" style={{ color: x.efecto === "favorable" ? "#5a8500" : x.efecto === "riesgo" ? "#c0392b" : undefined }}>{x.señal}</span><span className="sub">{x.lectura}</span></li>
                ))}
              </ul>
            )}
            <ol className="pasos">{contacto.rutas_de_contacto.map((r: any, i: number) => <li key={i}><b>{r.paso}:</b> {r.como}</li>)}</ol>
            <div className="nota">{contacto.aviso_legal}</div>
          </>
        )}
      </div>
    </>
  );
}

function FichaProyecto({ d }: { d: any }) {
  const p = d.proyecto;
  return (
    <>
      <div className="titulo">
        <h2>{p.nombre}</h2>
        <div className="sub">{p.constructora} · {p.barrio ? `${p.barrio}, ` : ""}{p.municipio}</div>
      </div>
      <div className="tarjeta">
        <h4>Producto</h4>
        <div className="cifras">
          <Cifra v={millones(p.precio_desde)} k="precio desde" />
          <Cifra v={millones(p.precio_m2_desde)} k="precio por m² desde" />
          <Cifra v={`${m2(p.area_min)} – ${m2(p.area_max)}`} k="áreas" />
          <Cifra v={p.entrega ?? "—"} k="entrega" />
        </div>
      </div>
      <div className="tarjeta">
        <h4>Competencia a 1,5 km ({d.competencia_1500m.length})</h4>
        <ul className="lista">
          {d.competencia_1500m.map((c: any) => <li key={c.id}><span className="n">{c.nombre}</span><span className="sub">{c.constructora} · desde {millones(c.precio_desde)} · a {num(c.distancia_m)} m</span></li>)}
        </ul>
      </div>
      <div className="nota">{d.atribucion}</div>
    </>
  );
}
