import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "./api";
import { RANKING_LABELS } from "./constants";
import AppShell from "./components/AppShell";
import Dashboard from "./components/Dashboard";
import PeriodSelect from "./components/PeriodSelect";
import LideresRanking from "./components/LideresRanking";
import CalidadPage from "./components/CalidadPage";
import LoginPage from "./components/LoginPage";
import VisitorHome from "./components/VisitorHome";
import RankingsPage from "./components/RankingsPage";
import ExportPanel from "./components/ExportPanel";
import StatusNotice from "./components/StatusNotice";

const money = (v) => new Intl.NumberFormat("es-PA", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(String(v ?? "0").replaceAll(",", "")));

// Cada sección tiene su propia dirección (#rankings, #calidad…) para poder volver atrás con el navegador.
const PAGINAS = ["datos", "rankings", "calidad", "exportar", "administracion"];
const paginaDesdeUrl = () => {
  const h = window.location.hash.replace("#", "");
  return PAGINAS.includes(h) ? h : "datos";
};

export default function SbpApp() {
  // Sesión iniciada: el rol de la cuenta define el perfil (publico, analista o admin).
  const [sesion, setSesion] = useState(null);
  const [revisandoSesion, setRevisandoSesion] = useState(true);
  const profile = sesion?.rol || "publico";
  useEffect(() => {
    api.sesion().then(setSesion).catch(() => setSesion(null)).finally(() => setRevisandoSesion(false));
    const caducada = () => setSesion(null);
    window.addEventListener("sesion-caducada", caducada);
    return () => window.removeEventListener("sesion-caducada", caducada);
  }, []);
  const [page, setPage] = useState(paginaDesdeUrl);
  const [periods, setPeriods] = useState([]);
  const [period, setPeriod] = useState("");
  const [health, setHealth] = useState(false);
  const [ranking, setRanking] = useState("HIPOTECARIO");
  const [rankings, setRankings] = useState({});
  const [quality, setQuality] = useState(null);
  const [breakdown, setBreakdown] = useState([]);
  const [reconciliations, setReconciliations] = useState(null);
  const [historico, setHistorico] = useState({});
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const loadPeriods = useCallback(async () => {
    setError("");
    try {
      const [healthData, available] = await Promise.all([api.health(), api.periods()]);
      setHealth(Boolean(healthData.ok));
      setPeriods(available);
      setPeriod((current) => available.includes(current) ? current : (available.at(-1) || ""));
    } catch (e) { setHealth(false); setPeriods([]); setPeriod(""); setError(e.message); }
  }, []);

  useEffect(() => { if (sesion) loadPeriods(); }, [loadPeriods, sesion]);

  // Histórico: calidad y rankings de cada período disponible (para tendencias y comparación).
  useEffect(() => {
    if (!periods.length) { setHistorico({}); return; }
    let alive = true;
    Promise.all(periods.map((p) => Promise.all([api.quality(p), api.rankings(p)]).then(([q, r]) => [p, { quality: q, rankings: r }])))
      .then((pares) => { if (alive) setHistorico(Object.fromEntries(pares)); })
      .catch(() => { if (alive) setHistorico({}); });
    return () => { alive = false; };
  }, [periods]);

  useEffect(() => {
    if (!period) return;
    let alive = true;
    setLoading(true); setError("");
    Promise.all([api.rankings(period), api.quality(period), api.breakdown(period), api.reconciliations(period)])
      .then(([r, q, b, rec]) => {
        if (!alive) return;
        setRankings(r || {}); setQuality(q); setBreakdown(b || []); setReconciliations(rec);
        if (!Object.keys(r || {}).includes(ranking)) setRanking(Object.keys(r || {})[0] || "HIPOTECARIO");
      })
      .catch((e) => { if (alive) { setError(e.message); setRankings({}); setQuality(null); setBreakdown([]); setReconciliations(null); } })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [period]);

  const rankingNames = useMemo(() => Object.keys(rankings), [rankings]);
  const rows = rankings[ranking] || [];
  const subactivityRows = breakdown.filter((row) => row.Ranking === ranking);
  // Navegar guarda la sección en el historial del navegador.
  const go = (next) => {
    if (next !== page) window.history.pushState({ page: next }, "", `#${next}`);
    setPage(next);
  };
  useEffect(() => {
    const alVolver = () => setPage(paginaDesdeUrl());
    window.addEventListener("popstate", alVolver);
    return () => window.removeEventListener("popstate", alVolver);
  }, []);
  const selector = <PeriodSelect periods={periods} value={period} onChange={setPeriod} />;
  // En Rankings y en la portada de visitante el selector va junto al menú de actividades.
  const selectorEnContenido = page === "rankings" || (page === "datos" && profile === "publico");

  if (revisandoSesion) return null;
  if (!sesion) return <LoginPage onEntrar={setSesion} />;
  const cerrarSesion = async () => { await api.logout(); setSesion(null); setPage("datos"); };
  return <AppShell profile={profile} usuario={sesion.usuario} onCerrarSesion={cerrarSesion}
    page={page} setPage={go} periods={periods} period={period} setPeriod={setPeriod} apiState={health} selectorEnContenido={selectorEnContenido}>
    {error && <StatusNotice type="error" onRetry={loadPeriods}>{error}</StatusNotice>}

    {page === "datos" && (
      periods.length ? (
        profile === "publico" ? (
          <VisitorHome quality={quality} rankings={rankings} reconciliations={reconciliations} period={period} onIr={go} selector={selector} />
        ) : <>
        <Dashboard
          periods={periods} period={period} quality={quality} rankings={rankings}
          reconciliations={reconciliations} historico={historico}
          ranking={ranking} setRanking={setRanking} onIr={go}
        />
        {profile === "analista" && <LideresRanking rankings={rankings} historico={historico} onVerRanking={(nombre) => { setRanking(nombre); go("rankings"); }} />}
        </>
      ) : (
        <div className="panel"><span className="eyebrow">SIN DATOS</span><h2>No hay períodos cargados</h2>
          <p>Coloque el paquete AT03 de la SBP en la carpeta <code>datos/</code> del proyecto y recargue la página.</p></div>
      )
    )}


    {page === "calidad" && <CalidadPage quality={quality} reconciliations={reconciliations} historico={historico} period={period} />}

    {page === "rankings" && <RankingsPage rankings={rankings} ranking={ranking} setRanking={setRanking} breakdown={breakdown} historico={historico} loading={loading} selector={selector} profile={profile} />}


    {page === "exportar" && <ExportPanel period={period} />}

    {page === "administracion" && <div className="stack">
      <div className="panel"><span className="eyebrow">OPERACIÓN DEL SISTEMA</span><h2>Administración de períodos</h2><p>El contrato API entregado no documenta rutas para carga de archivos, actualización de períodos, parámetros, catálogos ni bitácora. Para no simular operaciones, estos controles quedan identificados como pendientes de integración.</p>
        <div className="admin-capability"><b>Carga / actualización AT03</b><span>Endpoint no especificado</span></div>
        <div className="admin-capability"><b>Parámetros y umbral de movimientos</b><span>Endpoint no especificado</span></div>
        <div className="admin-capability"><b>Catálogos (incl. códigos CINU)</b><span>Fuente/catálogo oficial pendiente</span></div>
        <div className="admin-capability"><b>Bitácora de archivos y operaciones</b><span>Endpoint no especificado</span></div>
      </div>
      <div className="panel"><span className="eyebrow">AUTOMATIZACIONES</span><h2>Flujo propuesto al cargar un período</h2>
        <ol className="automation-list"><li>Validar archivo AT03 y emitir reporte de calidad.</li><li>Aplicar SB21 en el procesamiento del backend y registrar evidencia.</li><li>Recalcular rankings en el backend al confirmar el período.</li><li>Comparar posiciones contra el período anterior y señalar cambios según parámetro configurable.</li><li>Generar explicación textual basada exclusivamente en variaciones verificadas y preparar CSV.</li></ol>
      </div>
    </div>}
  </AppShell>;
}
