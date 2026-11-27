"use client";
// AccesoTemporal — Pantalla de acceso (diseño de Amet: formulario a la izquierda, panel de
// presentación a la derecha, logo animado). Usuario y clave se verifican con la acción de
// servidor iniciarSesion; "Entrar como visitante" da la vista Pública. Bajo el formulario,
// "Acceso rápido" con un botón por vista (cambiarPerfil) para la demostración sin cuentas.
// Se usa en app/login/page.js y app/perfil/page.js.
//
// Props:
//   presentacion (objeto|null)  Cifras reales de todos los cortes (app/login/datos.js):
//                               { periodos: [{ fecha, etiqueta, prestamos, prestamosN, bancos, total, totalN }],
//                                 rankings: [{ clave, nombre, bancos: [{ codigo, banco, serie: [{ posicion, saldo, n }|null] }] }] }.
//                               El panel derecho es una "carrera de barras" en bucle: recorre los períodos de
//                               cada ranking (las barras cambian de ancho y se reordenan) y pasa al siguiente.
//                               null deja en el panel solo el nombre y la línea.
import { useEffect, useRef, useState, useTransition } from "react";
import { cambiarPerfil, entrarComoVisitante, iniciarSesion } from "@/app/perfil/acciones";
import LogoAnimado from "./LogoAnimado";
import "@/app/login/login.css";

const VISTAS = [
  { valor: "publico", nombre: "Público" },
  { valor: "analista", nombre: "Analista" },
  { valor: "administrador", nombre: "Administrador" },
];

const VISIBLES = 6;
const PASO_MS = 2200; // entre períodos
const PAUSA_MS = 1500; // tras el último período, antes de cambiar de ranking
const FUNDIDO_MS = 380;
const CONTEO_MS = 700;

// Formatos solo para los cuadros intermedios del conteo (la cifra final es el texto exacto del servidor).
const fmtM = (n) => `${(n / 1e6).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} M`;
const fmtEntero = (n) => Math.round(n).toLocaleString("en-US");

// Cuenta desde el valor anterior hasta `objetivo`; al terminar muestra `texto` (exacto).
function Conteo({ objetivo, texto, formato }) {
  const [mostrado, setMostrado] = useState(texto);
  const previo = useRef(objetivo);
  useEffect(() => {
    const desde = previo.current;
    previo.current = objetivo;
    if (desde === objetivo) {
      const t = setTimeout(() => setMostrado(texto), 0);
      return () => clearTimeout(t);
    }
    let cuadro;
    const inicio = performance.now();
    const avanzar = (ahora) => {
      const t = Math.min(1, (ahora - inicio) / CONTEO_MS);
      const e = 1 - (1 - t) ** 3;
      if (t < 1) {
        setMostrado(formato(desde + (objetivo - desde) * e));
        cuadro = requestAnimationFrame(avanzar);
      } else setMostrado(texto);
    };
    cuadro = requestAnimationFrame(avanzar);
    return () => cancelAnimationFrame(cuadro);
  }, [objetivo, texto, formato]);
  return mostrado;
}

