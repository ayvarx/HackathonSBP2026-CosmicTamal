// Etiquetas legibles de las columnas del reporte personalizado. Solo para la pantalla:
// el archivo exportado conserva los encabezados originales (Codigo_Banco, Saldo_Actividad…).
export const ETIQUETA_COLUMNA = {
  fecha: "Fecha",
  ranking: "Ranking",
  posicion: "Posición",
  codigo_banco: "Código de banco",
  banco: "Banco",
  saldo_actividad: "Saldo de la actividad",
  total_cartera_local_valida: "Cartera local válida",
  ponderacion_pct: "Ponderación %",
  operaciones_validas: "Operaciones válidas",
};

/** Etiqueta legible de un campo; si no hay, el encabezado original. */
export function etiquetaColumna(campo, encabezado) {
  return ETIQUETA_COLUMNA[campo] ?? encabezado ?? campo;
}
