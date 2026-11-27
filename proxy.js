// proxy.js — Se ejecuta antes de cada solicitud (en Next 16 "middleware" se llama "proxy").
//
// Qué hace:
//   1. Agrega el encabezado interno x-ruta con la ruta pedida, para que exigirPerfil()
//      (lib/auth.js) sepa desde dónde llegó el usuario y la pantalla "Acceso restringido"
//      pueda ofrecer volver a esa misma sección tras cambiar de perfil.
//   2. Agrega encabezados básicos de seguridad a las respuestas.
//
// Qué NO hace: decidir permisos. La documentación de Next advierte que el proxy no debe
// ser la única barrera; el control real está en cada página, acción y ruta API.
import { NextResponse } from "next/server";

export function proxy(request) {
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
