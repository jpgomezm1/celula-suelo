import { NextResponse, type NextRequest } from "next/server";
import { COOKIE_SESION, credencialesValidas, verificar } from "./lib/auth";

// Acceso al workspace con página de inicio de sesión y cookie firmada (sin ventana emergente del navegador).
// Para scripts se sigue aceptando "Authorization: Basic" sin pedirlo. El MCP (/api/mcp) usa OAuth o su token y no pasa por aquí.
export async function proxy(request: NextRequest) {
  if (!process.env.APP_PASSWORD) return NextResponse.next();
  const sesion = await verificar(request.cookies.get(COOKIE_SESION)?.value, "sesion");
  if (sesion) return NextResponse.next();

  const auth = request.headers.get("authorization") ?? "";
  const [tipo, valor] = auth.split(" ");
  if (tipo === "Basic" && valor) {
    const texto = atob(valor);
    const i = texto.indexOf(":");
    if (credencialesValidas(texto.slice(0, i), texto.slice(i + 1))) return NextResponse.next();
  }

  const { pathname, search } = request.nextUrl;
  if (pathname.startsWith("/api/") && !pathname.match(/^\/api\/estudio\/[^/]+\/xlsx$/)) {
    return NextResponse.json({ error: "Sesión vencida: vuelve a iniciar sesión." }, { status: 401 });
  }
  const login = new URL("/login", request.url);
  login.searchParams.set("next", pathname + search);
  return NextResponse.redirect(login);
}

export const config = { matcher: ["/mapa/:path*", "/api/tiles/:path*", "/api/datos/:path*", "/api/estudio/:path*", "/api/estudio", "/api/galeria", "/api/perfil", "/api/norma"] };
