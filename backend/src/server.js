import express from "express";
import cors from "cors";
import { DATOS_DIR, datosListos, periodos, resultado } from "./servicio.js";

const app = express();
const PORT = process.env.PORT || 8000;
const SIN_DATOS = {
  error: "No hay datos cargados.",
  detalle: `Coloque el paquete AT03 de la SBP en la carpeta: ${DATOS_DIR}`,
};

// Acepta el frontend local en localhost o 127.0.0.1, en cualquier puerto (la API es de solo lectura).
// Para otro origen, define FRONTEND_ORIGIN.
const origenLocal = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
app.use(cors({
  origin: (origen, cb) => {
    if (!origen || origenLocal.test(origen) || origen === process.env.FRONTEND_ORIGIN) return cb(null, true);
    cb(new Error(`Origen no permitido: ${origen}`));
  },
}));
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, datos_cargados: datosListos() });
});

app.get("/api/periodos", (_req, res) => {
  const lista = periodos();
  if (lista === null) return res.status(503).json(SIN_DATOS);
  res.json(lista);
});

// Pide un período; responde 503 si no hay datos y 404 si el período no existe.
function conPeriodo(handler) {
  return (req, res) => {
    const r = resultado(req.params.fecha);
    if (r === null) return res.status(503).json(SIN_DATOS);
    if (r === undefined) return res.status(404).json({ error: `Período ${req.params.fecha} no encontrado.` });
    handler(r, req, res);
  };
}

app.get("/api/periodos/:fecha/calidad", conPeriodo((r, _req, res) => res.json(r.calidad)));

app.get("/api/periodos/:fecha/rankings", conPeriodo((r, _req, res) => res.json(r.rankings)));

app.get("/api/periodos/:fecha/rankings/:ranking", conPeriodo((r, req, res) => {
  const filas = r.rankings[req.params.ranking];
  if (!filas) return res.status(404).json({ error: `Ranking ${req.params.ranking} no existe.` });
  res.json(filas);
}));

app.get("/api/periodos/:fecha/desglose", conPeriodo((r, _req, res) => res.json(r.desglose)));

app.get("/api/periodos/:fecha/reconciliaciones", conPeriodo((r, _req, res) => res.json(r.reconciliaciones)));

// Exportación CSV del entregable 2 (Sección 10): columnas en el orden exacto del reto.
const COLUMNAS_RANKING = [
  "Fecha", "Ranking", "Posicion", "Codigo_Banco", "Banco",
  "Saldo_Actividad", "Total_Cartera_Local_Valida", "Ponderacion_Pct", "Operaciones_Validas",
];

function aCsv(filas, columnas) {
  const escapar = (v) => {
    const t = String(v ?? "");
    return /[",\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  return [columnas.join(","), ...filas.map((f) => columnas.map((c) => escapar(f[c])).join(","))].join("\r\n") + "\r\n";
}

app.get("/api/periodos/:fecha/exportar/rankings.csv", conPeriodo((r, req, res) => {
  const filas = Object.values(r.rankings).flat();
  res.type("text/csv; charset=utf-8");
  res.attachment(`rankings_${req.params.fecha}.csv`);
  res.send("﻿" + aCsv(filas, COLUMNAS_RANKING));
}));

app.get("/api/periodos/:fecha/exportar/desglose.csv", conPeriodo((r, req, res) => {
  res.type("text/csv; charset=utf-8");
  res.attachment(`desglose_${req.params.fecha}.csv`);
  res.send("﻿" + aCsv(r.desglose, ["Fecha", "Ranking", "Subactividad", "Codigo_Banco", "Saldo"]));
}));

app.listen(PORT, () => {
  console.log(`Backend en http://localhost:${PORT} (datos: ${DATOS_DIR})`);
});
