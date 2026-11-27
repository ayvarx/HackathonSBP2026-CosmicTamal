// Resumen de calidad de un período: cuatro cifras. El detalle E1–E4 está en la tabla "Todos los períodos".
import { formatearEntero } from "@/lib/formato";
import "./calidad.css";

const num = (v) => Number(String(v ?? 0).replaceAll(",", "")) || 0;
const pct = (n, base) => (base ? `${((n / base) * 100).toFixed(1)} %` : "—");

const MOTIVOS = ["e1_duplicados", "e2_destino_extranjero", "e3_saldo_no_positivo", "e4_actividad_no_catalogada"];

/** @param {{q: object, totalAlertas: number}} props */
export default function CalidadPage({ q, totalAlertas }) {
  const leidas = num(q?.filas_leidas);
  const validas = num(q?.universo_local_valido);
  const descartados = MOTIVOS.reduce((s, campo) => s + num(q?.[campo]), 0);

  return (
    <div className="calidad">
      <ul className="cal-resumen" aria-label="Resumen del corte">
        <li><span>Registros leídos</span><strong>{formatearEntero(leidas)}</strong></li>
        <li><span>Préstamos válidos</span><strong>{formatearEntero(validas)}</strong><small>{pct(validas, leidas)} del archivo</small></li>
        <li><span>Descartados</span><strong>{formatearEntero(descartados)}</strong><small>{pct(descartados, leidas)} del archivo</small></li>
        <li><span>Alertas de coherencia</span><strong>{formatearEntero(totalAlertas)}</strong></li>
      </ul>
    </div>
  );
}
