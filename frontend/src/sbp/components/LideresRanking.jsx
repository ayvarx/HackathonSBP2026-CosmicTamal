import { useState } from "react";
import { RANKING_LABELS } from "../constants";

// Líder de cada ranking. Solo para el perfil Analista.
// Cada tarjeta se puede abrir para ver el detalle del líder en cada corte.
const num = (v) => Number(String(v ?? "0").replaceAll(",", ""));
const dinero = (n) => new Intl.NumberFormat("es-PA", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
const millones = (n) => `${dinero(n / 1e6)} millones`;
const etiquetaPeriodo = (p) => `${p.slice(0, 4)}-${p.slice(4, 6)}-${p.slice(6, 8)}`;
const MES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const mesAnio = (p) => `${MES[Number(p.slice(4, 6)) - 1]} ${p.slice(0, 4)}`;

export default function LideresRanking({ rankings, historico, onVerRanking }) {
  const [abierta, setAbierta] = useState(null);
  const periodos = Object.keys(historico || {}).sort();
  const actual = Object.keys(rankings || {});

  const liderEn = (periodo, nombre) =>
    historico[periodo]?.rankings?.[nombre]?.find((f) => Number(f.Posicion) === 1) || null;

  return (
    <section className="lideres" aria-label="Líder de cada ranking">
      <h3>Líder de cada ranking</h3>
      <div className="lideres-grid">
        {actual.map((nombre) => {
          const filas = rankings[nombre] || [];
          const lider = filas.find((f) => Number(f.Posicion) === 1);
          if (!lider) return null;
          const total = filas.reduce((a, f) => a + num(f.Saldo_Actividad), 0);
          const estaAbierta = abierta === nombre;

          // Liderazgo: desde cuándo lo tiene el líder actual y quién lo tenía en el corte anterior.
          const historia = periodos.map((p) => ({ periodo: p, lider: liderEn(p, nombre) }));
          const prevCorte = historia.length > 1 ? historia[historia.length - 2].lider : null;
          let desde = periodos.at(-1);
          for (let i = historia.length - 1; i >= 0; i--) {
            if (historia[i].lider?.Codigo_Banco === lider.Codigo_Banco) desde = historia[i].periodo;
            else break;
          }
          const cambio = prevCorte && prevCorte.Codigo_Banco !== lider.Codigo_Banco;

          // Detalle del líder en cada corte.
          const detalle = periodos.map((p) => {
            const r = historico[p]?.rankings?.[nombre]?.find((x) => x.Codigo_Banco === lider.Codigo_Banco);
            return { periodo: p, saldo: r ? num(r.Saldo_Actividad) : 0, ponderacion: r?.Ponderacion_Pct ?? "—", operaciones: r?.Operaciones_Validas ?? "—" };
          });

          return (
            <article
              key={nombre}
              className={`lider-card ${estaAbierta ? "abierta" : ""}`}
              onClick={() => setAbierta(estaAbierta ? null : nombre)}
              role="button"
              tabIndex={0}
              aria-expanded={estaAbierta}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setAbierta(estaAbierta ? null : nombre); } }}
            >
              <div className="lider-resumen">
              <header>
                <strong>{RANKING_LABELS[nombre] || nombre}</strong>
                <span className="lider-toggle" aria-hidden="true">{estaAbierta ? "−" : "+"}</span>
              </header>
              <div className="lider-banco">{lider.Codigo_Banco} · {lider.Banco}</div>
              <dl>
                <div><dt>Saldo</dt><dd>{dinero(num(lider.Saldo_Actividad))}</dd></div>
                <div><dt>Ponderación</dt><dd>{Number(lider.Ponderacion_Pct).toFixed(4)} %</dd></div>
                <div><dt>Total del ranking</dt><dd>{millones(total)}</dd></div>
              </dl>
              {cambio ? (
                <p className="lider-estado nuevo">▲ Nuevo líder (antes: {prevCorte.Banco})</p>
              ) : (
                <p className="lider-estado">{`= Líder desde ${mesAnio(desde || periodos[0])}`}</p>
              )}

              </div>

              {estaAbierta && (
                <div className="lider-detalle" onClick={(e) => e.stopPropagation()}>
                  <h4>Evolución del líder por corte</h4>
                  <table>
                    <thead>
                      <tr><th>Corte</th><th className="num">Saldo</th><th className="num">Ponderación</th><th className="num">Préstamos</th></tr>
                    </thead>
                    <tbody>
                      {detalle.map((d) => (
                        <tr key={d.periodo}>
                          <td>{etiquetaPeriodo(d.periodo)}</td>
                          <td className="num">{dinero(d.saldo)}</td>
                          <td className="num">{typeof d.ponderacion === "number" || !isNaN(Number(d.ponderacion)) ? `${Number(d.ponderacion).toFixed(4)} %` : "—"}</td>
                          <td className="num">{d.operaciones}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <h4>Top 3 de la actividad</h4>
                  <ol className="lider-top">
                    {filas.slice(0, 3).map((f) => (
                      <li key={f.Codigo_Banco}><span>{f.Posicion}. {f.Banco}</span><b>{dinero(num(f.Saldo_Actividad))}</b></li>
                    ))}
                  </ol>
                  <button className="lider-ver" onClick={(e) => { e.stopPropagation(); onVerRanking?.(nombre); }}>
                    Ver ranking completo →
                  </button>
                </div>
              )}

              <small className="lider-corte">Corte {etiquetaPeriodo(periodos.at(-1) || "")}</small>
            </article>
          );
        })}
      </div>
    </section>
  );
}
