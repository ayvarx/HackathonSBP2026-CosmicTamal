"use client";
// Grafico — Envoltorio de ECharts (echarts-for-react) con el tema de colores de la plataforma.
// ECharts necesita el navegador (canvas), por eso se carga sin SSR con next/dynamic y,
// mientras llega, se muestra un espacio del mismo alto (la página no "salta").
//
// IMPORTANTE (dinero): ECharts dibuja con números de JavaScript. Use aNumeroParaGrafico(texto)
// de lib/formato.js solo para el alto de barras/puntos. La cifra oficial siempre va en una
// TablaOrdenable junto al gráfico (además es la alternativa accesible al gráfico).
//
// Uso desde una página de servidor (la opción es un objeto serializable):
//   <Grafico
//     titulo="Saldo de CONSTRUCCION por banco · septiembre de 2026"
//     descripcion="Barras horizontales; el detalle exacto está en la tabla de abajo."
//     altura={420}
//     formatoValor="monto"
//     opcion={{
//       grid: { left: 140 },
//       xAxis: { type: "value" },
//       yAxis: { type: "category", data: nombresBancos, inverse: true },
//       series: [{ type: "bar", data: saldos.map(aNumeroParaGrafico) }],
//     }} />
//
// Props:
//   opcion       Objeto de opciones de ECharts (https://echarts.apache.org/es/option.html).
//   titulo       (string) Título visible sobre el gráfico y nombre accesible (aria-label).
//   descripcion  (string) opcional  Explicación breve (también para lectores de pantalla).
//   altura       (number px | string CSS) Predeterminado 360.
//   formatoValor ("monto" | "porcentaje" | "entero") opcional  Formatea el tooltip y el eje de valores
//                si la opción no trae sus propios formateadores.
//   eventos      opcional  { click: (params) => ... } — SOLO desde otro componente cliente.
import dynamic from "next/dynamic";

// Paleta de series: solo verdes de la marca (orden fijo). El ámbar COLOR_RESALTADO se reserva
// para resaltar el líder o un banco elegido.
export const COLORES_GRAFICO = ["#106003", "#7EAC39", "#297D5F", "#419A33", "#136749", "#608D1A", "#034E33", "#426B04"];
export const COLOR_RESALTADO = "#f5a524";

// Tema sobrio: ejes y rejilla discretos, texto con los colores de la interfaz.
const TEMA_SBP = {
  color: COLORES_GRAFICO,
  backgroundColor: "transparent",
  textStyle: { fontFamily: 'Inter, "Segoe UI", system-ui, -apple-system, "Helvetica Neue", Roboto, Arial, sans-serif', color: "#122a0f" },
  title: { textStyle: { color: "#122a0f", fontWeight: 700, fontSize: 14 }, subtextStyle: { color: "#375533" } },
  legend: { top: 0, textStyle: { color: "#375533" }, icon: "roundRect", itemWidth: 12, itemHeight: 12 },
  tooltip: {
    confine: true,
    backgroundColor: "#ffffff",
    borderColor: "#d9e9d7",
    borderWidth: 1,
    textStyle: { color: "#122a0f", fontSize: 13 },
    extraCssText: "box-shadow: 0 12px 30px -12px rgba(18, 42, 15,0.25); border-radius: 10px;",
  },
  categoryAxis: {
    axisLine: { lineStyle: { color: "#bfe5ba" } },
    axisTick: { show: false },
    axisLabel: { color: "#375533" },
    splitLine: { show: false },
  },
  valueAxis: {
    axisLine: { show: false },
    axisTick: { show: false },
    axisLabel: { color: "#375533" },
    splitLine: { lineStyle: { color: "#e7f3e5" } },
  },
  bar: { itemStyle: { borderRadius: 4 }, barMaxWidth: 28 },
  line: { symbolSize: 8, lineStyle: { width: 2 } },
};

let temaRegistrado = false;

// Carga perezosa: echarts (~1 MB) solo se descarga en las pantallas que tienen gráficos.
const ReactECharts = dynamic(
  async () => {
    const [{ default: Componente }, echarts] = await Promise.all([import("echarts-for-react"), import("echarts")]);
    if (!temaRegistrado) {
      echarts.registerTheme("sbp", TEMA_SBP);
      temaRegistrado = true;
    }
    return Componente;
  },
  { ssr: false, loading: () => <EspacioCargando /> }
);

function EspacioCargando() {
  return (
    <div className="flex h-full min-h-[inherit] items-center justify-center text-sm text-texto-tenue">
      Cargando gráfico…
    </div>
  );
}

// Formateadores de presentación (los datos del gráfico ya son números de JS).
const formatoDosDecimales = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const formatoEntero = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

function formatearValorTooltip(tipo, valor) {
  if (typeof valor !== "number" || Number.isNaN(valor)) return valor ?? "—";
  if (tipo === "monto") return formatoDosDecimales.format(valor);
  if (tipo === "porcentaje") return `${valor.toFixed(4)} %`;
  if (tipo === "entero") return formatoEntero.format(valor);
  return String(valor);
}

