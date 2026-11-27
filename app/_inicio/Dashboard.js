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

// Paleta verde del equipo (primario, secundario 1 y secundario 2), alternando tonos para distinguir sectores.
const PALETA = ["#106003", "#7EAC39", "#297D5F", "#419A33", "#034E33", "#426B04", "#136749"];
const AZUL = "#106003";
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
        altura={64}
        opcion={{
          grid: { top: 10, right: 10, bottom: 4, left: 10, containLabel: false },
          tooltip: { trigger: "axis", confine: true, formatter: (p) => `${p[0].name}: ${formatearEntero(p[0].value)}` },
          xAxis: { type: "category", show: false, data: valores.map((_, i) => `Periodo ${i + 1}`) },
          yAxis: { type: "value", show: false, scale: true },
          series: [
            {
              type: "line",
              data: valores.map((v, i) => ({ value: v, symbolSize: i === ultimo ? 9 : 6, itemStyle: { color: i === ultimo ? color : "#ffffff", borderColor: color, borderWidth: 2 } })),
              smooth: true,
              symbol: "circle",
              showAllSymbol: true,
              lineStyle: { color, width: 2.5 },
              areaStyle: { color: { type: "linear", x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: `${color}59` }, { offset: 1, color: `${color}00` }] } },
              markLine: { silent: true, symbol: "none", label: { show: false }, lineStyle: { color: "#bfe5ba", type: "dashed" }, data: [{ type: "max" }] },
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

/**
 * Etiqueta compacta de gráfico en millones ("175.8 M", "50 M", "0"). Solo para ejes y
 * etiquetas de barras: se deriva de formatearMontoCompacto (exacto) sin los decimales ".00".
 */
function montoEnMillones(valor, decimales = 0) {
  if (valor === null || valor === undefined || valor === "") return "";
  if (Number(valor) === 0) return "0";
  const texto = formatearMontoCompacto(String(valor));
  if (!texto.endsWith(" millones")) return texto.replace(/\.00$/, "");
  // Redondeo aritmético exacto (BigInt) de centésimas de millón a `decimales` cifras.
  const crudo = texto.replace(" millones", "").replace(/,/g, "");
  const negativo = crudo.startsWith("-");
  const [entero, frac = "00"] = crudo.replace("-", "").split(".");
  const factor = 10n ** BigInt(2 - decimales);
  let unidades = BigInt(entero + frac.padEnd(2, "0")) / factor;
  if ((BigInt(entero + frac.padEnd(2, "0")) % factor) * 2n >= factor) unidades += 1n;
  const base = 10n ** BigInt(decimales);
  const ent = (unidades / base).toLocaleString("en-US");
  const dec = decimales > 0 ? (unidades % base).toString().padStart(decimales, "0") : "";
  const cifra = dec && !/^0+$/.test(dec) ? `${ent}.${dec}` : ent;
  return `${negativo ? "-" : ""}${cifra} M`;
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
    yAxis: { type: "value", name: "N° de préstamos", nameTextStyle: { color: "#698b64", fontSize: 11 }, splitLine: { lineStyle: { color: "#e5f2e3", type: "dashed" } } },
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
            n: { color: "#213b1e", fontSize: 12, fontWeight: 600, lineHeight: 16 },
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
        radius: ["62%", "90%"],
        center: ["50%", "50%"],
        padAngle: 2,
        label: { show: false },
        labelLine: { show: false },
        emphasis: { label: { show: false }, scale: false },
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
    grid: { top: 4, right: 96, left: 8, bottom: 4, containLabel: true },
    xAxis: { type: "value", splitNumber: 4, axisLabel: { hideOverlap: true, formatter: (v) => montoEnMillones(v) }, splitLine: { lineStyle: { color: "#e5f2e3", type: "dashed" } } },
    yAxis: { type: "category", inverse: true, data: filasActivo.map((f) => f.banco), axisLabel: { interval: 0 } },
    series: [
      {
        type: "bar",
        name: "Saldo",
        barCategoryGap: "22%",
        barWidth: 18,
        showBackground: true,
        backgroundStyle: { color: "#eef5ea", borderRadius: 8 },
        label: { show: true, position: "right", color: "#1f2937", fontSize: 12, fontWeight: 600, formatter: (p) => montoEnMillones(filasActivo[p.dataIndex]?.saldo_actividad, 1) },
        data: filasActivo.map((f) => ({
          value: aNumeroParaGrafico(f.saldo_actividad),
          itemStyle: { color: f.posicion === 1 ? AMBAR : AZUL, borderRadius: [0, 8, 8, 0] },
        })),
      },
    ],
  };

  const leidas = calidad?.filas_leidas ?? 0;
  // Total descartado por la cascada E1–E4 (conteos enteros; el detalle está en /calidad).
  const descartados = calidad
    ? [calidad.e1_duplicados, calidad.e2_destino_extranjero, calidad.e3_saldo_no_positivo, calidad.e4_actividad_no_catalogada].reduce(
        (t, v) => t + (Number(v) || 0),
        0,
      )
    : null;
  const recOk = reconciliaciones.filter((r) => r.todas_cuadran).length;
  const recTodas = recOk === reconciliaciones.length;
  // Total de la dona en dos líneas cortas para que quepa en el hueco central.
  const totalCompacto = formatearMontoCompacto(universo.saldo_universo_local_valido);
  const totalCifra = totalCompacto.replace(/ millones$/, "");
  const totalUnidad = totalCifra === totalCompacto ? "Saldo total" : "millones · total";

  return (
    <div className="dash">
      <div className="dash-head">
        <div>
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
          color="#7EAC39"
          detalle={`Exacto: ${formatearMonto(universo.saldo_universo_local_valido)}`}
        />
        <Kpi
          etiqueta="Bancos incluidos"
          valor={formatearEntero(numBancos)}
          color={AZUL}
          detalle={`Todos figuran en los ${formatearEntero(rankings.length)} rankings (saldo 0.00 si no tienen cartera).`}
          enlace={{ href: enlaces.rankings, texto: "Ver rankings" }}
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
              Se necesitan al menos dos cortes cargados. Hoy hay {serie.length}.
            </p>
          ) : (
            <Grafico opcion={opcionTendencia} altura={260} />
          )}
        </Panel>

        <Panel className="donut-panel" eyebrow="COMPOSICIÓN" titulo="Saldo por macroactividad">
          <div className="donut-wrap">
            <div className="donut">
              <Grafico opcion={opcionDona} altura={220} formatoValor="monto" />
              <div className="donut-center">
                <strong>{totalCifra}</strong>
                <small>{totalUnidad}</small>
              </div>
            </div>
            <ul className="legend">
              {composicion.map((c, i) => (
                <li key={c.ranking}>
                  <span className="sw" style={{ background: PALETA[i % PALETA.length] }} />
                  <span className="legend-nombre" title={nombreRanking(c.ranking)}>{nombreRanking(c.ranking)}</span>
                  <b>{formatearPorcentaje(c.participacion_pct, 2)}</b>
                </li>
              ))}
            </ul>
          </div>
        </Panel>

        <Panel
          className="span-3"
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
          <Grafico opcion={opcionBancos} altura={Math.max(300, filasActivo.length * 36)} formatoValor="monto" />
        </Panel>

      </div>

      <div className="dash-estado">
        {calidad && (
          <p>
            <span className="cifra">{formatearEntero(descartados)}</span> registros descartados de{" "}
            <span className="cifra">{formatearEntero(leidas)}</span> leídos.{" "}
            <Link href="/calidad">Ver calidad de datos →</Link>
          </p>
        )}
        {reconciliaciones.length > 0 && (
          <Link
            href="/verificacion"
            className={`dash-insignia ${recTodas ? "ok" : "alerta"}`}
            aria-label={`Reconciliaciones: ${recOk} de ${reconciliaciones.length} cuadran. Ver verificación`}
          >
            {recOk}/{reconciliaciones.length} cuadran
          </Link>
        )}
      </div>
    </div>
  );
}
