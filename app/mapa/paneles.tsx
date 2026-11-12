"use client";
// Paneles del workspace: ficha completa del lote, comparación, cartera, zona, POT 2026 y estudio de competencia.
import { useEffect, useState } from "react";
import { Cambio, Cifra, Luz, Seccion, Vacio, m2, millones, num, pct } from "./comunes";

/* ───────────── Inicio ───────────── */
const HERRAMIENTAS: [string, string, string, string][] = [
  ["lote", "⌖", "Consultar un lote", "Qué se puede construir, semáforo, cesiones, valor residual y ficha PDF. Busca por CBML, matrícula, dirección o coordenada, o haz clic en el mapa."],
  ["pot", "◆", "POT 2026 de Medellín", "La revisión del POT cambia lo que se puede construir. Mira qué barrios y lotes ganan o pierden, y colorea el mapa."],
  ["oportunidades", "★", "Dónde construir", "Describe tu edificio (VIS/NO VIS, unidades, m², pisos) y encuentra los lotes de todo un municipio donde cabe."],
  ["estudio", "◎", "Estudio de competencia", "Proyectos de Galería alrededor de un lote: ventas, ritmo, oferta y precio. Sale el Excel de la Etapa 1."],
  ["comparar", "⇄", "Comparar lotes", "Pon de 2 a 5 lotes lado a lado. Agrégalos con “+ Comparar” desde el mapa."],
  ["cartera", "▤", "Analizar una cartera", "Sube un KMZ o pega una lista de hasta 250 lotes y obtén un ranking con semáforo y Excel."],
  ["zona", "⬠", "Analizar una zona", "Dibuja un polígono: norma, cambio POT, competencia y mercado de esa zona."],
];
export function PanelInicio({ ir }: { ir: (k: string) => void }) {
  return (
    <>
      <div className="consejo-mapa">💡 Haz clic en cualquier predio del mapa (acercándote a nivel de manzana) para ver su resumen.</div>
      <div className="herramientas-inicio">
        {HERRAMIENTAS.map(([k, ic, t, d]) => (
          <button key={k} className={`tarjeta-inicio ${k === "pot" ? "destacada-pot" : ""}`} onClick={() => ir(k)}>
            <span className="ic">{ic}</span>
            <span className="tx"><b>{t}</b><span>{d}</span></span>
            <span className="flecha">→</span>
          </button>
        ))}
      </div>
    </>
  );
}