/** Eje abreviado en español de Panamá: 1,500,000 → "1.5 M"; 2,000,000,000 → "2,000 M". */
function formatearValorEje(tipo, valor) {
  if (tipo === "porcentaje") return `${valor} %`;
  const absoluto = Math.abs(valor);
  if (absoluto >= 1e6) {
    const millones = valor / 1e6;
    return `${absoluto >= 1e7 ? formatoEntero.format(millones) : millones.toFixed(1)} M`;
  }
  if (absoluto >= 1e3) return `${formatoEntero.format(valor / 1e3)} mil`;
  return formatoEntero.format(valor);
}

/** Agrega formateadores a ejes de valor y tooltip si la opción no los trae. */
function aplicarFormato(opcion, tipo) {
  if (!tipo || !opcion) return opcion;
  const conFormatoEje = (eje) => {
    if (!eje) return eje;
    if (Array.isArray(eje)) return eje.map(conFormatoEje);
    if (eje.type !== "value" || eje.axisLabel?.formatter) return eje;
    return { ...eje, axisLabel: { ...eje.axisLabel, formatter: (v) => formatearValorEje(tipo, v) } };
  };
  const tooltip = opcion.tooltip ?? {};
  return {
    ...opcion,
    xAxis: conFormatoEje(opcion.xAxis),
    yAxis: conFormatoEje(opcion.yAxis),
    tooltip: tooltip.valueFormatter || tooltip.formatter ? tooltip : { ...tooltip, valueFormatter: (v) => formatearValorTooltip(tipo, v) },
  };
}

/** Barras con el mismo radio en todo el gráfico; en series apiladas, sin esquinas redondeadas. */
function ajustarSeries(opcion) {
  if (!opcion || !Array.isArray(opcion.series)) return opcion;
  const ejeY = Array.isArray(opcion.yAxis) ? opcion.yAxis[0] : opcion.yAxis;
  const horizontal = ejeY?.type === "category";
  return {
    ...opcion,
    series: opcion.series.map((serie) => {
      if (serie?.type !== "bar") return serie;
      const radio = serie.stack ? 0 : horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0];
      return { ...serie, itemStyle: { ...serie.itemStyle, borderRadius: radio } };
    }),
  };
}

/** Ejes de valor con cifras compactas ("50 M") cuando la página no indica un formato. */
function ejesCompactos(opcion) {
  if (!opcion) return opcion;
  const compacto = (v) => {
    if (typeof v !== "number") return v;
    const absoluto = Math.abs(v);
    if (absoluto >= 1e6) return formatearValorEje("monto", v);
    if (absoluto >= 1e3) return formatoEntero.format(v);
    return String(v);
  };
  const conEje = (eje) => {
    if (!eje) return eje;
    if (Array.isArray(eje)) return eje.map(conEje);
    if (eje.type !== "value" || eje.axisLabel?.formatter) return eje;
    return { ...eje, axisLabel: { ...eje.axisLabel, formatter: compacto } };
  };
  return { ...opcion, xAxis: conEje(opcion.xAxis), yAxis: conEje(opcion.yAxis) };
}

export default function Grafico({ opcion, titulo, descripcion, altura = 360, formatoValor, eventos }) {
  const alto = typeof altura === "number" ? `${altura}px` : altura;
  // Valores por defecto: tooltip al pasar sobre cada categoría y márgenes ajustados.
  // Lo que traiga `opcion` siempre tiene prioridad.
  const base = ajustarSeries({
    tooltip: { trigger: "axis", axisPointer: { type: "shadow", shadowStyle: { color: "rgba(40, 127, 29, 0.07)" } } },
    ...opcion,
  });
  // Tooltip siempre dentro del gráfico y con fondo opaco; leyenda arriba.
  if (base.tooltip && !Array.isArray(base.tooltip)) base.tooltip = { confine: true, backgroundColor: "#ffffff", ...base.tooltip };
  if (base.legend && !Array.isArray(base.legend)) {
    base.legend = { ...base.legend };
    delete base.legend.bottom;
    if (typeof base.legend.top !== "number" && base.legend.top !== "top") base.legend.top = 0;
  }
  if (!Array.isArray(base.grid)) {
    base.grid = { top: base.legend ? 40 : 24, right: 24, bottom: 32, ...base.grid };
    // Con la leyenda arriba, deja sitio para que no tape el área del gráfico.
    if (base.legend && typeof base.grid.top === "number" && base.grid.top < 36) base.grid.top = 40;
  }
  const opcionFinal = formatoValor ? aplicarFormato(base, formatoValor) : ejesCompactos(base);

  return (
    <figure className="tarjeta">
      {(titulo || descripcion) && (
        <figcaption className="mb-2">
          {titulo && <span className="block text-sm font-semibold text-texto">{titulo}</span>}
          {descripcion && <span className="block text-xs text-texto-tenue">{descripcion}</span>}
        </figcaption>
      )}
      <div style={{ height: alto, minHeight: alto }} role="img" aria-label={descripcion ? `${titulo}. ${descripcion}` : titulo}>
        <ReactECharts
          option={opcionFinal}
          theme="sbp"
          notMerge
          lazyUpdate
          style={{ height: "100%", width: "100%" }}
          opts={{ renderer: "canvas" }}
          onEvents={eventos}
        />
      </div>
    </figure>
  );
}
