import { useState } from "react";
import { api } from "../api";
import "./login.css";

// Pantalla de inicio de sesión. Las cuentas se crean en el backend (ver README).
export default function LoginPage({ onEntrar }) {
  const [usuario, setUsuario] = useState("");
  const [clave, setClave] = useState("");
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);

  async function enviar(e) {
    e.preventDefault();
    setError("");
    setCargando(true);
    try {
      const s = await api.login(usuario.trim(), clave);
      onEntrar(s);
    } catch (err) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  }

  return (
    <div className="login-pagina">
      <form className="login-tarjeta" onSubmit={enviar}>
        <div className="login-marca">
          <span className="login-logo">RC</span>
          <div>
            <strong>Rankings de crédito bancario</strong>
            <small>Hackathon SBP 2026 · Datos ficticios</small>
          </div>
        </div>
        <label>
          <span>Usuario</span>
          <input value={usuario} onChange={(e) => setUsuario(e.target.value)} autoComplete="username" autoFocus required />
        </label>
        <label>
          <span>Clave</span>
          <input type="password" value={clave} onChange={(e) => setClave(e.target.value)} autoComplete="current-password" required />
        </label>
        {error && <p className="login-error" role="alert">{error}</p>}
        <button type="submit" disabled={cargando}>{cargando ? "Entrando…" : "Iniciar sesión"}</button>
      </form>
    </div>
  );
}
