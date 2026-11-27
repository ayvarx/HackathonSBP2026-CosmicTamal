"use client";
// Portado del frontend de Amet: components/ExportPanel.jsx (enlaza a /api/exportar/* en lugar de api.js).
import { useState } from "react";
import "./amet-export.css";

const TIPOS = {
  rankings: { texto: "Rankings consolidados (CSV)", href: "/api/exportar/rankings" },
  desglose: { texto: "Desglose por subactividad (CSV)", href: "/api/exportar/subactividades" },
};

/** @param {{periodo: string, textoPeriodo: string}} props periodo = AAAAMMDD activo ("" = todos). */
export default function ExportPanel({ periodo, textoPeriodo }) {
  const [tipo, setTipo] = useState("rankings");
  const destino = TIPOS[tipo].href + (periodo ? `?fecha=${encodeURIComponent(periodo)}` : "");
  return (
    <div className="amet-exp">
      <div className="panel export-panel">
        <span className="eyebrow">ACCESO RÁPIDO</span>
        <h2>Exportar resultados</h2>
        <p className="helper-text">Descarga el archivo del período activo ({textoPeriodo}). Los datos salen del motor SQL, sin recalcular.</p>
        <label className="field">
          <span>Contenido</span>
          <select value={tipo} onChange={(e) => setTipo(e.target.value)}>
            {Object.entries(TIPOS).map(([k, v]) => <option key={k} value={k}>{v.texto}</option>)}
          </select>
        </label>
        <a className="primary-button" href={destino} download>Descargar CSV</a>
      </div>
    </div>
  );
}
