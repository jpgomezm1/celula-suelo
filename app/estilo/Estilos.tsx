"use client";
// Perfiles de estilo: el arquitecto sube fotos de sus obras y describe su lenguaje; los estudios de cabida generan
// las imágenes con ese lenguaje (ver lib/estilo.ts).
import { useCallback, useEffect, useRef, useState } from "react";

type Ref = { n: number; titulo?: string | null; proyecto?: string | null; ancho?: number; alto?: number };
type Perfil = { id: string; nombre: string; estudio?: string | null; descripcion?: string | null; materiales?: string | null; paleta?: string | null;
  rasgos?: string | null; evitar?: string | null; prompt_en?: string | null; analisis_fuente?: string | null; referentes: Ref[]; texto_prompt?: string | null };
type Fila = { id: string; nombre: string; estudio?: string | null; referentes: number; con_sintesis: boolean };

const CAMPOS: { k: keyof Perfil; label: string; ayuda: string; filas: number }[] = [
  { k: "descripcion", label: "Cómo describes tu arquitectura", ayuda: "Con tus palabras: qué buscas, qué te importa, cómo se siente un proyecto tuyo.", filas: 4 },
  { k: "materiales", label: "Materiales", ayuda: "Concreto a la vista, ladrillo, madera, celosías, piedra, vidrio…", filas: 2 },
  { k: "paleta", label: "Paleta de color", ayuda: "Tonos de fachada, carpinterías, acentos.", filas: 2 },
  { k: "rasgos", label: "Rasgos que te identifican", ayuda: "Fachada, vanos, balcones, remates, primer piso, paisajismo, interiores.", filas: 3 },
  { k: "evitar", label: "Lo que nunca harías", ayuda: "Lo que la IA no debe poner en tus imágenes.", filas: 2 },
];

/** Reduce la foto en el navegador (máx. 1600 px, JPEG) para no pasar el límite por petición. */
async function reducir(f: File) {
  const bmp = await createImageBitmap(f);
  const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.86);
}

