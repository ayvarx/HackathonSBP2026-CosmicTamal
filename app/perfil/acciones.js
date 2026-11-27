"use server";
// Acción de servidor del selector de perfil.
// La cookie se escribe aquí, en el servidor, firmada con HMAC (ver lib/auth.js).
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  NOMBRE_COOKIE,
  esPerfilValido,
  fijarPerfil,
  puedeVerRuta,
  rutaInternaSegura,
} from "@/lib/auth";
import { COOKIE_USUARIO, verificar } from "@/lib/usuarios";

/**
 * Recibe el formulario { perfil, volver } y fija el perfil elegido.
 * Luego vuelve a la pantalla de origen si el nuevo perfil puede verla; si no, al Panel.
 */
export async function cambiarPerfil(formulario) {
  const perfil = String(formulario.get("perfil") ?? "");
  // No se confía en el navegador: solo se aceptan los tres perfiles conocidos.
  if (!esPerfilValido(perfil)) redirect("/perfil?error=perfil");

  await fijarPerfil(perfil);
  (await cookies()).delete({ name: COOKIE_USUARIO, path: "/" });

  const volver = rutaInternaSegura(formulario.get("volver"), "/");
  redirect(puedeVerRuta(perfil, volver) ? volver : "/");
}

/** Cierra la sesión: borra la cookie de perfil y lleva a /login. */
export async function cerrarSesion() {
  const almacen = await cookies();
  almacen.delete({ name: NOMBRE_COOKIE, path: "/" });
  almacen.delete({ name: COOKIE_USUARIO, path: "/" });
  redirect("/login");
}

/**
 * Inicia sesión con usuario y clave. Si son correctos fija la cookie de perfil firmada con el
 * rol de la cuenta y lleva a "/"; si no, devuelve { error }.
 */
export async function iniciarSesion(usuario, clave) {
  const nombre = String(usuario ?? "").trim();
  if (!nombre || !clave) return { error: "Escribe tu usuario y tu clave." };
  let cuenta;
  try {
    cuenta = await verificar(nombre, String(clave));
  } catch (error) {
    console.error("[login] No se pudo verificar la cuenta:", error.message);
    return { error: "No se pudo verificar la cuenta. Intenta de nuevo." };
  }
  if (!cuenta || !esPerfilValido(cuenta.rol)) return { error: "Usuario o clave incorrectos." };
  await fijarPerfil(cuenta.rol);
  (await cookies()).set(COOKIE_USUARIO, cuenta.usuario, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 8 * 60 * 60 });
  redirect("/");
}

/** Entrar como visitante: perfil Público, sin nombre de usuario. */
export async function entrarComoVisitante() {
  await fijarPerfil("publico");
  (await cookies()).delete({ name: COOKIE_USUARIO, path: "/" });
  redirect("/");
}
