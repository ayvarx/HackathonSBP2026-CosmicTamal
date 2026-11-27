"use client";
// Portado del frontend de Amet: components/Dashboard.jsx (+ dashboard.css, depth.css)
// Indicadores y tendencias del corte: KPIs, evolución del universo válido, composición por
// macroactividad, saldo por banco en cada ranking, registros descartados y verificaciones.
// Los gráficos de recharts se rehicieron con components/Grafico (ECharts). Todas las cifras
// llegan como props desde app/page.js (lib/consultas*.js); los montos son texto decimal exacto
// y se muestran con lib/formato.js (Number solo para dibujar barras y porcentajes de conteos).
import { useState } from "react";
import Link from "next/link";
import Grafico from "@/components/Grafico";
import {
  aNumeroParaGrafico,
  formatearEntero,
  formatearFecha,
  formatearMonto,
  formatearMontoCompacto,
  formatearPorcentaje,
  nombreRanking,
} from "@/lib/formato";
import "./dashboard.css";
import "./depth.css";
import "./inicio.css";

// Paleta del tema Radar (la de Amet, sin el azul repetido).
const PALETA = ["#1D3E7F", "#5B82C8", "#f5a524", "#f87171", "#2dd4bf", "#e879f9", "#94a3b8"];
const AZUL = "#1D3E7F";
const AMBAR = "#f5a524";

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

/** Minilínea del KPI (en Amet era un LineChart de recharts). */
function Sparkline({ valores, color }) {
  if (!valores || valores.length < 2) return null;
  const ultimo = valores.length - 1;
  return (
    <div className="spark" aria-hidden="true">
      <Grafico
        altura={38}
        opcion={{
          grid: { top: 6, right: 8, bottom: 2, left: 2, containLabel: false },
          tooltip: { show: false },
          xAxis: { type: "category", show: false, data: valores.map((_, i) => i) },
          yAxis: { type: "value", show: false, scale: true },
          series: [
            {
              type: "line",
              data: valores.map((v, i) => ({ value: v, symbolSize: i === ultimo ? 7 : 0 })),
              smooth: true,
              symbol: "circle",
              lineStyle: { color, width: 2 },
              itemStyle: { color },
              markLine: { silent: true, symbol: "none", label: { show: false }, lineStyle: { color: "#B9C8E6", type: "dashed" }, data: [{ type: "max" }] },
            },
          ],
        }}
      />
    </div>
  );
}

function Kpi({ etiqueta, valor, detalle, color, serie, enlace }) {
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
        {enlace && (
          <Link className="kpi-enlace" href={enlace.href}>
            {enlace.texto}
          </Link>
        )}
      </div>
    </article>
  );
}

