// lib/auth.js — Perfiles, permisos y control de acceso EN EL SERVIDOR.
//
// El reto (entregable 8) pide tres perfiles con opciones distintas y acepta un selector
// de perfil sin contraseña. Para que el jurado no pueda "saltarse" el perfil escribiendo
// la URL, cada página, acción de servidor y ruta API verifica el perfil aquí, en el
// servidor; ocultar enlaces en el menú es solo comodidad visual.
//
// Cómo se guarda el perfil: en una cookie httpOnly (JavaScript del navegador no la lee)
// con el formato  perfil.emitidoEn.firma , donde la firma es un HMAC-SHA256 con el
// secreto SESSION_SECRET (.env.local, nunca en el repositorio). Si alguien edita la
// cookie a mano, la firma deja de coincidir y se le trata como "publico".
//
// Uso:
//   // Componente de servidor (solo leer):
//   const perfil = await obtenerPerfil();                 // 'publico' | 'analista' | 'administrador'
//   if (puede(perfil, "comparar")) { ... }
//
//   // Página o acción de servidor protegida (redirige a /acceso-restringido si no alcanza):
//   await exigirPerfil("administrador");
//
//   // Ruta API protegida (responde 403 en JSON si no alcanza):
//   const { error } = await exigirPerfilApi("analista");
//   if (error) return error;

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

// ---------------------------------------------------------------------------
// Perfiles y jerarquía
// ---------------------------------------------------------------------------

/** Perfiles de menor a mayor: cada uno puede todo lo del anterior y algo más. */
export const PERFILES = ["publico", "analista", "administrador"];

/** Sin sesión (o con cookie inválida) el visitante es "publico". */
export const PERFIL_PREDETERMINADO = "publico";

/** Nombres para mostrar en pantalla. */
export const NOMBRE_PERFIL = {
  publico: "Público",
  analista: "Analista",
  administrador: "Administrador",
};

/** Descripción breve de cada perfil (tarjetas de /perfil). */
export const DESCRIPCION_PERFIL = {
  publico: "Ciudadanía y medios: consulta los rankings publicados, filtra, ve gráficos y descarga la información.",
  analista: "Equipo técnico: además compara bancos y períodos, revisa el detalle y arma reportes personalizados.",
  administrador: "Responsable de la plataforma: además carga cortes AT03, ajusta parámetros y catálogos y revisa la bitácora.",
};

/** true si el texto es uno de los tres perfiles válidos. */
export function esPerfilValido(perfil) {
  return PERFILES.includes(perfil);
}

/** true si `perfil` está en el mismo nivel o por encima de `minimo` en la jerarquía. */
export function alcanzaPerfil(perfil, minimo) {
  const nivel = PERFILES.indexOf(perfil);
  const requerido = PERFILES.indexOf(minimo);
  if (requerido === -1) throw new Error(`Perfil mínimo desconocido: ${minimo}`);
  return nivel >= requerido;
}

// ---------------------------------------------------------------------------
// Matriz de permisos (sirve para pintar menús y para documentar en el README)
// ---------------------------------------------------------------------------

/**
 * Qué puede hacer cada perfil. `minimo` es el perfil más bajo que tiene el permiso;
 * por la jerarquía, los perfiles superiores también lo tienen.
 */
export const PERMISOS = {
  consultar_rankings: { minimo: "publico", descripcion: "Consultar los rankings por período, actividad y banco" },
  aplicar_filtros: { minimo: "publico", descripcion: "Filtrar por período, ranking, banco y subactividad" },
  ver_graficos: { minimo: "publico", descripcion: "Ver gráficos interactivos y tablas ordenables" },
  ver_calidad: { minimo: "publico", descripcion: "Ver el reporte de calidad (exclusiones E1–E4) y las reconciliaciones" },
  descargar: { minimo: "publico", descripcion: "Descargar rankings, desglose por subactividad, calidad y filas excluidas en CSV" },
  comparar: { minimo: "analista", descripcion: "Comparar bancos y períodos y descargar los movimientos de posición" },
  ver_detalle: { minimo: "analista", descripcion: "Revisar los préstamos que sustentan cada cifra del ranking" },
  reportes_personalizados: { minimo: "analista", descripcion: "Generar reportes personalizados" },
  cargar_cortes: { minimo: "administrador", descripcion: "Cargar o actualizar un corte AT03 y recalcular" },
  administrar_parametros: { minimo: "administrador", descripcion: "Administrar parámetros (p. ej. regla de movimiento significativo)" },
  administrar_catalogos: { minimo: "administrador", descripcion: "Administrar catálogos de referencia" },
  ver_bitacora: { minimo: "administrador", descripcion: "Consultar la bitácora de operaciones" },
};

/** true si el perfil tiene el permiso indicado (clave de PERMISOS). */
export function puede(perfil, permiso) {
  const regla = PERMISOS[permiso];
  if (!regla) throw new Error(`Permiso desconocido: ${permiso}`);
  return alcanzaPerfil(perfil, regla.minimo);
}

