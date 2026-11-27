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
  formatearFecha,
  formatearMonto,
  formatearMontoCompacto,
  formatearPorcentaje,
} from "@/lib/formato";
import "./visitor.css";
import "./depth.css";
import "./inicio.css";

export default function VisitorHome({ fecha, cortes, obligatorios, actividades, urlRankings, urlsDescarga, lideres }) {
  const [vista, setVista] = useState({ tipo: "inicio" });
  const codigos = actividades.map((a) => a.ranking);
  const bancos = actividades[0]?.filas.length ?? 0;
  const actividad = actividades.find((a) => a.ranking === vista.ranking);

  const abrirActividad = (codigo) => setVista({ tipo: "actividad", ranking: codigo || codigos[0] });
  const abrirDescargas = () => setVista({ tipo: "descargas" });
  const volver = () => setVista({ tipo: "inicio" });

  return (
    <div className="visitante">
      <header className="hero">
        <h1>Rankings de crédito por actividad</h1>
        <p className="hero-sub">
          Qué bancos lideran cada actividad económica de la cartera local y cómo se compone su saldo.
        </p>
        <div className="hero-acciones">
          <Link href={urlRankings}>Ver rankings completos →</Link>
          <a className="secundario" href="#resumen">
            Ir al resumen del corte ↓
          </a>
        </div>
        <div className="hero-stats">
          <div>
            <span>Actividades evaluadas</span>
            <strong>{formatearEntero(actividades.length)}</strong>
          </div>
          <div>
            <span>Rankings principales</span>
            <strong>{formatearEntero(obligatorios)}</strong>
          </div>
          <div>
            <span>Cortes cargados</span>
            <strong>{formatearEntero(cortes)}</strong>
          </div>
        </div>
      </header>

      {vista.tipo === "inicio" && (
        <nav className="saltos" aria-label="Ir a">
          <span>Ir a:</span>
          <button type="button" onClick={() => abrirActividad()}>
            Rankings por actividad
          </button>
          <button type="button" onClick={abrirDescargas}>
            Descargas
          </button>
          <button type="button" onClick={() => document.getElementById("resumen")?.scrollIntoView({ behavior: "smooth" })}>
            Resumen del corte
          </button>
        </nav>
      )}

      {vista.tipo === "inicio" && (
        <>
          <section className="seccion" aria-labelledby="titulo-actividades">
            <div className="seccion-head">
              <div>
                <h2 id="titulo-actividades">Rankings por actividad</h2>
                <small>
                  Saldo total por actividad · toque una para ver sus {formatearEntero(bancos)} bancos
                </small>
              </div>
              <button type="button" className="ver-mas" onClick={() => abrirActividad()}>
                VER MÁS <span aria-hidden="true">›</span>
              </button>
            </div>
            <div className="grid-tarjetas">
              {actividades.map((a) => (
                <button key={a.ranking} type="button" className="tarjeta-tema" onClick={() => abrirActividad(a.ranking)}>
                  <span className="tt-etiqueta">{a.nombre}</span>
                  <strong className="tt-cifra">{formatearMontoCompacto(a.saldo_total)}</strong>
                </button>
              ))}
            </div>
          </section>

          {lideres}

          <section className="seccion descargas-fila" aria-labelledby="titulo-descargas">
            <h2 id="titulo-descargas">Descargas</h2>
            <div className="descargas-botones">
              <BotonDescarga href={urlsDescarga.rankings} parametros={{ fecha }} texto="Rankings" variante="primario" />
              <BotonDescarga href={urlsDescarga.desglose} parametros={{ fecha }} texto="Desglose por subactividad" />
            </div>
          </section>
        </>
      )}

      {vista.tipo === "actividad" && actividad && (
        <section className="seccion detalle" aria-labelledby="titulo-actividad">
          <button type="button" className="volver" onClick={volver}>
            ‹ Volver a inicio
          </button>
          <div className="seccion-head">
            <div>
              <h2 id="titulo-actividad">{actividad.nombre}</h2>
              <small>Bancos ordenados por saldo en esta actividad · puesto 1 = mayor saldo</small>
            </div>
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
                  <span className="lv-peso cifra">{formatearPorcentaje(f.ponderacion_pct, 2)}</span>
                </li>
              ));
            })()}
          </ol>
          <p className="nota-visitante">
            Peso = saldo de esta actividad dividido entre la cartera local válida total del banco.{" "}
            <Link href={actividad.href}>Ver el ranking completo con su desglose</Link>
          </p>
        </section>
      )}

      {vista.tipo === "descargas" && (
        <section className="seccion detalle" aria-labelledby="titulo-descargas-detalle">
          <button type="button" className="volver" onClick={volver}>
            ‹ Volver a inicio
          </button>
          <div className="seccion-head">
            <div>
              <h2 id="titulo-descargas-detalle">Descargas</h2>
              <small>Período {formatearFecha(fecha)} ({fecha})</small>
            </div>
          </div>
          <div className="flex flex-row flex-wrap items-start gap-3">
            <BotonDescarga href={urlsDescarga.rankings} parametros={{ fecha }} texto="Rankings por actividad" variante="primario" />
            <BotonDescarga href={urlsDescarga.desglose} parametros={{ fecha }} texto="Desglose por subactividad" />
          </div>
          <p className="nota-visitante">
            Más reportes en <Link href="/reportes">Reportes</Link>.
          </p>
        </section>
      )}

    </div>
  );
}
