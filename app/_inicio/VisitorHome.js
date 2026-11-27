"use client";
// Portado del frontend de Amet: components/VisitorHome.jsx (+ visitor.css)
// Portada para el perfil Público: bienvenida y accesos. Cada opción muestra
// su información en la misma pantalla y un botón permite volver a la portada.
// Los datos llegan como props desde app/page.js (lib/consultas*.js); los montos son texto
// decimal exacto y se formatean con lib/formato.js. El líder de cada ranking no se repite
// aquí: lo muestra LideresRanking más abajo en la misma página.
import { useState } from "react";
import Link from "next/link";
import BotonDescarga from "@/components/BotonDescarga";
import {
  aNumeroParaGrafico,
  formatearEntero,
  formatearMonto,
  formatearPorcentaje,
} from "@/lib/formato";
import "./visitor.css";
import "./depth.css";
import "./inicio.css";

export default function VisitorHome({ fecha, cortes, actividades, urlRankings, urlsDescarga, lideres }) {
  const [vista, setVista] = useState({ tipo: "inicio" });
  const codigos = actividades.map((a) => a.ranking);
  const actividad = actividades.find((a) => a.ranking === vista.ranking);

  const abrirActividad = (codigo) => setVista({ tipo: "actividad", ranking: codigo || codigos[0] });
  const volver = () => setVista({ tipo: "inicio" });

  return (
    <div className="visitante">
      <header className="hero">
        <h1>Rankings de crédito por actividad</h1>
        <div className="hero-acciones">
          <Link href={urlRankings}>Ver rankings completos →</Link>
          <a className="secundario" href="#resumen">
            Resumen del corte ↓
          </a>
        </div>
        <div className="hero-stats">
          <div>
            <span>Actividades evaluadas</span>
            <strong>{formatearEntero(actividades.length)}</strong>
          </div>
          <div>
            <span>Cortes cargados</span>
            <strong>{formatearEntero(cortes)}</strong>
          </div>
        </div>
      </header>

      {vista.tipo === "inicio" && (
        <>
          <section className="seccion" aria-labelledby="titulo-actividades">
            <div className="seccion-head">
              <h2 id="titulo-actividades">Rankings por actividad</h2>
              <div className="descargas-botones" aria-label="Descargas">
                <BotonDescarga href={urlsDescarga.rankings} parametros={{ fecha }} texto="Rankings" variante="primario" />
                <BotonDescarga href={urlsDescarga.desglose} parametros={{ fecha }} texto="Desglose por subactividad" />
              </div>
            </div>
            <div className="grid-tarjetas">
              {actividades.map((a) => (
                <button key={a.ranking} type="button" className="tarjeta-tema" onClick={() => abrirActividad(a.ranking)}>
                  <span className="tt-etiqueta">{a.nombre}</span>
                </button>
              ))}
            </div>
          </section>

          {lideres}
        </>
      )}

      {vista.tipo === "actividad" && actividad && (
        <section className="seccion detalle" aria-labelledby="titulo-actividad">
          <div className="detalle-barra">
            <button type="button" className="volver" onClick={volver}>
              ‹ Volver a inicio
            </button>
            <h2 id="titulo-actividad">{actividad.nombre}</h2>
          </div>
          <div className="fila-chips">
            <div className="chips-visitante">
              {actividades.map((a) => (
                <button
                  key={a.ranking}
                  type="button"
                  className={a.ranking === actividad.ranking ? "on" : ""}
                  aria-pressed={a.ranking === actividad.ranking}
                  onClick={() => setVista({ tipo: "actividad", ranking: a.ranking })}
                >
                  {a.nombre}
                </button>
              ))}
            </div>
          </div>
          <ol className="lista-visitante">
            {(() => {
              // Ancho de barra: solo presentación (el monto exacto va en texto a la derecha).
              const max = Math.max(1, ...actividad.filas.map((x) => aNumeroParaGrafico(x.saldo_actividad) ?? 0));
              return actividad.filas.map((f) => (
                <li key={f.codigo_banco}>
                  <span className="lv-puesto">{f.posicion}</span>
                  <span className="lv-banco">{f.banco}</span>
                  <div className="lv-barra" aria-hidden="true">
                    <div style={{ width: `${((aNumeroParaGrafico(f.saldo_actividad) ?? 0) / max) * 100}%` }} />
                  </div>
                  <span className="lv-saldo cifra">{formatearMonto(f.saldo_actividad)}</span>
                  <span className="lv-peso cifra" title="Ponderación">{formatearPorcentaje(f.ponderacion_pct, 2)}</span>
                </li>
              ));
            })()}
          </ol>
          <p className="nota-visitante">
            <Link href={actividad.href}>Ver el ranking completo →</Link>
          </p>
        </section>
      )}
    </div>
  );
}
