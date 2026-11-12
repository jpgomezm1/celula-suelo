"use client";
// Visor 3D arquitectónico del anteproyecto: fachadas con vanos y vidrio, losas, cubierta, contexto (vecinos del catastro,
// lote con zonas verdes y árboles), sol con sombras por hora del día, corte por piso con espacios y muros en poché,
// y modo sótanos (parqueaderos, calles y rampa).
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { CSS2DRenderer, CSS2DObject } from "three/examples/jsm/renderers/CSS2DRenderer.js";

type P = [number, number];
const COL_ESP: Record<string, number> = { alcoba: 0xe7defa, alcoba_principal: 0xddd1f7, sala: 0xfbe6c8, estancia: 0xfbe6c8, cocina: 0xd9efdf, bano: 0xd2e7f5, ropas: 0xe3eed0,
  hall: 0xf1eee8, vestier: 0xebe2f6, estudio: 0xf7e4d4, deposito: 0xe2e2e2 };
const NOMBRE_TIPO: Record<string, string> = { alcoba: "Alcoba", alcoba_principal: "Alcoba principal", sala: "Sala-comedor", estancia: "Estancia", cocina: "Cocina", bano: "Baño", ropas: "Ropas", hall: "Hall", vestier: "Vestier", estudio: "Estudio", deposito: "Depósito" };

// ---------- geometría ----------
const forma = (pts: P[]) => { const s = new THREE.Shape(); pts.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y))); s.closePath(); return s; };
/** Prisma en el marco local: X = x, Y = altura, Z = −y. */
function prismaGeo(pts: P[], z0: number, h: number) {
  const g = new THREE.ExtrudeGeometry(forma(pts), { depth: h, bevelEnabled: false });
  g.rotateX(-Math.PI / 2); g.translate(0, z0, 0);
  return g;
}
const rectP = (x0: number, y0: number, x1: number, y1: number): P[] => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
const unir = (gs: THREE.BufferGeometry[]) => {
  if (!gs.length) return null;
  const limpias = gs.map((g) => { const n = g.index ? g.toNonIndexed() : g; for (const k of Object.keys(n.attributes)) if (!["position", "normal", "uv"].includes(k)) n.deleteAttribute(k); n.clearGroups(); return n; });
  return mergeGeometries(limpias, false);
};

/** Separa una extrusión en tapas (grupo 0: cara superior e inferior) y costados (grupo 1). */
function separar(g: THREE.BufferGeometry) {
  const n = g.index ? g.toNonIndexed() : g;
  const sub = (start: number, count: number) => {
    const o = new THREE.BufferGeometry();
    for (const k of ["position", "normal", "uv"]) { const a = n.getAttribute(k) as THREE.BufferAttribute | undefined; if (a) o.setAttribute(k, new THREE.BufferAttribute((a.array as Float32Array).slice(start * a.itemSize, (start + count) * a.itemSize), a.itemSize)); }
    return o;
  };
  const tapas: THREE.BufferGeometry[] = [], lados: THREE.BufferGeometry[] = [];
  for (const gr of n.groups) (gr.materialIndex === 0 ? tapas : lados).push(sub(gr.start, gr.count));
  return { tapas, lados };
}
function conPoche(gs: THREE.BufferGeometry[], poche: THREE.Material, lado: THREE.Material) {
  const t: THREE.BufferGeometry[] = [], l: THREE.BufferGeometry[] = [];
  for (const g of gs) { const x = separar(g); t.push(...x.tapas); l.push(...x.lados); }
  const out: THREE.Mesh[] = [];
  for (const [arr, m] of [[t, poche], [l, lado]] as [THREE.BufferGeometry[], THREE.Material][]) if (arr.length) { const mg = mergeGeometries(arr, false); if (mg) { const x = new THREE.Mesh(mg, m); x.castShadow = true; x.receiveShadow = true; out.push(x); } }
  return out;
}

