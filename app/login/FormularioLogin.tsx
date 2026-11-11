// Formulario de inicio de sesión con la identidad de Conaltura. Lo usan /login (workspace) y /oauth/authorize (conectar Claude).
export default function FormularioLogin({ accion, titulo, subtitulo, error, ocultos }: {
  accion: string; titulo: string; subtitulo: string; error?: string | null; ocultos: Record<string, string>;
}) {
  return (
    <div style={{ minHeight: "100vh", display: "grid", gridTemplateRows: "60px 1fr", background: "var(--fondo)" }}>
      <header className="barra">
        <img src="/marca/Logo-Menu-Sup.png" alt="Conaltura" />
        <div className="sep" />
        <div className="producto">Inteligencia de suelo<small>Estudios de competencia · Valle de Aburrá</small></div>
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
            <label htmlFor="usuario">Usuario</label>
            <input id="usuario" name="usuario" className="entrada" autoComplete="username" required autoFocus />
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
