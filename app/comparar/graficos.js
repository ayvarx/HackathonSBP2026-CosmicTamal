// app/comparar/graficos.js — Arma las opciones de ECharts de la pantalla Comparar.
//
// Se ejecuta en el servidor y devuelve objetos SERIALIZABLES (sin funciones) para el
// componente cliente <Grafico>. Los formateadores de ECharts van como plantillas de texto
// ("{a}", "{value}") o como texto ya formateado.
//
// Dinero: ECharts dibuja con números de JavaScript, así que aNumeroParaGrafico se usa SOLO
// para el alto de barras y puntos. Las etiquetas muestran el texto exacto del motor
// (formatearMonto) y cada gráfico va acompañado de una tabla con las cifras oficiales.

import { aNumeroParaGrafico, formatearFecha, nombreRanking } from "@/lib/formato";
import { montoCompacto } from "./explicacion";

// Misma paleta que components/Grafico.js (COLORES_GRAFICO). Se copia porque un componente
// de servidor no puede leer constantes exportadas por un módulo "use client".
export const COLORES = ["#094000", "#419A33", "#7EAC39", "#297D5F", "#106003", "#608D1A", "#136749", "#267F18"];
const GRIS = "#9db29a";
const TOTAL = "#094000";
const VERDE_SUBE = "#419A33";
const ROJO_BAJA = "#b42318";

/** Color del banco según su lugar en la lista de bancos comparados (mismo color en todos los gráficos). */
export function colorBanco(codigo, resaltados, indiceGeneral) {
  const i = resaltados.indexOf(codigo);
  if (i >= 0) return COLORES[i % COLORES.length];
  return resaltados.length ? GRIS : COLORES[indiceGeneral % COLORES.length];
}

/**
 * Gráfico de posiciones por mes ("bump chart"): una línea por banco y el eje vertical
 * invertido para que la 1.ª posición quede arriba.
 * @param {{fechas: string[], filas: {fecha: string, codigo_banco: string, banco: string, posicion: number}[],
 *          resaltados: string[], anterior: string, actual: string}} datos
 */
export function opcionPosiciones({ fechas, filas, resaltados = [], anterior, actual }) {
  const ultimaFecha = fechas.at(-1);
  // Bancos ordenados por su posición en el último corte (así la leyenda sigue el ranking).
  const bancos = filas
    .filter((f) => f.fecha === ultimaFecha)
    .sort((a, b) => a.posicion - b.posicion)
    .map((f) => ({ codigo: f.codigo_banco, nombre: f.banco }));
  const posicion = new Map(filas.map((f) => [`${f.fecha}|${f.codigo_banco}`, f.posicion]));
  const etiquetas = fechas.map((f) => formatearFecha(f, "corta"));

  const series = bancos.map((b, i) => {
    const destacado = resaltados.length === 0 || resaltados.includes(b.codigo);
    // Con 12 bancos y 8 colores, del 9.º en adelante la línea es punteada para distinguirla.
    const punteada = resaltados.length === 0 && i >= COLORES.length;
    return {
      name: `${b.nombre} (${b.codigo})`,
      type: "line",
      data: fechas.map((f) => posicion.get(`${f}|${b.codigo}`) ?? null),
      color: colorBanco(b.codigo, resaltados, i),
      symbolSize: destacado ? 9 : 6,
      z: destacado ? 3 : 1,
      lineStyle: { width: destacado ? 3 : 1.5, type: punteada ? "dashed" : "solid", opacity: destacado ? 1 : 0.6 },
      itemStyle: { opacity: destacado ? 1 : 0.6 },
      endLabel: {
        show: true,
        formatter: "{a}",
        distance: 8,
        fontSize: 11,
        color: destacado ? "#192b17" : "#62785f",
        fontWeight: destacado ? 600 : 400,
      },
      emphasis: { focus: "series" },
    };
  });

  // Sombrea el tramo entre los dos períodos que se están comparando.
  if (series.length && anterior && actual) {
    series[0].markArea = {
      silent: true,
      itemStyle: { color: "rgba(23, 102, 13, 0.07)" },
      label: { show: false },
      data: [[{ xAxis: formatearFecha(anterior, "corta") }, { xAxis: formatearFecha(actual, "corta") }]],
    };
  }

  return {
    tooltip: { trigger: "item", confine: true, formatter: "{a}<br/>{b}: posición {c}" },
    grid: { left: 56, right: 200, top: 28, bottom: 36 },
    xAxis: { type: "category", data: etiquetas, boundaryGap: false },
    yAxis: {
      type: "value",
      inverse: true,
      min: 1,
      max: Math.max(1, bancos.length),
      interval: 1,
      name: "Posición",
      nameLocation: "start",
      axisLabel: { formatter: "{value}.ª" },
    },
    series,
  };
}

/**
 * Gráfico en cascada de la variación de saldo de UN banco en UN ranking:
 *   saldo anterior → + préstamos nuevos → − préstamos que salieron → ± los que continúan → saldo actual.
 * Se arma con dos series apiladas: una "base" invisible que levanta cada barra y la barra visible.
 * @param {{m: object, d: object}} datos  m = fila de movimientos(); d = fila de descomposicion().
 */
