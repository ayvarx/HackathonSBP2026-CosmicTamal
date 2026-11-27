import { useState } from "react";

// Tarjeta de composición de un banco, dinámica:
// - las columnas crecen al cargar y muestran la cifra exacta y el período al pasar el cursor;
// - al tocar una subactividad se resalta y se ve su peso;
// - la tarjeta se puede plegar para ver solo el resumen.
const dinero = (n) => new Intl.NumberFormat("es-PA", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
const millones = (n) => `${(n / 1e6).toLocaleString("es-PA", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} M`;

export default function BancoCard({ posicion, banco, saldo, serie, partes, seleccionada, onSelect, onDescargar }) {
  const [abierta, setAbierta] = useState(true);
  const [mes, setMes] = useState(null);
  const [parte, setParte] = useState(null);

  const total = partes.reduce((a, p) => a + p.valor, 0) || saldo;
  const max = Math.max(1, ...serie.map((s) => s.valor));
  const primero = serie[0]?.valor ?? 0;
  const ultimo = serie.at(-1)?.valor ?? 0;
  const variacion = primero ? ((ultimo - primero) / primero) * 100 : null;
  const sube = variacion !== null && variacion >= 0;
  const parteActiva = parte !== null ? partes[parte] : null;

  return (
    <article
      className={`banco-card ${abierta ? "" : "plegada"} ${seleccionada ? "seleccionada" : ""}`}
      onClick={onSelect}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect?.(); } }}
      aria-pressed={seleccionada}
    >
      <button className="bc-cabecera" onClick={(e) => { e.stopPropagation(); setAbierta((v) => !v); }} aria-expanded={abierta}>
        <span>
          <span className="bc-puesto">Puesto {posicion}</span>
          <strong className="bc-nombre">{banco}</strong>
        </span>
        <span className="bc-toggle" aria-hidden="true">{abierta ? "−" : "+"}</span>
      </button>

      <div className="bc-cifra">{dinero(total)}</div>
      <p className="bc-sub">Saldo total del banco en esta actividad</p>

      {abierta && (
        <>
          {serie.length > 1 && (
            <div className="bc-meses">
              <div className="bc-columnas" onMouseLeave={() => setMes(null)}>
                {serie.map((s, i) => (
                  <div
                    key={s.periodo}
                    className={`bc-col ${i === serie.length - 1 ? "ultimo" : ""} ${mes === i ? "activa" : ""}`}
                    onMouseEnter={() => setMes(i)}
                    onFocus={() => setMes(i)}
                    tabIndex={0}
                  >
                    <span className="bc-col-valor">{millones(s.valor)}</span>
                    <div
                      className="bc-col-barra"
                      style={{ height: `${Math.max(6, (s.valor / max) * 64)}px`, animationDelay: `${i * 120}ms` }}
                    />
                    <span className="bc-col-fecha">Periodo {i + 1}</span>
                    {mes === i && (
                      <span className="bc-tip">Periodo {i + 1} ({s.periodo}): {dinero(s.valor)}</span>
                    )}
                  </div>
                ))}
              </div>
              {variacion !== null && (
                <span className={`bc-variacion ${sube ? "sube" : "baja"}`}>
                  {sube ? "▲" : "▼"} {Math.abs(variacion).toFixed(1)} % desde Periodo 1
                </span>
              )}
            </div>
          )}

          <div className="bc-partes-barra" role="img" aria-label={`Reparto de ${banco}`}>
            {partes.map((p, i) => (
              <div
                key={p.nombre}
                className={parte === null || parte === i ? "" : "atenuada"}
                style={{ width: `${total ? (p.valor / total) * 100 : 0}%`, background: p.color }}
                onMouseEnter={() => setParte(i)}
                onMouseLeave={() => setParte(null)}
                onClick={() => setParte(parte === i ? null : i)}
                title={`${p.nombre}: ${dinero(p.valor)}`}
              />
            ))}
          </div>
          <ul className="bc-partes">
            {partes.map((p, i) => (
              <li
                key={p.nombre}
                className={parte === i ? "activa" : parte === null ? "" : "atenuada"}
                onMouseEnter={() => setParte(i)}
                onMouseLeave={() => setParte(null)}
              >
                <i style={{ background: p.color }} />
                <span>{p.nombre}</span>
                <b>{dinero(p.valor)}</b>
                <em>{total ? ((p.valor / total) * 100).toFixed(1) : "0.0"} %</em>
              </li>
            ))}
          </ul>
          {parteActiva && (
            <p className="bc-detalle">
              {parteActiva.nombre}: {dinero(parteActiva.valor)} ({total ? ((parteActiva.valor / total) * 100).toFixed(1) : "0.0"} % del saldo del banco)
            </p>
          )}
        </>
      )}
      <button
        className="bc-descargar"
        onClick={(e) => { e.stopPropagation(); onDescargar?.(); }}
        onKeyDown={(e) => e.stopPropagation()}
      >
        Descargar datos del banco ↓
      </button>
    </article>
  );
}
