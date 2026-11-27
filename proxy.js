// proxy.js — Se ejecuta antes de cada solicitud (en Next 16 "middleware" se llama "proxy").
//
// Qué hace:
//   1. Agrega el encabezado interno x-ruta con la ruta pedida, para que exigirPerfil()
//      (lib/auth.js) sepa desde dónde llegó el usuario y la pantalla "Acceso restringido"
//      pueda ofrecer volver a esa misma sección tras cambiar de perfil.
//   2. Agrega encabezados básicos de seguridad a las respuestas.
//
//   3. Login temporal: una PÁGINA pedida sin cookie de perfil (o con una vencida o mal
//      formada) redirige a /login. No aplica a /api/** (sin cookie siguen valiendo como
//      Público, para no romper descargas ni pruebas), ni a /login y /perfil (el acceso mismo;
//      scripts/prueba-e2e.mjs espera 200 en /perfil sin cookie). La firma HMAC se sigue
//      verificando en el servidor (lib/auth.js): aquí solo se mira la forma y la fecha.
//
// Qué NO hace: decidir permisos. La documentación de Next advierte que el proxy no debe
// ser la única barrera; el control real está en cada página, acción y ruta API.
import { NextResponse } from "next/server";

const SIN_LOGIN = ["/api", "/login", "/perfil", "/_next"];
const DURACION_SEGUNDOS = 8 * 60 * 60; // igual que lib/auth.js

/** true si la cookie sbp_perfil tiene la forma perfil.emitidoEn.firma y no ha vencido. */
function tieneSesion(request) {
  const valor = request.cookies.get("sbp_perfil")?.value ?? "";
  const partes = /^(publico|analista|administrador)\.(\d+)\.[A-Za-z0-9_-]+$/.exec(valor);
  if (!partes) return false;
  const edad = Math.floor(Date.now() / 1000) - Number(partes[2]);
  return edad >= -60 && edad <= DURACION_SEGUNDOS;
}

export function proxy(request) {
  const ruta = request.nextUrl.pathname;
  const libre = SIN_LOGIN.some((p) => ruta === p || ruta.startsWith(`${p}/`));
  if (!libre && !tieneSesion(request)) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const encabezados = new Headers(request.headers);
  // Se sobrescribe siempre, así un cliente no puede inyectar su propio x-ruta.
  encabezados.set("x-ruta", request.nextUrl.pathname + request.nextUrl.search);

  const respuesta = NextResponse.next({ request: { headers: encabezados } });
  respuesta.headers.set("X-Content-Type-Options", "nosniff");
  respuesta.headers.set("Referrer-Policy", "same-origin");
  respuesta.headers.set("X-Frame-Options", "SAMEORIGIN");
  return respuesta;
}

export const config = {
  // No hace falta para archivos estáticos, imágenes ni el ícono.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
