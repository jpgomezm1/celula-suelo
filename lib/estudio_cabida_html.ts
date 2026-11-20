// Presentación del estudio de cabida (16:9, 1280 × 720, escalada a la ventana; flechas para pasar; imprimible a PDF).
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
const num = (x: unknown, d = 0) => (x == null || !Number.isFinite(Number(x)) ? "—" : Number(x).toLocaleString("es-CO", { minimumFractionDigits: d, maximumFractionDigits: d }));
const mill = (x: unknown) => (x == null ? "—" : `$${num(Number(x) / 1e6)} millones`);
const svgUri = (s: string) => `data:image/svg+xml;base64,${Buffer.from(s).toString("base64")}`;

const CSS = `:root{--navy:#00274D;--gold:#FDB719;--ink:#14202e;--mute:#6b7685;--line:#e3e7ec;--soft:#f3f5f8;--disp:"Archivo","Arial Narrow",system-ui,sans-serif;--text:"Inter",system-ui,"Segoe UI",sans-serif;color-scheme:light}
*{box-sizing:border-box}html,body{margin:0;height:100%;background:#0b1622;font-family:var(--text);color:var(--ink)}
#escena{position:fixed;inset:0;display:grid;place-items:center;overflow:hidden}
.s{position:absolute;width:1280px;height:720px;background:#fff;transform-origin:center;display:none;overflow:hidden}.s.on{display:block}
.pad{position:absolute;inset:0;padding:46px 56px 40px}
.eb{font:600 10px var(--text);letter-spacing:.32em;text-transform:uppercase;color:var(--mute)}
h1,h2,h3{font-family:var(--disp);margin:0;color:var(--navy);letter-spacing:-.01em}
h2{font-size:29px;font-weight:800;margin-top:8px;padding-bottom:14px;border-bottom:1px solid var(--line)}
.logo{position:absolute;top:40px;right:56px;height:24px}
.pie{position:absolute;left:56px;right:56px;bottom:18px;display:flex;justify-content:space-between;font-size:10px;color:var(--mute);font-style:italic}
.dark{background:var(--navy);color:#fff;border-radius:4px;padding:22px}.dark h3{color:#fff;font-size:14px}
.dark ul{margin:12px 0 0;padding-left:18px;font-size:12.5px;line-height:1.7;color:#dfe7f1}
.grid{display:grid;gap:18px}.g2{grid-template-columns:1fr 1fr}.g3{grid-template-columns:repeat(3,1fr)}.g4{grid-template-columns:repeat(4,1fr)}
.card{border:1px solid var(--line);border-radius:4px;padding:20px;background:#fff}
.kpi b{display:block;font:800 26px var(--disp);color:var(--navy)}.kpi span{font-size:12px;color:var(--mute);line-height:1.5}
.nota{background:var(--soft);padding:12px 16px;font-size:11px;color:var(--mute);border-radius:3px;line-height:1.6}
.ficha div{display:grid;gap:2px;padding:8px 0;border-bottom:1px solid var(--line)}.ficha small{font-size:10px;color:var(--mute)}.ficha b{font-size:13.5px;color:var(--navy)}
table{border-collapse:collapse;width:100%;font-size:12px}th{background:var(--navy);color:#fff;font-weight:600;padding:8px 10px;font-size:11px;text-align:center}
td{padding:8px 10px;border-bottom:1px solid var(--line);text-align:center}tr.hl td{background:#fff6dc;font-weight:700;color:var(--navy)}td.l,th.l{text-align:left}
.big{background:var(--navy);color:#fff;display:grid;place-items:center;text-align:center;padding:24px;border-radius:4px}.big b{font:800 54px var(--disp);line-height:1}.big span{font-size:12px;color:#cfdae6}
.fila{display:grid;grid-template-columns:150px 1fr;border:1px solid var(--line);border-radius:3px;overflow:hidden}
.fila .v{background:#5d6f86;color:#fff;display:grid;place-items:center;font:800 16px var(--disp);text-align:center;padding:4px}.fila:nth-child(odd) .v{background:var(--navy)}
.fila .t{padding:9px 14px;font-size:12px}.fila .t b{display:block;color:var(--navy);font-size:12.5px}.fila .t span{color:var(--mute);font-size:11px}
.full>img:first-child{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.full .sh{position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,20,40,.55) 0%,rgba(0,20,40,0) 28%,rgba(0,20,40,0) 70%,rgba(0,20,40,.7) 100%)}
.full .tt{position:absolute;left:56px;top:40px}.full .tt .eb{color:#ffffffb3}.full .tt h2{color:#fff;border:0}
.full .cap{position:absolute;left:56px;bottom:22px;color:#fff;font-size:12px;font-style:italic;opacity:.9}.full .logo{filter:brightness(0) invert(1)}
.portada .tit{position:absolute;left:64px;bottom:96px;color:#fff;max-width:820px}.portada h1{color:#fff;font-size:44px;line-height:1.04;font-weight:800}
.portada .sub{letter-spacing:.28em;font-size:11px;text-transform:uppercase;color:#ffffffcc}
.portada .marcas{position:absolute;left:64px;top:52px;display:flex;align-items:center;gap:16px}.portada .marcas img{height:26px}.portada .marcas i{width:1px;height:24px;background:#ffffff66}
.portada .fecha{position:absolute;right:64px;bottom:40px;color:#fff;font-size:12px;text-align:right}
.lam{background:#fff;border:1px solid var(--line);display:grid;place-items:center;overflow:hidden;position:relative}.lam img,.lam svg{width:100%;height:100%;object-fit:contain}
.paso{display:grid;grid-template-columns:34px 1fr;gap:12px;font-size:12.5px;line-height:1.5;padding:9px 0;border-bottom:1px solid var(--line)}
.paso i{width:28px;height:28px;border-radius:50%;background:var(--navy);color:#fff;font:700 12px var(--disp);display:grid;place-items:center;font-style:normal}
.dos{display:grid;grid-template-columns:1fr 1fr;gap:22px}.col h3{font-size:15px;margin-bottom:10px}.col.pago h3{color:#9a5b00}
video{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;background:#000}
#ui{position:fixed;bottom:14px;right:18px;display:flex;gap:8px;align-items:center;font:12px var(--text);color:#9fb0c3;z-index:5}
#ui button{background:#ffffff14;border:1px solid #ffffff2a;color:#fff;border-radius:999px;padding:6px 12px;cursor:pointer;font:inherit}
@page{size:1280px 720px;margin:0}
@media print{html,body{background:#fff}#ui{display:none}#escena{position:static;display:block}.s{display:block!important;position:relative;transform:none!important;page-break-after:always;break-after:page}video{display:none}}`;

