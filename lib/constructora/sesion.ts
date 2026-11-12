// Perfil de constructora del usuario de la sesión (cookie) y su aplicación a las opciones del anteproyecto.
import { COOKIE_SESION, verificar } from "../auth";
import { perfilDeUsuario, type PerfilConstructora } from "./perfil";
import type { OpcionesProyecto } from "../cabida/proyecto";

export async function usuarioDeRequest(req: Request): Promise<string | null> {
  const cookie = req.headers.get("cookie") ?? "";
  const token = cookie.split(";").map((c) => c.trim()).find((c) => c.startsWith(`${COOKIE_SESION}=`))?.slice(COOKIE_SESION.length + 1);
  const s = await verificar<{ sub: string }>(token ? decodeURIComponent(token) : null, "sesion");
  return s?.sub ?? null;
}

export async function perfilDeRequest(req: Request) { return perfilDeUsuario(await usuarioDeRequest(req)); }

/** Las opciones explícitas mandan; lo que no se indique sale del ADN de la constructora. */
export function opcionesConPerfil(o: OpcionesProyecto, p: PerfilConstructora): OpcionesProyecto {
  return { ...o, crujia_m: o.crujia_m ?? p.diseno.crujia_m, pasillo_m: o.pasillo_m ?? p.diseno.pasillo_m, altura_piso_m: o.altura_piso_m ?? p.diseno.altura_piso_m,
    altura_primer_piso_m: o.altura_primer_piso_m ?? p.diseno.altura_primer_piso_m, largo_max_torre_m: o.largo_max_torre_m ?? p.diseno.largo_max_torre_m,
    mezcla: o.mezcla?.length ? o.mezcla : p.diseno.mezcla, pisos_plataforma: o.pisos_plataforma ?? p.diseno.plataforma_pisos,
    parqueo_privados_viv: o.parqueo_privados_viv ?? p.diseno.parqueo_privados_viv, parqueo_visitantes_viv: o.parqueo_visitantes_viv ?? p.diseno.parqueo_visitantes_viv };
}
