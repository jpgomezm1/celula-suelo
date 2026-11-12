"use client";
// Visor 3D de la cabida arquitectónica (Three.js): volumen completo o corte por piso, capas, y rótulo al pasar el cursor.
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

type Pt = [number, number];
const COLOR: Record<string, number> = {
  LOTE: 0xf2a900, AREA_EDIFICABLE: 0x9a9a9a, SOTANO: 0x8d8a83, PARQUEADEROS: 0x3f8f4a, CIRCULACION_VEHICULAR: 0xb9b5ab, RAMPA: 0xc2185b,
  PLATAFORMA: 0xe39b4a, TORRE: 0x6c4de7, NUCLEO: 0xc0392b, CIRCULACION: 0xd9d5cc, APARTAMENTOS: 0x8b74f0,
};
const CAPAS_UI: [string, string][] = [["sotanos", "Sótanos"], ["parqueaderos", "Parqueaderos"], ["plataforma", "Plataforma"], ["torres", "Torres"], ["nucleos", "Puntos fijos"], ["lote", "Lote y retiros"]];

function forma(pts: Pt[]) {
  const s = new THREE.Shape();
  pts.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y)));
  s.closePath();
  return s;
}
/** Prisma: polígono en planta (x, y) extruido entre z0 y z1. En Three: X = x, Y = altura, Z = −y. */
function prisma(pts: Pt[], z0: number, alto: number, color: number, opacidad = 1) {
  const geo = new THREE.ExtrudeGeometry(forma(pts), { depth: alto, bevelEnabled: false });
  geo.rotateX(-Math.PI / 2); geo.translate(0, z0, 0);
  const mat = new THREE.MeshStandardMaterial({ color, transparent: opacidad < 1, opacity: opacidad, roughness: 0.75, metalness: 0.02 });
  const m = new THREE.Mesh(geo, mat);
  const bordes = new THREE.LineSegments(new THREE.EdgesGeometry(geo, 20), new THREE.LineBasicMaterial({ color: 0x08061a, transparent: true, opacity: 0.35 }));
  m.add(bordes);
  return m;
}
function contorno(pts: Pt[], z: number, color: number) {
  const g = new THREE.BufferGeometry().setFromPoints([...pts, pts[0]].map(([x, y]) => new THREE.Vector3(x, z, -y)));
  return new THREE.Line(g, new THREE.LineBasicMaterial({ color }));
}

