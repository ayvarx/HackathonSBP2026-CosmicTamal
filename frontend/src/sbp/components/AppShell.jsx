import { NAV_ITEMS, PROFILE_LABELS, etiquetaPeriodo } from "../constants";
import PeriodSelect from "./PeriodSelect";
import LogoRadar from "./LogoRadar";
import "./topbar.css";

// Estructura de la aplicación: cabecera azul con marca y perfil, pestañas de sección debajo,
// y el contenido de cada sección en su propia página.
export default function AppShell({
  profile, usuario, onCerrarSesion, page, setPage, periods, period, setPeriod, children, apiState, selectorEnContenido
}) {
  const visibleItems = NAV_ITEMS.filter((item) => item.profiles.includes(profile));
  const actual = visibleItems.find((item) => item.id === page);

  return (
    <div className="app-shell">
      <header className="app-cabecera">
        <div className="app-marca">
          <LogoRadar size={42} />
          <div>
            <h1>Rankings de crédito bancario</h1>
            <small>Por banco y actividad económica · Hackathon SBP 2026</small>
          </div>
        </div>
        <div className="app-perfil">
          <span>{usuario} · {PROFILE_LABELS[profile]}</span>
          <button className="app-salir" onClick={onCerrarSesion}>Cerrar sesión</button>
        </div>
      </header>

      <nav className="app-tabs" aria-label="Secciones">
        {visibleItems.map((item) => (
          <button
            key={item.id}
            className={page === item.id ? "activa" : ""}
            onClick={() => setPage(item.id)}
            aria-current={page === item.id ? "page" : undefined}
          >
            {item.label}
          </button>
        ))}
      </nav>

      <main className="main-area">
        <div className="persistent-disclaimer" role="note">
          <span><b>Fuente:</b> API regulatoria sintética · Formato AT03</span>
          <span><b>Período de corte:</b> {etiquetaPeriodo(period) || "No disponible"}</span>
          <span className="fiction-label">DATOS FICTICIOS · NO REPRESENTAN ENTIDADES REALES</span>
          <span className={`estado-api ${apiState ? "ok" : ""}`}>{apiState ? "API conectada" : "API sin conexión"}</span>
        </div>
        <section className="page-content">
          {!selectorEnContenido && (
            <div className="periodo-barra">
              <span className="periodo-titulo">{actual?.label}</span>
              <PeriodSelect periods={periods} value={period} onChange={setPeriod} />
            </div>
          )}
          {children}
        </section>
      </main>
    </div>
  );
}
