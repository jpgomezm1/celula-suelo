// Formulario de inicio de sesión con la identidad de irrelevant. Lo usan /login (workspace) y /oauth/authorize (conectar Claude).
export default function FormularioLogin({ accion, titulo, subtitulo, error, ocultos }: {
  accion: string; titulo: string; subtitulo: string; error?: string | null; ocultos: Record<string, string>;
}) {
  return (
    <div style={{ minHeight: "100vh", display: "grid", gridTemplateRows: "60px 1fr", background: "var(--fondo)" }}>
      <header className="barra">
        <a className="logo" href="/login"><img src="/marca/irrelevant.png" alt="" />irrelevant</a>
        <div className="sep" />
        <div className="producto">Inteligencia de suelo<small>Norma, mercado y competencia · Valle de Aburrá</small></div>
        <div className="franja" />
      </header>
      <main style={{ display: "grid", placeItems: "center", padding: 24 }}>
        <form method="post" action={accion} className="tarjeta" style={{ width: "100%", maxWidth: 400, padding: 28, gap: 16, boxShadow: "var(--sombra)" }}>
          <div className="titulo">
            <h2>{titulo}</h2>
            <div className="sub">{subtitulo}</div>
          </div>
          {error && <div className="error">{error}</div>}
          {Object.entries(ocultos).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
          <div className="campo">
            <label htmlFor="usuario">Correo</label>
            <input id="usuario" name="usuario" className="entrada" type="text" inputMode="email" autoComplete="username" placeholder="nombre@empresa.com" required autoFocus />
          </div>
          <div className="campo">
            <label htmlFor="clave">Clave</label>
            <input id="clave" name="clave" type="password" className="entrada" autoComplete="current-password" required />
          </div>
          <button className="btn btn-primario btn-bloque" type="submit">Ingresar</button>
        </form>
      </main>
    </div>
  );
}
