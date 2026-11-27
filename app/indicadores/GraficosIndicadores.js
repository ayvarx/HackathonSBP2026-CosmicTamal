"use client";
// Gráficos de la pantalla de indicadores. Son componentes de cliente porque los
// formateadores del tooltip son funciones (no pueden viajar desde el servidor).
// Los gráficos solo DIBUJAN: la cifra exacta está en la tabla ("Ver como tabla").
import Grafico, { COLORES_GRAFICO, COLOR_RESALTADO } from "@/components/Grafico";
import { aNumeroParaGrafico, formatearMonto, formatearPorcentaje, nombreRanking } from "@/lib/formato";

const n = (texto) => aNumeroParaGrafico(texto) ?? 0;

// Un color fijo por macroactividad para que el mismo color signifique lo mismo en todos los gráficos.
const COLOR_MACRO = Object.fromEntries(
  ["HIPOTECARIO", "CONSTRUCCION", "INDUSTRIA", "AGROPECUARIO", "COMERCIO", "CONSUMO"].map((m, i) => [m, COLORES_GRAFICO[i]])
);

/** Barras horizontales del % del saldo con mora (> 0 días) por banco, con el banco elegido resaltado. */
export function BarrasMorosidad({ filas, bancoElegido }) {
  const ordenadas = [...filas].sort((a, b) => n(b.mora_pct) - n(a.mora_pct));
  const opcion = {
    grid: { left: 130, right: 24, top: 8, bottom: 28 },
    xAxis: { type: "value" },
    yAxis: { type: "category", data: ordenadas.map((f) => f.banco), inverse: true },
    series: [{
      type: "bar",
      data: ordenadas.map((f) => ({
        value: n(f.mora_pct),
        itemStyle: { color: f.codigo_banco === bancoElegido ? COLOR_RESALTADO : COLORES_GRAFICO[0] },
      })),
    }],
  };
  return (
    <Grafico
      titulo="Saldo con mora (> 0 días) por banco, % del saldo"
      altura={Math.max(300, ordenadas.length * 28 + 50)}
      formatoValor="porcentaje"
      opcion={opcion}
    />
  );
}

/** Líneas del % del saldo con mora (> 0 y > 90 días) a lo largo de los períodos cargados. */
export function LineaMorosidad({ puntos }) {
  // puntos: [{etiqueta, mora_pct, mora_90_pct}]
  const etiqueta = { show: true, formatter: (p) => `${p.value.toFixed(2)} %`, position: "top" };
  const opcion = {
    legend: { top: 0 },
    grid: { left: 56, right: 24, top: 48, bottom: 28 },
    xAxis: { type: "category", data: puntos.map((p) => p.etiqueta) },
    yAxis: { type: "value" },
    series: [
      { name: "Saldo con mora (> 0 días)", type: "line", itemStyle: { color: "#106003" }, lineStyle: { color: "#106003" }, data: puntos.map((p) => n(p.mora_pct)), label: etiqueta },
      { name: "Saldo con mora mayor a 90 días", type: "line", itemStyle: { color: "#7EAC39" }, lineStyle: { color: "#7EAC39" }, data: puntos.map((p) => n(p.mora_90_pct)), label: etiqueta },
    ],
  };
  return (
    <Grafico
      titulo="Evolución del saldo con mora"
      altura={280}
      formatoValor="porcentaje"
      opcion={opcion}
    />
  );
}

/** Escalera de vencimientos: 16 tramos de plazo (por vencer en verde, vencido en ámbar). */
export function EscaleraTramos({ tramos }) {
  const opcion = {
    grid: { left: 64, right: 16, top: 16, bottom: 100 },
    xAxis: { type: "category", data: tramos.map((t) => t.etiqueta), axisLabel: { rotate: 40, interval: 0 } },
    yAxis: { type: "value" },
    series: [{
      type: "bar",
      data: tramos.map((t) => ({
        value: n(t.monto),
        itemStyle: { color: t.tipo === "Vencido" ? COLOR_RESALTADO : COLORES_GRAFICO[0], borderRadius: [3, 3, 0, 0] },
      })),
    }],
  };
  return (
    <Grafico
      titulo="Escalera de vencimientos del saldo"
      descripcion="Verde: por vencer. Ámbar: vencido."
      altura={380}
      formatoValor="monto"
      opcion={opcion}
    />
  );
}

/** Barras apiladas al 100 %: cómo se reparte el saldo de cada banco por plazo y mora. */
export function BarrasApiladasVencimientos({ filas }) {
  const bloques = [
    { clave: "hasta_1a", nombre: "Por vencer hasta 1 año", color: "#106003" },
    { clave: "de_1_a_5a", nombre: "Por vencer de 1 a 5 años", color: "#7EAC39" },
    { clave: "mas_5a", nombre: "Por vencer a más de 5 años", color: "#052200" },
    { clave: "vencido_hasta_90", nombre: "Vencido hasta 90 días", color: "#f5a524" },
    { clave: "vencido_mas_90", nombre: "Vencido a más de 90 días", color: "#b42318" },
  ];
  const opcion = {
    legend: { top: 0 },
    grid: { left: 130, right: 24, top: 40, bottom: 28 },
    xAxis: { type: "value", max: 100 },
    yAxis: { type: "category", data: filas.map((f) => f.banco), inverse: true },
    series: bloques.map((b) => ({
      name: b.nombre, type: "bar", stack: "total", itemStyle: { color: b.color, borderRadius: 0 },
      data: filas.map((f) => n(f[b.clave])),
    })),
  };
  return (
    <Grafico
      titulo="Perfil de vencimiento de cada banco (% de su saldo)"
      altura={Math.max(340, filas.length * 30 + 90)}
      formatoValor="porcentaje"
      opcion={opcion}
    />
  );
}
