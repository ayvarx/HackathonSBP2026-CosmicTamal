// Portado del frontend de Amet: components/BancoDetalle.jsx
// Detalle del banco seleccionado: más información que la tarjeta (diferencia con el puesto 1,
// puesto en cada corte, reparto por subactividad y puesto en las otras actividades).
// Componente de servidor: en Amet se cerraba con un estado; aquí "Cerrar" es un enlace que
// quita ?banco= de la URL. Cifras exactas con lib/formato.js.
//
// Props: banco, posicion, actividad, saldo (texto), ponderacion (texto %), operaciones, lider (texto),
//   partes [{ nombre, valor, color }], posicionesPeriodos [{ periodo, etiqueta, posicion }],
//   otras [{ clave, nombre, posicion, saldo, activa, href }], hrefCerrar, children (pie opcional).
import Link from "next/link";
import { formatearEntero, formatearMonto, formatearPorcentaje, signoDecimal } from "@/lib/formato";
import { porcentajeDe, restarMontos } from "./numeros";

const pct = (parte, total) => {
  const p = porcentajeDe(parte, total, 1);
  return p === null ? "0.0 %" : formatearPorcentaje(p, 1);
};

export default function BancoDetalle({
  banco,
  posicion,
  actividad,
  saldo,
  ponderacion,
  operaciones,
  lider,
  partes,
  posicionesPeriodos,
  otras,
  hrefCerrar,
  children,
}) {
  const brecha = restarMontos(saldo, lider);
  const signo = signoDecimal(brecha);

  return (
    <section id="detalle-banco" className="banco-detalle" aria-label={`Detalle de ${banco}`}>
      <header className="bd-cabecera">
        <div>
          <span className="bd-etiqueta">Puesto {posicion} en {actividad}</span>
          <h3>{banco}</h3>
        </div>
        <Link className="bd-cerrar" href={hrefCerrar} scroll={false}>
          Cerrar ×
        </Link>
      </header>

      <div className="bd-kpis">
        <div><span>Saldo en esta actividad</span><strong className="cifra">{formatearMonto(saldo)}</strong></div>
        <div><span>Peso en su cartera (ponderación)</span><strong className="cifra">{formatearPorcentaje(ponderacion)}</strong></div>
        <div><span>Préstamos que lo forman</span><strong className="cifra">{formatearEntero(operaciones)}</strong></div>
        <div>
          <span>Diferencia con el puesto 1</span>
          <strong className={`cifra ${signo < 0 ? "bd-neg" : ""}`}>
            {signo === 0 ? "Ninguna (es el líder)" : `${formatearMonto(brecha)} (${pct(brecha, lider)})`}
          </strong>
        </div>
      </div>

      <div className="bd-grid">
        <div className="bd-bloque">
          <h4>Puesto en cada corte</h4>
          <ol className="bd-puestos">
            {posicionesPeriodos.map((p) => (
              <li key={p.periodo}>
                <span>{p.etiqueta}</span>
                <b>{p.posicion ?? "—"}</b>
              </li>
            ))}
          </ol>
        </div>

        <div className="bd-bloque">
          <h4>Reparto por subactividad</h4>
          <ul className="bd-partes">
            {partes.map((p) => {
              const share = porcentajeDe(p.valor, saldo, 1) ?? "0.0";
              return (
                <li key={p.nombre}>
                  <div className="bd-parte-head">
                    <span><i style={{ background: p.color }} /> {p.nombre}</span>
                    <b>{formatearMonto(p.valor)} · {formatearPorcentaje(share, 1)}</b>
                  </div>
                  <div className="bd-parte-barra"><div style={{ width: `${share}%`, background: p.color }} /></div>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="bd-bloque bd-ancho">
          <h4>Puesto en las otras actividades (mismo corte)</h4>
          <ul className="bd-otras">
            {otras.map((o) => (
              <li key={o.clave} className={o.activa ? "activa" : ""}>
                <span>{o.href && !o.activa ? <Link href={o.href} scroll={false}>{o.nombre}</Link> : o.nombre}</span>
                <b>Puesto {o.posicion ?? "—"}</b>
                <em>{formatearMonto(o.saldo)}</em>
              </li>
            ))}
          </ul>
        </div>
      </div>
      {children && <div className="bd-pie">{children}</div>}
    </section>
  );
}