/* ───────────── Ficha completa del lote ───────────── */
export function PanelLote({ id, onComparar, onEstudio, enComparacion }: { id: string; onComparar: (id: string) => void; onEstudio: () => void; enComparacion: boolean }) {
  const [f, setF] = useState<any>(null);
  const [d, setD] = useState<any>(null);
  const [contacto, setContacto] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setF(null); setD(null); setContacto(null); setError(null);
    fetch(`/api/ficha?formato=json&id=${encodeURIComponent(id)}`).then((r) => r.json()).then((j) => (j.encontrado === false ? setError(j.mensaje) : setF(j))).catch((e) => setError(e.message));
    fetch(`/api/datos?tipo=predio&id=${encodeURIComponent(id)}`).then((r) => r.json()).then(setD).catch(() => {});
  }, [id]);
  if (error) return <div className="error">{error}</div>;
  if (!f) return <div className="cargando-panel"><span className="giro" />Analizando el lote…</div>;
  const a = f.analisis;
  const esc = a.cabida.escenarios as any[];
  const b26 = a.pot_2026_preliminar;
  return (
    <>
      <div className="cabecera-lote">
        <div>
          <div className="sobretitulo">{f.municipio}{f.norma?.tratamiento ? ` · ${f.norma.tratamiento}` : ""}</div>
          <h2>{f.barrio ?? f.municipio}</h2>
          <div className="sub">{f.predio}{f.identificacion?.matriculas?.length ? ` · Mat. ${f.identificacion.matriculas.slice(0, 2).join(", ")}` : ""}{f.identificacion?.direcciones?.[0] ? ` · ${f.identificacion.direcciones[0]}` : ""}</div>
        </div>
        <div className="semaforo-grande" title={`Semáforo ${a.semaforo.general}`}><Luz luz={a.semaforo.general} tam={18} /></div>
      </div>
      {b26?.disponible && (
        <div className={`banda-pot ${String(b26.frente_a_2014.area_construible_m2.cambio).startsWith("-") ? "baja" : b26.frente_a_2014.area_construible_m2.cambio === "+0 %" ? "igual" : "sube"}`}>
          <div className="etq-pot">POT 2026</div>
          <div><b>{String(b26.frente_a_2014.area_construible_m2.cambio).startsWith("-") ? "Este lote pierde" : b26.frente_a_2014.area_construible_m2.cambio === "+0 %" ? "Este lote queda igual" : "Este lote gana"} {b26.frente_a_2014.area_construible_m2.cambio !== "+0 %" ? b26.frente_a_2014.area_construible_m2.cambio.replace(/^[+-]/, "") : ""} de área construible</b>
            <span>{m2(b26.frente_a_2014.area_construible_m2.pot2014)} con el POT 2014 → {m2(b26.frente_a_2014.area_construible_m2.pot2026)} con el proyecto 2026{b26.que_se_puede_hacer?.con_derechos ? ` · hasta ${num(b26.que_se_puede_hacer.con_derechos.viviendas_max_por_densidad)} viviendas comprando derechos` : ""}</span></div>
        </div>
      )}
      <div className="cifras tres">
        <Cifra v={m2(f.area_lote_m2)} k="área del lote" />
        <Cifra v={m2(a.area_util.area_util_m2)} k="área útil" />
        <Cifra v={num(esc[1]?.unidades)} k="unidades (base)" />
      </div>
      <div className="acciones">
        <a className="btn btn-primario" href={`/api/ficha?id=${encodeURIComponent(f.predio)}`} target="_blank">⤓ Ficha PDF</a>
        <button className="btn btn-borde" onClick={() => onComparar(f.predio)} disabled={enComparacion}>{enComparacion ? "✓ En comparación" : "+ Comparar"}</button>
        <button className="btn btn-borde" onClick={onEstudio}>Estudio de competencia</button>
      </div>

      <Seccion titulo="Semáforo" extra={<span className={`etiqueta ${a.semaforo.general === "verde" ? "lima" : a.semaforo.general === "rojo" ? "riesgo" : "aviso"}`}>{a.semaforo.general}</span>}>
        <ul className="semaforo">
          {a.semaforo.items.map((i: any) => (
            <li key={i.categoria}><Luz luz={i.luz} /><div><b>{i.categoria}</b><span>{i.lectura}</span></div></li>
          ))}
        </ul>
      </Seccion>

      <Seccion titulo="Qué se puede construir">
        <div className="escenarios">
          {esc.map((e: any, k: number) => (
            <div key={k} className={`escenario ${k === 1 ? "base" : ""}`}>
              <div className="nombre">{e.escenario.replace(/\s*\(.*\)/, "")}</div>
              <div className="detalle-norma">{e.escenario.match(/\((.*)\)/)?.[1]}</div>
              {e.disponible ? (
                <>
                  <div className="unidades">{num(e.unidades)}<small> und</small></div>
                  <div className="linea"><span>Construible</span><b>{m2(e.area_construible_m2)}</b></div>
                  <div className="linea"><span>Vendible</span><b>{m2(e.area_vendible_m2)}</b></div>
                  <div className="linea"><span>Pisos</span><b>{num(e.pisos_sobre_rasante)}{e.limitado_por_altura ? "*" : ""}</b></div>
                  <div className="linea"><span>Parqueaderos</span><b>{num(e.parqueaderos)}</b></div>
                  <div className="linea"><span>Sótanos</span><b>{num(e.sotanos_aprox)}</b></div>
                  <div className="linea"><span>IC · viv/ha</span><b>{num(e.indice_construccion, 1)} · {num(e.densidad_viv_ha)}</b></div>
                  <div className="nota">limita: {e.limita}</div>
                </>
              ) : <div className="nota">Sin norma</div>}
            </div>
          ))}
        </div>
        <div className="nota">{a.cabida.supuestos.area_unidad_m2} m²/unidad · 80 % vendible · IO {a.cabida.supuestos.indice_ocupacion} · {a.cabida.nota}</div>
      </Seccion>

      <Seccion titulo="Norma: POT 2014 y proyecto POT 2026">
        <div className="etiquetas">
          {f.norma?.codigo && <span className="etiqueta">{f.norma.codigo}{b26?.codigo_2026 ? ` → ${b26.codigo_2026}` : ""}</span>}
          {f.norma?.uso_del_suelo && <span className="etiqueta">{f.norma.uso_del_suelo}</span>}
          {f.norma?.altura_max_pisos && <span className="etiqueta">Altura {f.norma.altura_max_pisos} pisos</span>}
        </div>
        {b26?.disponible ? (
          <table className="tabla">
            <thead><tr><th></th><th>2014</th><th>2026</th><th>Cambio</th></tr></thead>
            <tbody>
              <tr><td>Índice de construcción</td><td>{num(b26.frente_a_2014.indice_construccion.pot2014, 1)}</td><td><b>{num(b26.frente_a_2014.indice_construccion.pot2026, 1)}</b></td><td><Cambio v={b26.frente_a_2014.indice_construccion.cambio} /></td></tr>
              <tr><td>Densidad viv/ha</td><td>{num(b26.frente_a_2014.densidad_viv_ha.pot2014)}</td><td><b>{num(b26.frente_a_2014.densidad_viv_ha.pot2026)}</b></td><td><Cambio v={b26.frente_a_2014.densidad_viv_ha.cambio} /></td></tr>
              <tr><td>Área construible</td><td>{m2(b26.frente_a_2014.area_construible_m2.pot2014)}</td><td><b>{m2(b26.frente_a_2014.area_construible_m2.pot2026)}</b></td><td><Cambio v={b26.frente_a_2014.area_construible_m2.cambio} /></td></tr>
              <tr><td>Viviendas</td><td>{num(b26.frente_a_2014.viviendas.pot2014)}</td><td><b>{num(b26.frente_a_2014.viviendas.pot2026)}</b></td><td><Cambio v={b26.frente_a_2014.viviendas.cambio} /></td></tr>
            </tbody>
          </table>
        ) : (
          <div className="cifras tres">
            <Cifra v={num(f.norma?.indice_construccion_base, 1)} k="IC base" />
            <Cifra v={num(f.norma?.indice_construccion_con_derechos, 1)} k="IC con derechos" />
            <Cifra v={num(f.norma?.densidad_max_viv_ha)} k="densidad viv/ha" />
          </div>
        )}
        {b26?.frente_a_2014?.lectura && <div className="sub"><b>{b26.frente_a_2014.lectura}</b></div>}
        {b26?.disponible === false && <div className="nota">{b26.motivo}</div>}
        {b26?.estado && <div className="nota">{b26.estado}</div>}
      </Seccion>

      <Seccion titulo="Área útil y cesiones">
        <div className="cifras">
          <Cifra v={m2(a.area_util.area_afectada_m2)} k="área afectada" />
          <Cifra v={m2(a.area_util.area_util_m2)} k="área útil" />
          <Cifra v={m2(a.cesiones.espacio_publico_suelo_m2)} k={`cesión de suelo (${a.cesiones.pct_del_lote ?? "—"} %)`} />
          <Cifra v={m2(a.cesiones.equipamiento_construido_m2)} k="equipamiento construido" />
        </div>
        {[...a.area_util.proteccion, ...a.area_util.amenaza_alta].length > 0 && (
          <div className="etiquetas">{[...a.area_util.proteccion.map((p: any) => `${p.tipo}: ${m2(p.m2)}`), ...a.area_util.amenaza_alta.map((p: any) => `Amenaza alta ${p.tipo}: ${m2(p.m2)}`)].map((t) => <span key={t} className="etiqueta riesgo">{t}</span>)}</div>
        )}
        <div className="nota">{a.cesiones.regla}. {a.cesiones.nota}</div>
      </Seccion>

      <Seccion titulo={`Usos · ${a.usos.area_de_actividad}`} abierta={false}>
        <div className="usos">
          {(a.usos.usos ?? []).map((u: any) => <span key={u.actividad} className={`uso ${u.estado === "permitido" ? "si" : u.estado === "condicionado" ? "talvez" : "no"}`}>{u.actividad}</span>)}
        </div>
        <div className="nota"><span className="uso si mini">permitido</span> <span className="uso talvez mini">condicionado</span> <span className="uso no mini">no permitido</span> · {a.usos.nota}</div>
      </Seccion>

      {a.valor_residual && (
        <Seccion titulo="Valor residual del suelo">
          {a.valor_residual.disponible === false ? <div className="sub">{a.valor_residual.motivo}</div> : (
            <>
              <div className="cifras">
                <Cifra v={a.valor_residual.valor_residual_legible} k="máximo a pagar por el lote" />
                <Cifra v={millones(a.valor_residual.valor_residual_m2)} k="por m² de lote" />
                <Cifra v={millones(a.valor_residual.valor_suelo_referencia_m2)} k="referencia catastral $/m²" />
                <Cifra v={millones(a.valor_residual.precio_m2_venta_supuesto)} k="precio de venta supuesto $/m²" />
              </div>
              <div className="nota">{a.valor_residual.nota}</div>
            </>
          )}
        </Seccion>
      )}

      {d?.encontrado && (
        <Seccion titulo="Mercado y proyectos a 1,5 km" abierta={false}>
          <div className="cifras">
            <Cifra v={num(d.mercado_1500m.apartamentos_en_venta)} k="apartamentos en venta" />
            <Cifra v={millones(d.mercado_1500m.precio_m2_mediana)} k="precio por m² típico" />
            <Cifra v={num(d.mercado_1500m.pedidos_compradores_90d)} k="compradores buscando (90 d)" />
            <Cifra v={millones(d.mercado_1500m.presupuesto_mediana)} k="presupuesto típico" />
          </div>
          <ul className="lista">
            {d.proyectos_nuevos_1500m.slice(0, 8).map((p: any) => <li key={p.id}><span className="n">{p.nombre}</span><span className="sub">{p.constructora} · desde {millones(p.precio_desde)} · {num(p.distancia_m)} m</span></li>)}
          </ul>
        </Seccion>
      )}

      <Seccion titulo="¿Cómo llegar al dueño?" abierta={false}>
        {!contacto && <button className="btn btn-borde" onClick={async () => setContacto(await (await fetch(`/api/datos?tipo=contacto&id=${encodeURIComponent(f.predio)}`)).json())}>Ver señales de venta y ruta de contacto</button>}
        {contacto?.encontrado && (
          <>
            <div className="cifras">
              <Cifra v={contacto.senales_de_venta.probabilidad_venta ?? "—"} k="probabilidad de venta" />
              <Cifra v={contacto.titular_probable} k="titular probable" />
            </div>
            {contacto.senales_de_venta.senales && (
              <ul className="lista">{contacto.senales_de_venta.senales.map((x: any, i: number) => <li key={i}><span className="n" style={{ color: x.efecto === "favorable" ? "#3f8f4a" : x.efecto === "riesgo" ? "#c0392b" : undefined }}>{x.señal}</span><span className="sub">{x.lectura}</span></li>)}</ul>
            )}
            <ol className="pasos">{contacto.rutas_de_contacto.map((r: any, i: number) => <li key={i}><b>{r.paso}:</b> {r.como}</li>)}</ol>
            <div className="nota">{contacto.aviso_legal}</div>
          </>
        )}
      </Seccion>

      {f.aviso_pot && <div className="alerta">{f.aviso_pot}</div>}
      <div className="nota legal">{a.aviso_legal}</div>
    </>
  );
}

