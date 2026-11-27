// Descarga en CSV de los datos de un banco en la actividad elegida.
// Usa solo datos que ya entrega la API (histórico por corte y desglose del período actual).

const escapar = (v) => {
  const t = String(v ?? "");
  return /[",;\r\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
};

const aTexto = (filas) => filas.map((f) => f.map(escapar).join(",")).join("\r\n");

const nombreArchivo = (codigo, actividad) =>
  `banco_${codigo}_${actividad.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, "_")}.csv`;

export function descargarBanco({ banco, codigo, actividad, ranking, historico, partes }) {
  const periodos = Object.keys(historico || {}).sort();
  const filas = [
    ["Banco", "Codigo_Banco", "Actividad", "Fecha", "Posicion", "Saldo_Actividad", "Total_Cartera_Local_Valida", "Ponderacion_Pct", "Operaciones_Validas"],
  ];
  for (const p of periodos) {
    const r = historico[p]?.rankings?.[ranking]?.find((x) => x.Codigo_Banco === codigo);
    if (!r) continue;
    filas.push([banco, codigo, actividad, p, r.Posicion, r.Saldo_Actividad, r.Total_Cartera_Local_Valida, r.Ponderacion_Pct, r.Operaciones_Validas]);
  }
  filas.push([]);
  filas.push(["Desglose por subactividad (período actual)"]);
  filas.push(["Subactividad", "Saldo"]);
  for (const p of partes) filas.push([p.nombre, Number(p.valor).toFixed(2)]);

  const blob = new Blob(["﻿" + aTexto(filas)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement("a");
  enlace.href = url;
  enlace.download = nombreArchivo(codigo, actividad);
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
  URL.revokeObjectURL(url);
}
