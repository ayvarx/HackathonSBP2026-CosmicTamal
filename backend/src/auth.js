// Inicio de sesión básico y control de acceso por rol.
// Las cuentas viven en backend/usuarios.json (no se sube al repositorio) y las claves se guardan cifradas (scrypt).
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
export const ARCHIVO_USUARIOS = path.resolve(process.env.USUARIOS_ARCHIVO || path.join(AQUI, "..", "usuarios.json"));
export const ROLES = ["publico", "analista", "admin"];
const DURACION_SESION = 8 * 60 * 60 * 1000; // 8 horas
const sesiones = new Map(); // token -> { usuario, rol, expira }

export function leerUsuarios() {
  if (!fs.existsSync(ARCHIVO_USUARIOS)) return [];
  return JSON.parse(fs.readFileSync(ARCHIVO_USUARIOS, "utf8"));
}

function cifrar(clave, salt) {
  return crypto.scryptSync(clave, salt, 64).toString("hex");
}

export function crearUsuario(usuario, rol, clave) {
  if (!ROLES.includes(rol)) throw new Error(`Rol inválido. Use uno de: ${ROLES.join(", ")}`);
  if (!usuario || !clave) throw new Error("Usuario y clave son obligatorios.");
  const salt = crypto.randomBytes(16).toString("hex");
  const lista = leerUsuarios().filter((u) => u.usuario !== usuario);
  lista.push({ usuario, rol, salt, hash: cifrar(clave, salt) });
  fs.writeFileSync(ARCHIVO_USUARIOS, JSON.stringify(lista, null, 2));
}

function claveCorrecta(clave, u) {
  const a = Buffer.from(cifrar(clave, u.salt), "hex");
  const b = Buffer.from(u.hash, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function iniciarSesion(usuario, clave) {
  const u = leerUsuarios().find((x) => x.usuario === usuario);
  if (!u || !claveCorrecta(String(clave ?? ""), u)) return null;
  const token = crypto.randomBytes(32).toString("hex");
  sesiones.set(token, { usuario: u.usuario, rol: u.rol, expira: Date.now() + DURACION_SESION });
  return { token, usuario: u.usuario, rol: u.rol };
}

export function sesionDe(req) {
  const cabecera = req.headers.authorization || "";
  const token = cabecera.startsWith("Bearer ") ? cabecera.slice(7) : null;
  if (!token) return null;
  const s = sesiones.get(token);
  if (!s) return null;
  if (s.expira < Date.now()) {
    sesiones.delete(token);
    return null;
  }
  return { token, usuario: s.usuario, rol: s.rol };
}

export function cerrarSesion(token) {
  sesiones.delete(token);
}

// Middleware: exige sesión iniciada para usar los datos.
export function requerirSesion(req, res, next) {
  const s = sesionDe(req);
  if (!s) return res.status(401).json({ error: "Inicie sesión para ver los datos." });
  req.sesion = s;
  next();
}

// Acceso como visitante: sesión con rol "publico" sin usuario ni clave.
export function iniciarSesionVisitante() {
  const token = crypto.randomBytes(32).toString("hex");
  sesiones.set(token, { usuario: "visitante", rol: "publico", expira: Date.now() + DURACION_SESION });
  return { token, usuario: "visitante", rol: "publico" };
}
