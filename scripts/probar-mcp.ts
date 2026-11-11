export {};
// Prueba de punta a punta del MCP v0.2: npm run probar -- [url]
// Llama las 15 herramientas en Medellín, Envigado y Rionegro con el token de .env.local.

const url = process.argv[2] ?? "http://localhost:3077/api/mcp";
const headers = { "content-type": "application/json", accept: "application/json, text/event-stream", authorization: `Bearer ${process.env.MCP_TOKEN}` };

let id = 0;
async function rpc(method: string, params: unknown = {}) {
  const res = await fetch(url, { method: "POST", headers, body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params }) });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method}: HTTP ${res.status} ${text.slice(0, 300)}`);
  const line = text.split("\n").find((l) => l.startsWith("data: "));
  const body = JSON.parse(line ? line.slice(6) : text);
  if (body.error) throw new Error(`${method}: ${JSON.stringify(body.error)}`);
  return body.result;
}
const t0 = Date.now();
const tool = async (name: string, args: unknown) => {
  const s = Date.now();
  const r = await rpc("tools/call", { name, arguments: args });
  if (r.isError) throw new Error(`${name}: ${r.content?.[0]?.text}`);
  const out = JSON.parse(r.content[0].text);
  console.log(`  · ${name} (${Date.now() - s} ms)`);
  return out;
};
const M = (v: any) => (v ? `$${Math.round(Number(v) / 1e6).toLocaleString("es-CO")} M` : "—");

await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "probar", version: "0" } });
const { tools } = await rpc("tools/list");
console.log(`Herramientas (${tools.length}): ${tools.map((t: any) => t.name).join(", ")}`);

const cob = await tool("cobertura", {});
console.log(`  ${cob.municipios.length} municipios · ${cob.municipios.reduce((a: number, m: any) => a + m.predios, 0).toLocaleString("es-CO")} predios`);

for (const municipio of ["Medellín", "Envigado", "Rionegro"]) {
  console.log(`\n■ ${municipio}`);
  const mz = await tool("mercado_zona", { municipio });
  console.log(`  mercado: ${mz.oferta.inventario_activo} aptos, mediana ${M(mz.oferta.precio_mediana)}, ${mz.demanda.pedidos_compradores} pedidos, ${mz.proyectos_nuevos.proyectos} proyectos`);
  const lotes = await tool("buscar_lotes", { municipio, area_min: 1000, limite: 3 });
  console.log(`  lotes con potencial ≥1.000 m²: ${lotes.resultados}${lotes.lotes[0] ? ` · 1º ${lotes.lotes[0].id} (${lotes.lotes[0].tratamiento})` : ""}`);
  const cualquiera = lotes.lotes[0] ?? (await tool("buscar_lotes", { municipio, solo_potencial: false, area_min: 1000, limite: 1 })).lotes[0];
  if (cualquiera) {
    const f = await tool("ficha_predio", { id: cualquiera.id });
    console.log(`  ficha: ${f.nivel_dato} · norma ${f.norma.fuente_norma} · prefactibilidad ${f.prefactibilidad_rapida.disponible ? `${f.prefactibilidad_rapida.veredicto}, lote máx ${f.prefactibilidad_rapida.lote_maximo_legible}` : f.prefactibilidad_rapida.motivo}`);
    const pf = await tool("prefactibilidad_lote", { id: cualquiera.id, costo_lote: 5_000_000_000 });
    console.log(`  prefactibilidad con lote de $5.000 M: ${pf.prefactibilidad.disponible ? pf.prefactibilidad.veredicto : pf.prefactibilidad.motivo}`);
  }
  const pr = await tool("buscar_proyectos", { municipio, limite: 3 });
  console.log(`  proyectos: ${pr.resultados}${pr.proyectos[0] ? ` · ${pr.proyectos[0].nombre} (${pr.proyectos[0].constructora}) desde ${M(pr.proyectos[0].precio_desde)}` : ""}`);
  if (pr.proyectos[0]) {
    const fp = await tool("ficha_proyecto", { id: pr.proyectos[0].id });
    console.log(`  ficha proyecto: ${fp.competencia_1500m.length} competidores a 1,5 km`);
    if (pr.proyectos[0].constructora) {
      const k = await tool("constructora", { nombre: pr.proyectos[0].constructora });
      console.log(`  constructora: ${k.resumen?.proyectos_activos ?? 0} proyectos activos en ${k.resumen?.municipios?.join(", ")}`);
    }
  }
  const op = await tool("oportunidades", { municipio, limite: 3 });
  console.log(`  oportunidades: ${op.oportunidades.length}${op.oportunidades[0] ? ` · 1ª puntaje ${op.oportunidades[0].puntaje} (${op.oportunidades[0].barrio ?? ""})` : ""}`);
}
console.log("\n■ Estudios");
const perfil = await tool("oportunidades_por_perfil", { municipio: "Medellín", tipo_vivienda: "NO VIS", unidades_min: 150, unidades_max: 300, area_unidad_m2: 65, pisos_min: 12, limite: 5 });
console.log(`  perfil NO VIS 150–300 und: ${perfil.resumen.lotes_que_cumplen_la_norma} lotes cumplen · 1º ${perfil.oportunidades[0]?.id} (${perfil.oportunidades[0]?.barrio}, ${perfil.oportunidades[0]?.puntaje} pts) · Excel ${perfil.excel}`);
const est = await tool("estudio_competencia", { nombre: "Prueba MCP BONEM", lote: { cbml: "15090030007" }, radio_m: 3000, tipo_vivienda: "NO VIS" });
console.log(`  estudio: ${est.id} · ${est.paso5_proyectos_a_consultar?.cantidad} proyectos · zoom ${(est.paso7_proyectos_zoom ?? []).length}`);
const comp = await tool("completar_estudio", { id: est.id, textos: { conclusion: "Prueba automática." } });
console.log(`  completar_estudio: ${comp.ok}`);
const ct = await tool("contacto_predio", { id: "05001:15090030007" });
console.log(`  contacto_predio: ${ct.encontrado ? `titular probable ${ct.titular_probable}, ${ct.rutas_de_contacto?.length} pasos` : "sin datos"}`);
const malo = await rpc("tools/call", { name: "ficha_predio", arguments: { id: "05001:00000000000" } });
console.log(`  predio inexistente → ${malo.isError ? "error controlado" : "respuesta"}: ${malo.content[0].text.slice(0, 90).replace(/\s+/g, " ")}`);
const invalido = await rpc("tools/call", { name: "oportunidades_por_perfil", arguments: { municipio: "Narnia" } });
console.log(`  municipio inválido → ${invalido.isError ? "error controlado" : "respuesta"}: ${invalido.content[0].text.slice(0, 90).replace(/\s+/g, " ")}`);
const f = await tool("fuentes", {});
console.log(`\nfuentes: ${f.fuentes.length}`);
const sinToken = await fetch(url, { method: "POST", headers: { ...headers, authorization: "" }, body: "{}" });
console.log(`sin token → HTTP ${sinToken.status} · total ${Math.round((Date.now() - t0) / 1000)} s`);
