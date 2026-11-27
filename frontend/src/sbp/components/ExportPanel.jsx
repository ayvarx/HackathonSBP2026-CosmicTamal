import { useState } from "react";
import { api } from "../api";
import StatusNotice from "./StatusNotice";
import "./exportar.css";

// Descarga de resultados del período activo en CSV, Excel (.xlsx) y PDF.
const CONTENIDOS = [
  {
    id: "rankings", titulo: "Rankings por actividad", etiqueta: "Entregable 2",
    texto: "Posición, saldo, cartera total y peso de cada banco en las seis actividades.",
    icono: <path d="M5 20V10M12 20V4M19 20v-7" />,
  },
  {
    id: "desglose", titulo: "Desglose por subactividad", etiqueta: "Entregable 3",
    texto: "Saldo de cada banco en cada subactividad, con la reclasificación SB21 aplicada.",
    icono: <><circle cx="12" cy="12" r="8" /><path d="M12 4v8l6 4" /></>,
  },
];
const FORMATOS = [
  { id: "csv", nombre: "CSV", detalle: "Texto separado por comas", marca: "CSV" },
  { id: "xlsx", nombre: "Excel", detalle: "Hoja de cálculo .xlsx", marca: "XLS" },
  { id: "pdf", nombre: "PDF", detalle: "Documento para imprimir", marca: "PDF" },
];

function IconoArchivo({ marca }) {
  return (
    <svg viewBox="0 0 48 56" width="46" height="54" aria-hidden="true" className="exp-doc">
      <path d="M6 2h24l12 12v38a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z" fill="#fff" stroke="currentColor" strokeWidth="2" />
      <path d="M30 2v10a2 2 0 0 0 2 2h10" fill="none" stroke="currentColor" strokeWidth="2" />
      <rect x="4" y="30" width="38" height="14" rx="2" fill="currentColor" />
      <text x="23" y="41" textAnchor="middle" fontSize="10" fontWeight="800" fill="#fff" fontFamily="inherit">{marca}</text>
    </svg>
  );
}

export default function ExportPanel({ period }) {
  const [ocupado, setOcupado] = useState("");
  const [estado, setEstado] = useState("");
  const [error, setError] = useState("");

  const descargar = async (contenido, formato) => {
    if (!period) return;
    const clave = `${contenido}.${formato}`;
    setOcupado(clave); setError(""); setEstado("");
    try {
      await api.download(period, contenido, formato);
      setEstado(`Descargado: ${clave}`);
    } catch (e) { setError(e.message); }
    finally { setOcupado(""); }
  };

  return (
    <div className="stack exportar">
      {error && <StatusNotice type="error">{error}</StatusNotice>}
      {estado && <StatusNotice type="success">{estado}</StatusNotice>}
      <div className="exp-grid">
        {CONTENIDOS.map((c) => (
          <section key={c.id} className="exp-card">
            <header className="exp-cabecera">
              <span className="exp-icono">
                <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="#fff" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{c.icono}</svg>
              </span>
              <div>
                <span className="exp-etiqueta">{c.etiqueta}</span>
                <h3>{c.titulo}</h3>
              </div>
            </header>
            <p>{c.texto}</p>
            <div className="exp-formatos">
              {FORMATOS.map((f) => {
                const preparando = ocupado === `${c.id}.${f.id}`;
                return (
                  <button key={f.id} className={`exp-formato f-${f.id}`} onClick={() => descargar(c.id, f.id)} disabled={!period || !!ocupado}>
                    <IconoArchivo marca={f.marca} />
                    <b>{f.nombre}</b>
                    <small>{f.detalle}</small>
                    <span className="exp-boton">{preparando ? "Preparando…" : <>Descargar <i aria-hidden="true">↓</i></>}</span>
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
