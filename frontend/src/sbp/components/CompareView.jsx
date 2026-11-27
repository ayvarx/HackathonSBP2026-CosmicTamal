import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { etiquetaPeriodo } from "../constants";
import StatusNotice from "./StatusNotice";

// Compara el período activo con el corte mensual inmediatamente anterior (comparaciones consecutivas, Sección 8).
// Si el usuario elige otro período de referencia, se respeta; si el elegido coincide con el activo, se usa el anterior.
export default function CompareView({ periods, currentPeriod, ranking }) {
  const indiceActual = periods.indexOf(currentPeriod);
  const anteriorConsecutivo = indiceActual > 0 ? periods[indiceActual - 1] : "";
  const [elegido, setElegido] = useState("");
  const basePeriod = elegido && elegido !== currentPeriod && periods.includes(elegido) ? elegido : anteriorConsecutivo;

  const [baseRows, setBaseRows] = useState([]);
  const [currentRows, setCurrentRows] = useState([]);
  const [umbral, setUmbral] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!basePeriod || !currentPeriod || !ranking) return;
    let alive = true;
    setLoading(true); setError("");
    Promise.all([api.ranking(basePeriod, ranking), api.ranking(currentPeriod, ranking)])
      .then(([before, after]) => { if (alive) { setBaseRows(before); setCurrentRows(after); } })
      .catch((e) => { if (alive) setError(e.message); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [basePeriod, currentPeriod, ranking]);

  const movimientos = useMemo(() => {
    const anterior = new Map(baseRows.map((row) => [row.Codigo_Banco, row]));
    return currentRows
      .map((row) => {
        const previo = anterior.get(row.Codigo_Banco);
        // Positivo = sube (mejora la posición); negativo = baja; 0 = se mantiene.
        const cambio = previo ? Number(previo.Posicion) - Number(row.Posicion) : null;
        return { ...row, posicionAnterior: previo?.Posicion ?? null, cambio };
      })
      .sort((a, b) => Number(a.Posicion) - Number(b.Posicion));
  }, [baseRows, currentRows]);

  const limite = umbral.trim() === "" ? null : Math.abs(Number(umbral));
  const sinReferencia = !basePeriod;

  return (
    <div className="stack">
      <div className="panel">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">ANÁLISIS TEMPORAL</span>
            <h2>Comparar con el período anterior</h2>
            <p className="helper-text">
              {sinReferencia
                ? "No hay un período anterior cargado para comparar."
                : `Comparando ${etiquetaPeriodo(currentPeriod)} contra ${etiquetaPeriodo(basePeriod)}.`}
            </p>
          </div>
        </div>
        <div className="filter-row">
          <label className="field">
            <span>Período de referencia</span>
            <select value={basePeriod} onChange={(e) => setElegido(e.target.value)} disabled={periods.length < 2}>
              {periods.filter((p) => p !== currentPeriod).map((p) => (
                <option key={p} value={p}>{etiquetaPeriodo(p)}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Resaltar cambios de al menos (puestos)</span>
            <input inputMode="numeric" value={umbral} onChange={(e) => setUmbral(e.target.value)} placeholder="Ej. 2 — vacío = sin resaltar" />
          </label>
        </div>
        <p className="helper-text">
          Cambio = posición anterior − posición actual. ▲ sube, ▼ baja, • se mantiene. Las posiciones vienen de la API; esta vista no recalcula el ranking.
        </p>
      </div>

      {error && <StatusNotice type="error">{error}</StatusNotice>}

      <div className="panel">
        <div className="panel-heading">
          <div><span className="eyebrow">MOVIMIENTOS</span><h2>{ranking}</h2></div>
        </div>
        {sinReferencia ? (
          <p className="empty-inline">Se necesita al menos un corte anterior para comparar.</p>
        ) : loading ? (
          <p className="empty-inline">Consultando ambos períodos…</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Pos.</th><th>Entidad</th><th>Posición anterior</th><th>Cambio</th><th>Señal</th></tr>
              </thead>
              <tbody>
                {movimientos.map((row) => {
                  const c = row.cambio;
                  const relevante = limite !== null && Number.isFinite(limite) && c !== null && Math.abs(c) >= limite && c !== 0;
                  return (
                    <tr key={row.Codigo_Banco}>
                      <td className="numeric">{row.Posicion}</td>
                      <td><strong>{row.Banco}</strong></td>
                      <td className="numeric">{row.posicionAnterior ?? "—"}</td>
                      <td className={`numeric ${c > 0 ? "sube" : c < 0 ? "baja" : ""}`}>
                        {c === null ? "Sin dato anterior" : c > 0 ? `▲ ${c}` : c < 0 ? `▼ ${-c}` : "• 0"}
                      </td>
                      <td>{relevante ? <span className="status-tag">Cambio relevante</span> : <span className="subtle">—</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