/** Lista de permisos de un perfil: [{ clave, descripcion, propio }]. `propio` = no heredado. */
export function permisosDe(perfil) {
  return Object.entries(PERMISOS)
    .filter(([, regla]) => alcanzaPerfil(perfil, regla.minimo))
    .map(([clave, regla]) => ({ clave, descripcion: regla.descripcion, propio: regla.minimo === perfil }));
}

// ---------------------------------------------------------------------------
// Rutas de la aplicación y perfil mínimo de cada una
// ---------------------------------------------------------------------------

/** Menú principal, en orden. Las páginas usan el mismo perfil mínimo con exigirPerfil(). */
export const RUTAS = [
  { ruta: "/", etiqueta: "Panel", minimo: "publico", descripcion: "Resumen del último corte" },
  { ruta: "/rankings", etiqueta: "Rankings", minimo: "publico", descripcion: "Posición de cada banco por actividad" },
  { ruta: "/comparar", etiqueta: "Comparar", minimo: "analista", descripcion: "Movimientos entre períodos y bancos" },
  { ruta: "/indicadores", etiqueta: "Indicadores", minimo: "publico", descripcion: "Concentración, morosidad y vencimientos" },
  { ruta: "/calidad", etiqueta: "Calidad de datos", minimo: "publico", descripcion: "Exclusiones E1–E4 y universo válido" },
  { ruta: "/verificacion", etiqueta: "Verificación", minimo: "publico", descripcion: "Reconciliaciones y controles" },
  { ruta: "/reportes", etiqueta: "Reportes", minimo: "publico", descripcion: "Descargas y reportes" },
  { ruta: "/admin", etiqueta: "Administración", minimo: "administrador", descripcion: "Cortes, parámetros, catálogos y bitácora" },
  // Subpáginas con perfil propio: no salen en el menú (enMenu: false), pero así la pantalla
  // "Acceso restringido" nombra la sección correcta y el perfil que se necesita.
  { ruta: "/rankings/detalle", etiqueta: "Detalle de préstamos", minimo: "analista", descripcion: "Préstamos que sustentan una cifra", enMenu: false },
  { ruta: "/reportes/imprimir", etiqueta: "Reporte imprimible", minimo: "analista", descripcion: "Versión para imprimir o guardar en PDF", enMenu: false },
];

/** Secciones del menú principal (sin las subpáginas marcadas enMenu: false). */
export const RUTAS_MENU = RUTAS.filter((r) => r.enMenu !== false);

/** Rutas del menú que el perfil puede ver (para pintar el menú). */
export function rutasPermitidas(perfil) {
  return RUTAS_MENU.filter((r) => alcanzaPerfil(perfil, r.minimo));
}

/** Entrada de RUTAS que corresponde a una ruta concreta ("/admin/cortes" → Administración). */
export function rutaDe(ruta) {
  const camino = String(ruta ?? "/").split("?")[0] || "/";
  let mejor = null;
  for (const r of RUTAS) {
    const coincide = r.ruta === "/" ? camino === "/" : camino === r.ruta || camino.startsWith(r.ruta + "/");
    if (coincide && (!mejor || r.ruta.length > mejor.ruta.length)) mejor = r;
  }
  return mejor;
}

/** true si el perfil puede entrar a esa ruta (las rutas fuera del menú son públicas). */
export function puedeVerRuta(perfil, ruta) {
  const r = rutaDe(ruta);
  return !r || alcanzaPerfil(perfil, r.minimo);
}

/**
 * Acepta solo rutas internas ("/rankings?periodo=..."). Evita redirecciones abiertas
 * a otros sitios ("//sitio.com", "https://...") cuando la ruta llega de un formulario.
 */
export function rutaInternaSegura(valor, predeterminada = "/") {
  const texto = typeof valor === "string" ? valor.trim() : "";
  if (!texto.startsWith("/") || texto.startsWith("//") || texto.startsWith("/\\")) return predeterminada;
  return texto;
}

// ---------------------------------------------------------------------------
// Cookie firmada
// ---------------------------------------------------------------------------

export const NOMBRE_COOKIE = "sbp_perfil";
const DURACION_SEGUNDOS = 8 * 60 * 60; // una jornada de trabajo; luego vuelve a "publico"

/**
 * Secreto para firmar. Viene de SESSION_SECRET. Si falta, se genera uno aleatorio por
 * arranque del servidor (las sesiones se pierden al reiniciar) y se avisa en consola.
 * Nunca se usa un valor fijo escrito en el código (R5: sin llaves en el repositorio).
 * Se guarda en globalThis para que todas las copias del módulo compartan el mismo.
 */
function secreto() {
  const desdeEntorno = process.env.SESSION_SECRET;
  if (desdeEntorno && desdeEntorno.length >= 16) return desdeEntorno;
  if (!globalThis.__secretoSesionSBP) {
    globalThis.__secretoSesionSBP = randomBytes(32).toString("hex");
    console.warn(
      "[auth] SESSION_SECRET no está definido (o tiene menos de 16 caracteres) en .env.local. " +
        "Se generó un secreto aleatorio temporal: los perfiles elegidos se pierden al reiniciar el servidor."
    );
  }
  return globalThis.__secretoSesionSBP;
}

