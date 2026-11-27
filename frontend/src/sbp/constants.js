export const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

// Navegación simplificada: cada sección responde a una pregunta del usuario.
//   Inicio      → ¿cómo está la cartera este mes?
//   Rankings    → ¿quién ocupa cada posición y qué compone su saldo?
//   Calidad     → ¿los datos son confiables? (analista y administrador)
//   Exportar    → ¿cómo me llevo los datos?
//   Administración → operación del sistema (solo administrador)
export const NAV_ITEMS = [
  { id: "datos", label: "Inicio", profiles: ["publico", "analista", "admin"] },
  { id: "rankings", label: "Rankings", profiles: ["publico", "analista", "admin"] },
  { id: "calidad", label: "Calidad", profiles: ["analista", "admin"] },
  { id: "exportar", label: "Exportar", profiles: ["publico", "analista", "admin"] },
  { id: "administracion", label: "Administración", profiles: ["admin"] },
];

export const PROFILE_LABELS = {
  publico: "Público",
  analista: "Analista",
  admin: "Administrador",
};

export const RANKING_LABELS = {
  HIPOTECARIO: "Hipotecario",
  CONSTRUCCION: "Construcción",
  INDUSTRIA: "Industria",
  AGROPECUARIO: "Agropecuario",
  COMERCIO: "Comercio",
  CONSUMO: "Consumo",
};

// Presenta un código de período como fecha legible: "20260930" -> "2026-09-30".
export const etiquetaPeriodo = (codigo) =>
  codigo && codigo.length === 8 ? `${codigo.slice(0, 4)}-${codigo.slice(4, 6)}-${codigo.slice(6, 8)}` : codigo || "";
