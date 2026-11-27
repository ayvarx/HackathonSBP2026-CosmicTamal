"use client";
// Portado del frontend de Amet: components/CompareView.jsx (datos por props; sin api.js).
import { useState } from "react";
import "./amet-compare.css";

/**
 * Resumen visual de movimientos del ranking elegido. Los períodos se eligen con los filtros de la página
 * (URL); aquí solo se resaltan cambios de al menos N puestos. Las posiciones vienen del motor SQL.
 * @param {{ranking: string, textoPar: string, filas: {codigo: string, banco: string, posicion: number, anterior: number|null, cambio: number|null}[]}} props
 */
export default function CompareView({ ranking, textoPar, filas }) {
  const [umbral, setUmbral] = useState("");
  const limite = umbral.trim() === "" ? null : Math.abs(Number(umbral));
  const ordenadas = [...filas].sort((a, b) => a.posicion - b.posicion);

  return (
    <div className="amet-cmp">
      <div className="stack">
        <div className="panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">ANÁLISIS TEMPORAL</span>
              <h2>Movimientos de {ranking}</h2>
              <p className="helper-text">Comparando {textoPar}.</p>
            </div>
          </div>
          <div className="filter-row">
            <label className="field">
              <span>Resaltar cambios de al menos (puestos)</span>
              <input inputMode="numeric" value={umbral} onChange={(e) => setUmbral(e.target.value)} placeholder="Ej. 2 (vacío = sin resaltar)" />
            </label>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Pos.</th><th>Entidad</th><th>Posición anterior</th><th>Cambio</th><th>Señal</th></tr>
              </thead>
              <tbody>
                {ordenadas.map((row) => {
                  const c = row.cambio;
                  const relevante = limite !== null && Number.isFinite(limite) && c !== null && c !== 0 && Math.abs(c) >= limite;
                  return (
                    <tr key={row.codigo}>
                      <td className="numeric">{row.posicion}</td>
                      <td><strong>{row.banco}</strong></td>
                      <td className="numeric">{row.anterior ?? "—"}</td>
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
          <p className="helper-text">Cambio = posición anterior − posición actual. ▲ sube, ▼ baja, • se mantiene.</p>
        </div>
      </div>
    </div>
  );
}
