// Pantalla de inicio de sesión que abre Claude al conectar el MCP.
import FormularioLogin from "../../login/FormularioLogin";
import { leerCliente } from "@/lib/oauth";

export const metadata = { title: "Conectar Claude · Inteligencia de suelo" };

const CAMPOS = ["client_id", "redirect_uri", "state", "code_challenge", "code_challenge_method", "scope", "resource"];

export default async function Autorizar({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const q = await searchParams;
  const p: Record<string, string> = Object.fromEntries(CAMPOS.map((k) => [k, q[k] ?? ""]));
  const cliente = await leerCliente(p.client_id);
  const valido = !!cliente && cliente.r.includes(p.redirect_uri) && !!p.code_challenge
    && (p.code_challenge_method || "S256") === "S256" && (q.response_type ?? "code") === "code";
  if (!valido) {
    return (
      <main style={{ padding: 40 }}>
        <h2>Solicitud de conexión no válida</h2>
        <p>Vuelve a conectar el servidor desde Claude.</p>
      </main>
    );
  }
  return (
    <FormularioLogin accion="/api/oauth/authorize" titulo="Conectar Claude"
      subtitulo={`${cliente!.n ?? "Claude"} quiere usar Inteligencia de suelo. Ingresa con tu usuario y clave para autorizarlo.`}
      error={q.error ? "Usuario o clave incorrectos." : null} ocultos={p} />
  );
}
