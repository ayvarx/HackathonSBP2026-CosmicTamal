// ReglaAplicada — Regla de "movimiento significativo" en una línea con los parámetros vigentes.
// Los valores salen de la tabla `parametros` (los cambia el Administrador). Componente de servidor.

// Mismos valores por defecto que usa movimientos() en lib/consultas.js si falta un parámetro.
const PREDETERMINADOS = { min_cambio_posicion: "2", marcar_cambio_lider: "si", min_var_saldo_pct: "20" };

export default function ReglaAplicada({ parametros = [] }) {
  const porClave = Object.fromEntries(parametros.map((p) => [p.clave, p]));
  const valor = (clave) => porClave[clave]?.valor ?? PREDETERMINADOS[clave];
  const fichas = [
    `±${valor("min_cambio_posicion")} posiciones`,
    ...(valor("marcar_cambio_lider") === "si" ? ["Cambio de líder"] : []),
    `Saldo ±${valor("min_var_saldo_pct")} %`,
    "Saldo nuevo",
  ];
  return (
    <p className="flex flex-wrap items-center gap-2 text-sm">
      <span className="font-semibold text-texto-suave">Significativo si cumple una:</span>
      {fichas.map((f) => (
        <span key={f} className="etiqueta">
          {f}
        </span>
      ))}
    </p>
  );
}
