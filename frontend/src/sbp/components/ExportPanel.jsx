import { useState } from "react";
import { api } from "../api";
import StatusNotice from "./StatusNotice";

export default function ExportPanel({ period }) {
  const [kind, setKind] = useState("rankings");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const exportFile = async () => {
    if (!period) return;
    setBusy(true); setError(""); setStatus("");
    try { await api.download(period, kind); setStatus("La descarga fue preparada por la API."); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };
  return <div className="panel export-panel">
    <span className="eyebrow">SALIDA DE DATOS</span><h2>Exportar resultados</h2>
    <p className="helper-text">Descarga el archivo correspondiente al período activo. La exportación conserva los datos entregados por el backend.</p>
    <label className="field"><span>Contenido</span><select value={kind} onChange={(e) => setKind(e.target.value)}>
      <option value="rankings">Rankings consolidados (CSV)</option>
      <option value="desglose">Desglose por subactividad (CSV)</option>
    </select></label>
    <button className="primary-button" onClick={exportFile} disabled={!period || busy}>{busy ? "Preparando…" : "Descargar CSV"}</button>
    {error && <StatusNotice type="error">{error}</StatusNotice>}
    {status && <StatusNotice type="success">{status}</StatusNotice>}
  </div>;
}