/* ───────────── Comparar lotes ───────────── */
export function PanelComparar({ ids, quitar, abrir }: { ids: string[]; quitar: (id: string) => void; abrir: (id: string) => void }) {
  const [r, setR] = useState<any>(null);
  const [cargando, setCargando] = useState(false);
  useEffect(() => { if (ids.length >= 2) comparar(); else setR(null); }, [ids.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps
  async function comparar() {
    setCargando(true); setR(null);
    try { setR(await (await fetch("/api/analisis/comparar", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ lotes: ids.map((id) => ({ id })) }) })).json()); }
    finally { setCargando(false); }
  }
  if (ids.length < 2) return (
    <>
      <div className="pasos-guia">
        {[
          ["Elige un lote", "Haz clic en un predio del mapa y, en la ventana que aparece, pulsa “+ Comparar”.", ids.length >= 1],
          ["Agrega otro lote", "Repite con un segundo lote (puedes llevar hasta 5). Los verás en la bandeja de abajo del mapa.", ids.length >= 2],
          ["Mira la comparación", "Aparece aquí sola: unidades, semáforo, cambio POT 2026, cesiones y valor residual.", false],
        ].map(([t, d, hecho], i) => (
          <div key={i} className={`paso ${hecho ? "hecho" : ""}`}>
            <span className="numero">{hecho ? "✓" : i + 1}</span>
            <div><b>{t as string}</b><p>{d as string}</p></div>
          </div>
        ))}
      </div>
      {ids.length === 1 && <div className="etiquetas"><span className="etiqueta chip" onClick={() => abrir(ids[0])}>{ids[0]} <b onClick={(e) => { e.stopPropagation(); quitar(ids[0]); }}>×</b></span></div>}
    </>
  );
  const lotes = (r?.lotes ?? []).filter((l: any) => l.encontrado);
  const fila = (k: string, f: (l: any) => React.ReactNode) => <tr key={k}><td>{k}</td>{lotes.map((l: any) => <td key={l.predio}>{f(l)}</td>)}</tr>;
  return (
    <>
      <div className="etiquetas">{ids.map((id) => <span key={id} className="etiqueta chip" onClick={() => abrir(id)}>{id} <b onClick={(e) => { e.stopPropagation(); quitar(id); setR(null); }}>×</b></span>)}</div>
      {cargando && <div className="cargando-panel"><span className="giro" />Comparando {ids.length} lotes…</div>}
      {r?.error && <div className="error">{r.error}</div>}
      {lotes.length > 0 && (
        <div className="tarjeta" style={{ overflowX: "auto" }}>
          <table className="tabla comparacion">
            <thead><tr><th></th>{lotes.map((l: any) => <th key={l.predio} className="clicable" onClick={() => abrir(l.predio)}>{l.barrio}<div className="nota">{l.predio}</div></th>)}</tr></thead>
            <tbody>
              {fila("Semáforo", (l) => <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}><Luz luz={l.semaforo} />{l.semaforo}</span>)}
              {fila("Área lote", (l) => m2(l.area_lote_m2))}
              {fila("Área útil", (l) => m2(l.area_util_m2))}
              {fila("Tratamiento", (l) => l.tratamiento)}
              {fila("Unidades conservador", (l) => num(l.unidades.conservador))}
              {fila("Unidades base", (l) => <b>{num(l.unidades.base)}</b>)}
              {fila("Unidades máximo", (l) => num(l.unidades.maximo))}
              {fila("Pisos (base)", (l) => num(l.pisos_base))}
              {fila("Cambio POT 2026", (l) => <Cambio v={l.cambio_pot_2026} />)}
              {fila("Cesión de suelo", (l) => m2(l.cesion_espacio_publico_m2))}
              {fila("Valor residual $/m²", (l) => millones(l.valor_residual_m2))}
              {fila("Referencia $/m²", (l) => millones(l.valor_suelo_referencia_m2))}
            </tbody>
          </table>
        </div>
      )}
      {r?.destacados && (
        <div className="tarjeta">
          <h4>Destacados</h4>
          <div className="sub">Más unidades: <b>{r.destacados.mas_unidades}</b> · Mayor valor residual: <b>{r.destacados.mayor_valor_residual_m2}</b> · Mayor área útil: <b>{r.destacados.mayor_area_util}</b></div>
        </div>
      )}
    </>
  );
}