const JS = `const S=[...document.querySelectorAll(".s")];let i=0;
function ajustar(){const k=Math.min(innerWidth/1280,innerHeight/720);S.forEach(s=>s.style.transform="scale("+k+")")}
function ir(n){i=Math.max(0,Math.min(S.length-1,n));S.forEach((s,j)=>s.classList.toggle("on",j===i));document.getElementById("num").textContent=(i+1)+" / "+S.length;
document.querySelectorAll("video").forEach(v=>{if(S[i].contains(v)){v.currentTime=0;v.play().catch(()=>{})}else v.pause()});try{history.replaceState(null,"","#s"+(i+1))}catch(e){}}
addEventListener("resize",ajustar);addEventListener("keydown",e=>{if(["ArrowRight","PageDown"," "].includes(e.key)){e.preventDefault();ir(i+1)}if(["ArrowLeft","PageUp"].includes(e.key))ir(i-1);if(e.key==="f")document.documentElement.requestFullscreen?.()});
document.getElementById("ant").onclick=()=>ir(i-1);document.getElementById("sig").onclick=()=>ir(i+1);document.getElementById("pdf").onclick=()=>window.print();
document.getElementById("escena").addEventListener("click",e=>{if(e.target.closest("video,a"))return;ir(e.clientX>innerWidth/2?i+1:i-1)});
ajustar();ir(Math.max(0,(parseInt((location.hash||"").replace("#s",""))||1)-1));`;

