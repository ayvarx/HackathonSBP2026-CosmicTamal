"use client";
// Portado del frontend de Amet: components/LideresRanking.jsx (estilos en dashboard.css)
// Líder de cada ranking, visible para TODOS los perfiles (requisito del reto; en Amet era
// solo para Analista). Cada tarjeta se abre para ver la evolución del líder por corte y el
// top 3 de la actividad. Los datos llegan ya calculados desde app/page.js (resumenPanel y
// rankings de lib/consultas.js); los montos son texto exacto formateado con lib/formato.js.
import { useState } from "react";
import Link from "next/link";
import {
  formatearEntero,
  formatearFecha,
  formatearMonto,
  formatearMontoCompacto,
  formatearPorcentaje,
  nombreBanco,
} from "@/lib/formato";
import "./dashboard.css";
import "./inicio.css";


export default function LideresRanking({ lideres, fecha }) {
  const [abierta, setAbierta] = useState(null);
  const alternar = (codigo) => setAbierta((actual) => (actual === codigo ? null : codigo));

  return (
    <section className="lideres" aria-labelledby="titulo-lideres">
      <h3 id="titulo-lideres">Líder de cada ranking</h3>
      <div className="lideres-grid">
        {lideres.map((r) => {
          const estaAbierta = abierta === r.ranking;
          return (
            <article
              key={r.ranking}
              className={`lider-card ${estaAbierta ? "abierta" : ""}`}
              onClick={() => alternar(r.ranking)}
              role="button"
              tabIndex={0}
              aria-expanded={estaAbierta}
              onKeyDown={(e) => {
                if (e.target !== e.currentTarget) return;
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  alternar(r.ranking);
                }
              }}
            >
              <div className="lider-resumen">
                <header>
                  <strong>{r.nombre}</strong>
                  <span className="lider-toggle" aria-hidden="true">
                    {estaAbierta ? "−" : "+"}
                  </span>
                </header>
                <div className="lider-banco">{nombreBanco(r.lider.codigo_banco, r.lider.banco)}</div>
                <dl>
                  <div>
                    <dt>Saldo</dt>
                    <dd>{formatearMonto(r.lider.saldo_actividad)}</dd>
                  </div>
                  <div>
                    <dt>Ponderación</dt>
                    <dd>{formatearPorcentaje(r.lider.ponderacion_pct)}</dd>
                  </div>
                  <div>
                    <dt>Total del ranking</dt>
                    <dd>{formatearMontoCompacto(r.saldo_total)}</dd>
                  </div>
                </dl>
                {!r.lider_anterior ? (
                  <p className="lider-estado">Sin período anterior</p>
                ) : r.cambio_de_lider ? (
                  <p className="lider-estado nuevo">▲ Nuevo líder (antes: {r.lider_anterior.banco})</p>
                ) : (
                  <p className="lider-estado">= Líder desde {formatearFecha(r.desde)}</p>
                )}
              </div>

              {estaAbierta && (
                <div className="lider-detalle" onClick={(e) => e.stopPropagation()}>
                  <h4>Evolución del líder por corte</h4>
                  <table>
                    <thead>
                      <tr>
                        <th scope="col">Corte</th>
                        <th scope="col" className="num">Saldo</th>
                        <th scope="col" className="num">Ponderación</th>
                        <th scope="col" className="num">Préstamos</th>
                      </tr>
                    </thead>
                    <tbody>
                      {r.detalle.map((d) => (
                        <tr key={d.fecha}>
                          <td>{formatearFecha(d.fecha)}</td>
                          <td className="num">{formatearMonto(d.saldo)}</td>
                          <td className="num">{formatearPorcentaje(d.ponderacion)}</td>
                          <td className="num">{formatearEntero(d.operaciones)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <h4>Top 3 de la actividad</h4>
                  <ol className="lider-top">
                    {r.top3.map((f) => (
                      <li key={f.codigo_banco}>
                        <span>
                          {f.posicion}. {f.banco}
                        </span>
                        <b>{formatearMonto(f.saldo_actividad)}</b>
                      </li>
                    ))}
                  </ol>
                  <Link className="lider-ver" href={r.href}>
                    Ver ranking completo →
                  </Link>
                </div>
              )}

              <small className="lider-corte">Corte {formatearFecha(fecha, "completa")}</small>
            </article>
          );
        })}
      </div>
    </section>
  );
}
