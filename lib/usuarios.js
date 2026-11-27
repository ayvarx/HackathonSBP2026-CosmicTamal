// lib/usuarios.js — Cuentas de acceso guardadas en la base (tabla usuarios).
// Claves cifradas con scrypt (salt aleatorio por cuenta) y comparación con timingSafeEqual.
// Ninguna clave vive en el repositorio: las cuentas se crean con  npm run usuario -- <usuario> <rol> <clave>.
// Solo para el servidor.
import crypto from "node:crypto";
import { consulta } from "./db.js";

/** Cookie solo informativa con el nombre de usuario (los permisos salen de la cookie de perfil firmada). */
export const COOKIE_USUARIO = "sbp_usuario";

export const ROLES_USUARIO = ["publico", "analista", "administrador"];

let tablaLista = null;
function asegurarTabla() {
  if (!tablaLista) {
    tablaLista = (async () => {
      await consulta(`CREATE TABLE IF NOT EXISTS usuarios (
        usuario TEXT PRIMARY KEY,
        rol TEXT NOT NULL CHECK (rol IN ('publico','analista','administrador')),
        salt TEXT NOT NULL,
        hash TEXT NOT NULL,
        creado_en TIMESTAMPTZ NOT NULL DEFAULT now()
      )`);
      await consulta("ALTER TABLE usuarios ENABLE ROW LEVEL SECURITY");
    })().catch((error) => {
      tablaLista = null;
      throw error;
    });
  }
  return tablaLista;
}

function cifrar(clave, salt) {
  return crypto.scryptSync(clave, salt, 64).toString("hex");
}

/** Crea o reemplaza una cuenta. */
export async function crearUsuario(usuario, rol, clave) {
  const nombre = String(usuario ?? "").trim();
  if (!ROLES_USUARIO.includes(rol)) throw new Error(`Rol inválido. Use uno de: ${ROLES_USUARIO.join(", ")}`);
  if (!nombre || !clave) throw new Error("Usuario y clave son obligatorios.");
  await asegurarTabla();
  const salt = crypto.randomBytes(16).toString("hex");
  await consulta(
    `INSERT INTO usuarios (usuario, rol, salt, hash) VALUES ($1, $2, $3, $4)
     ON CONFLICT (usuario) DO UPDATE SET rol = EXCLUDED.rol, salt = EXCLUDED.salt, hash = EXCLUDED.hash`,
    [nombre, rol, salt, cifrar(String(clave), salt)],
  );
}

/** Devuelve { usuario, rol } si la clave es correcta; si no, null. */
export async function verificar(usuario, clave) {
  const nombre = String(usuario ?? "").trim();
  if (!nombre) return null;
  await asegurarTabla();
  const [u] = await consulta("SELECT usuario, rol, salt, hash FROM usuarios WHERE usuario = $1", [nombre]);
  // Se calcula el hash aunque la cuenta no exista, para no revelar qué usuarios existen por el tiempo.
  const salt = u?.salt ?? "0".repeat(32);
  const a = Buffer.from(cifrar(String(clave ?? ""), salt), "hex");
  const b = Buffer.from(u?.hash ?? "0".repeat(128), "hex");
  const ok = a.length === b.length && crypto.timingSafeEqual(a, b);
  return u && ok && ROLES_USUARIO.includes(u.rol) ? { usuario: u.usuario, rol: u.rol } : null;
}