/* ───────────── Cartera ───────────── */
export function PanelCartera({ pintar, abrir }: { pintar: (l: any[]) => void; abrir: (id: string) => void }) {
  const [texto, setTexto] = useState("");
  const [archivo, setArchivo] = useState<File | null>(null);
  const [opts, setOpts] = useState({ nombre: "", tipo_vivienda: "NO VIS", area_unidad_m2: 65 });
  const [r, setR] = useState<any>(null);
  const [cargando, setCargando] = useState(false);
  async function analizar() {
    setCargando(true); setR(null);
    try {
      const body: any = { nombre: opts.nombre || undefined, tipo_vivienda: opts.tipo_vivienda, area_unidad_m2: opts.area_unidad_m2 };
      if (archivo) {
        if (/\.kmz$/i.test(archivo.name)) {
          const { default: JSZip } = await import("jszip");
          const zip = await JSZip.loadAsync(await archivo.arrayBuffer());
          const k = Object.keys(zip.files).find((n) => /\.kml$/i.test(n));
          if (!k) throw new Error("El KMZ no trae un .kml");
          body.kml = await zip.files[k].async("string");
        } else body.kml = await archivo.text();
      } else {
        const { interpretarBusqueda } = await import("./comunes");
        body.lotes = texto.split(/\n+/).map((l) => l.trim()).filter(Boolean).map((l) => {
          const [ref, nombre] = l.split(/\s*[;|\t]\s*/);
          return { ...interpretarBusqueda(ref), nombre: nombre || ref };
        });
      }
      const j = await (await fetch("/api/analisis/cartera", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })).json();
      setR(j);
      if (!j.error) pintar(j.ranking.map((f: any) => ({ id: f.predio, lat: f.lat, lon: f.lon })));
    } catch (e) { setR({ error: (e as Error).message }); } finally { setCargando(false); }
  }
  return (
    <>
      <div className="tarjeta">
        <div className="campo"><label>Nombre de la cartera</label><input className="entrada" placeholder="p. ej. Lotes estructuración Q4" value={opts.nombre} onChange={(e) => setOpts({ ...opts, nombre: e.target.value })} /></div>
        <label className="soltar">
          <input type="file" accept=".kmz,.kml" hidden onChange={(e) => setArchivo(e.target.files?.[0] ?? null)} />
          <b>{archivo ? archivo.name : "Sube un KMZ / KML de Google Earth"}</b>
          <span className="nota">{archivo ? "Listo para analizar" : "Cada punto o polígono es un lote (hasta 250)"}</span>
        </label>
        {!archivo && (
          <div className="campo">
            <label>…o pega la lista (uno por línea: CBML, matrícula, dirección o coordenada; opcional “; nombre”)</label>
            <textarea className="entrada" rows={5} placeholder={"15090030008; Cristo Rey\n001-728976\n6.2032, -75.5826; Lote Google Maps"} value={texto} onChange={(e) => setTexto(e.target.value)} />
          </div>
        )}
        {archivo && <button className="btn btn-borde" onClick={() => setArchivo(null)}>Quitar archivo</button>}
        <div className="fila">
          <div className="campo"><label>Producto</label><div className="segmento">{["NO VIS", "VIS"].map((v) => <button key={v} className={opts.tipo_vivienda === v ? "on" : ""} onClick={() => setOpts({ ...opts, tipo_vivienda: v, area_unidad_m2: v === "VIS" ? 50 : 65 })}>{v}</button>)}</div></div>
          <div className="campo"><label>m² por unidad</label><input className="entrada" type="number" value={opts.area_unidad_m2} onChange={(e) => setOpts({ ...opts, area_unidad_m2: Number(e.target.value) })} /></div>
        </div>
      </div>
      <button className="btn btn-primario btn-bloque" disabled={cargando || (!archivo && !texto.trim())} onClick={analizar}>{cargando ? "Analizando lote por lote…" : "Analizar cartera"}</button>
      {r?.error && <div className="error">{r.error}</div>}
      {r && !r.error && (
        <>
          <div className="tarjeta destacada">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
              <div><h3 style={{ fontSize: 17 }}>{r.resumen.encontrados} de {r.resumen.lotes} lotes</h3><div style={{ fontSize: 12, opacity: 0.85 }}>{num(r.resumen.unidades_base_total)} unidades posibles en total</div></div>
              <a className="btn btn-primario" href={`/api/estudio/${r.id}/xlsx`}>⤓ Excel</a>
            </div>
            <div className="cifras tres">
              <Cifra v={<span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}><Luz luz="verde" />{r.resumen.verdes}</span>} k="verdes" />
              <Cifra v={<span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}><Luz luz="amarillo" />{r.resumen.amarillos}</span>} k="amarillos" />
              <Cifra v={<span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}><Luz luz="rojo" />{r.resumen.rojos}</span>} k="rojos" />
            </div>
          </div>
          <div className="tarjeta" style={{ overflowX: "auto" }}>
            <table className="tabla">
              <thead><tr><th>#  Lote</th><th>Pts</th><th>Und base</th><th>POT 2026</th><th>$/m² resid.</th></tr></thead>
              <tbody>{r.ranking.map((f: any, i: number) => (
                <tr key={f.predio + i} className="clicable" onClick={() => abrir(f.predio)}>
                  <td><span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}><Luz luz={f.semaforo} />{i + 1}. {f.nombre}</span><div className="nota">{f.barrio} · {m2(f.area_lote_m2)}</div></td>
                  <td>{f.puntaje}</td><td>{num(f.unidades.base)}</td><td><Cambio v={f.cambio_pot_2026} /></td><td>{millones(f.valor_residual_m2)}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          {r.no_encontrados?.length > 0 && <div className="alerta">No encontrados: {r.no_encontrados.join(", ")}</div>}
          <div className="nota">{r.metodo}</div>
        </>
      )}
    </>
  );
}