export default function Dashboard({
  fecha,
  anterior,
  serie,
  calidad,
  universo,
  numBancos,
  movimientos,
  reconciliaciones,
  composicion,
  rankings,
  enlaces,
}) {
  const [ranking, setRanking] = useState(rankings[0]?.ranking);
  const activo = rankings.find((r) => r.ranking === ranking) ?? rankings[0];

  // Variación del universo válido entre cortes consecutivos (conteos enteros, no dinero).
  const tendencia = serie.map((s, i) => {
    const previo = i > 0 ? serie[i - 1].universo : null;
    const delta = previo == null ? null : s.universo - previo;
    const pct = previo ? (delta / previo) * 100 : null;
    return { ...s, delta, pct };
  });
  const ultimo = tendencia.at(-1);
  const variacion = ultimo?.pct;

  const opcionTendencia = {
    grid: { top: 52, right: 16, left: 8, bottom: 8, containLabel: true },
    tooltip: { trigger: "axis", valueFormatter: (v) => `${formatearEntero(v)} préstamos` },
    xAxis: { type: "category", data: tendencia.map((t) => formatearFecha(t.fecha, "corta")) },
    yAxis: { type: "value", name: "N° de préstamos", nameTextStyle: { color: "#64748b", fontSize: 11 }, splitLine: { lineStyle: { color: "#e3e8f2", type: "dashed" } } },
    series: [
      {
        type: "bar",
        name: "Universo válido",
        barMaxWidth: 90,
        itemStyle: { color: AZUL },
        data: tendencia.map((t) => t.universo),
        label: {
          show: true,
          position: "top",
          formatter: ({ dataIndex }) => {
            const t = tendencia[dataIndex];
            const linea1 = `{n|${formatearEntero(t.universo)} préstamos}`;
            if (t.delta == null) return linea1;
            const sube = t.delta >= 0;
            return `${linea1}\n{${sube ? "s" : "b"}|${sube ? "▲ +" : "▼ "}${formatearEntero(t.delta)} (${sube ? "+" : ""}${t.pct.toFixed(1)} %)}`;
          },
          rich: {
            n: { color: "#1e293b", fontSize: 12, fontWeight: 600, lineHeight: 16 },
            s: { color: "#1d6b3a", fontSize: 11, fontWeight: 600, lineHeight: 16 },
            b: { color: "#a12a2a", fontSize: 11, fontWeight: 600, lineHeight: 16 },
          },
        },
      },
    ],
  };

  const opcionDona = {
    tooltip: { trigger: "item" },
    series: [
      {
        type: "pie",
        name: "Saldo",
        radius: ["62%", "92%"],
        padAngle: 2,
        label: { show: false },
        data: composicion.map((c, i) => ({
          name: nombreRanking(c.ranking),
          value: aNumeroParaGrafico(c.saldo),
          itemStyle: { color: PALETA[i % PALETA.length] },
        })),
      },
    ],
  };

  const filasActivo = activo?.filas ?? [];
  const opcionBancos = {
    grid: { top: 4, right: 24, left: 8, bottom: 4, containLabel: true },
    xAxis: { type: "value", splitLine: { lineStyle: { color: "#e3e8f2", type: "dashed" } } },
    yAxis: { type: "category", inverse: true, data: filasActivo.map((f) => f.banco), axisLabel: { interval: 0 } },
    series: [
      {
        type: "bar",
        name: "Saldo",
        barCategoryGap: "22%",
        data: filasActivo.map((f) => ({
          value: aNumeroParaGrafico(f.saldo_actividad),
          itemStyle: { color: f.posicion === 1 ? AMBAR : AZUL },
        })),
      },
    ],
  };

  const leidas = calidad?.filas_leidas ?? 0;
  const exclusiones = calidad
    ? [
        { k: "E1", t: "Préstamo repetido", v: calidad.e1_duplicados },
        { k: "E2", t: "Destino extranjero", v: calidad.e2_destino_extranjero },
        { k: "E3", t: "Saldo cero o negativo", v: calidad.e3_saldo_no_positivo },
        { k: "E4", t: "Actividad no catalogada", v: calidad.e4_actividad_no_catalogada },
      ]
    : [];
  const recOk = reconciliaciones.filter((r) => r.todas_cuadran).length;

  return (
    <div className="dash">
      <div className="dash-head">
        <div>
          <span className="eyebrow">PANEL PRINCIPAL</span>
          <h2>Cartera crediticia · {formatearFecha(fecha)}</h2>
          <p>
            {anterior ? `Comparado con ${formatearFecha(anterior)}.` : "Primer corte cargado: sin período anterior."}
          </p>
        </div>
        <div className="dash-actions">
          <Link className="ghost" href={enlaces.rankings}>
            Ver rankings →
          </Link>
          <Link className="ghost" href={enlaces.exportar}>
            Exportar →
          </Link>
        </div>
      </div>

      <div className="kpi-row">
        <Kpi
          etiqueta="Préstamos válidos (universo local)"
          valor={formatearEntero(universo.universo_local_valido)}
          color={AZUL}
          detalle={
            variacion == null
              ? `De ${formatearEntero(universo.filas_leidas)} registros leídos`
              : `${variacion >= 0 ? "+" : ""}${variacion.toFixed(2)} % vs período anterior · de ${formatearEntero(universo.filas_leidas)} leídos`
          }
          serie={serie.map((s) => s.universo)}
          enlace={{ href: "/calidad", texto: "Ver reporte de calidad" }}
        />
        <Kpi
          etiqueta="Saldo del universo local válido"
          valor={formatearMontoCompacto(universo.saldo_universo_local_valido)}
          color="#5B82C8"
          detalle={`Exacto: ${formatearMonto(universo.saldo_universo_local_valido)}`}
        />
        <Kpi
          etiqueta="Bancos incluidos"
          valor={formatearEntero(numBancos)}
          color={AZUL}
          detalle={`Todos figuran en los ${formatearEntero(rankings.length)} rankings (saldo 0.00 si no tienen cartera).`}
          enlace={{ href: "#cartera-bancos", texto: "Ver cartera por banco" }}
        />
        <Kpi
          etiqueta="Movimientos significativos"
          valor={anterior ? formatearEntero(movimientos.significativos) : "—"}
          color={anterior && movimientos.significativos ? AMBAR : AZUL}
          detalle={
            anterior
              ? `De ${formatearEntero(movimientos.total)} posiciones frente a ${formatearFecha(anterior)}.`
              : "Primer corte: no hay período anterior para comparar."
          }
          enlace={anterior ? enlaces.movimientos : undefined}
        />
      </div>

      <div className="dash-grid">
        <Panel className="span-2" eyebrow="TENDENCIA" titulo="Préstamos válidos por período">
          {serie.length < 2 ? (
            <p className="dash-empty">
              La evolución aparece cuando hay al menos dos cortes cargados hasta este período. Hoy hay {serie.length}.
            </p>
          ) : (
            <Grafico opcion={opcionTendencia} altura={260} />
          )}
        </Panel>

        <Panel eyebrow="COMPOSICIÓN" titulo="Saldo por macroactividad">
          <div className="donut-wrap">
            <div className="donut">
              <Grafico opcion={opcionDona} altura={200} formatoValor="monto" />
              <div className="donut-center">
                <strong>{formatearMontoCompacto(universo.saldo_universo_local_valido)}</strong>
                <small>Saldo total</small>
              </div>
            </div>
            <ul className="legend">
              {composicion.map((c, i) => (
                <li key={c.ranking}>
                  <span className="sw" style={{ background: PALETA[i % PALETA.length] }} />
                  <span>{nombreRanking(c.ranking)}</span>
                  <b>{formatearPorcentaje(c.participacion_pct, 2)}</b>
                </li>
              ))}
            </ul>
          </div>
        </Panel>

        <Panel
          className="span-2"
          eyebrow="ENTIDADES"
          titulo={`Saldo por banco · ${activo ? nombreRanking(activo.ranking) : ""}`}
          lectura="En ámbar, el líder de la actividad. Las cifras exactas están en Rankings."
          aside={
            <div className="chips" role="group" aria-label="Elegir ranking">
              {rankings.map((r) => (
                <button
                  key={r.ranking}
                  type="button"
                  className={`chip ${r.ranking === activo?.ranking ? "on" : ""}`}
                  aria-pressed={r.ranking === activo?.ranking}
                  onClick={() => setRanking(r.ranking)}
                >
                  {nombreRanking(r.ranking)}
                </button>
              ))}
            </div>
          }
        >
          <Grafico opcion={opcionBancos} altura={340} formatoValor="monto" />
        </Panel>

        <Panel
          eyebrow="CALIDAD"
          titulo="Registros descartados"
          lectura={calidad ? `De ${formatearEntero(leidas)} registros leídos (filtros en cascada E1–E4).` : undefined}
        >
          <ul className="quality-list">
            {exclusiones.map((e) => {
              const pct = leidas ? (Number(e.v) / leidas) * 100 : 0;
              return (
                <li key={e.k}>
                  <div className="q-head">
                    <span>
                      <b>{e.k}</b> {e.t}
                    </span>
                    <span>{formatearEntero(e.v)}</span>
                  </div>
                  <div className="q-bar">
                    <i style={{ width: `${Math.min(100, pct)}%` }} />
                  </div>
                </li>
              );
            })}
            {calidad && (
              <li className="q-total">
                <span>Universo local válido</span>
                <b>{formatearEntero(calidad.universo_local_valido)}</b>
              </li>
            )}
          </ul>
        </Panel>

        <Panel
          className="span-3"
          eyebrow="CONTROLES"
          titulo={`Verificaciones · ${recOk}/${reconciliaciones.length} cuadran`}
          aside={
            <Link className="recon-pie" href="/verificacion">
              Ver reconciliaciones →
            </Link>
          }
        >
          <ul className="recon">
            {reconciliaciones.map((r) => (
              <li key={r.reconciliacion} className={r.todas_cuadran ? "ok" : "fallo"}>
                <span>
                  {r.reconciliacion}. {r.descripcion} ({formatearEntero(r.cuadran)}/{formatearEntero(r.comprobaciones)})
                </span>
                <b aria-label={r.todas_cuadran ? "Cuadra" : "No cuadra"}>{r.todas_cuadran ? "✔" : "✖"}</b>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </div>
  );
}
