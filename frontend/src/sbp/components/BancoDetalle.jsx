// Detalle de un banco seleccionado: más información que la tarjeta, todo calculado a partir de la API.
const dinero = (n) => new Intl.NumberFormat("es-PA", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
const pct = (n) => `${Number(n).toLocaleString("es-PA", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`;

export default function BancoDetalle({ banco, posicion, actividad, saldo, porcentaje, operaciones, lider, partes, posicionesPeriodos, otras, onCerrar }) {
  const total = partes.reduce((a, p) => a + p.valor, 0) || saldo;
  const brecha = saldo - lider;
  const brechaPct = lider ? (brecha / lider) * 100 : 0;

  return (
    <section className="banco-detalle" aria-label={`Detalle de ${banco}`}>
      <header className="bd-cabecera">
        <div>
          <span className="bd-etiqueta">Puesto {posicion} en {actividad}</span>
          <h3>{banco}</h3>
        </div>
        <button className="bd-cerrar" onClick={onCerrar}>Cerrar ×</button>
      </header>

      <div className="bd-kpis">
        <div><span>Saldo en esta actividad</span><strong>{dinero(saldo)}</strong></div>
        <div><span>Peso en su cartera</span><strong>{porcentaje}</strong></div>
        <div><span>Préstamos que lo forman</span><strong>{operaciones}</strong></div>
        <div>
          <span>Diferencia con el puesto 1</span>
          <strong className={brecha < 0 ? "bd-neg" : ""}>
            {brecha === 0 ? "Ninguna" : `${dinero(brecha)} (${pct(brechaPct)})`}
          </strong>
        </div>
      </div>

      <div className="bd-grid">
        <div className="bd-bloque">
          <h4>Puesto en cada corte</h4>
          <ol className="bd-puestos">
            {posicionesPeriodos.map((p) => (
              <li key={p.periodo}>
                <span>{p.periodo}</span>
                <b>{p.posicion}</b>
              </li>
            ))}
          </ol>
        </div>

        <div className="bd-bloque">
          <h4>Reparto por subactividad</h4>
          <ul className="bd-partes">
            {partes.map((p) => {
              const share = total ? (p.valor / total) * 100 : 0;
              return (
                <li key={p.nombre}>
                  <div className="bd-parte-head">
                    <span><i style={{ background: p.color }} /> {p.nombre}</span>
                    <b>{dinero(p.valor)} · {pct(share)}</b>
                  </div>
                  <div className="bd-parte-barra"><div style={{ width: `${share}%`, background: p.color }} /></div>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="bd-bloque bd-ancho">
          <h4>Puesto en las otras actividades</h4>
          <ul className="bd-otras">
            {otras.map((o) => (
              <li key={o.nombre} className={o.activa ? "activa" : ""}>
                <span>{o.nombre}</span>
                <b>Puesto {o.posicion}</b>
                <em>{dinero(o.saldo)}</em>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
