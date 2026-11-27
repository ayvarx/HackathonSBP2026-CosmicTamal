import express from "express";
import cors from "cors";
import { DATOS_DIR, datosListos, periodos, resultado } from "./servicio.js";
import { aCsv, aExcel, aPdf, COLUMNAS_RANKING, COLUMNAS_DESGLOSE } from "./exportar.js";
import { iniciarSesion, iniciarSesionVisitante, cerrarSesion, sesionDe, requerirSesion } from "./auth.js";

const app = express();
const PORT = process.env.PORT || 8000;
const SIN_DATOS = {
  error: "No hay datos cargados.",
  detalle: `Coloque el paquete AT03 de la SBP en la carpeta: ${DATOS_DIR}`,
};

// Acepta el frontend local en localhost o 127.0.0.1, en cualquier puerto.
// Para otro origen, define FRONTEND_ORIGIN.
const origenLocal = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
app.use(cors({
  origin: (origen, cb) => {
    if (!origen || origenLocal.test(origen) || origen === process.env.FRONTEND_ORIGIN) return cb(null, true);
    cb(new Error(`Origen no permitido: ${origen}`));
  },
}));
app.use(express.json());

// Públicas: estado del servicio e inicio/cierre de sesión.
app.get("/api/health", (_req, res) => {
  res.json({ ok: true, datos_cargados: datosListos() });
});

app.post("/api/login", (req, res) => {
  const s = iniciarSesion(req.body?.usuario, req.body?.clave);
  if (!s) return res.status(401).json({ error: "Usuario o clave incorrectos." });
  res.json(s);
});

app.post("/api/visitante", (_req, res) => {
  res.json(iniciarSesionVisitante());
});

app.post("/api/logout", (req, res) => {
  const s = sesionDe(req);
  if (s) cerrarSesion(s.token);
  res.json({ ok: true });
});

app.get("/api/sesion", requerirSesion, (req, res) => {
  res.json({ usuario: req.sesion.usuario, rol: req.sesion.rol });
});

// Protegidas: todos los datos exigen sesión iniciada.
app.use("/api/periodos", requerirSesion);

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

// Exportación de rankings y desglose en CSV, Excel (.xlsx) y PDF: /exportar/<rankings|desglose>.<csv|xlsx|pdf>
const TIPOS_ARCHIVO = {
  csv: "text/csv; charset=utf-8",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pdf: "application/pdf",
};

app.get("/api/periodos/:fecha/exportar/:archivo", conPeriodo(async (r, req, res) => {
  const m = /^(rankings|desglose)\.(csv|xlsx|pdf)$/.exec(req.params.archivo);
  if (!m) return res.status(404).json({ error: "Formato de exportación no disponible. Use csv, xlsx o pdf." });
  const [, contenido, formato] = m;
  const filas = contenido === "rankings" ? Object.values(r.rankings).flat() : r.desglose;
  const columnas = contenido === "rankings" ? COLUMNAS_RANKING : COLUMNAS_DESGLOSE;
  try {
    const cuerpo = formato === "csv" ? aCsv(filas, columnas)
      : formato === "xlsx" ? await aExcel(filas, columnas, contenido, req.params.fecha)
      : await aPdf(filas, columnas, contenido, req.params.fecha);
    res.type(TIPOS_ARCHIVO[formato]);
    res.attachment(`${contenido}_${req.params.fecha}.${formato}`);
    res.send(cuerpo);
  } catch (e) {
    res.status(500).json({ error: `No se pudo generar el archivo: ${e.message}` });
  }
}));

app.listen(PORT, () => {
  console.log(`Backend en http://localhost:${PORT} (datos: ${DATOS_DIR})`);
});