export function opcionCascada({ m, d }) {
  const anterior = aNumeroParaGrafico(m.saldo_anterior);
  const nuevos = aNumeroParaGrafico(d.saldo_nuevos);
  const salidos = aNumeroParaGrafico(d.saldo_salidos); // negativo o cero
  const continuan = aNumeroParaGrafico(d.variacion_continuan);
  const actual = aNumeroParaGrafico(m.saldo_actual);
  const trasNuevos = anterior + nuevos;
  const trasSalidos = trasNuevos + salidos;

  const pasos = [
    { nombre: "Saldo anterior", base: 0, alto: anterior, color: TOTAL, texto: montoCompacto(m.saldo_anterior, { signo: false }), detalle: formatearFecha(m.fecha_anterior) },
    { nombre: "Préstamos nuevos", base: anterior, alto: nuevos, color: VERDE_SUBE, texto: montoCompacto(d.saldo_nuevos), detalle: `${d.prestamos_nuevos} préstamos` },
    { nombre: "Préstamos que salieron", base: trasSalidos, alto: -salidos, color: ROJO_BAJA, texto: montoCompacto(d.saldo_salidos), detalle: `${d.prestamos_salidos} préstamos` },
    {
      nombre: "Préstamos que continúan",
      base: continuan >= 0 ? trasSalidos : trasSalidos + continuan,
      alto: Math.abs(continuan),
      color: continuan >= 0 ? VERDE_SUBE : ROJO_BAJA,
      texto: montoCompacto(d.variacion_continuan),
      detalle: `${d.prestamos_continuan} préstamos`,
    },
    { nombre: "Saldo actual", base: 0, alto: actual, color: TOTAL, texto: montoCompacto(m.saldo_actual, { signo: false }), detalle: formatearFecha(m.fecha_actual) },
  ];

  // El eje no empieza en cero: si no, las variaciones (≈10 % del saldo) casi no se verían.
  const nivelMinimo = Math.min(anterior, trasNuevos, trasSalidos, trasSalidos + Math.min(continuan, 0), actual);
  // Se redondea hacia abajo a una cifra "limpia" (p. ej. 121.4 M → 120 M) para que el eje se lea bien.
  const bajo = nivelMinimo * 0.85;
  const paso = bajo > 0 ? 10 ** (Math.floor(Math.log10(bajo)) - 1) : 1;
  const ejeMinimo = nivelMinimo > 1e6 ? Math.floor(bajo / paso) * paso : 0;

  return {
    tooltip: { trigger: "item", confine: true },
    grid: { left: 72, right: 24, top: 36, bottom: 48 },
    xAxis: { type: "category", data: pasos.map((p) => p.nombre), axisLabel: { interval: 0, width: 110, overflow: "break" } },
    yAxis: { type: "value", min: ejeMinimo },
    series: [
      {
        name: "Base",
        type: "bar",
        stack: "cascada",
        silent: true,
        itemStyle: { color: "transparent", borderColor: "transparent" },
        emphasis: { disabled: true },
        tooltip: { show: false },
        data: pasos.map((p) => p.base),
      },
      {
        name: "Variación",
        type: "bar",
        stack: "cascada",
        barMaxWidth: 72,
        data: pasos.map((p) => ({
          value: p.alto,
          itemStyle: { color: p.color, borderRadius: [3, 3, 0, 0] },
          label: { show: true, position: "top", formatter: p.texto, fontSize: 11, color: "#192b17" },
          tooltip: { formatter: `${p.nombre}<br/>${p.texto} · ${p.detalle}` },
        })),
      },
    ],
  };
}

/**
 * Barras agrupadas: saldo actual de los bancos elegidos en cada uno de los 6 rankings.
 * @param {{bancos: {codigo: string, nombre: string}[], ordenRankings: string[],
 *          movimientos: object[]}} datos  movimientos = filas de movimientos() del par de períodos.
 */
export function opcionEntidades({ bancos, ordenRankings, movimientos }) {
  const saldo = new Map(movimientos.map((m) => [`${m.ranking}|${m.codigo_banco}`, m.saldo_actual]));
  return {
    legend: { top: 0 },
    tooltip: { trigger: "axis", confine: true, axisPointer: { type: "shadow" } },
    grid: { left: 64, right: 16, top: 40, bottom: 32 },
    xAxis: { type: "category", data: ordenRankings.map(nombreRanking) },
    yAxis: { type: "value" },
    series: bancos.map((b, i) => ({
      name: `${b.nombre} (${b.codigo})`,
      type: "bar",
      color: COLORES[i % COLORES.length],
      barMaxWidth: 28,
      itemStyle: { borderRadius: [3, 3, 0, 0] },
      data: ordenRankings.map((r) => aNumeroParaGrafico(saldo.get(`${r}|${b.codigo}`) ?? "0")),
    })),
  };
}