export default function Anteproyecto3D({ escena, onCerrar }: { escena: any; onCerrar: () => void }) {
  const caja = useRef<HTMLDivElement>(null);
  const brujula = useRef<HTMLDivElement>(null);
  const api = useRef<any>(null);
  const tipos = (escena.niveles as any[]).filter((n) => n.tipo === "tipo" || n.tipo === "primero" || n.tipo === "plataforma");
  const [modo, setModo] = useState<"exterior" | "corte" | "sotanos">("exterior");
  const [piso, setPiso] = useState(Math.min(2, tipos.length - 1));
  const [hora, setHora] = useState(10);
  const [vecinos, setVecinos] = useState(true);
  const [girar, setGirar] = useState(false);
  const [tip, setTip] = useState<{ x: number; y: number; t: string } | null>(null);

  useEffect(() => {
    const el = caja.current!;
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(el.clientWidth, el.clientHeight);
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
    el.appendChild(renderer.domElement);
    const etiquetas = new CSS2DRenderer(); etiquetas.setSize(el.clientWidth, el.clientHeight);
    etiquetas.domElement.style.position = "absolute"; etiquetas.domElement.style.inset = "0"; etiquetas.domElement.style.pointerEvents = "none";
    el.appendChild(etiquetas.domElement);

    const scene = new THREE.Scene();
    const cielo = new THREE.Color(0xdde6ee);
    scene.background = cielo; scene.fog = new THREE.Fog(cielo, 260, 900);
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

    const lote: P[] = escena.lote;
    const xs = lote.map((p) => p[0]), ys = lote.map((p) => p[1]);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    const ext = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
    const zTop = Math.max(...escena.niveles.map((n: any) => n.z + n.altura));
    const camera = new THREE.PerspectiveCamera(38, el.clientWidth / el.clientHeight, 0.5, 3000);
    camera.position.set(cx + ext * 0.9, Math.max(zTop * 1.6, ext * 0.75), -cy + ext * 1.05);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(cx, zTop * 0.35, -cy); controls.enableDamping = true; controls.maxPolarAngle = Math.PI * 0.495; controls.minDistance = 8; controls.maxDistance = 900;

    // Luz: cielo + sol con sombras
    scene.add(new THREE.HemisphereLight(0xeaf2ff, 0xb9ad94, 0.75));
    const sol = new THREE.DirectionalLight(0xfff4e2, 2.6);
    sol.castShadow = true; sol.shadow.mapSize.set(2048, 2048); sol.shadow.bias = -0.0004; sol.shadow.normalBias = 0.03;
    const sc = sol.shadow.camera as THREE.OrthographicCamera; const B = ext * 0.95 + 40; sc.left = -B; sc.right = B; sc.top = B; sc.bottom = -B; sc.near = 1; sc.far = 1200;
    sol.target.position.set(cx, 0, -cy); scene.add(sol, sol.target);

    // Materiales
    const M = {
      suelo: new THREE.MeshStandardMaterial({ color: 0xe4dfd2, roughness: 1 }),
      pasto: new THREE.MeshStandardMaterial({ color: 0xa5c182, roughness: 1 }),
      muro: new THREE.MeshStandardMaterial({ color: 0xf3efe7, roughness: 0.82 }),
      losa: new THREE.MeshStandardMaterial({ color: 0xb6b0a4, roughness: 0.7 }),
      vidrio: new THREE.MeshStandardMaterial({ color: 0x6f92ab, roughness: 0.08, metalness: 0.65, envMapIntensity: 1.3 }),
      marco: new THREE.MeshStandardMaterial({ color: 0x33373d, roughness: 0.5, metalness: 0.4 }),
      cubierta: new THREE.MeshStandardMaterial({ color: 0xd9d3c7, roughness: 0.9 }),
      nucleo: new THREE.MeshStandardMaterial({ color: 0xcfc7ba, roughness: 0.85 }),
      vecino: new THREE.MeshStandardMaterial({ color: 0xece8e0, roughness: 0.95 }),
      poche: new THREE.MeshStandardMaterial({ color: 0x2f2f33, roughness: 0.9 }),
      blanco: new THREE.MeshStandardMaterial({ color: 0xfaf8f4, roughness: 0.85 }),
      tronco: new THREE.MeshStandardMaterial({ color: 0x7a5a3a, roughness: 1 }),
      copa: new THREE.MeshStandardMaterial({ color: 0x6f9a55, roughness: 0.95, flatShading: true }),
      sotano: new THREE.MeshStandardMaterial({ color: 0xa9a49a, roughness: 0.95 }),
      celda: new THREE.MeshStandardMaterial({ color: 0x94bf8f, roughness: 0.9 }),
      visitante: new THREE.MeshStandardMaterial({ color: 0x8db3d8, roughness: 0.9 }),
      calle: new THREE.MeshStandardMaterial({ color: 0x8e8a83, roughness: 1 }),
      rampa: new THREE.MeshStandardMaterial({ color: 0xc2185b, roughness: 0.8, side: THREE.DoubleSide }),
    };
    const malla = (g: THREE.BufferGeometry | null, m: THREE.Material, sombra = true) => { if (!g) return null; const x = new THREE.Mesh(g, m); x.castShadow = sombra; x.receiveShadow = true; return x; };

    // Terreno, lote y árboles
    const suelo = new THREE.Mesh(new THREE.CircleGeometry(1400, 64), M.suelo); suelo.rotation.x = -Math.PI / 2; suelo.position.set(cx, -0.03, -cy); suelo.receiveShadow = true; scene.add(suelo);
    const gLote = new THREE.ShapeGeometry(forma(lote)); gLote.rotateX(-Math.PI / 2); gLote.translate(0, 0.02, 0);
    const pasto = new THREE.Mesh(gLote, M.pasto); pasto.receiveShadow = true; scene.add(pasto);
    const linea = (pts: P[], z: number, color: number, discontinua = false) => {
      const g = new THREE.BufferGeometry().setFromPoints([...pts, pts[0]].map(([x, y]) => new THREE.Vector3(x, z, -y)));
      const l = new THREE.Line(g, discontinua ? new THREE.LineDashedMaterial({ color, dashSize: 1.2, gapSize: 0.8 }) : new THREE.LineBasicMaterial({ color }));
      if (discontinua) l.computeLineDistances(); return l;
    };
    scene.add(linea(lote, 0.05, 0xd9a400));
    if (escena.edificable?.length) scene.add(linea(escena.edificable, 0.06, 0x6c4de7, true));

    // Marco de cada torre
    const T = (t: any) => ([s, q]: P): P => (t.rotada ? [t.origen[0] + t.D - q, t.origen[1] + s] : [t.origen[0] + s, t.origen[1] + q]);
    const huellas = escena.torres.map((t: any) => { const f = T(t); return [f([0, 0]), f([t.L, 0]), f([t.L, t.D]), f([0, t.D])] as P[]; });
    const dentro = (p: P, poly: P[]) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, yi] = poly[i], [xj, yj] = poly[j]; if ((yi > p[1]) !== (yj > p[1]) && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) c = !c; } return c; };
    const libre = (p: P) => dentro(p, lote) && !huellas.some((h: P[]) => { const xs2 = h.map((q) => q[0]), ys2 = h.map((q) => q[1]); return p[0] > Math.min(...xs2) - 3 && p[0] < Math.max(...xs2) + 3 && p[1] > Math.min(...ys2) - 3 && p[1] < Math.max(...ys2) + 3; });
    // Árboles en los retiros: puntos a lo largo del lindero, 2,5 m hacia adentro
    const arboles: P[] = [];
    for (let i = 0; i < lote.length; i++) {
      const a = lote[i], b = lote[(i + 1) % lote.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      for (let d = 4; d < L - 2; d += 8) {
        const t = d / L, p: P = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
        const nx = -(b[1] - a[1]) / L, ny = (b[0] - a[0]) / L;
        for (const sgn of [1, -1]) { const q: P = [p[0] + nx * 2.6 * sgn, p[1] + ny * 2.6 * sgn]; if (libre(q)) { arboles.push(q); break; } }
      }
    }
    if (arboles.length) {
      const tr = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.16, 0.22, 3, 6), M.tronco, arboles.length);
      const co = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(2.1, 0), M.copa, arboles.length);
      const mm = new THREE.Matrix4();
      arboles.forEach(([x, y], i) => {
        const s = 0.8 + ((Math.sin(x * 12.9 + y * 78.2) + 1) / 2) * 0.5;
        mm.compose(new THREE.Vector3(x, 1.5, -y), new THREE.Quaternion(), new THREE.Vector3(1, s, 1)); tr.setMatrixAt(i, mm);
        mm.compose(new THREE.Vector3(x, 3 + 1.6 * s, -y), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, x, 0)), new THREE.Vector3(s, s * 1.15, s)); co.setMatrixAt(i, mm);
      });
      tr.castShadow = co.castShadow = true; co.receiveShadow = true;
      scene.add(tr, co);
    }

    // Vecinos (catastro): volúmenes claros con su altura
    const grupoVecinos = new THREE.Group(); scene.add(grupoVecinos);
    const gv: THREE.BufferGeometry[] = [];
    for (const v of escena.vecinos ?? []) if (v.poly.length >= 3 && v.altura > 0) { try { gv.push(prismaGeo(v.poly, 0, v.altura)); } catch { /* polígono inválido */ } }
    const mv = malla(unir(gv), M.vecino); if (mv) grupoVecinos.add(mv);

    // Torres: un grupo por piso (exterior) para poder cortar
    const pisosExt: THREE.Group[] = []; // índice = nivel sobre rasante
    const nivelesSobre = (escena.niveles as any[]).filter((n) => n.tipo !== "sotano");
    const cubierta = new THREE.Group(); scene.add(cubierta);
    const fachadaPiso = (t: any, n: any, corte: boolean) => {
      const f = T(t), out: Record<string, THREE.BufferGeometry[]> = { muro: [], losa: [], vidrio: [], marco: [] };
      const pr = (k: string, pts: P[], z0: number, h: number) => { if (h > 0.01) out[k].push(prismaGeo(pts.map(f), z0, h)); };
      const z = n.z, H = corte ? Math.min(2.4, n.altura) : n.altura, e = 0.2, s0 = 0.24;
      pr("losa", rectP(-e, -e, t.L + e, t.D + e), z, s0);
      const lobby = n.tipo === "primero" ? t.aptos.filter((a: any) => a.convertido).map((a: any) => { const xs2 = a.poly.map((p: P) => p[0]); return [Math.min(...xs2), Math.max(...xs2), a.lado] as [number, number, string]; }) : [];
      for (const [q0, q1, lado] of [[-e, 0, "sur"], [t.D, t.D + e, "norte"]] as [number, number, string][]) {
        const yq = lado === "sur" ? 0 : t.D;
        let vs = (t.ventanas as any[]).filter((v) => Math.abs(v.a[1] - yq) < 0.05).map((v) => [Math.min(v.a[0], v.b[0]), Math.max(v.a[0], v.b[0]), v.tipo === "ventanal"] as [number, number, boolean]);
        for (const [a, b, l] of lobby) if (l === lado) vs = [...vs.filter((v) => v[1] < a || v[0] > b), [a + 0.3, b - 0.3, true]];
        vs.sort((x, y) => x[0] - y[0]);
        let s = 0;
        for (const [a, b, piso] of vs) {
          pr("muro", rectP(s, q0, a, q1), z + s0, H - s0);
          const ante = piso ? 0 : 0.9, dintel = 2.35;
          if (ante) pr("muro", rectP(a, q0, b, q1), z + s0, ante);
          if (!corte || dintel < H) pr("muro", rectP(a, q0, b, q1), z + s0 + dintel, H - s0 - dintel);
          const vq0 = (q0 + q1) / 2 - 0.02, vq1 = vq0 + 0.04, hv = Math.min(dintel, H - s0) - ante;
          pr("vidrio", rectP(a, vq0, b, vq1), z + s0 + ante, hv);
          // Marcos y parteluces cada ~1,2 m
          const nPar = Math.max(1, Math.round((b - a) / 1.2));
          for (let i = 0; i <= nPar; i++) { const x = a + ((b - a) * i) / nPar; pr("marco", rectP(x - 0.03, vq0 - 0.02, x + 0.03, vq1 + 0.02), z + s0 + ante, hv); }
          if (ante) pr("marco", rectP(a, vq0 - 0.03, b, vq1 + 0.03), z + s0 + ante - 0.04, 0.05);
          s = b;
        }
        pr("muro", rectP(s, q0, t.L, q1), z + s0, H - s0);
      }
      pr("muro", rectP(-e, -e, 0, t.D + e), z + s0, H - s0); pr("muro", rectP(t.L, -e, t.L + e, t.D + e), z + s0, H - s0);
      return out;
    };
    nivelesSobre.forEach((n) => {
      const g = new THREE.Group(); g.userData = { nivel: n };
      const acc: Record<string, THREE.BufferGeometry[]> = { muro: [], losa: [], vidrio: [], marco: [] };
      for (const t of escena.torres) { const o = fachadaPiso(t, n, false); for (const k of Object.keys(acc)) acc[k].push(...o[k]); }
      for (const [k, mat] of [["muro", M.muro], ["losa", M.losa], ["vidrio", M.vidrio], ["marco", M.marco]] as [string, THREE.Material][]) { const x = malla(unir(acc[k]), mat, k !== "vidrio"); if (x) g.add(x); }
      scene.add(g); pisosExt.push(g);
    });
    // Cubierta: losa, antepecho y cuarto de máquinas sobre el punto fijo; rótulos de torre
    for (const t of escena.torres) {
      const f = T(t), e = 0.2, gs: THREE.BufferGeometry[] = [], gn: THREE.BufferGeometry[] = [];
      gs.push(prismaGeo(rectP(-e, -e, t.L + e, t.D + e).map(f), zTop, 0.3));
      for (const r of [rectP(-e, -e, t.L + e, 0), rectP(-e, t.D, t.L + e, t.D + e), rectP(-e, 0, 0, t.D), rectP(t.L, 0, t.L + e, t.D)]) gs.push(prismaGeo(r.map(f), zTop + 0.3, 1.0));
      const nuc = [...t.nucleo.escaleras, ...t.nucleo.ascensores, t.nucleo.hall].flat() as P[];
      const nx = nuc.map((p) => p[0]), ny = nuc.map((p) => p[1]);
      gn.push(prismaGeo(rectP(Math.min(...nx), Math.min(...ny), Math.max(...nx), Math.max(...ny)).map(f), zTop + 0.3, 3.2));
      const a = malla(unir(gs), M.cubierta), b = malla(unir(gn), M.nucleo); if (a) cubierta.add(a); if (b) cubierta.add(b);
      const c = f([t.L / 2, t.D / 2]);
      const div = document.createElement("div"); div.className = "rotulo-torre"; div.textContent = `Torre ${t.id}`;
      const lab = new CSS2DObject(div); lab.position.set(c[0], zTop + 6, -c[1]); cubierta.add(lab);
    }

    // Sótanos (ocultos salvo en modo sótanos)
    const grupoSot = new THREE.Group(); grupoSot.visible = false; scene.add(grupoSot);
    for (const s of escena.sotanos ?? []) {
      const z = -s.nivel * 3;
      const ls = malla(prismaGeo(s.poligono, z - 0.2, 0.2), M.sotano); if (ls) grupoSot.add(ls);
      const gc: THREE.BufferGeometry[] = [], gvv: THREE.BufferGeometry[] = [], gca: THREE.BufferGeometry[] = [];
      for (const p of s.puestos) (p.v ? gvv : gc).push(prismaGeo((p.poly as P[]).map(([x, y], i, arr) => { const c = [arr.reduce((u, q) => u + q[0], 0) / 4, arr.reduce((u, q) => u + q[1], 0) / 4]; return [c[0] + (x - c[0]) * 0.9, c[1] + (y - c[1]) * 0.94] as P; }), z, 0.04));
      for (const c of [...s.calles, s.espina]) gca.push(prismaGeo(c, z, 0.02));
      for (const [g, m] of [[gc, M.celda], [gvv, M.visitante], [gca, M.calle]] as [THREE.BufferGeometry[], THREE.Material][]) { const x = malla(unir(g), m, false); if (x) grupoSot.add(x); }
      for (const nn of s.nucleos) { const x = malla(prismaGeo(nn, z, 3), M.nucleo); if (x) grupoSot.add(x); }
      if (s.nivel === 1) {
        // Rampa inclinada desde el nivel de la calle hasta el sótano 1
        const r: P[] = s.rampa, ys2 = r.map((p) => p[1]), xs2 = r.map((p) => p[0]);
        const x0 = Math.min(...xs2), x1 = Math.max(...xs2), y0 = Math.min(...ys2), y1 = Math.max(...ys2);
        const g = new THREE.BufferGeometry();
        g.setAttribute("position", new THREE.Float32BufferAttribute([x0, 0, -y0, x1, 0, -y0, x1, z, -y1, x0, 0, -y0, x1, z, -y1, x0, z, -y1], 3)); g.computeVertexNormals();
        grupoSot.add(new THREE.Mesh(g, M.rampa));
      }
    }

    // Corte: interior del piso elegido (se construye al vuelo)
    const grupoCorte = new THREE.Group(); scene.add(grupoCorte);
    const espaciosMallas: THREE.Mesh[] = [];
    const construirCorte = (idx: number) => {
      grupoCorte.clear(); espaciosMallas.length = 0;
      const n = nivelesSobre[idx]; if (!n) return;
      const acc: Record<string, THREE.BufferGeometry[]> = { muro: [], losa: [], vidrio: [], marco: [] };
      const muros: THREE.BufferGeometry[] = [];
      for (const t of escena.torres) {
        const f = T(t), o = fachadaPiso(t, n, true);
        for (const k of Object.keys(acc)) acc[k].push(...o[k]);
        const conv = new Set((t.aptos as any[]).filter((a) => n.tipo === "primero" && a.convertido).map((a) => a.id));
        for (const e of t.espacios) {
          if (conv.has(e.apto)) continue;
          const mesh = new THREE.Mesh(prismaGeo((e.poly as P[]).map(f), n.z + 0.24, 0.03), new THREE.MeshStandardMaterial({ color: COL_ESP[e.tipo] ?? 0xeeeeee, roughness: 0.9 }));
          mesh.receiveShadow = true;
          const ap = t.aptos.find((a: any) => a.id === e.apto);
          mesh.userData.etiqueta = `${e.nombre} · ${e.area.toFixed(1)} m²  —  Apto ${t.id}-${String(n.nombre).replace(/\D/g, "")}${String(e.apto).replace(/\D/g, "").padStart(2, "0")} · ${ap?.nombre ?? ""} ${ap ? ap.area.toFixed(1) + " m²" : ""}`;
          grupoCorte.add(mesh); espaciosMallas.push(mesh);
        }
        for (const a of t.aptos) if (n.tipo === "primero" && a.convertido) {
          const mesh = new THREE.Mesh(prismaGeo((a.poly as P[]).map(f), n.z + 0.24, 0.03), new THREE.MeshStandardMaterial({ color: 0xf6e7b8, roughness: 0.9 }));
          mesh.userData.etiqueta = `${a.convertido} · ${a.area.toFixed(1)} m²`; grupoCorte.add(mesh); espaciosMallas.push(mesh);
        }
        for (const c of t.circulacion) grupoCorte.add(new THREE.Mesh(prismaGeo((c as P[]).map(f), n.z + 0.24, 0.025), new THREE.MeshStandardMaterial({ color: 0xd9d4ca })));
        for (const e of [...t.nucleo.escaleras]) grupoCorte.add(new THREE.Mesh(prismaGeo((e as P[]).map(f), n.z + 0.24, 0.6), new THREE.MeshStandardMaterial({ color: 0xe0b1aa })));
        for (const e of t.nucleo.ascensores) grupoCorte.add(new THREE.Mesh(prismaGeo((e as P[]).map(f), n.z + 0.24, 0.05), new THREE.MeshStandardMaterial({ color: 0x8c8580 })));
        for (const mu of t.muros) {
          if (mu.tipo === "fachada") continue;
          const c = (mu.poly as P[]).reduce((u, q) => [u[0] + q[0] / 4, u[1] + q[1] / 4], [0, 0]);
          if (n.tipo === "primero" && mu.tipo === "interior" && t.aptos.some((a: any) => a.convertido && dentro(c as P, a.poly))) continue;
          muros.push(prismaGeo((mu.poly as P[]).map(f), n.z + 0.24, 2.16));
        }
      }
      // Fachadas cortadas y muros interiores con poché (cara superior oscura, como en un corte arquitectónico)
      for (const x of conPoche(acc.muro, M.poche, M.muro)) grupoCorte.add(x);
      for (const x of conPoche(muros, M.poche, M.blanco)) grupoCorte.add(x);
      for (const [k, mat] of [["losa", M.losa], ["vidrio", M.vidrio], ["marco", M.marco]] as [string, THREE.Material][]) { const x = malla(unir(acc[k]), mat, k !== "vidrio"); if (x) grupoCorte.add(x); }
    };

    // Asoleamiento: posición del sol según la hora (Medellín ≈ 6° N), orientada con el norte real del lote
    const N = escena.norte as P, E: P = [N[1], -N[0]];
    const ponerSol = (h: number) => {
      const t = Math.max(0.02, Math.min(0.98, (h - 6) / 12));
      const el = THREE.MathUtils.degToRad(Math.max(6, 78 * Math.sin(Math.PI * t)));
      const az = THREE.MathUtils.degToRad(90 + 180 * t + (t > 0.5 ? -8 : 8) * Math.sin(Math.PI * t)); // del oriente al occidente pasando un poco al sur
      const hx = N[0] * Math.cos(az) + E[0] * Math.sin(az), hy = N[1] * Math.cos(az) + E[1] * Math.sin(az);
      const R = 400;
      sol.position.set(cx + hx * R * Math.cos(el), R * Math.sin(el), -(cy + hy * R * Math.cos(el)));
      sol.intensity = 0.8 + 2.2 * Math.sin(Math.PI * t);
    };

    let raf = 0;
    const render = () => { renderer.render(scene, camera); etiquetas.render(scene, camera); };
    const loop = () => {
      controls.update(); render();
      // Brújula: rota según la dirección de la cámara frente al norte del lote
      if (brujula.current) {
        const d = new THREE.Vector3(); camera.getWorldDirection(d);
        const angCam = Math.atan2(d.x, -d.z), angN = Math.atan2(N[0], N[1]);
        brujula.current.style.transform = `rotate(${THREE.MathUtils.radToDeg(angN - angCam)}deg)`;
      }
      raf = requestAnimationFrame(loop);
    };
    loop();
    const ray = new THREE.Raycaster(), mouse = new THREE.Vector2();
    const mover = (ev: PointerEvent) => {
      if (!espaciosMallas.length) return setTip(null);
      const b = renderer.domElement.getBoundingClientRect();
      mouse.set(((ev.clientX - b.left) / b.width) * 2 - 1, -((ev.clientY - b.top) / b.height) * 2 + 1);
      ray.setFromCamera(mouse, camera);
      const hit = ray.intersectObjects(espaciosMallas, false)[0];
      setTip(hit ? { x: ev.clientX - b.left + 14, y: ev.clientY - b.top + 14, t: hit.object.userData.etiqueta } : null);
    };
    renderer.domElement.addEventListener("pointermove", mover);
    const redim = () => { camera.aspect = el.clientWidth / el.clientHeight; camera.updateProjectionMatrix(); renderer.setSize(el.clientWidth, el.clientHeight); etiquetas.setSize(el.clientWidth, el.clientHeight); };
    window.addEventListener("resize", redim);
    api.current = { pisosExt, cubierta, grupoSot, grupoCorte, grupoVecinos, pasto, construirCorte, ponerSol, controls, camera, cx, cy, ext, zTop };
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", redim); renderer.domElement.removeEventListener("pointermove", mover); controls.dispose(); pmrem.dispose(); renderer.dispose(); el.innerHTML = ""; };
  }, [escena]);

  // Modos
  useEffect(() => {
    const a = api.current; if (!a) return;
    const enCorte = modo === "corte", enSot = modo === "sotanos";
    a.pisosExt.forEach((g: THREE.Group, i: number) => (g.visible = !enSot && (!enCorte || i < piso)));
    a.cubierta.visible = modo === "exterior";
    a.grupoSot.visible = enSot;
    a.pasto.material.opacity = enSot ? 0.25 : 1; a.pasto.material.transparent = enSot;
    if (enCorte) a.construirCorte(piso); else a.grupoCorte.clear();
    if (enSot) { a.controls.target.set(a.cx, -4, -a.cy); }
    else a.controls.target.set(a.cx, enCorte ? (escena.niveles.find((n: any) => n.tipo !== "sotano")?.z ?? 0) + piso * 2.9 : a.zTop * 0.35, -a.cy);
  }, [modo, piso, escena]);
  useEffect(() => { api.current?.ponerSol(hora); }, [hora]);
  useEffect(() => { if (api.current) api.current.grupoVecinos.visible = vecinos; }, [vecinos]);
  useEffect(() => { if (api.current) { api.current.controls.autoRotate = girar; api.current.controls.autoRotateSpeed = 0.6; } }, [girar]);

  const r = escena.resumen;
  const nivelesSobre = (escena.niveles as any[]).filter((n) => n.tipo !== "sotano");
  return (
    <div className="modal-3d completo" onClick={(e) => e.stopPropagation()}>
      <div className="caja-3d">
        <div className="cabeza-3d">
          <b>Anteproyecto · {escena.barrio ?? escena.predio}</b>
          <span>{r.torres} torres · {r.pisos_totales} pisos · {r.unidades} viviendas · {r.sotanos} sótanos · arrastra para girar, clic derecho para desplazar, rueda para acercar</span>
          <button onClick={onCerrar} title="Cerrar">✕</button>
        </div>
        <div className="visor-cabida">
          <div ref={caja} className="lienzo-cabida" />
          {tip && <div className="tip-cabida" style={{ left: tip.x, top: tip.y }}>{tip.t}</div>}
          <div className="brujula" title="Norte"><div ref={brujula} className="aguja">▲<span>N</span></div></div>
          <div className="controles-cabida">
            <div className="segmento">{[["exterior", "Exterior"], ["corte", "Corte por piso"], ["sotanos", "Sótanos"]].map(([k, t]) => <button key={k} className={modo === k ? "on" : ""} onClick={() => setModo(k as any)}>{t}</button>)}</div>
            {modo === "corte" && (
              <div className="campo"><label>Piso: {nivelesSobre[piso]?.nombre}</label>
                <input type="range" min={0} max={nivelesSobre.length - 1} value={piso} onChange={(e) => setPiso(Number(e.target.value))} />
                <div className="leyenda-cabida">{[["Alcobas", 0xe7defa], ["Sala", 0xfbe6c8], ["Cocina", 0xd9efdf], ["Baños", 0xd2e7f5], ["Ropas", 0xe3eed0], ["Estudio", 0xf7e4d4], ["Circulación", 0xd9d4ca], ["Escalera", 0xe0b1aa]].map(([t, c]) =>
                  <span key={t as string}><i style={{ background: `#${(c as number).toString(16).padStart(6, "0")}` }} />{t}</span>)}</div>
                <div className="nota">Pasa el cursor por un espacio para ver su nombre y área.</div>
              </div>
            )}
            <div className="campo"><label>Sol: {String(Math.floor(hora)).padStart(2, "0")}:{hora % 1 ? "30" : "00"} h</label>
              <input type="range" min={6} max={18} step={0.5} value={hora} onChange={(e) => setHora(Number(e.target.value))} /></div>
            <div className="capas-cabida">
              <label><input type="checkbox" checked={vecinos} onChange={(e) => setVecinos(e.target.checked)} /> Vecinos (catastro)</label>
              <label><input type="checkbox" checked={girar} onChange={(e) => setGirar(e.target.checked)} /> Girar</label>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
