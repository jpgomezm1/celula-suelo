import FormularioLogin from "./FormularioLogin";

export const metadata = { title: "Ingresar · Inteligencia de suelo" };

export default async function Login({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const q = await searchParams;
  const next = q.next && q.next.startsWith("/") && !q.next.startsWith("//") ? q.next : "/mapa";
  return (
    <FormularioLogin accion="/api/login" titulo="Ingresar" subtitulo="Usa tu usuario y clave del workspace."
      error={q.error ? "Usuario o clave incorrectos." : null} ocultos={{ next }} />
  );
}
