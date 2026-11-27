// Portado del frontend de Amet: components/LideresRanking.jsx (estilos en dashboard.css)
// Líder de cada ranking: banco líder, saldo, ponderación y enlace al ranking completo.
// Los datos llegan ya calculados desde app/page.js; los montos son texto exacto formateado
// con lib/formato.js.
import Link from "next/link";
import { formatearPorcentaje, nombreBanco } from "@/lib/formato";
import { montoEnMillones } from "./montos";
import "./dashboard.css";
import "./inicio.css";

export default function LideresRanking({ lideres }) {
  return (
    <section className="lideres" aria-labelledby="titulo-lideres">
      <h2 id="titulo-lideres">Líder de cada ranking</h2>
      <div className="lideres-grid">
        {lideres.map((r) => (
          <article key={r.ranking} className="lider-card">
            <div className="lider-resumen">
              <header>
                <strong>{r.nombre}</strong>
              </header>
              <div className="lider-banco">{nombreBanco(r.lider.codigo_banco, r.lider.banco)}</div>
              <dl>
                <div>
                  <dt>Saldo</dt>
                  <dd>{montoEnMillones(r.lider.saldo_actividad, 1)}</dd>
                </div>
                <div>
                  <dt>Ponderación</dt>
                  <dd>{formatearPorcentaje(r.lider.ponderacion_pct)}</dd>
                </div>
              </dl>
              {r.cambio_de_lider && r.lider_anterior && (
                <p className="lider-estado"><span className="cambio-sube">▲ {nombreBanco(r.lider.codigo_banco, r.lider.banco)}</span> · <span className="cambio-baja">▼ {nombreBanco(r.lider_anterior.codigo_banco, r.lider_anterior.banco)}</span></p>
              )}
            </div>
            <Link className="lider-ver" href={r.href}>
              Ver ranking →
            </Link>
          </article>
        ))}
      </div>
    </section>
  );
}