export default function Estilos() {
  const [lista, setLista] = useState<Fila[]>([]);
  const [p, setP] = useState<Perfil | null>(null);
  const [cambios, setCambios] = useState<Partial<Perfil>>({});
  const [estado, setEstado] = useState<string | null>(null);
  const [subiendo, setSubiendo] = useState<string | null>(null);
  const [proyecto, setProyecto] = useState("");
  const [sobre, setSobre] = useState(false);
  const archivo = useRef<HTMLInputElement>(null);

  const cargarLista = useCallback(async () => setLista(await (await fetch("/api/estilo")).json()), []);
  const abrir = useCallback(async (id: string) => {
    const r = await fetch(`/api/estilo/${id}`);
    if (r.ok) { setP(await r.json()); setCambios({}); history.replaceState(null, "", `/estilo?id=${id}`); }
  }, []);
  useEffect(() => {
    cargarLista();
    const id = new URLSearchParams(location.search).get("id");
    if (id) abrir(id);
  }, [cargarLista, abrir]);

  const valor = (k: keyof Perfil) => ((k in cambios ? cambios[k] : p?.[k]) as string | null | undefined) ?? "";
  const editar = (k: keyof Perfil, v: string) => setCambios((c) => ({ ...c, [k]: v }));

  async function guardar() {
    if (!p) return;
    setEstado("Guardando…");
    const r = await fetch("/api/estilo", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: p.id, ...cambios }) });
    const j = await r.json();
    if (j.error) return setEstado(j.error);
    setP(j); setCambios({}); setEstado("Guardado."); cargarLista();
  }

  async function nuevo() {
    const nombre = (document.getElementById("nuevo-nombre") as HTMLInputElement)?.value?.trim();
    if (!nombre) return setEstado("Escribe un nombre para el perfil (p. ej. el nombre de tu estudio).");
    const r = await fetch("/api/estilo", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ nombre }) });
    const j = await r.json();
    if (j.error) return setEstado(j.error);
    (document.getElementById("nuevo-nombre") as HTMLInputElement).value = "";
    await cargarLista(); setP(j); setCambios({}); setEstado(null); history.replaceState(null, "", `/estilo?id=${j.id}`);
  }

  async function subir(files: FileList | File[]) {
    if (!p) return;
    const fs = Array.from(files).filter((f) => f.type.startsWith("image/"));
    let ok = 0; const errores: string[] = [];
    for (const [i, f] of fs.entries()) {
      setSubiendo(`Subiendo ${i + 1} de ${fs.length}…`);
      try {
        const b64 = await reducir(f);
        const r = await fetch(`/api/estilo/${p.id}/referente`, { method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ b64, titulo: f.name.replace(/\.[^.]+$/, ""), proyecto: proyecto || undefined }) });
        const j = await r.json();
        if (j.error) errores.push(`${f.name}: ${j.error}`); else ok++;
      } catch { errores.push(`${f.name}: no se pudo leer`); }
    }
    setSubiendo(null);
    setEstado(errores.length ? `${ok} subidas. ${errores.join(" · ")}` : `${ok} ${ok === 1 ? "referente subido" : "referentes subidos"}.`);
    abrir(p.id); cargarLista();
  }

  async function borrarRef(n: number) {
    if (!p) return;
    await fetch(`/api/estilo/${p.id}/referente/${n}`, { method: "DELETE" });
    abrir(p.id); cargarLista();
  }

  async function analizar() {
    if (!p) return;
    if (Object.keys(cambios).length) await guardar();
    setEstado("Leyendo los referentes con IA (hasta un minuto)…");
    const r = await fetch(`/api/estilo/${p.id}/analizar`, { method: "POST" });
    const j = await r.json();
    if (j.error) return setEstado(j.error);
    setP(j.estilo); setCambios({}); setEstado("Listo: revisa la lectura y ajústala con tus palabras.");
  }

  const pendientes = Object.keys(cambios).length > 0;

  return (
    <div className="est">
      <header className="barra">
        <a className="logo" href="/mapa"><img src="/marca/irrelevant.png" alt="" />irrelevant</a>
        <div className="sep" />
        <div className="producto">Estilo del arquitecto<small>Referentes y lenguaje para las imágenes del estudio de cabida</small></div>
        <div className="derecha"><a href="/mapa">Mapa</a><a href="/api/logout">Salir</a></div>
        <div className="franja" />
      </header>

      <div className="est-cuerpo">
        <aside className="est-lista">
          <h3>Perfiles</h3>
          {lista.map((f) => (
            <button key={f.id} className={`est-item${p?.id === f.id ? " activo" : ""}`} onClick={() => abrir(f.id)}>
              <b>{f.nombre}</b>
              <small>{f.estudio ? `${f.estudio} · ` : ""}{f.referentes} {f.referentes === 1 ? "referente" : "referentes"}{f.con_sintesis ? " · listo para IA" : ""}</small>
            </button>
          ))}
          {!lista.length && <p className="est-nota">Todavía no hay perfiles.</p>}
          <div className="est-nuevo">
            <input id="nuevo-nombre" placeholder="Nombre del perfil (p. ej. tu estudio)" onKeyDown={(e) => { if (e.key === "Enter") nuevo(); }} />
            <button className="est-btn" onClick={nuevo}>Crear perfil</button>
          </div>
          <div className="est-como">
            <b>Cómo se usa</b>
            <ol>
              <li>Sube fotos de obras tuyas: fachadas, accesos, interiores, zonas sociales.</li>
              <li>Describe tu arquitectura con tus palabras.</li>
              <li>Pídele a Claude: <i>“estudio de cabida de este lote con el estilo {p?.nombre ?? "de mi perfil"}”</i>.</li>
            </ol>
            Las fotos se usan solo como lenguaje (materiales, fachada, vanos, paisajismo). El volumen sale siempre de la norma y del anteproyecto.
          </div>
        </aside>

        <main className="est-main">
          {!p ? <div className="est-vacio"><h2>Tu arquitectura en las imágenes</h2><p>Crea un perfil a la izquierda o abre uno existente. Con tus referentes, los renders, el acceso, los interiores y la zona social del estudio de cabida salen con tu lenguaje y no con uno genérico.</p></div> : (
            <>
              <div className="est-cab">
                <input className="est-titulo" value={valor("nombre")} onChange={(e) => editar("nombre", e.target.value)} />
                <input className="est-sub" placeholder="Estudio o firma (opcional)" value={valor("estudio")} onChange={(e) => editar("estudio", e.target.value)} />
              </div>

              <section className="est-sec">
                <div className="est-sec-cab">
                  <h3>Referentes <small>{p.referentes.length} de 24</small></h3>
                  <input className="est-proy" placeholder="Proyecto de estas fotos (opcional)" value={proyecto} onChange={(e) => setProyecto(e.target.value)} />
                </div>
                <div className={`est-drop${sobre ? " sobre" : ""}`} onClick={() => archivo.current?.click()}
                  onDragOver={(e) => { e.preventDefault(); setSobre(true); }} onDragLeave={() => setSobre(false)}
                  onDrop={(e) => { e.preventDefault(); setSobre(false); subir(e.dataTransfer.files); }}>
                  {subiendo ?? "Arrastra fotos de tus obras aquí o haz clic para elegirlas (JPG, PNG o WebP)"}
                  <input ref={archivo} type="file" accept="image/*" multiple hidden onChange={(e) => { if (e.target.files) subir(e.target.files); e.target.value = ""; }} />
                </div>
                {p.referentes.length > 0 && (
                  <div className="est-grid">
                    {p.referentes.map((r, i) => (
                      <figure key={r.n} className={i < 4 ? "principal" : ""}>
                        <img src={`/api/estilo/${p.id}/referente/${r.n}`} alt={r.titulo ?? ""} loading="lazy" />
                        <figcaption>{r.proyecto ?? r.titulo}</figcaption>
                        <button title="Quitar" onClick={() => borrarRef(r.n)}>×</button>
                      </figure>
                    ))}
                  </div>
                )}
                {p.referentes.length > 4 && <p className="est-nota">Los 4 primeros (marcados) van como imagen de referencia en cada render; todos sirven para leer el estilo.</p>}
              </section>

              <section className="est-sec">
                <div className="est-sec-cab">
                  <h3>Tu lenguaje</h3>
                  <button className="est-btn sec" onClick={analizar} disabled={!p.referentes.length}>Leer mis referentes con IA</button>
                </div>
                <div className="est-campos">
                  {CAMPOS.map((c) => (
                    <label key={c.k}>
                      <span>{c.label}</span>
                      <textarea rows={c.filas} placeholder={c.ayuda} value={valor(c.k)} onChange={(e) => editar(c.k, e.target.value)} />
                    </label>
                  ))}
                  <label className="ancho">
                    <span>Síntesis para el generador de imágenes <small>(en inglés; la arma la IA al leer tus referentes, puedes ajustarla)</small></span>
                    <textarea rows={3} value={valor("prompt_en")} onChange={(e) => editar("prompt_en", e.target.value)} placeholder="Se llena al leer los referentes con IA, o Claude la escribe al revisar tu perfil." />
                  </label>
                </div>
              </section>

              <div className="est-acciones">
                <button className="est-btn" onClick={guardar} disabled={!pendientes}>{pendientes ? "Guardar cambios" : "Sin cambios"}</button>
                {estado && <span className="est-estado">{estado}</span>}
                <span className="est-id">id del perfil: <code>{p.id}</code></span>
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
