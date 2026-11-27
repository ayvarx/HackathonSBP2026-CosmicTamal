import { useMemo } from "react";
import {
  Area, AreaChart, Bar, BarChart, Cell, LabelList, Line, LineChart, Pie, PieChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid,
} from "recharts";
import { RANKING_LABELS } from "../constants";
import "./dashboard.css";

// Todas las cifras llegan de la API. Aquí solo se agrupan y se presentan.
const num = (v) => Number(String(v ?? "0").replaceAll(",", ""));
const fmt = (n) => new Intl.NumberFormat("es-PA", { maximumFractionDigits: 0 }).format(n);
const fmt2 = (n) => new Intl.NumberFormat("es-PA", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
const etiquetaPeriodo = (p) => (p ? `${p.slice(0, 4)}-${p.slice(4, 6)}-${p.slice(6, 8)}` : "—");
const PALETA = ["#267F18", "#7EAC39", "#136749", "#419A33", "#94a3b8", "#A9D18E", "#052200", "#608D1A"];

function Panel({ titulo, eyebrow, lectura, aside, className = "", children }) {
  return (
    <section className={`dash-panel ${className}`}>
      <header className="dash-panel-head">
        <div>
          {eyebrow && <span className="eyebrow">{eyebrow}</span>}
          <h3>{titulo}</h3>
          {lectura && <p className="dash-lectura">{lectura}</p>}
        </div>
        {aside}
      </header>
      {children}
    </section>
  );
}

function Sparkline({ valores, color }) {
  if (!valores || valores.length < 2) return null;
  const data = valores.map((v, i) => ({ i, v }));
  return (
    <div className="spark">
      <ResponsiveContainer width="100%" height={38}>
        <LineChart data={data} margin={{ top: 6, right: 8, bottom: 2, left: 2 }}>
          <ReferenceLine y={Math.max(...valores)} stroke="#CFE3C4" strokeDasharray="3 3" />
          <Line type="monotone" dataKey="v" stroke={color} strokeWidth={2} isAnimationActive={false}
            dot={(p) => (p.index === data.length - 1 ? <circle key={p.index} cx={p.cx} cy={p.cy} r={3.5} fill={color} /> : null)} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function Kpi({ etiqueta, valor, detalle, color, serie }) {
  return (
    <article className="kpi-card">
      <div className="kpi-top">
        <span className="kpi-label">{etiqueta}</span>
        <span className="kpi-dot" style={{ background: color }} />
      </div>
      <strong className="kpi-value">{valor}</strong>
      <div className="kpi-foot">
        <small>{detalle}</small>
        <Sparkline valores={serie} color={color} />
      </div>
    </article>
  );
}

export default function Dashboard({ periods, period, quality, rankings, reconciliations, historico, ranking, setRanking, onIr }) {
  const nombres = Object.keys(rankings || {});
  const filasActivo = rankings?.[ranking] || [];

  // Totales por macroactividad (suma de saldos de cada ranking en el período activo).
  const macros = useMemo(() => nombres.map((n, i) => ({
    nombre: RANKING_LABELS[n] || n,
    clave: n,
    valor: (rankings[n] || []).reduce((s, f) => s + num(f.Saldo_Actividad), 0),
    color: PALETA[i % PALETA.length],
  })).sort((a, b) => b.valor - a.valor), [rankings]);
  const totalMacros = macros.reduce((s, m) => s + m.valor, 0);

  // Serie histórica del universo válido, solo con períodos que la API ya entregó.
  const serie = useMemo(() => (periods || [])
    .filter((p) => historico?.[p]?.quality)
    .map((p) => ({ periodo: etiquetaPeriodo(p), universo: num(historico[p].quality.universo_valido), raw: p })),
    [periods, historico]);
  const seriesUniverso = serie.map((s) => s.universo);

  // Variación entre cortes consecutivos (solo presentación; los conteos vienen de la API).
  const tendencia = serie.map((s, i) => {
    const previo = i > 0 ? serie[i - 1].universo : null;
    const delta = previo == null ? null : s.universo - previo;
    const pct = previo ? (delta / previo) * 100 : null;
    return { ...s, delta, pct };
  });

  // Etiqueta sobre cada columna: cantidad y, desde el segundo corte, variación con su color.
  const etiquetaTendencia = ({ x, y, width, index }) => {
    const d = tendencia[index];
    if (!d) return null;
    const cx = x + width / 2;
    const subeOBaja = d.delta >= 0;
    return (
      <g>
        <text x={cx} y={d.delta == null ? y - 8 : y - 24} textAnchor="middle" fill="#1e293b" fontSize={12} fontWeight={600}>
          {`${fmt(d.universo)} préstamos`}
        </text>
        {d.delta != null && (
          <text x={cx} y={y - 8} textAnchor="middle" fill={subeOBaja ? "#34d399" : "#f87171"} fontSize={11} fontWeight={600}>
            {`${subeOBaja ? "▲ +" : "▼ "}${fmt(d.delta)} (${subeOBaja ? "+" : ""}${d.pct.toFixed(1)}%)`}
          </text>
        )}
      </g>
    );
  };


  const exclusiones = quality ? [
    { k: "E1", t: "Préstamo repetido", v: quality.E1 },
    { k: "E2", t: "Destino extranjero", v: quality.E2 },
    { k: "E3", t: "Saldo cero o negativo", v: quality.E3 },
    { k: "E4", t: "Actividad no catalogada", v: quality.E4 },
  ] : [];
  const leidas = num(quality?.leidas);
  const reconOk = reconciliations ? Object.values(reconciliations).filter(Boolean).length : 0;
  const reconTotal = reconciliations ? Object.keys(reconciliations).length : 3;

  const ultimo = serie.at(-1)?.universo;
  const anterior = serie.at(-2)?.universo;
  const variacion = ultimo != null && anterior ? ((ultimo - anterior) / anterior) * 100 : null;

  const datosBarras = filasActivo
    .slice()
    .sort((a, b) => Number(a.Posicion) - Number(b.Posicion))
    .map((f) => ({ banco: f.Banco, saldo: num(f.Saldo_Actividad), pos: Number(f.Posicion) }));

  return (
    <div className="dash">
      <div className="dash-head">
        <div>
          <span className="eyebrow">PANEL PRINCIPAL</span>
          <h2>Cartera crediticia · {etiquetaPeriodo(period)}</h2>
        </div>
        <div className="dash-actions">
          <button className="ghost" onClick={() => onIr("rankings")}>Ver rankings →</button>
          <button className="ghost" onClick={() => onIr("exportar")}>Exportar →</button>
        </div>
      </div>

      <div className="kpi-row">
        <Kpi etiqueta="Préstamos válidos" valor={fmt(num(quality?.universo_valido))} color="#267F18"
          detalle={variacion == null ? "Un período cargado" : `${variacion >= 0 ? "+" : ""}${fmt2(variacion)}% vs período anterior`}
          serie={seriesUniverso} />
        <Kpi etiqueta="Registros leídos" valor={fmt(leidas)} color="#608D1A"
          detalle={`${fmt(num(quality?.validas))} préstamos válidos tras E1–E4`} />
        <Kpi etiqueta="Bancos incluidos" valor={fmt(filasActivo.length)} color="#267F18"
          detalle={`${nombres.length} rankings disponibles`} />
        <Kpi etiqueta="Controles que cuadran" valor={`${reconOk}/${reconTotal}`} color={reconOk === reconTotal ? "#267F18" : "#f5a524"}
          detalle={reconOk === reconTotal ? "Todas cuadran al centavo" : "Revisar en Calidad"} />
      </div>

      <div className="dash-grid">
        <Panel className="span-2" eyebrow="TENDENCIA" titulo="Préstamos válidos por período">
          {serie.length < 2 ? (
            <p className="dash-empty">La evolución aparece cuando el backend tiene al menos dos cortes cargados. Hoy hay {serie.length}.</p>
          ) : (
            <div className="chart-h">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={serie} margin={{ top: 52, right: 16, left: 4, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gUniverso" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#267F18" stopOpacity={0.5} />
                      <stop offset="100%" stopColor="#267F18" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="#e3e8f2" strokeDasharray="3 5" vertical={false} />
                  <XAxis dataKey="periodo" tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={fmt} width={84} label={{ value: "N° de préstamos", angle: -90, position: "insideLeft", fill: "#64748b", fontSize: 11, dx: -4 }} />
                  <Tooltip formatter={(v) => fmt(v)} contentStyle={{ background: "#ffffff", border: "1px solid #d7dde9", borderRadius: 10 }} />
                  <Bar dataKey="universo" name="Universo válido" fill="#267F18" maxBarSize={90} isAnimationActive={false}>
                    <LabelList dataKey="universo" position="top" content={etiquetaTendencia} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Panel>

        <Panel eyebrow="COMPOSICIÓN" titulo="Saldo por macroactividad">
          <div className="donut-wrap">
            <div className="chart-h donut">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={macros} dataKey="valor" nameKey="nombre" innerRadius="62%" outerRadius="92%" paddingAngle={2} stroke="none" isAnimationActive={false}>
                    {macros.map((m) => <Cell key={m.clave} fill={m.color} />)}
                  </Pie>
                  <Tooltip
                    formatter={(v) => `${fmt2(v / 1e6)} M`}
                    wrapperStyle={{ zIndex: 5, pointerEvents: "none" }}
                    contentStyle={{ background: "#ffffff", border: "1px solid #d7dde9", borderRadius: 6, fontSize: 12, padding: "6px 10px" }}
                    labelStyle={{ fontSize: 12, color: "#111827" }}
                    itemStyle={{ fontSize: 12, color: "#111827" }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="donut-center"><strong>{fmt(totalMacros)}</strong><small>Saldo total</small></div>
            </div>
            <ul className="legend">
              {macros.map((m) => (
                <li key={m.clave}>
                  <span className="sw" style={{ background: m.color }} />
                  <span>{m.nombre}</span>
                  <b>{totalMacros ? fmt2((m.valor / totalMacros) * 100) : "0,00"}%</b>
                </li>
              ))}
            </ul>
          </div>
        </Panel>

        <Panel className="span-2" eyebrow="ENTIDADES" titulo={`Saldo por banco · ${RANKING_LABELS[ranking] || ranking}`}          aside={
            <div className="chips">
              {nombres.map((n) => (
                <button key={n} className={`chip ${n === ranking ? "on" : ""}`} onClick={() => setRanking(n)}>
                  {RANKING_LABELS[n] || n}
                </button>
              ))}
            </div>
          }>
          <div className="chart-h">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={datosBarras} layout="vertical" margin={{ top: 4, right: 24, left: 8, bottom: 4 }} barCategoryGap="22%">
                <CartesianGrid stroke="#e3e8f2" strokeDasharray="3 5" horizontal={false} />
                <XAxis type="number" tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={fmt} />
                <YAxis type="category" dataKey="banco" width={170} tick={{ fill: "#334155", fontSize: 12 }} axisLine={false} tickLine={false} interval={0} />
                <Tooltip formatter={(v) => fmt2(v)} contentStyle={{ background: "#ffffff", border: "1px solid #d7dde9", borderRadius: 10 }} />
                <Bar dataKey="saldo" name="Saldo" radius={[0, 0, 0, 0]} isAnimationActive={false}>
                  {datosBarras.map((d, i) => <Cell key={i} fill={d.pos === 1 ? "#f5a524" : "#267F18"} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel eyebrow="CALIDAD" titulo="Registros descartados">
          <ul className="quality-list">
            {exclusiones.map((e) => {
              const pct = leidas ? (num(e.v) / leidas) * 100 : 0;
              return (
                <li key={e.k}>
                  <div className="q-head"><span><b>{e.k}</b> {e.t}</span><span>{fmt(num(e.v))}</span></div>
                  <div className="q-bar"><i style={{ width: `${Math.min(100, pct)}%` }} /></div>
                </li>
              );
            })}
          </ul>
        </Panel>

        <Panel className="span-3" eyebrow="CONTROLES" titulo="Verificaciones">
          <ul className="recon">
            {Object.entries(reconciliations || {}).map(([k, ok]) => (
              <li key={k} className={ok ? "ok" : "fallo"}>
                <span>{k === "rec1" ? "Subactividades = actividad" : k === "rec2" ? "Macroactividades = cartera" : "Carteras = universo"}</span>
                <b aria-label={ok ? "Cuadra" : "No cuadra"}>{ok ? "✔" : "✖"}</b>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

    </div>
  );
}
