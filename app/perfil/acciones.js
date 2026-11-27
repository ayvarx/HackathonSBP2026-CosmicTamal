"use server";
// Acción de servidor del selector de perfil.
// La cookie se escribe aquí, en el servidor, firmada con HMAC (ver lib/auth.js).
import { redirect } from "next/navigation";
import { esPerfilValido, fijarPerfil, puedeVerRuta, rutaInternaSegura } from "@/lib/auth";

/**
 * Recibe el formulario { perfil, volver } y fija el perfil elegido.
 * Luego vuelve a la pantalla de origen si el nuevo perfil puede verla; si no, al Panel.
 */
export async function cambiarPerfil(formulario) {
  const perfil = String(formulario.get("perfil") ?? "");
  // No se confía en el navegador: solo se aceptan los tres perfiles conocidos.
  if (!esPerfilValido(perfil)) redirect("/perfil?error=perfil");

  await fijarPerfil(perfil);

  const volver = rutaInternaSegura(formulario.get("volver"), "/");
  redirect(puedeVerRuta(perfil, volver) ? volver : "/");
}
