"use client";
// AccesoTemporal — Pantalla de acceso (diseño de Amet: formulario a la izquierda, panel de
// presentación a la derecha, logo animado). Usuario y clave se verifican con la acción de
// servidor iniciarSesion; "Entrar como visitante" da la vista Pública. Bajo el formulario,
// "Acceso rápido" con un botón por vista (cambiarPerfil) para la demostración sin cuentas.
// Se usa en app/login/page.js y app/perfil/page.js.
//
// Props:
//   presentacion (objeto|null)  Cifras reales del último corte: { etiqueta, ranking, prestamos,
//                               bancos, top: [{ nombre, pct, monto }], total }. null omite las cifras.
import { useEffect, useState, useTransition } from "react";
import { cambiarPerfil, entrarComoVisitante, iniciarSesion } from "@/app/perfil/acciones";
import LogoAnimado from "./LogoAnimado";
import "@/app/login/login.css";

const VISTAS = [
  { valor: "publico", nombre: "Público" },
  { valor: "analista", nombre: "Analista" },
  { valor: "administrador", nombre: "Administrador" },
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

function VistaPrevia({ datos }) {
  const prestamos = useContador(datos.prestamos);
  const bancos = useContador(datos.bancos, 900);
  return (
    <div className="login-escena" aria-hidden="true">
      <div className="login-vista">
        <div className="lv-top">
          <div className="lv-cabecera"><span>Rankings · {datos.ranking}</span></div>
          <span className="lv-periodo">Corte {datos.etiqueta}</span>
        </div>
        <div className="lv-tarjetas">
          <div><small>Préstamos válidos</small><strong>{prestamos.toLocaleString("es-PA")}</strong></div>
          <div><small>Bancos incluidos</small><strong>{bancos}</strong></div>
        </div>
        <div className="lv-barras">
          {datos.top.map((b, i) => (
            <div key={b.nombre}>
              <span><b className="lv-puesto">{i + 1}</b>{b.nombre}</span>
              <div className="lv-pista"><i style={{ width: `${b.pct}%`, animationDelay: `${0.35 + i * 0.12}s` }} /></div>
              <em>{b.monto}</em>
            </div>
          ))}
        </div>
        <div className="lv-pie">Total del ranking · {datos.total}</div>
      </div>
    </div>
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
          <div className="login-icono"><LogoAnimado size={104} id="la-login" /></div>
          <h1 id="titulo-acceso">Inicia sesión en tu cuenta</h1>
          <p>Ingresa tu usuario y tu clave para ver los rankings del período.</p>

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
            <p className="login-ayuda">Déjalos vacíos para entrar como visitante.</p>
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

      <aside className="login-presentacion">
        <div className="login-brillo" aria-hidden="true" />
        <div className="login-patron" aria-hidden="true" />
        <div className="login-anillo a1" aria-hidden="true" />
        <div className="login-anillo a2" aria-hidden="true" />

        <h2>Vigila la cartera y compara bancos en un solo lugar</h2>
        <p>Rankings por actividad económica, calidad de los datos y el líder de cada ranking.</p>
        <ul className="login-beneficios">
          {BENEFICIOS.map((b) => <li key={b}><i aria-hidden="true">✓</i>{b}</li>)}
        </ul>
        {presentacion && <VistaPrevia datos={presentacion} />}
      </aside>
    </div>
  );
}
