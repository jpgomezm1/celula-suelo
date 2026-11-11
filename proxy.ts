import { NextResponse, type NextRequest } from "next/server";

// Acceso al workspace con HTTP Basic: usuario = APP_USER, clave = APP_PASSWORD.
// El MCP (/api/mcp) tiene su propio token y no pasa por aquí.
export function proxy(request: NextRequest) {
  const clave = process.env.APP_PASSWORD;
  if (!clave) return NextResponse.next();
  const auth = request.headers.get("authorization") ?? "";
  const [tipo, valor] = auth.split(" ");
  if (tipo === "Basic" && valor) {
    const texto = atob(valor);
    const i = texto.indexOf(":");
    const usuario = texto.slice(0, i), pass = texto.slice(i + 1);
    const usuarioOk = !process.env.APP_USER || usuario === process.env.APP_USER;
    if (usuarioOk && pass === clave) return NextResponse.next();
  }
  return new NextResponse("Acceso restringido", { status: 401, headers: { "WWW-Authenticate": 'Basic realm="Celula de suelo"' } });
}

export const config = { matcher: ["/mapa/:path*", "/api/tiles/:path*", "/api/datos/:path*", "/api/estudio/:path*", "/api/estudio", "/api/galeria", "/api/perfil"] };
