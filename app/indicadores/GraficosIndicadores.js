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

/** Mapa de calor: ponderación (%) de cada banco en cada macroactividad. */
export function MapaCalor({ celdas, rankings, bancos }) {
  // celdas: [{codigo_banco, banco, ranking, saldo, ponderacion_pct}] con textos exactos.
  const datos = celdas.map((c) => ({
    value: [rankings.indexOf(c.ranking), bancos.indexOf(c.banco), n(c.ponderacion_pct)],
    texto: c,
  }));
  const maximo = Math.max(1, ...datos.map((d) => d.value[2]));
  const opcion = {
    tooltip: {
      trigger: "item",
      formatter: (p) =>
        `<strong>${p.data.texto.banco}</strong> · ${nombreRanking(p.data.texto.ranking)}<br/>` +
        `Ponderación: ${formatearPorcentaje(p.data.texto.ponderacion_pct)}<br/>` +
        `Saldo: ${formatearMonto(p.data.texto.saldo)}`,
    },
    grid: { left: 130, right: 16, top: 8, bottom: 70 },
    xAxis: { type: "category", data: rankings.map(nombreRanking), splitArea: { show: true }, axisLabel: { interval: 0 } },
    yAxis: { type: "category", data: bancos, inverse: true, splitArea: { show: true } },
    visualMap: {
      min: 0, max: maximo, calculable: false, orient: "horizontal", left: "center", bottom: 4,
      text: ["Mayor ponderación", "Menor"], inRange: { color: ["#eef8ec", "#a0d898", "#17660d"] },
    },
    series: [{
      type: "heatmap",
      data: datos.map((d) => ({
        ...d,
        label: { show: true, formatter: () => d.value[2].toFixed(1), color: d.value[2] > maximo * 0.55 ? "#ffffff" : "#192b17" },
      })),
      itemStyle: { borderColor: "#ffffff", borderWidth: 2 },
    }],
  };
  return (
    <Grafico
      titulo="Mapa de calor: ponderación de cada banco por actividad"
      descripcion="Cada celda es el % de la cartera local válida del banco que está en esa actividad (el número es el %, redondeado a 1 decimal). Más oscuro = mayor peso."
      altura={Math.max(360, bancos.length * 34 + 110)}
      opcion={opcion}
    />
  );
}

/** Treemap de la cartera: por banco y actividad (todos los bancos) o solo por actividad (un banco). */
export function MapaArbol({ filas, bancoElegido }) {
  // filas: [{banco, ranking, saldo}] con saldo como texto.
  const hoja = (f) => ({
    name: nombreRanking(f.ranking), value: n(f.saldo), saldoTexto: f.saldo, banco: f.banco,
    itemStyle: { color: COLOR_MACRO[f.ranking] },
  });
  const positivas = filas.filter((f) => n(f.saldo) > 0);
  let datos;
  if (bancoElegido) {
    datos = positivas.map(hoja);
  } else {
    const porBanco = new Map();
    for (const f of positivas) {
      if (!porBanco.has(f.banco)) porBanco.set(f.banco, []);
      porBanco.get(f.banco).push(hoja(f));
    }
    datos = [...porBanco].map(([banco, hijos]) => ({ name: banco, children: hijos }));
  }
  const opcion = {
    tooltip: {
      trigger: "item",
      formatter: (p) =>
        p.data.saldoTexto
          ? `<strong>${p.data.banco}</strong> · ${p.name}<br/>Saldo: ${formatearMonto(p.data.saldoTexto)}`
          : p.name,
    },
    series: [{
      type: "treemap", data: datos, roam: false, nodeClick: false, breadcrumb: { show: false },
      width: "100%", height: "100%", top: 0, bottom: 0, left: 0, right: 0,
      label: { show: true, color: "#ffffff", fontSize: 12, overflow: "truncate" },
      upperLabel: { show: !bancoElegido, height: 20, color: "#192b17", fontWeight: 600 },
      itemStyle: { borderColor: "#ffffff", borderWidth: 2, gapWidth: 2 },
      levels: bancoElegido
        ? [{ itemStyle: { borderWidth: 0, gapWidth: 2 } }]
        : [{ itemStyle: { borderColor: "#e4ede3", borderWidth: 2, gapWidth: 3, color: "#f4f8f4" } }, { itemStyle: { gapWidth: 1 } }],
    }],
  };
  return (
    <Grafico
      titulo={bancoElegido ? "Treemap de la cartera del banco por actividad" : "Treemap de la cartera por banco y actividad"}
      descripcion="El área de cada rectángulo es proporcional al saldo. El color identifica la actividad económica."
      altura={460}
      opcion={opcion}
    />
  );
}

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
      descripcion="Ordenado de mayor a menor."
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
    legend: { bottom: 0 },
    grid: { left: 56, right: 24, top: 24, bottom: 48 },
    xAxis: { type: "category", data: puntos.map((p) => p.etiqueta) },
    yAxis: { type: "value" },
    series: [
      { name: "Saldo con mora (> 0 días)", type: "line", data: puntos.map((p) => n(p.mora_pct)), label: etiqueta },
      { name: "Saldo con mora mayor a 90 días", type: "line", data: puntos.map((p) => n(p.mora_90_pct)), label: etiqueta },
    ],
  };
  return (
    <Grafico
      titulo="Evolución del saldo con mora"
      descripcion="Saldo de los préstamos con mora sobre el saldo total en cada corte cargado."
      altura={280}
      formatoValor="porcentaje"
      opcion={opcion}
    />
  );
}

/** Escalera de vencimientos: 16 tramos de plazo (por vencer en azul, vencido en naranja). */
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
      descripcion="Azul: capital por vencer según el plazo restante. Naranja: capital vencido según los días de atraso."
      altura={380}
      formatoValor="monto"
      opcion={opcion}
    />
  );
}

/** Barras apiladas al 100 %: cómo se reparte el saldo de cada banco por plazo y mora. */
export function BarrasApiladasVencimientos({ filas }) {
  const bloques = [
    { clave: "hasta_1a", nombre: "Por vencer hasta 1 año", color: "#30b01f" },
    { clave: "de_1_a_5a", nombre: "Por vencer de 1 a 5 años", color: "#94d38c" },
    { clave: "mas_5a", nombre: "Por vencer a más de 5 años", color: "#17660d" },
    { clave: "vencido_hasta_90", nombre: "Vencido hasta 90 días", color: "#d99a00" },
    { clave: "vencido_mas_90", nombre: "Vencido a más de 90 días", color: "#c93f3e" },
  ];
  const opcion = {
    legend: { bottom: 0 },
    grid: { left: 130, right: 24, top: 8, bottom: 56 },
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
      descripcion="Cada barra suma 100 % del saldo del banco, dividido por plazo restante y por mora."
      altura={Math.max(340, filas.length * 30 + 90)}
      formatoValor="porcentaje"
      opcion={opcion}
    />
  );
}
