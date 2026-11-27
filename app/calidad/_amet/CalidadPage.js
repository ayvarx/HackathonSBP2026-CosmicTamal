// Resumen de calidad de un período: cuatro cifras, la cascada E1–E4 y su reparto.
import { formatearEntero, formatearMonto } from "@/lib/formato";
import "./calidad.css";

const num = (v) => Number(String(v ?? 0).replaceAll(",", "")) || 0;
const pct = (n, base) => (base ? `${((n / base) * 100).toFixed(1)} %` : "—");

const MOTIVOS = [
  { k: "E1", campo: "e1_duplicados", t: "Préstamo repetido", color: "#f5a524" },
  { k: "E2", campo: "e2_destino_extranjero", t: "Destino extranjero", color: "#7EAC39" },
  { k: "E3", campo: "e3_saldo_no_positivo", t: "Saldo cero o negativo", color: "#419A33" },
  { k: "E4", campo: "e4_actividad_no_catalogada", t: "Actividad no catalogada", color: "#608D1A" },
];

/** @param {{q: object, totalAlertas: number}} props */
export default function CalidadPage({ q, totalAlertas }) {
  const leidas = num(q?.filas_leidas);
  const validas = num(q?.universo_local_valido);
  const motivos = MOTIVOS.map((m) => ({ ...m, valor: num(q?.[m.campo]) }));
  const descartados = motivos.reduce((s, m) => s + m.valor, 0);
  const suma = descartados + validas;
  const cuadra = suma === leidas;

  return (
    <div className="calidad">
      <ul className="cal-resumen" aria-label="Resumen del corte">
        <li><span>Registros leídos</span><strong>{formatearEntero(leidas)}</strong><small>Filas del archivo</small></li>
        <li><span>Préstamos válidos</span><strong>{formatearEntero(validas)}</strong><small>{pct(validas, leidas)} del archivo</small></li>
        <li><span>Descartados</span><strong>{formatearEntero(descartados)}</strong><small>{pct(descartados, leidas)} del archivo</small></li>
        <li><span>Alertas de coherencia</span><strong>{formatearEntero(totalAlertas)}</strong><small>{totalAlertas ? "Revise el detalle abajo" : "Sin alertas"}</small></li>
      </ul>

      <section className="cal-bloque" aria-labelledby="t-cascada">
        <h2 id="t-cascada">Cascada de exclusión E1 → E4</h2>
        <div className="cal-franja" role="img" aria-label="Reparto de registros descartados por motivo">
          {motivos.map((m) => (
            <div
              key={m.k}
              className="cal-franja-seg"
              style={{ width: `${descartados ? (m.valor / descartados) * 100 : 0}%`, background: m.color }}
              title={`${m.k} · ${m.t}: ${formatearEntero(m.valor)}`}
            />
          ))}
        </div>
        <ul className="cal-leyenda">
          {motivos.map((m) => (
            <li key={m.k}>
              <i style={{ background: m.color }} />
              <span>{m.k} · {m.t}</span>
              <b>{formatearEntero(m.valor)}</b>
              <em>{pct(m.valor, leidas)}</em>
            </li>
          ))}
          <li>
            <i style={{ background: "#094000" }} />
            <span>Universo local válido · {formatearMonto(q?.saldo_universo_local_valido)}</span>
            <b>{formatearEntero(validas)}</b>
            <em>{pct(validas, leidas)}</em>
          </li>
        </ul>
        <p className={`cal-identidad ${cuadra ? "" : "fallo"}`} role="status">
          Leídas {formatearEntero(leidas)} = E1 + E2 + E3 + E4 + universo = {formatearEntero(suma)}
          {cuadra ? " ✓" : ` (diferencia ${formatearEntero(leidas - suma)})`}
        </p>
      </section>
    </div>
  );
}