export function renderEstudioCabida(r: any, imagenes: { tipo?: string; titulo?: string; mime: string; b64: string; fuente?: string }[] = []) {
  const L = r.lote, N = r.norma, pp = r.plan_parcial, A = r.anteproyecto, M = r.mercado ?? {}, mk = r.marca;
  const img = (t: string) => imagenes.find((x) => x.tipo === t);
  const uri = (x: any) => `data:${x.mime};base64,${x.b64}`;
  const fechaTxt = new Date(r.generado).toLocaleDateString("es-CO", { month: "long", year: "numeric" });
  const IRR = "/marca/irrelevant-negro.png", IRRB = "/marca/irrelevant-blanco.png";
  const slides: string[] = [];
  let k = 0;
  const pie = (txt = "irrelevant · Inteligencia de suelo") => `<div class="pie"><span>${esc(txt)}</span><span>${++k + 1}</span></div>`;
  const hoja = (eb: string, titulo: string, cuerpo: string) => slides.push(`<section class="s"><div class="pad"><div class="eb">${esc(eb)}</div><h2>${esc(titulo)}</h2><img class="logo" src="${IRR}" alt="irrelevant">${cuerpo}</div>${pie()}</section>`);

  // 1. Portada
  const fondo = img("fachada") ?? img("aerea");
  slides.push(`<section class="s full portada" style="background:var(--navy)">${fondo ? `<img src="${uri(fondo)}" alt="">` : r.ortofoto?.disponible ? `<img src="data:${r.ortofoto.mime};base64,${r.ortofoto.b64}" alt="">` : ""}
    <div class="sh" style="background:linear-gradient(90deg,rgba(0,25,50,.85) 0%,rgba(0,25,50,.4) 55%,rgba(0,25,50,.12) 100%)"></div>
    <div class="marcas"><img src="${IRRB}" alt="irrelevant">${mk?.logo_oscuro || mk?.logo ? `<i></i><img src="${mk.logo_oscuro ?? mk.logo}" alt="${esc(mk.cliente)}">` : mk ? `<i></i><b style="color:#fff">${esc(mk.cliente)}</b>` : ""}</div>
    <div class="tit"><div class="sub">Análisis normativo · Estudio de cabida</div><h1 style="margin-top:14px">${esc(r.nombre)}</h1>
    <div class="sub" style="margin-top:18px">${esc([L.municipio, pp ? `${pp.plan.nombre} · UAU ${pp.uau.id}` : N.codigo ? `${N.tratamiento} ${N.codigo}` : N.tratamiento].filter(Boolean).join(" · "))}</div></div>
    <div class="fecha">${esc(fechaTxt)}<br><span style="opacity:.7">irrelevant · Inteligencia de suelo${mk ? `, para ${esc(mk.cliente)}` : ""}</span></div></section>`);

  // 2. Contexto
  const orto = r.ortofoto?.disponible ? `<img src="data:${r.ortofoto.mime};base64,${r.ortofoto.b64}" alt="Ortofoto" style="object-fit:cover"><svg viewBox="0 0 ${r.ortofoto.w} ${r.ortofoto.h}" preserveAspectRatio="xMidYMid slice" style="position:absolute;inset:0"><path d="${r.ortofoto.lindero}" fill="rgba(253,183,25,.18)" stroke="#FDB719" stroke-width="4"/></svg>` : r.mapa_svg ? `<img src="${svgUri(r.mapa_svg)}" alt="Mapa del lote">` : "";
  const otros = pp?.uau?.otros_predios ?? [];
  hoja("Contexto", "Localización del lote", `<div class="grid" style="grid-template-columns:1.55fr 1fr;margin-top:20px;height:480px">
    <div class="lam" style="height:480px">${orto}</div>
    <div class="ficha">
      <div><small>Predio</small><b>${esc(L.municipio)} · ${esc(L.clave)}</b></div>
      ${L.matriculas?.length ? `<div><small>Matrícula</small><b>${esc(L.matriculas.slice(0, 2).join(", "))}</b></div>` : ""}
      <div><small>Área del lote (catastro)</small><b>${num(L.area_m2, 2)} m²</b></div>
      ${pp ? `<div><small>Unidad de actuación (UAU ${esc(pp.uau.id)}) · ${num(pp.uau.area_bruta_m2, 2)} m²</small><b>Lote${otros.map((o: any, i: number) => ` + ${i + 1}: ${num(o.area_m2, 0)} m²`).join("")}</b></div>` : ""}
      <div><small>Clasificación</small><b>${L.clase === "R" ? "Rural o expansión" : "Urbano"} · ${esc(N.tratamiento ?? "—")} ${esc(N.codigo ?? "")}</b></div>
      ${r.topografia ? `<div><small>Terreno</small><b>${esc(r.topografia.clase)} · ${num(r.topografia.pendiente_pct, 0)} % · ${num(r.topografia.desnivel_m, 1)} m de desnivel hacia el ${esc(r.topografia.cae_hacia)}</b></div>` : ""}
      ${L.estacion ? `<div><small>Transporte masivo más cercano</small><b>${esc(L.estacion.sistema)} ${esc(L.estacion.nombre)} (${esc(L.estacion.linea)}) · ${num(L.estacion.distancia_m)} m</b></div>` : ""}
      ${L.estrato ? `<div><small>Estrato de la zona (estimado)</small><b>${esc(L.estrato)}</b></div>` : ""}
      ${r.ortofoto?.disponible ? `<div><small>Imagen</small><b style="font-size:11px;font-weight:500">${esc(r.ortofoto.atribucion)}</b></div>` : ""}
    </div></div>`);

  // 3. Marco normativo
  hoja("Marco normativo", pp ? "Plan parcial adoptado: su norma manda" : "Norma aplicable al lote", `<div class="grid g2" style="margin-top:20px">
    <div class="dark" style="min-height:440px"><h3>Norma aplicable</h3><ul>
      ${N.acuerdo ? `<li>${esc(N.acuerdo)}.</li>` : ""}
      ${pp ? (pp.plan.soporte ?? []).map((x: string) => `<li>${esc(x)}.</li>`).join("") + (pp.plan.actos ?? []).map((a: any) => `<li>${esc(a.tipo)} ${esc(a.numero)} de ${esc(String(a.fecha).slice(0, 4))}: ${esc(a.objeto)}.</li>`).join("") : ""}
      ${N.pot2026 ? `<li>Revisión del POT 2026 (preliminar): ${esc(N.pot2026.codigo_2026 ?? "")}.</li>` : ""}
      ${N.aviso_pot ? `<li>${esc(typeof N.aviso_pot === "string" ? N.aviso_pot : N.aviso_pot.mensaje ?? "")}</li>` : ""}
      ${N.nivel && N.nivel !== "norma_oficial" ? "<li>Norma digitalizada por Inteligencia de suelo, pendiente de validar con la curaduría.</li>" : ""}</ul></div>
    <div class="ficha">
      ${pp ? `<div><small>Plan parcial</small><b>${esc(pp.plan.nombre)} · ${esc(pp.plan.estado)}</b></div><div><small>Ámbito</small><b>${esc(pp.plan.ambito ?? "—")}</b></div>
        <div><small>Viviendas del plan</small><b>${num(pp.plan.viviendas_total)} en ${num(pp.plan.area_intervencion_m2, 0)} m²</b></div>
        ${Object.entries(pp.normas ?? {}).slice(0, 5).map(([kk, v]) => `<div><small>${esc(kk.replace(/_/g, " "))}</small><b style="font-size:12px">${esc(v)}</b></div>`).join("")}`
      : `<div><small>Tratamiento</small><b>${esc(N.tratamiento)} ${esc(N.codigo ?? "")}</b></div><div><small>Uso</small><b>${esc(N.uso ?? r.usos?.area_de_actividad ?? "—")}</b></div>
        <div><small>Altura máxima</small><b>${N.altura_max ? `${num(N.altura_max)} pisos` : "Según volumetría"}</b></div><div><small>Índice de construcción</small><b>${num(N.ic, 2)}${N.ic_total ? ` · ${num(N.ic_total, 2)} con derechos` : ""}</b></div>
        <div><small>Densidad</small><b>${num(N.densidad)} viv/ha</b></div><div><small>Índice de ocupación</small><b>${N.io ? `${num(N.io * 100)} %` : "No asignado"}</b></div>`}
    </div></div>`);

  // 4. Ficha normativa
  const kpis = pp ? [[`${pp.uau.altura_pisos} niveles`, `Altura de la UAU ${pp.uau.id}${pp.uau.altura_pisos_max_con_visto_bueno ? ` (hasta ${pp.uau.altura_pisos_max_con_visto_bueno} con visto bueno)` : ""}.`], [`${num(pp.uau.viviendas)} viviendas`, `Asignadas a la UAU ${pp.uau.id} tras el reparto de cargas y beneficios.`],
      [`≈ ${num(pp.lote.viviendas_estimadas)}`, `Viviendas que le corresponderían al lote: ${pp.lote.calculo}.`], [`${num(pp.uau.suelo_util_m2, 0)} m²`, `Suelo útil de la UAU después de cesiones.`]]
    : [[N.altura_max ? `${num(N.altura_max)} pisos` : "—", "Altura máxima."], [`${num(N.densidad)} viv/ha`, "Densidad máxima."], [`IC ${num(N.ic, 2)}`, N.ic_total ? `Con derechos adicionales: ${num(N.ic_total, 2)}.` : "Índice de construcción."], [`${num(r.cesiones?.pct_del_lote ?? 18)} %`, "Cesión mínima de espacio público (área bruta)."]];
  hoja("Ficha normativa", "Parámetros clave", `<div class="grid g2" style="margin-top:24px">${kpis.map(([b, s]) => `<div class="card kpi"><b>${esc(b)}</b><span>${esc(s)}</span></div>`).join("")}</div>
    <div class="nota" style="margin-top:20px">${esc(pp ? pp.aviso : "Fuente: capa de norma del POT del municipio (servicio público) e Inteligencia de suelo.")}</div>`);

  // 5. Lo que puedo construir vs lo que pago
  const cab = (r.cabida?.escenarios ?? []).filter((e: any) => e.disponible);
  const C = pp?.uau?.cargas ?? null, ce = r.cesiones ?? {};
  const pagos: [string, string][] = C ? [
    [`${num(C.cesion_vias_m2, 0)} m²`, `Ceder y construir vías (${(C.vias ?? []).join(", ")})`], [`${num(C.cesion_parques_equipamiento_m2, 0)} m²`, "Ceder y adecuar parques y equipamiento"],
    [`${num(C.suelo_ambiental_ceder_m2, 0)} m²`, "Ceder y adecuar suelo ambiental"], [`${num(C.espacio_publico_en_dinero_m2, 0)} m²`, "Espacio público a compensar en dinero"],
    [`${num(C.acueducto_ml, 0)} ml`, "Redes de acueducto y alcantarillado"], [`${num(C.equipamiento_construido_m2, 0)} m²`, "Equipamiento construido"]]
    : [[`${num(ce.espacio_publico_suelo_m2, 0)} m²`, `Espacio público (${esc(ce.regla ?? "")})`], [`${num(ce.equipamiento_construido_m2, 0)} m²`, `Equipamiento construido (${esc(ce.regla_equipamiento ?? "")})`]];
  hoja("El cruce del negocio", "Lo que el lote permite construir frente a lo que se paga al municipio", `<div class="dos" style="margin-top:20px">
    <div class="col"><h3>Lo que aprovecho</h3><table><thead><tr><th class="l">Escenario</th><th>Viviendas</th><th>m² vendibles</th><th>Pisos</th></tr></thead><tbody>
      ${cab.map((e: any, i: number) => `<tr class="${/^base/i.test(e.escenario) ? "hl" : ""}"><td class="l">${esc(e.escenario)}</td><td>${num(e.unidades)}</td><td>${num(e.area_vendible_m2)}</td><td>${num(e.pisos_sobre_rasante)}</td></tr>`).join("")}
      <tr class="hl"><td class="l">Cabida dibujada (esta propuesta)</td><td>${num(A.unidades)}</td><td>${num(A.area_vendible_m2)}</td><td>${num(A.pisos)}</td></tr></tbody></table></div>
    <div class="col pago"><h3>Lo que pago al municipio${pp ? ` (UAU ${esc(pp.uau.id)})` : ""}</h3><div class="grid" style="gap:7px">${pagos.map(([v, t]) => `<div class="fila"><div class="v">${v}</div><div class="t"><b>${esc(t)}</b></div></div>`).join("")}</div>
      ${pp?.normas?.vis_vip ? `<div class="nota" style="margin-top:10px">Vivienda social: ${esc(pp.normas.vis_vip)}</div>` : ""}</div></div>`);

  // 6. Volumetría
  const nv = A.norma_vol ?? {};
  hoja("Volumetría", "Retiros, aislamientos y parqueaderos", `<div class="grid" style="gap:8px;margin-top:20px">
    ${[[`${num(nv.frontal)} m`, "Antejardín o retiro frontal"], [`${num(nv.lateral)} m`, "Retiro a linderos con fachada abierta"], [`${num(nv.cabecera)} m`, "Retiro con fachada cerrada (culata)"], [`${num(nv.entre_torres)} m`, "Entre torres con fachadas abiertas"],
       [`${num(A.parqueaderos_exigidos)}`, `Parqueaderos exigidos (${num(A.visitantes)} de visitantes)`], [pp?.normas?.retiros ? "Plan parcial" : "Norma", pp?.normas?.retiros ?? "Los retiros se confirman con la curaduría al licenciar."]]
      .map(([v, t]) => `<div class="fila"><div class="v">${esc(v)}</div><div class="t"><b>${esc(t)}</b></div></div>`).join("")}</div>
    <div class="nota" style="margin-top:12px">${esc(nv.fuente ?? "")}${(nv.citas ?? []).length ? ` · ${esc(nv.citas.slice(0, 2).join(" "))}` : ""}</div>`);

  // 7-9. Planos
  const plano = (eb: string, t: string, svg: string, lado: string) => hoja(eb, t, `<div class="grid" style="grid-template-columns:${lado ? "2.2fr 1fr" : "1fr"};margin-top:16px;height:510px"><div class="lam"><img src="${svgUri(svg)}" alt="${esc(t)}"></div>${lado}</div>`);
  const h = A.huellas?.[0];
  plano("Propuesta arquitectónica", "Localización e implantación", A.svgs.implantacion, `<div class="dark"><h3>${A.torres > 1 ? `${A.torres} torres` : "Una torre"}</h3><ul>
    ${h ? `<li>Torre de ${num(h.largo_m, 1)} × ${num(h.ancho_m, 1)} m, ${num(A.pisos)} pisos y ${num(A.altura_m, 1)} m de altura.</li>` : ""}<li>Ocupa el ${num((A.io ?? 0) * 100)} % del lote; el resto queda libre.</li>
    <li>${num(A.sotanos)} sótano(s) de parqueaderos${r.topografia?.desnivel_m > 4 ? ", semienterrados aprovechando el desnivel" : ""}.</li><li>Retiros de ${num(nv.frontal)} m al frente y ${num(nv.lateral)} m a linderos.</li></ul></div>`);
  plano("Propuesta arquitectónica", "Planta piso tipo", A.svgs.planta_tipo, `<div class="dark"><h3>${num(A.aptos_por_piso)} apartamentos por piso</h3><ul>
    ${(A.por_tipologia ?? []).map((t: any) => `<li>${esc(t.tipologia)}: ${num(t.unidades)} de ${num(t.area_promedio_m2, 1)} m².</li>`).join("")}<li>Eficiencia de planta: ${num(A.eficiencia_pct)} %.</li>
    ${(A.punto_fijo ?? []).slice(1, 3).map((x: string) => `<li>${esc(x)}</li>`).join("")}</ul></div>`);

  // 10. Cuadro de áreas
  const faltan = (A.parqueaderos_exigidos ?? 0) - (A.parqueaderos_dibujados ?? 0);
  hoja("Cuadro de áreas", "Unidades y áreas del proyecto", `<div class="grid" style="grid-template-columns:1.25fr 1fr;margin-top:20px">
    <div><table><thead><tr><th class="l">Tipología</th><th>Unidades</th><th>Área privada (m²)</th><th>Total (m²)</th></tr></thead><tbody>
      ${(A.por_tipologia ?? []).map((t: any) => `<tr><td class="l">${esc(t.tipologia)}</td><td>${num(t.unidades)}</td><td>${num(t.area_promedio_m2, 2)}</td><td>${num(t.unidades * t.area_promedio_m2)}</td></tr>`).join("")}
      <tr class="hl"><td class="l">Total vendible</td><td>${num(A.unidades)}</td><td>${num(A.area_vendible_m2 / Math.max(A.unidades, 1), 1)} prom.</td><td>${num(A.area_vendible_m2)}</td></tr></tbody></table>
      <table style="margin-top:16px"><thead><tr><th class="l">Edificio</th><th>Valor</th></tr></thead><tbody>
      <tr><td class="l">Área construida sobre rasante</td><td>${num(A.area_construida_m2)} m²</td></tr><tr><td class="l">Sótanos (${num(A.sotanos)})</td><td>${num(A.area_sotanos_m2)} m²</td></tr>
      <tr><td class="l">Índice de construcción resultante</td><td>${num(A.ic, 2)}</td></tr><tr><td class="l">Índice de ocupación</td><td>${num((A.io ?? 0) * 100)} %</td></tr></tbody></table></div>
    <div class="grid" style="gap:14px;align-content:start"><div class="big"><div><b>${num(A.area_vendible_m2)} m²</b><div><span>vendibles en ${num(A.unidades)} unidades</span></div></div></div>
      <div class="card" style="font-size:12.5px;line-height:1.6"><b style="color:var(--navy)">Parqueaderos:</b> la norma pide ${num(A.parqueaderos_exigidos)} y se dibujan ${num(A.parqueaderos_dibujados)}.${faltan > 0 ? ` Faltan ${num(faltan)}: otro sótano parcial, celdas de visitantes en superficie o ajustar la mezcla.` : " Cumple."}</div></div></div>`);
  plano("Propuesta arquitectónica", "Corte transversal y fachada", A.svgs.corte, "");

  // 11. Opciones de cabida
  if (r.alternativas?.length) hoja("Opciones de cabida", "Otras formas de ocupar el mismo lote", `<table style="margin-top:24px"><thead><tr><th class="l">Opción</th><th>Torres</th><th>Pisos</th><th>Unidades</th><th>m² vendibles</th><th>Ocupación</th><th>Parqueaderos</th></tr></thead><tbody>
    <tr class="hl"><td class="l">Propuesta principal</td><td>${num(A.torres)}</td><td>${num(A.pisos)}</td><td>${num(A.unidades)}</td><td>${num(A.area_vendible_m2)}</td><td>${num((A.io ?? 0) * 100)} %</td><td>${num(A.parqueaderos_dibujados)} / ${num(A.parqueaderos_exigidos)}</td></tr>
    ${r.alternativas.map((a: any) => `<tr><td class="l">${esc(a.nombre)}<br><small style="color:var(--mute)">${esc((a.por_tipologia ?? []).map((t: any) => `${t.unidades} × ${t.tipologia}`).join(" · "))}</small></td><td>${num(a.torres)}</td><td>${num(a.pisos)}</td><td>${num(a.unidades)}</td><td>${num(a.area_vendible_m2)}</td><td>${num((a.io ?? 0) * 100)} %</td><td>${num(a.parqueaderos_dibujados)} / ${num(a.parqueaderos_exigidos)}</td></tr>`).join("")}</tbody></table>
    <div class="nota" style="margin-top:18px">Opciones generadas por el motor de cabida con la misma norma. La decisión de tipología (compacto, bloques, asoleación y vistas) es del arquitecto: en la ladera oriental del valle la vista que más se vende mira al occidente y necesita protección solar.</div>`);

  // 12. Mercado y potencial de ventas
  const F = M.fynder ?? {}, tip = A.por_tipologia ?? [];
  hoja(`Mercado a ${num((M.radio_m ?? 1500) / 1000, 1)} km`, "Potencial de ventas y comprador de la zona", `<div class="grid g4" style="margin-top:22px">
    <div class="card kpi"><b>${F.precio_m2_nuevo ? `$${num(F.precio_m2_nuevo / 1e6, 1)} M` : "—"}</b><span>por m² de vivienda nueva o sobre planos</span></div>
    <div class="card kpi"><b>${num(F.compradores_90d)}</b><span>compradores activos (90 días)${F.presupuesto_mediana ? ` · presupuesto típico ${mill(F.presupuesto_mediana)}` : ""}</span></div>
    <div class="card kpi"><b>${num(F.en_venta)}</b><span>apartamentos en venta${F.precio_mediana ? ` · el mediano pide ${mill(F.precio_mediana)}` : ""}</span></div>
    <div class="card kpi"><b>${num((M.proyectos ?? []).length)}</b><span>proyectos nuevos en la zona</span></div></div>
    <div class="grid g2" style="margin-top:18px"><div class="dark"><h3>Potencial de ventas</h3><ul>
      ${F.precio_m2_nuevo ? tip.map((t: any) => `<li>${esc(t.tipologia)} de ${num(t.area_promedio_m2, 1)} m²: unos <b style="color:var(--gold)">${mill(t.area_promedio_m2 * F.precio_m2_nuevo)}</b>.</li>`).join("") : ""}
      <li>Ventas estimadas: <b style="color:var(--gold)">${mill(M.ventas_estimadas)}</b> (${num(A.area_vendible_m2)} m² vendibles).</li>
      ${M.techo_lote_15 ? `<li>Para que el suelo no pase de 15 % de las ventas, el lote no debería costar más de ${mill(M.techo_lote_15)} (20 %: ${mill(M.techo_lote_20)}), antes de cargas.</li>` : ""}</ul></div>
    <div class="card" style="font-size:12px;line-height:1.5"><b style="color:var(--navy)">Competencia cercana</b><table style="margin-top:8px;font-size:11px"><tbody>
      ${(M.proyectos ?? []).slice(0, 6).map((q: any) => `<tr><td class="l">${esc(q.nombre)}<br><small style="color:var(--mute)">${esc(q.constructora ?? "")}</small></td><td>${q.precio_m2_desde ? `$${num(q.precio_m2_desde / 1e6, 1)} M/m²` : "—"}</td><td>${num(q.distancia_m)} m</td></tr>`).join("") || "<tr><td>Sin proyectos anunciados cerca.</td></tr>"}</tbody></table>
      <div style="color:var(--mute);font-size:10.5px;margin-top:6px">Fuentes: Fynder (oferta y pedidos) y Zonario. Precios de oferta, no de cierre.</div></div></div>`);

  // 13+. Maqueta, renders y video
  const maq = img("maqueta");
  if (maq) hoja("Propuesta arquitectónica", "Maqueta conceptual de volumetría", `<div class="lam" style="margin-top:16px;height:510px;background:#f4f4f2"><img src="${uri(maq)}" alt="" style="object-fit:cover"></div>`);
  for (const x of imagenes.filter((x) => x.tipo !== "maqueta")) slides.push(`<section class="s full"><img src="${uri(x)}" alt=""><div class="sh"></div><div class="tt"><div class="eb">Propuesta arquitectónica</div><h2>${esc(x.titulo ?? "Imagen ilustrativa")}</h2></div><img class="logo" src="${IRRB}" alt="irrelevant"><div class="cap">Imagen ilustrativa generada con IA a partir del anteproyecto${x.fuente ? ` (${esc(x.fuente)})` : ""}.</div></section>`);
  if (r.video_url) slides.push(`<section class="s" style="background:#000"><video src="${esc(r.video_url)}" playsinline controls preload="metadata"></video></section>`);

  // Última: qué verificar
  const v: string[] = [];
  if (pp) v.push(`<b>Acuerdo con los otros ${otros.length} predios de la UAU ${esc(pp.uau.id)}</b> y reparto de sus ${num(pp.uau.viviendas)} viviendas.`, "<b>Vigencia del plan parcial</b> y licencias de otras unidades en trámite.", "<b>Costo actual de las cargas</b> (vías, redes con factibilidad de servicios, parques, suelo ambiental, equipamiento).");
  else if ((r.semaforo?.items ?? []).some((x: any) => /planificaci/i.test(x.categoria) && x.luz !== "verde")) v.push("<b>Plan parcial:</b> conseguir el decreto de adopción y el DTS (o confirmar que hay que formularlo).");
  for (const it of (r.semaforo?.items ?? []).filter((x: any) => x.luz === "rojo" || x.luz === "amarillo").slice(0, 3)) if (!/planificaci/i.test(it.categoria)) v.push(`<b>${esc(it.categoria)}:</b> ${esc(it.lectura)}`);
  if (faltan > 0) v.push(`<b>Parqueaderos:</b> resolver los ${num(faltan)} cupos que faltan.`);
  v.push("<b>Precio pedido</b> frente al techo de suelo del 15 % de las ventas.", "<b>Certificado de tradición</b> y estudio de suelos.");
  const mitad = Math.ceil(Math.min(v.length, 8) / 2), vv = v.slice(0, 8);
  hoja("Siguientes pasos", "Qué hay que verificar antes de ofertar", `<div class="grid g2" style="margin-top:14px;column-gap:40px">${[vv.slice(0, mitad), vv.slice(mitad)].map((col, ci) => `<div>${col.map((t, i) => `<div class="paso"><i>${ci * mitad + i + 1}</i><div>${t}</div></div>`).join("")}</div>`).join("")}</div>
    <div class="nota" style="margin-top:16px">Prefactibilidad con información pública${pp ? ", el plan parcial adoptado" : ""} y el motor de cabida de Inteligencia de suelo. La cabida es esquemática: la desarrolla y valida un arquitecto. ${imagenes.length ? "Las imágenes son ilustrativas, generadas con IA." : ""}</div>`);

  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(r.nombre)} · Estudio de cabida</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wght@500;600;700;800&family=Inter:wght@400;500;600&display=swap"><style>${CSS}</style></head><body>
<div id="escena">${slides.join("\n")}</div><div id="ui"><span id="num"></span><button id="ant" aria-label="Anterior">←</button><button id="sig" aria-label="Siguiente">→</button><button id="pdf">PDF</button></div>
<script>${JS}</script></body></html>`;
}
