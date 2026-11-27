import { etiquetaPeriodo } from "../constants";

export default function PeriodSelect({ periods, value, onChange, disabled }) {
  return (
    <label className="field">
      <span>Período de corte</span>
      <select value={value || ""} onChange={(event) => onChange(event.target.value)} disabled={disabled || !periods.length}>
        {!periods.length && <option value="">Sin períodos disponibles</option>}
        {periods.map((period) => (
          <option key={period} value={period}>
            {etiquetaPeriodo(period)}
          </option>
        ))}
      </select>
    </label>
  );
}
