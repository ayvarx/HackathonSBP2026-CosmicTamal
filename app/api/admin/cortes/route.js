// /api/admin/cortes — Cargar, listar y eliminar cortes AT03. SOLO perfil Administrador.
//
//   GET     lista los períodos cargados (archivo, filas, fecha de carga).
//   POST    sube un CSV AT03, lo valida y, si es válido, lo carga y recalcula el motor.
//           Responde con el resumen "Qué cambió con este corte".
//   DELETE  ?periodo=AAAAMMDD&confirmar=AAAAMMDD  borra un período y recalcula.
//
// El perfil se comprueba AQUÍ, en el servidor, en cada método: aunque alguien llame a la
// ruta con curl, un perfil Público o Analista recibe 403 y no se toca ningún dato.
//
// Cómo se envía el archivo en el POST:
//   * multipart/form-data con el campo "archivo" (y opcionales "reemplazar"=si, "modo"=validar).
//   * o el CSV como cuerpo crudo, con ?nombre=archivo.csv&reemplazar=si&modo=validar.
//   El archivo puede ir comprimido con gzip (el formulario de la página lo comprime solo).
//   Motivo: proxy.js hace que Next guarde en memoria cada cuerpo hasta
//   experimental.proxyClientMaxBodySize (64 MB en next.config.mjs); el corte de
//   septiembre pesa ~11 MB sin comprimir y ~2.9 MB comprimido, así que viaja más rápido.
//
// Ejemplo con curl (la cookie se obtiene eligiendo el perfil en /perfil):
//   gzip -c datos/AT03_sintetico_202609.csv > /tmp/sep.csv.gz
//   curl -b "sbp_perfil=..." -F "archivo=@/tmp/sep.csv.gz;filename=AT03_sintetico_202609.csv.gz" \
//        http://localhost:3000/api/admin/cortes
import { gunzipSync } from "node:zlib";
import { exigirPerfilApi } from "@/lib/auth";
import { cargarCorte, validarCorte } from "@/lib/ingesta";
import { registrarBitacora } from "@/lib/consultas";
import { cortesCargados, eliminarPeriodo, esPeriodo, resumenCorte } from "@/lib/consultas-admin";

export const dynamic = "force-dynamic";

/** Tamaño máximo del CSV ya descomprimido (los cortes reales pesan ~11 MB). */
const MAX_BYTES_CSV = 60 * 1024 * 1024;

/** Respuesta JSON de error con un mensaje en español claro. */
function errorJson(estado, mensaje, extra = {}) {
  return Response.json({ ok: false, mensaje, ...extra }, { status: estado });
}

/** "si", "true", "1" u "on" → true (casillas de formulario y parámetros de curl). */
function esVerdadero(valor) {
  return ["si", "sí", "true", "1", "on"].includes(String(valor ?? "").trim().toLowerCase());
}

/**
 * Lee el archivo enviado (multipart o cuerpo crudo) y lo descomprime si viene en gzip.
 * Devuelve { contenido: Buffer, nombre, reemplazar, modo } o { error: Response }.
 */
async function leerEnvio(request) {
  const url = new URL(request.url);
  const tipo = request.headers.get("content-type") || "";
  const declarado = Number(request.headers.get("content-length") || 0);
  const crudo = Buffer.from(await request.arrayBuffer());

  // Si llegaron menos bytes de los anunciados, el cuerpo se cortó en el camino (límite del proxy).
  if (declarado && crudo.length < declarado) {
    return {
      error: errorJson(413, `El archivo llegó incompleto (se recibieron ${crudo.length} de ${declarado} bytes): el servidor acepta como máximo 64 MB por envío. Use el formulario de Administración, que comprime el archivo automáticamente, o envíelo comprimido con gzip.`),
    };
  }

  let bytes = crudo;
  let nombre = url.searchParams.get("nombre") || "";
  let reemplazar = esVerdadero(url.searchParams.get("reemplazar"));
  let modo = url.searchParams.get("modo") || "cargar";

  if (tipo.startsWith("multipart/form-data")) {
    let formulario;
    try {
      formulario = await new Request("http://local/", { method: "POST", headers: { "content-type": tipo }, body: crudo }).formData();
    } catch {
      return { error: errorJson(400, "No se pudo leer el formulario enviado. Vuelva a seleccionar el archivo e inténtelo de nuevo.") };
    }
    const archivo = formulario.get("archivo");
    if (!archivo || typeof archivo === "string") {
      return { error: errorJson(400, 'No se recibió ningún archivo. Envíe el CSV en el campo "archivo".') };
    }
    bytes = Buffer.from(await archivo.arrayBuffer());
    nombre = String(formulario.get("nombre") || archivo.name || nombre);
    if (formulario.has("reemplazar")) reemplazar = esVerdadero(formulario.get("reemplazar"));
    if (formulario.has("modo")) modo = String(formulario.get("modo"));
  }

  if (!bytes.length) return { error: errorJson(400, "El archivo está vacío o no se recibió. Seleccione un CSV AT03.") };

  // gzip se reconoce por sus dos primeros bytes (1f 8b), sin depender del nombre.
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
    try {
      bytes = gunzipSync(bytes, { maxOutputLength: MAX_BYTES_CSV });
    } catch (error) {
      const mensaje = error.code === "ERR_BUFFER_TOO_LARGE"
        ? `El archivo descomprimido supera ${MAX_BYTES_CSV / 1024 / 1024} MB; un corte AT03 pesa alrededor de 11 MB.`
        : "El archivo comprimido (gzip) está dañado y no se pudo abrir. Vuelva a generarlo.";
      return { error: errorJson(400, mensaje) };
    }
  }
  if (bytes.length > MAX_BYTES_CSV) {
    return { error: errorJson(413, `El archivo supera ${MAX_BYTES_CSV / 1024 / 1024} MB; un corte AT03 pesa alrededor de 11 MB.`) };
  }

  nombre = (nombre || "archivo_sin_nombre.csv").replace(/\.gz$/i, "").replace(/[\\/]/g, "_").slice(0, 200);
  return { contenido: bytes, nombre, reemplazar, modo: modo === "validar" ? "validar" : "cargar" };
}

