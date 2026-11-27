import { useMemo, useState } from "react";
import { RANKING_LABELS } from "../constants";
import BancoCard from "./BancoCard";
import BancoDetalle from "./BancoDetalle";
import { descargarBanco } from "../descargaBanco";
import "./rankings.css";

// Pantalla de Rankings: una sección con dos pestañas.
//   1. Elegir la actividad económica.
//   2. Pestaña "Posiciones": podio de los tres primeros y lista del resto con barra proporcional.
//   3. Pestaña "Composición": una tarjeta por banco con su saldo, evolución y reparto por subactividad.
const numero = (v) => Number(String(v ?? "0").replaceAll(",", ""));
const dinero = (v) => new Intl.NumberFormat("es-PA", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(numero(v));
const porcentaje = (v) => `${Number(v).toLocaleString("es-PA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} %`;
const etiquetaPeriodo = (p) => `${p.slice(0, 4)}-${p.slice(4, 6)}-${p.slice(6, 8)}`;
// Colores de tonos muy distintos entre sí, para que cada subactividad se distinga de un vistazo.
const COLORES = ["#021335", "#1D3E7F", "#93c5fd", "#0ea5e9", "#4C7DB8", "#64748b", "#5B82C8", "#30648C"];

const PESTANAS = [
  { id: "posiciones", titulo: "Posiciones" },
  { id: "composicion", titulo: "Composición" },
];

export default function RankingsPage({ rankings, ranking, setRanking, breakdown, historico, loading, selector, profile }) {
  const [pestana, setPestana] = useState("posiciones");
  // La pestaña Composición es solo para el perfil Analista.
  const pestanaActiva = profile === "analista" ? pestana : "posiciones";
  const [busqueda, setBusqueda] = useState("");
  const [seleccionado, setSeleccionado] = useState(null);
  const nombres = Object.keys(rankings || {});
  const filas = rankings?.[ranking] || [];
  const periodos = useMemo(() => Object.keys(historico || {}).sort(), [historico]);

  const subactividades = useMemo(() => {
    const vistas = [];
    for (const d of breakdown || []) {
      if (d.Ranking === ranking && !vistas.includes(d.Subactividad)) vistas.push(d.Subactividad);
    }
    return vistas;
  }, [breakdown, ranking]);

  const colorDe = (s) => COLORES[subactividades.indexOf(s) % COLORES.length];

  // Saldo por banco y subactividad.
  const composicion = useMemo(() => {
    const porBanco = new Map();
    for (const d of breakdown || []) {
      if (d.Ranking !== ranking) continue;
      if (!porBanco.has(d.Codigo_Banco)) porBanco.set(d.Codigo_Banco, {});
      porBanco.get(d.Codigo_Banco)[d.Subactividad] = numero(d.Saldo);
    }
    return porBanco;
  }, [breakdown, ranking]);

  // Evolución del saldo total de un banco en esta actividad, en cada período cargado.
  const serieDe = (codigo) => periodos.map((p) => ({
    periodo: etiquetaPeriodo(p),
    valor: numero(historico[p]?.rankings?.[ranking]?.find((r) => r.Codigo_Banco === codigo)?.Saldo_Actividad),
  }));

  const maximo = Math.max(1, ...filas.map((f) => numero(f.Saldo_Actividad)));
  const visibles = filas.filter((f) => !busqueda.trim() || f.Banco.toLowerCase().includes(busqueda.trim().toLowerCase()));
  const podio = visibles.filter((f) => Number(f.Posicion) <= 3);
  const resto = visibles.filter((f) => Number(f.Posicion) > 3);

  // Detalle del banco seleccionado (solo en la pestaña Composición).
  const seleccion = seleccionado ? filas.find((f) => f.Codigo_Banco === seleccionado) : null;
  const detalle = seleccion ? (() => {
    const cod = seleccion.Codigo_Banco;
    const fila = composicion.get(cod) || {};
    const partesSel = subactividades.map((s) => ({ nombre: s, valor: fila[s] || 0, color: colorDe(s) })).filter((p) => p.valor > 0);
    const posicionesPeriodos = periodos.map((p) => ({
      periodo: etiquetaPeriodo(p),
      posicion: historico[p]?.rankings?.[ranking]?.find((r) => r.Codigo_Banco === cod)?.Posicion ?? "—",
    }));
    const otras = nombres.map((n) => {
      const r = rankings[n]?.find((x) => x.Codigo_Banco === cod);
      return { nombre: RANKING_LABELS[n] || n, posicion: r?.Posicion ?? "—", saldo: r ? numero(r.Saldo_Actividad) : 0, activa: n === ranking };
    });
    return (
      <BancoDetalle
        banco={seleccion.Banco}
        posicion={seleccion.Posicion}
        actividad={RANKING_LABELS[ranking] || ranking}
        saldo={numero(seleccion.Saldo_Actividad)}
        porcentaje={porcentaje(seleccion.Ponderacion_Pct)}
        operaciones={seleccion.Operaciones_Validas}
        lider={numero(filas[0]?.Saldo_Actividad)}
        partes={partesSel}
        posicionesPeriodos={posicionesPeriodos}
        otras={otras}
        onCerrar={() => setSeleccionado(null)}
      />
    );
  })() : null;

  return (
    <div className="panel rk-seccion">
      <div className="rk-actividad">
        <span className="eyebrow">ACTIVIDAD ECONÓMICA</span>
        <div className="fila-chips">
          <div className="chips grande">
            {nombres.map((n) => (
              <button key={n} className={`chip ${n === ranking ? "on" : ""}`} onClick={() => setRanking(n)}>
                {RANKING_LABELS[n] || n}
              </button>
            ))}
          </div>
          {selector}
        </div>
        {subactividades.length > 0 && (
          <p className="incluye">Incluye: {subactividades.join(" · ")}</p>
        )}
      </div>

      <div className="rk-pestanas" role="tablist">
        {PESTANAS.filter((p) => p.id === "posiciones" || profile === "analista").map((p) => (
          <button
            key={p.id}
            role="tab"
            aria-selected={pestanaActiva === p.id}
            className={pestanaActiva === p.id ? "on" : ""}
            onClick={() => setPestana(p.id)}
          >
            {p.titulo}
          </button>
        ))}
      </div>

      {loading ? <div className="skeleton-line" /> : pestanaActiva === "posiciones" ? (
        <div role="tabpanel" className="rk-contenido">
          <div className="rk-sub-head">
            <p className="nota-corta">Puesto 1 = mayor saldo en esta actividad. La barra compara cada banco con el primero.</p>
            <label className="field buscador">
              <span>Buscar banco</span>
              <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Nombre del banco" />
            </label>
          </div>

          {!visibles.length && <p className="empty-inline">Ningún banco coincide con la búsqueda.</p>}

          {podio.length > 0 && (
            <div className="podio">
              {podio.map((f) => (
                <article key={f.Codigo_Banco} className={`podio-card pod-${f.Posicion}`}>
                  <span className="podio-puesto">{f.Posicion}</span>
                  <strong className="podio-banco">{f.Banco}</strong>
                  <span className="podio-saldo">{dinero(f.Saldo_Actividad)}</span>
                  <span className="podio-detalle">{porcentaje(f.Ponderacion_Pct)} de su cartera · {f.Operaciones_Validas} préstamos</span>
                </article>
              ))}
            </div>
          )}

          {resto.length > 0 && (
            <ol className="lista-pos">
              {resto.map((f) => (
                <li key={f.Codigo_Banco} className="fila-pos">
                  <span className="fila-puesto">{f.Posicion}</span>
                  <span className="fila-banco">{f.Banco}</span>
                  <div className="fila-barra" aria-hidden="true">
                    <div style={{ width: `${(numero(f.Saldo_Actividad) / maximo) * 100}%` }} />
                  </div>
                  <span className="fila-saldo">{dinero(f.Saldo_Actividad)}</span>
                  <span className="fila-extra">{porcentaje(f.Ponderacion_Pct)} · {f.Operaciones_Validas} prést.</span>
                </li>
              ))}
            </ol>
          )}

          <details className="definiciones">
            <summary>¿Qué significa cada dato?</summary>
            <ul>
              <li><b>Saldo:</b> suma de los préstamos del banco en la actividad elegida.</li>
              <li><b>Porcentaje:</b> ese saldo dividido entre toda la cartera válida del banco.</li>
              <li><b>Préstamos:</b> cuántos préstamos forman el saldo.</li>
            </ul>
          </details>
        </div>
      ) : (
        <div role="tabpanel" className="rk-contenido">
          <p className="nota-corta">
            Una tarjeta por banco: su saldo total en esta actividad, la evolución en los cortes cargados y el reparto por subactividad.
          </p>
          {detalle}
          <div className="bancos-grid">
            {filas.filter((f) => !busqueda.trim() || f.Banco.toLowerCase().includes(busqueda.trim().toLowerCase())).map((f) => {
              const fila = composicion.get(f.Codigo_Banco) || {};
              const partes = subactividades.map((s) => ({ nombre: s, valor: fila[s] || 0, color: colorDe(s) })).filter((p) => p.valor > 0);
              return (
                <BancoCard
                  key={f.Codigo_Banco}
                  posicion={f.Posicion}
                  banco={f.Banco}
                  saldo={numero(f.Saldo_Actividad)}
                  serie={serieDe(f.Codigo_Banco)}
                  partes={partes}
                  onDescargar={() => descargarBanco({ banco: f.Banco, codigo: f.Codigo_Banco, actividad: RANKING_LABELS[ranking] || ranking, ranking, historico, partes })}
                  seleccionada={seleccionado === f.Codigo_Banco}
                  onSelect={() => setSeleccionado(seleccionado === f.Codigo_Banco ? null : f.Codigo_Banco)}
                />
              );
            })}
          </div>
          <details className="definiciones">
            <summary>¿Cómo leer las tarjetas?</summary>
            <p>La cifra grande es el saldo total del banco en esta actividad. La línea muestra cómo cambió en los cortes cargados. La barra y la lista reparten ese saldo entre las subactividades, con su monto y su porcentaje.</p>
          </details>
        </div>
      )}
    </div>
  );
}
