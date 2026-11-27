import "./calidad.css";

// Calidad de los datos: qué proporción se conserva, qué se descarta y por qué,
// comparación entre cortes y verificaciones. Todas las cifras vienen de la API.
const num = (v) => Number(String(v ?? 0).replaceAll(",", ""));
const fmt = (n) => new Intl.NumberFormat("es-PA", { maximumFractionDigits: 0 }).format(n);
const pct = (n, base) => (base ? `${((n / base) * 100).toFixed(1)} %` : "—");
const etiquetaCorte = (p) => `${p.slice(0, 4)}-${p.slice(4, 6)}-${p.slice(6, 8)}`;

const MOTIVOS = [
  { k: "E1", t: "Préstamo repetido", color: "#E8A33D", ayuda: "Mismo número de préstamo más de una vez en el corte; se cuenta solo la primera aparición." },
  { k: "E2", t: "Destino extranjero", color: "#D98C1F", ayuda: "El destino del préstamo no es local (distinto de L)." },
  { k: "E3", t: "Saldo cero o negativo", color: "#F2C46D", ayuda: "El saldo no es positivo, así que no aporta al ranking." },
  { k: "E4", t: "Actividad no catalogada", color: "#B45309", ayuda: "La actividad no existe en el catálogo CINU oficial." },
];

const VERIFICACIONES = {
  rec1: "Subactividades suman la actividad",
  rec2: "Macroactividades suman la cartera",
  rec3: "Carteras suman el universo válido",
};

export default function CalidadPage({ quality, reconciliations, historico, period }) {
  const leidas = num(quality?.leidas);
  const validas = num(quality?.universo_valido ?? quality?.validas);
  const alertas = quality?.alertas?.length ?? 0;
  const descartados = leidas - validas;

  // Reparto del archivo: préstamos válidos y cada motivo de descarte.
  const reparto = [
    { nombre: "Préstamos válidos", valor: validas, color: "#094000", ayuda: "Entran al ranking." },
    ...MOTIVOS.map((m) => ({ nombre: `${m.k} · ${m.t}`, valor: num(quality?.[m.k]), color: m.color, ayuda: m.ayuda })),
  ];

  const periodos = Object.keys(historico || {}).sort();
  const verifOk = reconciliations ? Object.values(reconciliations).filter(Boolean).length : 0;
  const verifTotal = reconciliations ? Object.keys(reconciliations).length : 3;

  return (
    <div className="calidad">
      <section className="cal-resumen" aria-label="Resumen del corte">
        <div><span>Registros leídos</span><strong>{fmt(leidas)}</strong></div>
        <div className="destacado"><span>Préstamos válidos</span><strong>{fmt(validas)}</strong><small>{pct(validas, leidas)} del archivo</small></div>
        <div><span>Descartados</span><strong>{fmt(leidas - validas)}</strong><small>{pct(leidas - validas, leidas)} del archivo</small></div>
        <div className={alertas ? "alerta" : ""}><span>Alertas de coherencia</span><strong>{alertas}</strong></div>
      </section>

      <section className="cal-bloque">
        <header>
          <span className="cal-etiqueta">Reparto del archivo</span>
          <h3>Qué se conserva y qué se descarta, y por qué</h3>
          <p>La barra muestra solo los registros descartados (100 %), repartidos por motivo. Cada registro se cuenta una sola vez.</p>
        </header>
        <div className="cal-franja" role="img" aria-label="Reparto de registros por motivo">
          {reparto.slice(1).map((r) => (
            <div
              key={r.nombre}
              className="cal-franja-seg"
              style={{ width: `${descartados ? (r.valor / descartados) * 100 : 0}%`, background: r.color }}
              title={`${r.nombre}: ${fmt(r.valor)} (${pct(r.valor, leidas)})`}
            />
          ))}
        </div>
        <ul className="cal-leyenda">
          {reparto.map((r) => (
            <li key={r.nombre} title={r.ayuda}>
              <i style={{ background: r.color }} />
              <span>{r.nombre}</span>
              <b>{fmt(r.valor)}</b>
              <em>{pct(r.valor, leidas)}</em>
            </li>
          ))}
        </ul>
      </section>

      {periodos.length > 0 && (
        <section className="cal-bloque">
          <header>
            <span className="cal-etiqueta">Comparación entre cortes</span>
            <h3>Cómo cambió la calidad de un corte a otro</h3>
          </header>
          <div className="cal-cortes">
            {periodos.map((p, i) => {
              const q = historico[p]?.quality || {};
              const l = num(q.leidas);
              const v = num(q.universo_valido ?? q.validas);
              const activo = p === period;
              return (
                <article key={p} className={`cal-corte ${activo ? "activo" : ""}`}>
                  <span className="cal-corte-titulo">Periodo {i + 1} · {etiquetaCorte(p)}</span>
                  <strong className="cal-corte-valido">{fmt(v)}</strong>
                  <small>préstamos válidos · {pct(v, l)} de {fmt(l)}</small>
                  <ul>
                    {MOTIVOS.map((m) => (
                      <li key={m.k}><span>{m.k} · {m.t}</span><b>{fmt(num(q[m.k]))}</b></li>
                    ))}
                  </ul>
                </article>
              );
            })}
          </div>
        </section>
      )}

      <section className="cal-bloque">
        <header>
          <span className="cal-etiqueta">Verificaciones</span>
          <h3>Los totales cuadran entre sí</h3>
          <p>{verifOk} de {verifTotal} verificaciones cuadran al centavo en este corte.</p>
        </header>
        <ul className="cal-verif">
          {Object.entries(reconciliations || {}).map(([k, ok]) => (
            <li key={k} className={ok ? "ok" : "fallo"} aria-label={ok ? "Cuadra" : "No cuadra"}>
              <span>{VERIFICACIONES[k] || k}</span>
              <b>{ok ? "✔" : "✖"}</b>
            </li>
          ))}
        </ul>
      </section>

      <p className="cal-nota">
        La regla SB21 (Crédito personal con facilidad 07 pasa a Tarjeta) la aplica el backend. Esta vista no modifica ningún registro.
      </p>
    </div>
  );
}
