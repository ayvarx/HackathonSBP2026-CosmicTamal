import { useState } from "react";
import { api } from "../api";
import { RANKING_LABELS } from "../constants";
import ExportPanel from "./ExportPanel";
import "./visitor.css";

// Portada para visitantes. Cada opción muestra su información en la misma pantalla
// y un botón permite volver a la portada.
const num = (v) => Number(String(v ?? "0").replaceAll(",", ""));
const fmt = (n) => new Intl.NumberFormat("es-PA", { maximumFractionDigits: 0 }).format(n);
const dinero = (v) => new Intl.NumberFormat("es-PA", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num(v));
const etiquetaPeriodo = (p) => (p ? `${p.slice(0, 4)}-${p.slice(4, 6)}-${p.slice(6, 8)}` : "—");

export default function VisitorHome({ quality, rankings, reconciliations, period, onIr, selector }) {
  const [vista, setVista] = useState({ tipo: "inicio" });
  const nombres = Object.keys(rankings || {});
  const bancos = nombres.length ? (rankings[nombres[0]] || []).length : 0;
  const ok = reconciliations ? Object.values(reconciliations).filter(Boolean).length : 0;
  const total = reconciliations ? Object.keys(reconciliations).length : 3;

  const abrirActividad = (nombre) => setVista({ tipo: "actividad", nombre: nombre || nombres[0] });
  const abrirDescargas = () => setVista({ tipo: "descargas" });
  const volver = () => setVista({ tipo: "inicio" });

  return (
    <div className="visitante">
      {vista.tipo === "inicio" && <nav className="saltos" aria-label="Ir a">
        <span>Ir a:</span>
        <button onClick={() => abrirActividad()}>Rankings por actividad</button>
        <button onClick={abrirDescargas}>Descargas</button>
        <span className="saltos-selector">{selector}</span>
      </nav>}

      {vista.tipo === "inicio" && (
        <>
          <section className="seccion">
            <div className="seccion-head">
              <div>
                <h2>Rankings por actividad</h2>
                <small>{nombres.length} actividades · {bancos} bancos</small>
              </div>
              <button className="ver-mas" onClick={() => abrirActividad()}>VIEW MORE <span aria-hidden="true">›</span></button>
            </div>
            <div className="grid-tarjetas">
              {nombres.map((n) => {
                const primero = (rankings[n] || []).find((f) => Number(f.Posicion) === 1);
                return (
                  <button key={n} className="tarjeta-tema" onClick={() => abrirActividad(n)}>
                    <span className="tt-etiqueta">{RANKING_LABELS[n] || n}</span>
                    <strong className="tt-cifra">{primero?.Banco ?? "—"}</strong>
                    <span className="tt-texto">Primer lugar por saldo en esta actividad</span>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="seccion">
            <div className="seccion-head">
              <div>
                <h2>Descargas</h2>
                <small>Rankings y desglose por subactividad en CSV</small>
              </div>
              <button className="ver-mas" onClick={abrirDescargas}>VIEW MORE <span aria-hidden="true">›</span></button>
            </div>
          </section>
        </>
      )}

      {vista.tipo === "actividad" && (
        <section className="seccion detalle">
          <button className="volver" onClick={volver}>‹ Volver a inicio</button>
          <div className="seccion-head">
            <div>
              <h2>{RANKING_LABELS[vista.nombre] || vista.nombre}</h2>
              <small>Bancos ordenados por saldo en esta actividad · puesto 1 = mayor saldo</small>
            </div>
          </div>
          <div className="fila-chips">
            <div className="chips-visitante">
              {nombres.map((n) => (
                <button key={n} className={n === vista.nombre ? "on" : ""} onClick={() => setVista({ tipo: "actividad", nombre: n })}>
                  {RANKING_LABELS[n] || n}
                </button>
              ))}
            </div>
            {selector}
          </div>
          <ol className="lista-visitante">
            {(rankings[vista.nombre] || []).map((f) => {
              const max = Math.max(1, ...(rankings[vista.nombre] || []).map((x) => num(x.Saldo_Actividad)));
              return (
                <li key={f.Codigo_Banco}>
                  <span className="lv-puesto">{f.Posicion}</span>
                  <span className="lv-banco">{f.Banco}</span>
                  <div className="lv-barra"><div style={{ width: `${(num(f.Saldo_Actividad) / max) * 100}%` }} /></div>
                  <span className="lv-saldo">{dinero(f.Saldo_Actividad)}</span>
                  <span className="lv-peso">{Number(f.Ponderacion_Pct).toFixed(2)} %</span>
                </li>
              );
            })}
          </ol>
          <p className="nota-visitante">Peso = saldo de esta actividad dividido entre la cartera válida total del banco.</p>
        </section>
      )}

      {vista.tipo === "descargas" && (
        <section className="seccion detalle">
          <button className="volver" onClick={volver}>‹ Volver a inicio</button>
          <div className="seccion-head">
            <div>
              <h2>Descargas</h2>
              <small>Período {etiquetaPeriodo(period)} · CSV, Excel y PDF</small>
            </div>
          </div>
          <ExportPanel period={period} />
        </section>
      )}

      <p className="periodo-pie">Período de corte: <b>{etiquetaPeriodo(period)}</b></p>

      <p className="pie-visitante">Datos ficticios con formato regulatorio. Uso informativo; no es una opinión formal de la SBP.</p>
    </div>
  );
}