/* ───────────── Zona dibujada ───────────── */
export function PanelZona({ vertices, dibujar, borrar, onEstudio }: { vertices: [number, number][]; dibujar: () => void; borrar: () => void; onEstudio: () => void }) {
  const [r, setR] = useState<any>(null);
  const [cargando, setCargando] = useState(false);
  async function analizar() {
    setCargando(true); setR(null);
    try { setR(await (await fetch("/api/analisis/zona", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ poligono: vertices }) })).json()); }
    finally { setCargando(false); }
  }
  return (
    <>
      <div className="tarjeta">
        <div className="sub">{vertices.length >= 3 ? `Zona de ${vertices.length} vértices lista.` : "Dibuja la zona en el mapa (mínimo 3 puntos)."}</div>
        <div className="acciones">
          <button className="btn btn-oscuro" onClick={dibujar}>✎ Dibujar zona</button>
          {vertices.length > 0 && <button className="btn btn-borde" onClick={() => { borrar(); setR(null); }}>Borrar</button>}
        </div>
      </div>
      <button className="btn btn-primario btn-bloque" disabled={vertices.length < 3 || cargando} onClick={analizar}>{cargando ? "Analizando la zona…" : "Analizar zona"}</button>
      {r?.error && <div className="error">{r.error}</div>}
      {r && !r.error && (
        <>
          <div className="tarjeta destacada">
            <h3 style={{ fontSize: 17 }}>{num(r.area_zona_ha, 1)} ha · {num(r.suelo.predios)} predios</h3>
            <div className="cifras">
              <Cifra v={num(r.suelo.lotes_con_potencial)} k="lotes con potencial" />
              <Cifra v={m2(r.suelo.area_lotes_m2)} k="área de lotes" />
            </div>
          </div>
          <Seccion titulo="Norma">
            <div className="cifras">
              <Cifra v={m2(r.norma.area_construible_2014_m2)} k="construible POT 2014" />
              <Cifra v={num(r.norma.viviendas_2014)} k="viviendas POT 2014" />
              {r.norma.pot_2026_preliminar && <Cifra v={m2(r.norma.pot_2026_preliminar.area_construible_m2)} k="construible proyecto 2026" />}
              {r.norma.pot_2026_preliminar && <Cifra v={<Cambio v={r.norma.pot_2026_preliminar.cambio_area_construible} />} k="cambio de aprovechamiento" />}
            </div>
            <div className="etiquetas">{(r.suelo.tratamientos ?? []).map((t: any) => <span key={t.tratamiento} className="etiqueta">{t.tratamiento} · {t.predios}</span>)}</div>
          </Seccion>
          <Seccion titulo="Competencia (Galería)">
            {r.competencia_galeria ? (
              <div className="cifras">
                <Cifra v={num(r.competencia_galeria.proyectos)} k="proyectos" />
                <Cifra v={num(r.competencia_galeria.ventas_mes, 1)} k="unidades vendidas al mes" />
                <Cifra v={`${num(r.competencia_galeria.oferta_disponible)} + ${num(r.competencia_galeria.oferta_por_lanzar)}`} k="oferta + por lanzar" />
                <Cifra v={num(r.competencia_galeria.meses_inventario, 1)} k="meses de inventario" />
                <Cifra v={millones(r.competencia_galeria.precio_m2_mediana)} k="precio por m² mediano" />
              </div>
            ) : <div className="sub">Sin proyectos de Galería ubicados dentro de la zona.</div>}
          </Seccion>
          {r.mercado_usados && (
            <Seccion titulo="Mercado de usados (Fynder)">
              <div className="cifras">
                <Cifra v={num(r.mercado_usados.apartamentos_en_venta)} k="apartamentos en venta" />
                <Cifra v={millones(r.mercado_usados.precio_m2_mediana)} k="precio por m² típico" />
                <Cifra v={num(r.mercado_usados.compradores_90d)} k="compradores buscando (90 d)" />
                <Cifra v={millones(r.mercado_usados.presupuesto_mediano)} k="presupuesto típico" />
              </div>
            </Seccion>
          )}
          <button className="btn btn-borde btn-bloque" onClick={onEstudio}>Hacer estudio de competencia con esta zona</button>
        </>
      )}
    </>
  );
}

