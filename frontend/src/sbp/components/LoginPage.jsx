import { useEffect, useState } from "react";
import "@fontsource-variable/plus-jakarta-sans";
import { api } from "../api";
import LogoAnimado from "./LogoAnimado";
import "./login.css";

// Pantalla de acceso: formulario a la izquierda y un panel de presentación a la derecha.
// Las cuentas se crean en el backend (ver README).
const BANCOS_EJEMPLO = [
  { nombre: "Banco Solidez", valor: 98.4, saldo: "98.4 M" },
  { nombre: "Banco Regional", valor: 88.4, saldo: "88.4 M" },
  { nombre: "Banco Capital", valor: 81.7, saldo: "81.7 M" },
  { nombre: "Banco Progreso", valor: 77.2, saldo: "77.2 M" },
  { nombre: "Banco Pacífico", valor: 70.1, saldo: "70.1 M" },
];

const BENEFICIOS = ["Rankings por actividad", "Calidad de los datos", "Líder de cada ranking"];

// Cifra que cuenta desde 0 hasta su valor al cargar la pantalla.
function useContador(destino, ms = 1400) {
  const [valor, setValor] = useState(0);
  useEffect(() => {
    let id;
    const inicio = performance.now();
    const paso = (t) => {
      const p = Math.min(1, (t - inicio) / ms);
      setValor(Math.round(destino * (1 - Math.pow(1 - p, 3))));
      if (p < 1) id = requestAnimationFrame(paso);
    };
    id = requestAnimationFrame(paso);
    return () => cancelAnimationFrame(id);
  }, [destino, ms]);
  return valor;
}

export default function LoginPage({ onEntrar }) {
  const [usuario, setUsuario] = useState("");
  const [clave, setClave] = useState("");
  const [verClave, setVerClave] = useState(false);
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);
  const prestamos = useContador(28802);
  const bancos = useContador(12, 900);

  async function enviar(e) {
    e.preventDefault();
    setError("");
    setCargando(true);
    try {
      // Sin usuario ni clave se entra como visitante (perfil Público).
      const s = !usuario.trim() && !clave ? await api.visitante() : await api.login(usuario.trim(), clave);
      onEntrar(s);
    } catch (err) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  }

  async function entrarVisitante() {
    setError("");
    setCargando(true);
    try { onEntrar(await api.visitante()); } catch (err) { setError(err.message); } finally { setCargando(false); }
  }

  return (
    <div className="login">
      <section className="login-formulario">
        <div className="login-marca">
          <strong>Rankings de crédito</strong>
        </div>

        <div className="login-centro">
          <div className="login-icono"><LogoAnimado size={104} /></div>
          <h1>Inicia sesión en tu cuenta</h1>
          <p>Ingresa tu usuario y tu clave para ver los rankings del período.</p>

          <form onSubmit={enviar} className="login-form">
            <label>
              <span>Usuario</span>
              <input value={usuario} onChange={(e) => setUsuario(e.target.value)} autoComplete="username" autoFocus placeholder="tu_usuario" />
            </label>
            <label>
              <span>Clave</span>
              <div className="login-clave">
                <input type={verClave ? "text" : "password"} value={clave} onChange={(e) => setClave(e.target.value)} autoComplete="current-password" placeholder="••••••••" />
                <button type="button" className="login-ojo" onClick={() => setVerClave((v) => !v)} aria-label={verClave ? "Ocultar clave" : "Mostrar clave"}>
                  {verClave ? "Ocultar" : "Ver"}
                </button>
              </div>
            </label>
            {error && <p className="login-error" role="alert">{error}</p>}
            <button type="submit" className="login-entrar" disabled={cargando}>
              {cargando ? "Entrando…" : "Entrar"} <span aria-hidden="true">→</span>
            </button>
            <p className="login-ayuda">Déjalos vacíos para entrar como visitante.</p>
            <button type="button" className="login-visitante" onClick={entrarVisitante} disabled={cargando}>Continuar como visitante</button>
          </form>
        </div>

        <p className="login-pie">Datos ficticios con formato regulatorio · Uso informativo</p>
      </section>

      <aside className="login-presentacion">
        <div className="login-brillo" aria-hidden="true" />
        <div className="login-patron" aria-hidden="true" />
        <div className="login-anillo a1" aria-hidden="true" />
        <div className="login-anillo a2" aria-hidden="true" />

        <h2>Vigila la cartera y compara bancos en un solo lugar</h2>
        <p>Rankings por actividad económica, calidad de los datos y el líder de cada ranking, calculados a partir del formato AT03.</p>
        <ul className="login-beneficios">
          {BENEFICIOS.map((b) => <li key={b}><i aria-hidden="true">✓</i>{b}</li>)}
        </ul>

        <div className="login-escena" aria-hidden="true">
          <div className="login-flotante f1"><b>▲ +9,06 %</b><small>vs período anterior</small></div>
          <div className="login-flotante f2"><b>✔ 3 / 3</b><small>verificaciones</small></div>

          <div className="login-vista">
            <div className="lv-top">
              <div className="lv-cabecera"><span>Rankings · Hipotecario</span></div>
              <span className="lv-periodo">Corte 2026-09-30</span>
            </div>
            <div className="lv-tarjetas">
              <div><small>Préstamos válidos</small><strong>{prestamos.toLocaleString("es-ES")}</strong></div>
              <div><small>Bancos incluidos</small><strong>{bancos}</strong></div>
            </div>
            <div className="lv-barras">
              {BANCOS_EJEMPLO.map((b, i) => (
                <div key={b.nombre}>
                  <span><b className="lv-puesto">{i + 1}</b>{b.nombre}</span>
                  <div className="lv-pista"><i style={{ width: `${b.valor}%`, animationDelay: `${0.35 + i * 0.12}s` }} /></div>
                  <em>{b.saldo}</em>
                </div>
              ))}
            </div>
            <div className="lv-pie">Total del ranking · 1,740 M</div>
          </div>
        </div>
      </aside>
    </div>
  );
}
