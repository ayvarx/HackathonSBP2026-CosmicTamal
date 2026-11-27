import { API_BASE } from "./constants";

// Token de la sesión iniciada. Se guarda solo en esta pestaña (sessionStorage).
const CLAVE_TOKEN = "sbp_token";
const obtenerToken = () => {
  try { return sessionStorage.getItem(CLAVE_TOKEN); } catch { return null; }
};
export const guardarToken = (t) => {
  try { t ? sessionStorage.setItem(CLAVE_TOKEN, t) : sessionStorage.removeItem(CLAVE_TOKEN); } catch { /* sin almacenamiento */ }
};

async function request(path, options = {}) {
  const token = obtenerToken();
  const cabeceras = { ...(options.headers || {}) };
  if (token) cabeceras.Authorization = `Bearer ${token}`;
  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, { ...options, headers: cabeceras });
  } catch {
    throw new Error("No se pudo conectar con la API local. Verifica que Express esté activo en el puerto configurado.");
  }

  if (!response.ok) {
    let body = {};
    try { body = await response.json(); } catch { /* respuesta sin JSON */ }
    if (response.status === 401 && token) {
      // La sesión venció o no es válida: se avisa para volver al inicio de sesión.
      guardarToken(null);
      window.dispatchEvent(new Event("sesion-caducada"));
    }
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
  login: async (usuario, clave) => {
    const r = await fetch(`${API_BASE}/api/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ usuario, clave }),
    }).catch(() => { throw new Error("No se pudo conectar con la API local."); });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(body.error || "No se pudo iniciar sesión.");
    guardarToken(body.token);
    return body;
  },
  logout: async () => {
    try { await request("/api/logout", { method: "POST" }); } catch { /* ya cerrada */ }
    guardarToken(null);
  },
  visitante: async () => {
    const r = await fetch(`${API_BASE}/api/visitante`, { method: "POST" }).catch(() => { throw new Error("No se pudo conectar con la API local."); });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(body.error || "No se pudo entrar como visitante.");
    guardarToken(body.token);
    return body;
  },
  sesion: async () => (await request("/api/sesion")).json(),
  periods: async () => (await request("/api/periodos")).json(),
  quality: async (date) => (await request(`/api/periodos/${date}/calidad`)).json(),
  rankings: async (date) => (await request(`/api/periodos/${date}/rankings`)).json(),
  ranking: async (date, name) => (await request(`/api/periodos/${date}/rankings/${encodeURIComponent(name)}`)).json(),
  breakdown: async (date) => (await request(`/api/periodos/${date}/desglose`)).json(),
  reconciliations: async (date) => (await request(`/api/periodos/${date}/reconciliaciones`)).json(),
  // Descarga (CSV, Excel o PDF) con la sesión iniciada (un enlace directo no enviaría el token).
  download: async (date, kind, formato = "csv") => {
    const response = await request(`/api/periodos/${date}/exportar/${kind}.${formato}`);
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${kind}_${date}.${formato}`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  },
};