function Presentacion({ datos }) {
  const totalPeriodos = datos?.periodos.length ?? 0;
  const totalRankings = datos?.rankings.length ?? 0;
  // Primer render determinista (servidor y cliente): primer ranking, primer período.
  const [estado, setEstado] = useState({ r: 0, p: 0, visible: true });

  useEffect(() => {
    if (!totalRankings) return;
    const temporizadores = new Set();
    const esperar = (fn, ms) => {
      const t = setTimeout(() => { temporizadores.delete(t); fn(); }, ms);
      temporizadores.add(t);
    };
    const limpiar = () => temporizadores.forEach(clearTimeout);
    const ultimo = totalPeriodos - 1;

    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      esperar(() => setEstado({ r: 0, p: ultimo, visible: true }), 0);
      return limpiar;
    }

    let r = 0, p = 0;
    const paso = () => {
      if (document.hidden) return esperar(paso, 600); // en pausa mientras la pestaña no se ve
      if (p < ultimo) {
        p += 1;
        setEstado({ r, p, visible: true });
        esperar(paso, p < ultimo ? PASO_MS : PASO_MS + PAUSA_MS);
      } else {
        setEstado({ r, p, visible: false });
        esperar(() => {
          r = (r + 1) % totalRankings;
          p = 0;
          setEstado({ r, p, visible: true });
          esperar(paso, ultimo > 0 ? PASO_MS : PASO_MS + PAUSA_MS);
        }, FUNDIDO_MS);
      }
    };
    esperar(paso, ultimo > 0 ? PASO_MS : PASO_MS + PAUSA_MS);
    return limpiar;
  }, [totalPeriodos, totalRankings]);

  const ranking = datos?.rankings[estado.r];
  const periodo = datos?.periodos[estado.p];

  let filas = [];
  let maximo = 1;
  if (ranking) {
    ranking.bancos.forEach((b) => b.serie.forEach((s) => { if (s && s.n > maximo) maximo = s.n; }));
    const orden = ranking.bancos
      .filter((b) => b.serie[estado.p])
      .sort((a, b) => b.serie[estado.p].n - a.serie[estado.p].n || a.codigo.localeCompare(b.codigo))
      .map((b) => b.codigo);
    filas = ranking.bancos.map((b) => {
      const indice = orden.indexOf(b.codigo);
      const s = b.serie[estado.p];
      const visible = indice >= 0 && indice < VISIBLES;
      return { ...b, s, indice: visible ? indice : VISIBLES, visible };
    });
  }

  return (
    <aside className="login-presentacion" aria-labelledby="titulo-presentacion">
      <header className="lp-encabezado">
        <h2 id="titulo-presentacion">Rankings de crédito bancario</h2>
        <p>Posición de cada banco por actividad económica</p>
      </header>
      {ranking && periodo && (
        <>
          <figure className="lp-carrera" aria-live="off">
            <figcaption className={`lp-rotulo${estado.visible ? "" : " saliendo"}`}>
              <strong>{ranking.nombre}</strong>
              <span>{periodo.etiqueta}</span>
            </figcaption>
            <ol key={ranking.clave} className={`lp-barras${estado.visible ? "" : " saliendo"}`}
              style={{ "--filas": VISIBLES }} aria-label={`Top ${VISIBLES} de ${ranking.nombre}, ${periodo.etiqueta}`}>
              {filas.map((f) => (
                <li key={f.codigo} className={`lp-barra${f.visible ? "" : " fuera"}${f.indice === 0 ? " lider" : ""}`}
                  style={{ "--i": f.indice }} aria-hidden={!f.visible}>
                  <span className="lp-pos">{f.visible ? f.indice + 1 : ""}</span>
                  <div className="lp-cuerpo">
                    <div className="lp-fila">
                      <span className="lp-banco">{f.banco}</span>
                      <span className="lp-monto">
                        {f.s ? <Conteo objetivo={f.s.n} texto={f.s.saldo} formato={fmtM} /> : ""}
                      </span>
                    </div>
                    <div className="lp-pista" aria-hidden="true">
                      <i style={{ width: `${f.s ? Math.max(3, (f.s.n / maximo) * 100) : 0}%` }} />
                    </div>
                  </div>
                </li>
              ))}
            </ol>
            <div className="lp-progreso" aria-hidden="true">
              <span className="lp-puntos">
                {datos.rankings.map((x, i) => <i key={x.clave} className={i === estado.r ? "activo" : ""} />)}
              </span>
              {totalPeriodos > 1 && (
                <span className="lp-linea">
                  {datos.periodos.map((x, i) => (
                    <span key={x.fecha} className={i === estado.p ? "actual" : i < estado.p ? "pasado" : ""}>
                      {x.etiqueta.replace(/ de \d{4}$/, "")}
                    </span>
                  ))}
                </span>
              )}
            </div>
          </figure>
          <footer className="lp-cifras">
            <dl>
              <div><dt>Préstamos válidos</dt><dd><Conteo objetivo={periodo.prestamosN} texto={periodo.prestamos} formato={fmtEntero} /></dd></div>
              <div><dt>Bancos</dt><dd>{periodo.bancos}</dd></div>
              <div><dt>Saldo total</dt><dd><Conteo objetivo={periodo.totalN} texto={periodo.total} formato={fmtM} /></dd></div>
            </dl>
            <p>Corte de {periodo.etiqueta}</p>
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