function calcularFirma(contenido) {
  return createHmac("sha256", secreto()).update(contenido).digest("base64url");
}

/** Arma el valor de la cookie: "analista.1764255900.<firma>". */
export function firmarPerfil(perfil, ahoraSegundos = Math.floor(Date.now() / 1000)) {
  if (!esPerfilValido(perfil)) throw new Error(`Perfil inválido: ${perfil}`);
  const contenido = `${perfil}.${ahoraSegundos}`;
  return `${contenido}.${calcularFirma(contenido)}`;
}

/** Devuelve el perfil si la cookie es auténtica y no ha vencido; si no, null. */
export function verificarFirma(valor, ahoraSegundos = Math.floor(Date.now() / 1000)) {
  if (typeof valor !== "string") return null;
  const partes = valor.split(".");
  if (partes.length !== 3) return null;
  const [perfil, emitido, firma] = partes;
  if (!esPerfilValido(perfil) || !/^\d+$/.test(emitido)) return null;

  // Comparación en tiempo constante para no filtrar pistas sobre la firma correcta.
  const esperada = Buffer.from(calcularFirma(`${perfil}.${emitido}`));
  const recibida = Buffer.from(firma);
  if (esperada.length !== recibida.length || !timingSafeEqual(esperada, recibida)) return null;

  const edad = ahoraSegundos - Number(emitido);
  if (edad < -60 || edad > DURACION_SEGUNDOS) return null; // vencida o con fecha futura
  return perfil;
}

// ---------------------------------------------------------------------------
// Funciones para componentes de servidor, acciones y rutas API
// ---------------------------------------------------------------------------

/** Perfil del visitante actual. Sin cookie válida → "publico". */
export async function obtenerPerfil() {
  const almacen = await cookies();
  return verificarFirma(almacen.get(NOMBRE_COOKIE)?.value) ?? PERFIL_PREDETERMINADO;
}

/**
 * Guarda el perfil en la cookie firmada. Solo funciona dentro de una acción de servidor
 * o una ruta API (Next no permite escribir cookies mientras se dibuja una página).
 */
export async function fijarPerfil(perfil) {
  if (!esPerfilValido(perfil)) throw new Error(`Perfil inválido: ${perfil}`);
  const encabezados = await headers();
  // "secure" solo cuando se sirve por HTTPS; en la demo local (http://localhost) no aplicaría.
  const esHttps = encabezados.get("x-forwarded-proto") === "https";
  const almacen = await cookies();
  almacen.set(NOMBRE_COOKIE, firmarPerfil(perfil), {
    httpOnly: true,
    sameSite: "lax",
    secure: esHttps,
    path: "/",
    maxAge: DURACION_SEGUNDOS,
  });
}

/** Ruta que se está pidiendo (la agrega proxy.js en el encabezado x-ruta). */
async function rutaActual() {
  const encabezados = await headers();
  return rutaInternaSegura(encabezados.get("x-ruta") ?? "", "");
}

/**
 * Para PÁGINAS y ACCIONES DE SERVIDOR: devuelve el perfil si alcanza el mínimo; si no,
 * redirige a /acceso-restringido, que explica qué perfil se necesita y cómo cambiarlo.
 * Llamarla al inicio de la página, antes de consultar datos.
 */
export async function exigirPerfil(minimo) {
  const perfil = await obtenerPerfil();
  if (alcanzaPerfil(perfil, minimo)) return perfil;
  const parametros = new URLSearchParams({ requiere: minimo });
  const desde = await rutaActual();
  if (desde) parametros.set("desde", desde);
  redirect(`/acceso-restringido?${parametros.toString()}`);
}

/** Igual que exigirPerfil, pero por clave de permiso: await exigirPermiso("cargar_cortes"). */
export async function exigirPermiso(permiso) {
  const regla = PERMISOS[permiso];
  if (!regla) throw new Error(`Permiso desconocido: ${permiso}`);
  return exigirPerfil(regla.minimo);
}

/**
 * Para RUTAS API (route.js): nunca redirige; devuelve { perfil, error }.
 * Si el perfil no alcanza, `error` es una respuesta 403 en JSON lista para devolver.
 *
 *   export async function GET() {
 *     const { error } = await exigirPerfilApi("analista");
 *     if (error) return error;
 *     ...
 *   }
 */
export async function exigirPerfilApi(minimo) {
  const perfil = await obtenerPerfil();
  if (alcanzaPerfil(perfil, minimo)) return { perfil, error: null };
  const error = Response.json(
    {
      error: "acceso_restringido",
      mensaje: `Esta operación requiere el perfil ${NOMBRE_PERFIL[minimo]}. Su perfil actual es ${NOMBRE_PERFIL[perfil]}.`,
      requiere: minimo,
      perfil,
    },
    { status: 403 }
  );
  return { perfil, error };
}
