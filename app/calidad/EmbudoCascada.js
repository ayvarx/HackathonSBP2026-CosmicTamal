// EmbudoCascada — Cascada E1→E4 de un período con la identidad comprobada:
//   filas leídas = E1 + E2 + E3 + E4 + universo local válido.
// Servidor y cliente. Solo se suman conteos enteros (no hay dinero en esta cuenta).
import { formatearEntero, formatearMonto } from "@/lib/formato";
import { FILTROS } from "@/lib/consultas";

const AYUDA = {
  E1: "Mismo Numero_Prestamo repetido dentro del período: se conserva la primera aparición.",
  E2: "Destino distinto de L (crédito destinado al extranjero).",
  E3: "Saldo cero o negativo.",
  E4: "Tipo_Actividad que no existe en el catálogo CINU/SB109.",
};

export default function EmbudoCascada({ q }) {
  const excluidas = [q.e1_duplicados, q.e2_destino_extranjero, q.e3_saldo_no_positivo, q.e4_actividad_no_catalogada];
  const suma = excluidas.reduce((a, b) => a + b, 0) + q.universo_local_valido;
  const cuadra = suma === q.filas_leidas;
  // Etapas: lo que queda después de aplicar cada filtro (la cascada es ordenada).
  const pasos = FILTROS.map((f, i) => ({
    ...f,
    excluidas: excluidas[i],
    quedan: q.filas_leidas - excluidas.slice(0, i + 1).reduce((a, b) => a + b, 0),
  }));
  const ancho = (n) => `${q.filas_leidas ? Math.max(1, Math.round((n * 100) / q.filas_leidas)) : 0}%`;

  return (
    <div className="tarjeta">
      <ol className="space-y-3">
        <li>
          <div className="flex justify-between gap-2 text-sm">
            <span className="font-medium">Filas leídas del archivo</span>
            <span className="tabular-nums font-semibold">{formatearEntero(q.filas_leidas)}</span>
          </div>
          <div className="mt-1 h-3 rounded bg-primario" style={{ width: "100%" }} aria-hidden="true" />
        </li>
        {pasos.map((p) => (
          <li key={p.clave}>
            <div className="flex justify-between gap-2 text-sm">
              <span title={AYUDA[p.clave]}>
                <span className="codigo font-semibold">{p.clave}</span> {p.nombre}: se excluyen
              </span>
              <span className="tabular-nums">
                −{formatearEntero(p.excluidas)} <span className="text-texto-suave">(quedan {formatearEntero(p.quedan)})</span>
              </span>
            </div>
            <div className="mt-1 h-3 rounded bg-primario/60" style={{ width: ancho(p.quedan) }} aria-hidden="true" />
            <p className="mt-0.5 text-xs text-texto-suave">{AYUDA[p.clave]}</p>
          </li>
        ))}
        <li>
          <div className="flex justify-between gap-2 text-sm">
            <span className="font-medium">Universo local válido</span>
            <span className="tabular-nums font-semibold">{formatearEntero(q.universo_local_valido)}</span>
          </div>
          <div className="mt-1 h-3 rounded bg-primario" style={{ width: ancho(q.universo_local_valido) }} aria-hidden="true" />
          <p className="mt-0.5 text-xs text-texto-suave">Saldo del universo: {formatearMonto(q.saldo_universo_local_valido)}</p>
        </li>
      </ol>
      <p className={`mt-4 rounded border p-3 text-sm ${cuadra ? "border-borde" : "border-red-700"}`} role="status">
        <strong>{cuadra ? "La cascada cuadra." : "La cascada NO cuadra."}</strong>{" "}
        Leídas {formatearEntero(q.filas_leidas)} = E1 {formatearEntero(q.e1_duplicados)} + E2 {formatearEntero(q.e2_destino_extranjero)} + E3{" "}
        {formatearEntero(q.e3_saldo_no_positivo)} + E4 {formatearEntero(q.e4_actividad_no_catalogada)} + universo{" "}
        {formatearEntero(q.universo_local_valido)} = {formatearEntero(suma)}
        {cuadra ? " ✓" : ` (diferencia ${formatearEntero(q.filas_leidas - suma)})`}
      </p>
    </div>
  );
}