/** GET: períodos cargados. */
export async function GET() {
  const { error } = await exigirPerfilApi("administrador");
  if (error) return error;
  return Response.json({ ok: true, cortes: await cortesCargados() });
}

/** POST: validar o cargar un corte. */
export async function POST(request) {
  const { perfil, error } = await exigirPerfilApi("administrador");
  if (error) {
    // El intento rechazado también queda en la bitácora (quién intentó y con qué perfil).
    await registrarBitacora({ perfil, operacion: "carga_corte", detalle: `Intento de carga rechazado: el perfil ${perfil} no tiene permiso (se requiere administrador).`, resultado: "error" });
    return error;
  }

  const envio = await leerEnvio(request);
  if (envio.error) {
    await registrarBitacora({ perfil, operacion: "carga_corte", detalle: "Envío rechazado antes de validar (archivo ausente, dañado o demasiado grande).", resultado: "error" });
    return envio.error;
  }
  const { contenido, nombre, reemplazar, modo } = envio;

  // Solo validar: no se escribe nada en los datos.
  if (modo === "validar") {
    const validacion = validarCorte(contenido, nombre);
    await registrarBitacora({
      perfil,
      operacion: "validacion_corte",
      detalle: validacion.valido
        ? `${nombre}: válido, ${validacion.filas} filas, período ${validacion.periodos.join(", ")}`
        : `${nombre}: ${validacion.totalErrores} error(es). ${validacion.errores[0]?.mensaje ?? ""}`,
      resultado: validacion.valido ? "ok" : "error",
    });
    return Response.json({ ok: validacion.valido, modo, archivo: nombre, ...validacion }, { status: validacion.valido ? 200 : 422 });
  }

  // Cargar: lib/ingesta.js valida, inserta en una transacción, recalcula y anota la bitácora.
  // Si el archivo es inválido no se modifica ningún dato (todo o nada).
  const resultado = await cargarCorte({ nombreArchivo: nombre, contenido, perfil, reemplazar });
  if (!resultado.ok) {
    // cargarCorte solo devuelve "periodos" cuando el archivo es válido pero el período ya existe.
    const yaCargado = Array.isArray(resultado.periodos);
    const inesperado = /^error inesperado/.test(resultado.mensaje);
    const estado = yaCargado ? 409 : inesperado ? 500 : 422;
    return Response.json({ ...resultado, modo, motivo: yaCargado ? "periodo_ya_cargado" : inesperado ? "error_servidor" : "archivo_invalido" }, { status: estado });
  }

  // Resumen automático del período más reciente que traía el archivo.
  const resumen = await resumenCorte(resultado.periodos.at(-1));
  return Response.json({ ...resultado, modo, resumen });
}

/** DELETE: eliminar un período (exige confirmar repitiendo el período). */
export async function DELETE(request) {
  const { perfil, error } = await exigirPerfilApi("administrador");
  if (error) {
    await registrarBitacora({ perfil, operacion: "eliminar_corte", detalle: `Intento de eliminación rechazado: el perfil ${perfil} no tiene permiso (se requiere administrador).`, resultado: "error" });
    return error;
  }
  const url = new URL(request.url);
  const periodo = url.searchParams.get("periodo") || "";
  const confirmar = url.searchParams.get("confirmar") || "";
  if (!esPeriodo(periodo)) return errorJson(400, "Indique el período a eliminar con ?periodo=AAAAMMDD (por ejemplo 20260930).");
  // Confirmación explícita: evita borrar un período por un clic accidental.
  if (confirmar !== periodo) {
    return errorJson(400, `Para eliminar el período ${periodo} confírmelo escribiendo el mismo período (confirmar=${periodo}).`);
  }
  const resultado = await eliminarPeriodo({ fecha: periodo, perfil });
  if (!resultado.ok) return errorJson(resultado.estado, resultado.mensaje);
  return Response.json(resultado);
}
