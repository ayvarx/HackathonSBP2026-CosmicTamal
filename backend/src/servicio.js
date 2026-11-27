// Capa de datos: lee el paquete de la SBP desde DATOS_DIR y calcula por período.
// Si el paquete no está, devuelve null: la API responde "sin datos" y nunca inventa cifras.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { leerCsv } from "./motor/csv.js";
import { calcularPeriodo } from "./motor/rankings.js";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
export const DATOS_DIR = path.resolve(process.env.DATOS_DIR || path.join(AQUI, "..", "..", "datos"));

const ARCHIVOS = {
  cinu: "Catalogo_CINU_SB109_reto.csv",
  bancos: "Bancos_ficticios.csv",
  sb21: "Tabla_SB21_simplificada.csv",
};

// Firma de los archivos: si cambia (nuevo corte, archivo reemplazado) se vuelve a leer todo.
function firma() {
  if (!fs.existsSync(DATOS_DIR)) return "";
  return fs.readdirSync(DATOS_DIR).sort().map((n) => {
    const s = fs.statSync(path.join(DATOS_DIR, n));
    return `${n}:${s.size}:${s.mtimeMs}`;
  }).join("|");
}

let estado = { clave: null, catalogos: null, at03: null };

// Lee y guarda en memoria catálogos y AT03; se rehace solo si cambian los archivos.
function cargar() {
  const clave = firma();
  if (estado.clave === clave) return estado;

  const faltan = Object.values(ARCHIVOS).some((n) => !fs.existsSync(path.join(DATOS_DIR, n)));
  const leer = (n) => leerCsv(fs.readFileSync(path.join(DATOS_DIR, n), "utf8"));

  let catalogos = null;
  if (!faltan) {
    const bancos = leer(ARCHIVOS.bancos).map((b) => ({ Codigo_Banco: b.Codigo_Banco, Banco: b.Nombre_Ficticio }));
    catalogos = { cinu: leer(ARCHIVOS.cinu), bancos, sb21: leer(ARCHIVOS.sb21) };
  }

  const at03 = new Map();
  if (fs.existsSync(DATOS_DIR)) {
    for (const nombre of fs.readdirSync(DATOS_DIR)) {
      if (!/^AT03_.*\.csv$/i.test(nombre)) continue;
      for (const fila of leer(nombre)) {
        if (!at03.has(fila.Fecha)) at03.set(fila.Fecha, []);
        at03.get(fila.Fecha).push(fila);
      }
    }
  }

  estado = { clave, catalogos, at03, resultados: new Map() };
  return estado;
}

export function datosListos() {
  const e = cargar();
  return e.catalogos !== null && e.at03.size > 0;
}

export function periodos() {
  if (!datosListos()) return null;
  return [...cargar().at03.keys()].sort();
}

// Resultado completo de un período: null si no hay datos, undefined si el período no existe.
export function resultado(fecha) {
  if (!datosListos()) return null;
  const e = cargar();
  if (e.resultados.has(fecha)) return e.resultados.get(fecha);
  const filas = e.at03.get(fecha);
  if (!filas) return undefined;
  const r = calcularPeriodo(fecha, filas, e.catalogos);
  e.resultados.set(fecha, r);
  return r;
}