export default function Cabida3D({ modelo, onCerrar }: { modelo: any; onCerrar: () => void }) {
  const caja = useRef<HTMLDivElement>(null);
  const escena = useRef<{ grupos: Record<string, THREE.Group>; pisos: THREE.Group[]; render: () => void } | null>(null);
  const [capas, setCapas] = useState<Record<string, boolean>>({ sotanos: true, parqueaderos: true, plataforma: true, torres: true, nucleos: true, lote: true });
  const tipos = (modelo.niveles as any[]).filter((n) => n.tipo === "tipo");
  const [corte, setCorte] = useState<number | null>(null); // índice de piso tipo cortado; null = volumen completo
  const [tip, setTip] = useState<{ x: number; y: number; t: string } | null>(null);

  useEffect(() => {
    const el = caja.current!;
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(el.clientWidth, el.clientHeight);
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf4f2ec);
    const r = modelo.resumen;
    const ext = Math.max(...modelo.lote.flatMap((p: Pt) => [Math.abs(p[0]), Math.abs(p[1])]));
    const camera = new THREE.PerspectiveCamera(40, el.clientWidth / el.clientHeight, 0.5, 5000);
    camera.position.set(ext * 1.6, Math.max(r.altura_m * 1.3, ext), ext * 1.8);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, r.altura_m * 0.3, 0); controls.enableDamping = true;
    scene.add(new THREE.HemisphereLight(0xffffff, 0x8d8a83, 1.6));
    const sol = new THREE.DirectionalLight(0xffffff, 1.4); sol.position.set(ext, ext * 2, ext * 0.6); scene.add(sol);

    const grupos: Record<string, THREE.Group> = {};
    for (const k of ["sotanos", "parqueaderos", "plataforma", "torres", "nucleos", "lote"]) { grupos[k] = new THREE.Group(); scene.add(grupos[k]); }
    // Terreno, lote y área edificable
    const suelo = new THREE.Mesh(new THREE.CircleGeometry(ext * 3, 64), new THREE.MeshStandardMaterial({ color: 0xe7e3d8, transparent: true, opacity: 0.85 }));
    suelo.rotation.x = -Math.PI / 2; suelo.position.y = -0.02; scene.add(suelo);
    grupos.lote.add(contorno(modelo.lote, 0.03, COLOR.LOTE), contorno(modelo.edificable, 0.03, COLOR.AREA_EDIFICABLE));
    const pisos: THREE.Group[] = [];
    for (const n of modelo.niveles) {
      const gPiso = new THREE.Group(); gPiso.userData = { nivel: n.nombre };
      for (const e of n.elementos) {
        let obj: THREE.Object3D | null = null, grupo = "torres";
        if (e.capa === "SOTANO") { obj = prisma(e.poligono, n.z, n.altura * 0.96, COLOR.SOTANO, 0.35); grupo = "sotanos"; }
        else if (e.capa === "PARQUEADEROS" || e.capa === "RAMPA" || e.capa === "CIRCULACION_VEHICULAR") { obj = prisma(e.poligono, n.z + 0.02, 0.06, COLOR[e.capa], 0.95); grupo = "parqueaderos"; }
        else if (e.capa === "PLATAFORMA") { obj = prisma(e.poligono, n.z, n.altura * 0.95, COLOR.PLATAFORMA, 0.9); grupo = "plataforma"; }
        else if (e.capa === "NUCLEO") { obj = prisma(e.poligono, n.z, n.altura * 0.97, COLOR.NUCLEO, 0.95); grupo = n.tipo === "tipo" ? "nucleos" : n.tipo === "sotano" ? "sotanos" : "plataforma"; }
        else if (e.capa === "TORRE") { obj = prisma(e.poligono, n.z, n.altura * 0.92, COLOR.TORRE, 0.88); obj.userData.esCasco = true; }
        else if (e.capa === "APARTAMENTOS") { obj = prisma(e.poligono, n.z, 0.12, COLOR.APARTAMENTOS, 1); obj.userData.esPlanta = true; obj.visible = false; }
        else if (e.capa === "CIRCULACION") { obj = prisma(e.poligono, n.z, 0.08, COLOR.CIRCULACION, 1); obj.userData.esPlanta = true; obj.visible = false; }
        if (!obj) continue;
        obj.userData = { ...obj.userData, etiqueta: e.etiqueta ? `${n.nombre} · ${e.etiqueta}` : n.nombre, grupo };
        if (n.tipo === "tipo") gPiso.add(obj); else grupos[grupo].add(obj);
      }
      if (n.tipo === "tipo") { grupos.torres.add(gPiso); pisos.push(gPiso); }
    }

    let raf = 0;
    const render = () => renderer.render(scene, camera);
    const loop = () => { controls.update(); render(); raf = requestAnimationFrame(loop); };
    loop();
    const ray = new THREE.Raycaster(), mouse = new THREE.Vector2();
    const mover = (ev: PointerEvent) => {
      const b = renderer.domElement.getBoundingClientRect();
      mouse.set(((ev.clientX - b.left) / b.width) * 2 - 1, -((ev.clientY - b.top) / b.height) * 2 + 1);
      ray.setFromCamera(mouse, camera);
      const hit = ray.intersectObjects(scene.children, true).find((h) => h.object.visible && (h.object as any).isMesh && h.object.userData.etiqueta && isVisible(h.object));
      setTip(hit ? { x: ev.clientX - b.left + 12, y: ev.clientY - b.top + 12, t: hit.object.userData.etiqueta } : null);
    };
    const isVisible = (o: THREE.Object3D): boolean => (o.visible ? (o.parent ? isVisible(o.parent) : true) : false);
    renderer.domElement.addEventListener("pointermove", mover);
    const redim = () => { camera.aspect = el.clientWidth / el.clientHeight; camera.updateProjectionMatrix(); renderer.setSize(el.clientWidth, el.clientHeight); };
    window.addEventListener("resize", redim);
    escena.current = { grupos, pisos, render };
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", redim); renderer.domElement.removeEventListener("pointermove", mover); controls.dispose(); renderer.dispose(); el.innerHTML = ""; };
  }, [modelo]);

  // Capas visibles
  useEffect(() => { const s = escena.current; if (!s) return; for (const [k, g] of Object.entries(s.grupos)) g.visible = capas[k]; }, [capas]);
  // Corte por piso: oculta los pisos de arriba y muestra la planta (apartamentos y pasillos) del piso cortado.
  useEffect(() => {
    const s = escena.current; if (!s) return;
    s.pisos.forEach((g, i) => {
      g.visible = corte === null || i <= corte;
      g.traverse((o) => {
        if (o.userData.esPlanta) o.visible = corte !== null && i === corte;
        if (o.userData.esCasco) o.visible = corte === null || i < corte;
        if (o.userData.grupo === "nucleos") o.visible = capas.nucleos;
      });
    });
  }, [corte, capas.nucleos]);

  const r = modelo.resumen;
  return (
    <div className="modal-3d completo" onClick={(e) => e.stopPropagation()}>
      <div className="caja-3d">
        <div className="cabeza-3d">
          <b>Cabida arquitectónica · {modelo.barrio ?? modelo.predio}</b>
          <span>{r.torres} torres · {r.pisos_totales} pisos · {r.unidades} unidades · {r.sotanos} sótanos · arrastra para girar, rueda para acercar</span>
          <button onClick={onCerrar} title="Cerrar">✕</button>
        </div>
        <div className="visor-cabida">
          <div ref={caja} className="lienzo-cabida" />
          {tip && <div className="tip-cabida" style={{ left: tip.x, top: tip.y }}>{tip.t}</div>}
          <div className="controles-cabida">
            <div className="campo"><label>Vista</label>
              <input type="range" min={-1} max={tipos.length - 1} value={corte ?? -1} onChange={(e) => setCorte(Number(e.target.value) < 0 ? null : Number(e.target.value))} />
              <div className="nota">{corte === null ? "Volumen completo" : `Corte en ${tipos[corte]?.nombre} (planta de apartamentos)`}</div>
            </div>
            <div className="capas-cabida">{CAPAS_UI.map(([k, t]) => (
              <label key={k}><input type="checkbox" checked={capas[k]} onChange={(e) => setCapas({ ...capas, [k]: e.target.checked })} /> {t}</label>))}</div>
            <div className="leyenda-cabida">
              {[["Torres", COLOR.TORRE], ["Apartamentos", COLOR.APARTAMENTOS], ["Puntos fijos", COLOR.NUCLEO], ["Plataforma", COLOR.PLATAFORMA], ["Parqueaderos", COLOR.PARQUEADEROS], ["Sótanos", COLOR.SOTANO]].map(([t, c]) => (
                <span key={t as string}><i style={{ background: `#${(c as number).toString(16).padStart(6, "0")}` }} />{t}</span>))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
