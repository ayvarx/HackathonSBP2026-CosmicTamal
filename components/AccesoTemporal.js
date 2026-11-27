"use client";
// AccesoTemporal — Pantalla de acceso (diseño de Amet: formulario a la izquierda, panel de
// presentación a la derecha, logo animado). Usuario y clave se verifican con la acción de
// servidor iniciarSesion; "Entrar como visitante" da la vista Pública. Bajo el formulario,
// "Acceso rápido" con un botón por vista (cambiarPerfil) para la demostración sin cuentas.
// Se usa en app/login/page.js y app/perfil/page.js.
//
// Props:
//   presentacion (objeto|null)  Cifras reales del último corte (app/login/datos.js): { periodo,
//                               prestamos, bancos, total, rankings: [{ clave, nombre, lider, monto, pct }] }.
//                               null deja en el panel solo el nombre y la línea.
import { useState, useTransition } from "react";
import { cambiarPerfil, entrarComoVisitante, iniciarSesion } from "@/app/perfil/acciones";
import LogoAnimado from "./LogoAnimado";
import "@/app/login/login.css";

const VISTAS = [
  { valor: "publico", nombre: "Público" },
  { valor: "analista", nombre: "Analista" },
  { valor: "administrador", nombre: "Administrador" },
];

function Presentacion({ datos }) {
  return (
    <aside className="login-presentacion" aria-labelledby="titulo-presentacion">
      <header className="lp-encabezado">
        <h2 id="titulo-presentacion">Rankings de crédito bancario</h2>
        <p>Posición de cada banco por actividad económica</p>
      </header>
      {datos && (
        <>
          <figure className="lp-grafico">
            <figcaption>Líder de cada ranking · saldo</figcaption>
            <ul>
              {datos.rankings.map((r, i) => (
                <li key={r.clave}>
                  <div className="lp-fila">
                    <span className="lp-actividad">{r.nombre}</span>
                    <span className="lp-monto">{r.monto}</span>
                  </div>
                  <div className="lp-pista" aria-hidden="true">
                    <i style={{ width: `${r.pct}%`, animationDelay: `${0.15 + i * 0.08}s` }} />
                  </div>
                  <span className="lp-lider">{r.lider}</span>
                </li>
              ))}
            </ul>
          </figure>
          <footer className="lp-cifras">
            <dl>
              <div><dt>Préstamos válidos</dt><dd>{datos.prestamos}</dd></div>
              <div><dt>Bancos</dt><dd>{datos.bancos}</dd></div>
              <div><dt>Saldo total</dt><dd>{datos.total}</dd></div>
            </dl>
            <p>{datos.periodo}</p>
          </footer>
        </>
      )}
    </aside>
  );
}

export default function AccesoTemporal({ presentacion = null }) {
  const [usuario, setUsuario] = useState("");
  const [clave, setClave] = useState("");
  const [verClave, setVerClave] = useState(false);
  const [error, setError] = useState("");
  const [cargando, iniciar] = useTransition();

  function enviar(e) {
    e.preventDefault();
    setError("");
    iniciar(async () => {
      // Sin usuario ni clave se entra como visitante (perfil Público).
      const r = !usuario.trim() && !clave ? await entrarComoVisitante() : await iniciarSesion(usuario.trim(), clave);
      if (r?.error) setError(r.error);
    });
  }

  return (
    <div className="login">
      <section className="login-formulario">
        <div className="login-marca"><strong>Rankings de crédito bancario</strong></div>

        <div className="login-centro">
          <div className="login-icono"><LogoAnimado size={72} id="la-login" /></div>
          <h1 id="titulo-acceso">Inicia sesión en tu cuenta</h1>

          <form onSubmit={enviar} className="login-form">
            <label>
              <span>Usuario</span>
              <input value={usuario} onChange={(e) => setUsuario(e.target.value)} autoComplete="username" placeholder="tu_usuario" />
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
            <button type="button" className="login-visitante" disabled={cargando} onClick={() => iniciar(() => entrarComoVisitante())}>
              Continuar como visitante
            </button>
          </form>

          <div className="login-rapido">
            <span>Acceso rápido</span>
            <div className="login-rapido-fila">
              {VISTAS.map((vista) => (
                <form key={vista.valor} action={cambiarPerfil}>
                  <input type="hidden" name="perfil" value={vista.valor} />
                  <input type="hidden" name="volver" value="/" />
                  <button type="submit">{vista.nombre}</button>
                </form>
              ))}
            </div>
          </div>
        </div>

        <p className="login-pie">Datos ficticios</p>
      </section>

      <Presentacion datos={presentacion} />
    </div>
  );
}
