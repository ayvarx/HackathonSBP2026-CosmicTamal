import { API_BASE } from "./constants";

async function request(path, options) {
  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, options);
  } catch {
    throw new Error("No se pudo conectar con la API local. Verifica que Express esté activo en el puerto configurado.");
  }

  if (!response.ok) {
    let body = {};
    try { body = await response.json(); } catch { /* respuesta sin JSON */ }
    if (response.status === 503) {
      throw new Error(body.detalle || body.error || "Todavía no hay datos cargados para consultar.");
    }
    if (response.status === 404) {
      throw new Error(body.detalle || body.error || "El período o ranking solicitado no existe.");
    }
    throw new Error(body.detalle || body.error || `Error de API (${response.status}).`);
  }
  return response;
}

export const api = {
  health: async () => (await request("/api/health")).json(),
  periods: async () => (await request("/api/periodos")).json(),
  quality: async (date) => (await request(`/api/periodos/${date}/calidad`)).json(),
  rankings: async (date) => (await request(`/api/periodos/${date}/rankings`)).json(),
  ranking: async (date, name) => (await request(`/api/periodos/${date}/rankings/${encodeURIComponent(name)}`)).json(),
  breakdown: async (date) => (await request(`/api/periodos/${date}/desglose`)).json(),
  reconciliations: async (date) => (await request(`/api/periodos/${date}/reconciliaciones`)).json(),
  download: async (date, kind) => {
    const filename = kind === "desglose" ? "desglose.csv" : "rankings.csv";
    const response = await request(`/api/periodos/${date}/exportar/${filename}`);
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${kind}-${date}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  },
};
