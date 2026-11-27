// Portado del frontend de Amet: components/CalidadPage.jsx (datos por props desde lib/consultas.js).
import { formatearEntero, formatearFecha } from "@/lib/formato";
import "./calidad.css";

const num = (v) => Number(String(v ?? 0).replaceAll(",", "")) || 0;
const pct = (n, base) => (base ? `${((n / base) * 100).toFixed(1)} %` : "—");

const MOTIVOS = [
  { k: "E1", campo: "e1_duplicados", t: "Préstamo repetido", color: "#E8A33D", ayuda: "Mismo número de préstamo más de una vez en el corte." },
  { k: "E2", campo: "e2_destino_extranjero", t: "Destino extranjero", color: "#D98C1F", ayuda: "El destino del préstamo no es local." },
  { k: "E3", campo: "e3_saldo_no_positivo", t: "Saldo cero o negativo", color: "#F2C46D", ayuda: "El saldo no es positivo." },
  { k: "E4", campo: "e4_actividad_no_catalogada", t: "Actividad no catalogada", color: "#B45309", ayuda: "La actividad no existe en el catálogo CINU." },
];

/**
 * @param {{q: object, todas: object[], fecha: string, verificaciones: {reconciliacion:number, descripcion:string, todas_cuadran:boolean}[], totalAlertas: number}} props
 */
export default function CalidadPage({ q, todas, fecha, verificaciones, totalAlertas }) {
  const leidas = num(q?.filas_leidas);
  const validas = num(q?.universo_local_valido);
  const descartados = leidas - validas;
  const reparto = [
    { nombre: "Préstamos válidos", valor: validas, color: "#094000", ayuda: "Entran al ranking." },
    ...MOTIVOS.map((m) => ({ nombre: `${m.k} · ${m.t}`, valor: num(q?.[m.campo]), color: m.color, ayuda: m.ayuda })),
  ];
  const verifOk = verificaciones.filter((v) => v.todas_cuadran).length;

  return (
    <div className="calidad">
      <section className="cal-resumen" aria-label="Resumen del corte">
        <div><span>Registros leídos</span><strong>{formatearEntero(leidas)}</strong></div>
        <div className="destacado"><span>Préstamos válidos</span><strong>{formatearEntero(validas)}</strong><small>{pct(validas, leidas)} del archivo</small></div>
        <div><span>Descartados</span><strong>{formatearEntero(descartados)}</strong><small>{pct(descartados, leidas)} del archivo</small></div>
        <div className={totalAlertas ? "alerta" : ""}><span>Alertas de coherencia</span><strong>{formatearEntero(totalAlertas)}</strong></div>
      </section>

      <section className="cal-bloque">
        <header>
          <span className="cal-etiqueta">Reparto del archivo</span>
          <h3>Qué se conserva y qué se descarta, y por qué</h3>
          <p>La barra reparte los registros descartados por motivo.</p>
        </header>
        <div className="cal-franja" role="img" aria-label="Reparto de registros descartados por motivo">
          {reparto.slice(1).map((r) => (
            <div
              key={r.nombre}
              className="cal-franja-seg"
              style={{ width: `${descartados ? (r.valor / descartados) * 100 : 0}%`, background: r.color }}
              title={`${r.nombre}: ${formatearEntero(r.valor)} (${pct(r.valor, leidas)})`}
            />
          ))}
        </div>
        <ul className="cal-leyenda">
          {reparto.map((r) => (
            <li key={r.nombre} title={r.ayuda}>
              <i style={{ background: r.color }} />
              <span>{r.nombre}</span>
              <b>{formatearEntero(r.valor)}</b>
              <em>{pct(r.valor, leidas)}</em>
            </li>
          ))}
        </ul>
      </section>

      {todas.length > 1 && (
        <section className="cal-bloque">
          <header>
            <span className="cal-etiqueta">Comparación entre cortes</span>
            <h3>Cómo cambió la calidad de un corte a otro</h3>
          </header>
          <div className="cal-cortes">
            {todas.map((c) => {
              const l = num(c.filas_leidas);
              const v = num(c.universo_local_valido);
              return (
                <article key={c.fecha} className={`cal-corte ${c.fecha === fecha ? "activo" : ""}`}>
                  <span className="cal-corte-titulo">{formatearFecha(c.fecha)}</span>
                  <strong className="cal-corte-valido">{formatearEntero(v)}</strong>
                  <small>préstamos válidos · {pct(v, l)} de {formatearEntero(l)}</small>
                  <ul>
                    {MOTIVOS.map((m) => (
                      <li key={m.k}><span>{m.k} · {m.t}</span><b>{formatearEntero(num(c[m.campo]))}</b></li>
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
          <p>{verifOk} de {verificaciones.length} verificaciones cuadran al centavo en este corte.</p>
        </header>
        <ul className="cal-verif">
          {verificaciones.map((v) => (
            <li key={v.reconciliacion} className={v.todas_cuadran ? "ok" : "fallo"} aria-label={v.todas_cuadran ? "Cuadra" : "No cuadra"}>
              <span>{v.descripcion}</span>
              <b>{v.todas_cuadran ? "✔" : "✖"}</b>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