/* ───────────── POT 2026: cambio y novedades ───────────── */
export function PanelPot({ abrir, verCapa }: { abrir: (id: string, lon?: number, lat?: number) => void; verCapa: () => void }) {
  const [agrupar, setAgrupar] = useState<"barrio" | "poligono">("barrio");
  const [r, setR] = useState<any>(null);
  const [nov, setNov] = useState<any>(null);
  const [cargando, setCargando] = useState(false);
  useEffect(() => { fetch("/api/analisis/novedades?dias=90").then((x) => x.json()).then(setNov).catch(() => {}); }, []);
  async function cargar(a = agrupar) {
    setCargando(true);
    try { setR(await (await fetch("/api/analisis/cambio_pot", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ agrupar: a, limite: 12 }) })).json()); }
    finally { setCargando(false); }
  }
  useEffect(() => { cargar(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const s = r?.resumen;
  return (
    <>
      <div className="explica-pot">
        <p><b>¿Qué es?</b> El Concejo de Medellín aprobó el 5 de noviembre de 2026 la revisión del POT (Proyecto de Acuerdo 104 de 2026). Cambia el índice de construcción, la densidad y los derechos que se pueden comprar en cada polígono.</p>
        <p><b>¿Por qué importa?</b> Un lote vale por lo que se puede construir en él: si su norma sube, vale más; si baja, vale menos. Aquí ves quién gana y quién pierde.</p>
        <p className="nota">Cifras del proyecto de acuerdo v3 (julio de 2026), preliminares hasta que se publique el texto final y la cartografía. No incluye la Zona 1.</p>
      </div>
      {s && (
        <div className="cifras">
          <Cifra v={<span style={{ color: "#3f8f4a" }}>{num(s.predios_que_suben)}</span>} k="predios suben su índice" />
          <Cifra v={<span style={{ color: "#c0392b" }}>{num(s.predios_que_bajan)}</span>} k="predios bajan su índice" />
          <Cifra v={<span style={{ color: s.m2_construibles_netos >= 0 ? "#3f8f4a" : "#c0392b" }}>{s.m2_construibles_netos >= 0 ? "+" : ""}{num(s.m2_construibles_netos / 1e6, 1)} M m²</span>} k="área construible base (neto)" />
          <Cifra v={<span style={{ color: s.viviendas_netas >= 0 ? "#3f8f4a" : "#c0392b" }}>{s.viviendas_netas >= 0 ? "+" : ""}{num(s.viviendas_netas)}</span>} k="viviendas por densidad (neto)" />
        </div>
      )}
      <div className="acciones">
        <div className="segmento" style={{ flex: 1 }}>{(["barrio", "poligono"] as const).map((v) => <button key={v} className={agrupar === v ? "on" : ""} onClick={() => { setAgrupar(v); cargar(v); }}>{v === "barrio" ? "Por barrio" : "Por polígono"}</button>)}</div>
        <button className="btn btn-oscuro" onClick={verCapa}>🗺 Colorear el mapa</button>
      </div>
      {cargando && <div className="cargando-panel"><span className="giro" />Comparando POT 2014 y 2026…</div>}
      {r && !r.error && (
        <>
          <Seccion titulo="Donde más sube el aprovechamiento">
            <table className="tabla"><thead><tr><th>{agrupar === "barrio" ? "Barrio" : "Polígono"}</th><th>Predios</th><th>m² extra</th><th>Cambio</th></tr></thead>
              <tbody>{r.mas_ganan.map((g: any) => <tr key={g.grupo}><td>{g.grupo}</td><td>{num(g.predios)}</td><td>{num(g.diferencia_m2)}</td><td><Cambio v={g.cambio} /></td></tr>)}</tbody></table>
          </Seccion>
          {r.mas_pierden.length > 0 && (
            <Seccion titulo="Donde baja" abierta={false}>
              <table className="tabla"><thead><tr><th>{agrupar === "barrio" ? "Barrio" : "Polígono"}</th><th>Predios</th><th>m²</th><th>Cambio</th></tr></thead>
                <tbody>{r.mas_pierden.map((g: any) => <tr key={g.grupo}><td>{g.grupo}</td><td>{num(g.predios)}</td><td>{num(g.diferencia_m2)}</td><td><Cambio v={g.cambio} /></td></tr>)}</tbody></table>
            </Seccion>
          )}
          <Seccion titulo="Lotes que más ganan (≥ 1.000 m²)">
            <ul className="lista">{r.lotes_que_mas_ganan.map((l: any) => (
              <li key={l.id} className="clicable" onClick={() => abrir(l.id, Number(l.lon), Number(l.lat))}>
                <div style={{ display: "flex", justifyContent: "space-between" }}><span className="n">{l.barrio}</span><b style={{ color: "#3f8f4a" }}>+{num(l.diferencia_m2)} m²</b></div>
                <span className="sub">{m2(l.area_lote)} · IC {num(l.ic_2014, 1)} → {num(l.ic_2026, 1)} · {l.codigo_2026}</span>
              </li>))}</ul>
          </Seccion>
          <div className="nota">{r.nota} {r.estado}</div>
        </>
      )}
      <Seccion titulo={`Novedades normativas${nov?.novedades ? ` (${nov.novedades.length})` : ""}`} abierta={false}>
        {nov?.ultima_revision && <div className="nota">Última revisión del monitor: {nov.ultima_revision}</div>}
        <ul className="lista">{(nov?.novedades ?? []).slice(0, 25).map((n: any) => (
          <li key={n.url}><a href={n.url} target="_blank" className="n">{n.titulo}</a><span className="sub">{n.publicado} · relevancia {n.relevancia}</span></li>
        ))}</ul>
      </Seccion>
    </>
  );
}

/* ───────────── Estudio de competencia (resultado) y proyecto ───────────── */
export function ResultadoEstudio({ e }: { e: any }) {
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
      {e.paso5_proyectos_a_consultar?.ubicacion_aproximada && <div className="alerta">{e.paso5_proyectos_a_consultar.ubicacion_aproximada}</div>}
      <div className="tarjeta">
        <h4>Competencia directa</h4>
        <table className="tabla">
          <thead><tr><th>Proyecto</th><th>$/m²</th><th>Und/mes</th><th>Vendido</th><th>Oferta</th></tr></thead>
          <tbody>
            {(e.paso8_tabla_resumen ?? []).map((x: any) => (
              <tr key={x.proyecto}>
                <td title={x.proyecto}>{x.proyecto}<div className="nota" style={{ fontWeight: 400 }}>{x.zona} · {x.constructor}</div></td>
                <td>{millones(x.precio_m2)}</td><td>{num(x.ventas_mes_promedio_semestre, 1)}</td>
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
          <Cifra v={num(i9.unidades_posibles_por_norma)} k="unidades posibles (POT 2014)" />
          {i9.norma_pot_2026_preliminar && <Cifra v={num(i9.norma_pot_2026_preliminar.con_derechos?.unidades_estimadas ?? i9.norma_pot_2026_preliminar.unidades_estimadas)} k="unidades proyecto 2026 (con derechos)" />}
        </div>
        {i9.entrega_predominante && <div className="sub">Entrega predominante en la zona: <b>{i9.entrega_predominante}</b></div>}
      </div>
      <div className="nota">La redacción del territorio, las recomendaciones y la conclusión se completan desde Claude y salen en el Excel.</div>
    </>
  );
}

export function FichaProyecto({ d }: { d: any }) {
  const p = d.proyecto;
  return (
    <>
      <div className="titulo"><h2>{p.nombre}</h2><div className="sub">{p.constructora} · {p.barrio ? `${p.barrio}, ` : ""}{p.municipio}</div></div>
      <div className="tarjeta">
        <h4>Producto</h4>
        <div className="cifras">
          <Cifra v={millones(p.precio_desde)} k="precio desde" /><Cifra v={millones(p.precio_m2_desde)} k="precio por m² desde" />
          <Cifra v={`${m2(p.area_min)} – ${m2(p.area_max)}`} k="áreas" /><Cifra v={p.entrega ?? "—"} k="entrega" />
        </div>
      </div>
      {d.aviso_ubicacion && <div className="alerta">{d.aviso_ubicacion}</div>}
      <div className="tarjeta">
        <h4>Competencia a 1,5 km ({d.competencia_1500m.length})</h4>
        <ul className="lista">{d.competencia_1500m.map((c: any) => <li key={c.id}><span className="n">{c.nombre}</span><span className="sub">{c.constructora} · desde {millones(c.precio_desde)} · a {num(c.distancia_m)} m</span></li>)}</ul>
      </div>
      <div className="nota">{d.atribucion}</div>
    </>
  );
}
