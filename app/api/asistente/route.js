// app/api/asistente/route.js — Chat del asistente de IA, con respuesta en streaming de texto plano.
//
// POST { mensajes: [{ rol: "usuario" | "asistente", texto }] }
// Una sola llamada al modelo por pregunta, sin herramientas: el modelo responde con las cifras
// que el motor ya calculó (lib/asistente.js). La IA nunca calcula los rankings.
import Anthropic from '@anthropic-ai/sdk';
import { exigirPerfilApi } from '@/lib/auth';
import { construirContexto, INSTRUCCIONES } from '@/lib/asistente';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const MODELO = 'claude-opus-5-5';
const MAX_TURNOS = 12;
const MAX_CARACTERES = 2000;

// Límite simple en memoria: 20 preguntas cada 10 minutos por IP + perfil.
const VENTANA_MS = 10 * 60 * 1000;
const MAX_PREGUNTAS = 20;
const historialPorCliente = new Map();

function excedeLimite(clave) {
  const ahora = Date.now();
  const recientes = (historialPorCliente.get(clave) || []).filter((t) => ahora - t < VENTANA_MS);
  if (recientes.length >= MAX_PREGUNTAS) {
    historialPorCliente.set(clave, recientes);
    return true;
  }
  recientes.push(ahora);
  historialPorCliente.set(clave, recientes);
  if (historialPorCliente.size > 5000) historialPorCliente.clear();
  return false;
}

const error = (estado, mensaje) => Response.json({ error: mensaje }, { status: estado });

/** Valida y recorta el historial; devuelve los mensajes para la API o null si no sirve. */
function prepararMensajes(cuerpo) {
  const lista = Array.isArray(cuerpo?.mensajes) ? cuerpo.mensajes : null;
  if (!lista) return null;
  const limpios = lista
    .filter((m) => m && (m.rol === 'usuario' || m.rol === 'asistente') && typeof m.texto === 'string' && m.texto.trim())
    .map((m) => ({ role: m.rol === 'usuario' ? 'user' : 'assistant', content: m.texto.trim().slice(0, MAX_CARACTERES) }))
    .slice(-MAX_TURNOS);
  // La conversación debe empezar con el usuario, alternar y terminar con el usuario (sin prefill).
  while (limpios.length && limpios[0].role !== 'user') limpios.shift();
  const alternados = [];
  for (const m of limpios) {
    if (alternados.length && alternados.at(-1).role === m.role) alternados.at(-1).content += `\n\n${m.content}`;
    else alternados.push(m);
  }
  if (!alternados.length || alternados.at(-1).role !== 'user') return null;
  return alternados;
}

/** Mensaje corto en español para cada error del SDK (clases tipadas, sin comparar textos). */
function mensajeError(e) {
  if (e instanceof Anthropic.AuthenticationError) return { estado: 503, mensaje: 'El asistente no está configurado correctamente (clave no válida).' };
  if (e instanceof Anthropic.PermissionDeniedError) return { estado: 503, mensaje: 'La clave del asistente no tiene permiso para este modelo.' };
  if (e instanceof Anthropic.RateLimitError) return { estado: 429, mensaje: 'El asistente está recibiendo muchas consultas. Intente de nuevo en un minuto.' };
  if (e instanceof Anthropic.BadRequestError) return { estado: 400, mensaje: 'La consulta no se pudo procesar. Pruebe a reformularla o inicie una nueva conversación.' };
  if (e instanceof Anthropic.APIConnectionError) return { estado: 502, mensaje: 'No se pudo conectar con el servicio del asistente.' };
  if (e instanceof Anthropic.APIError) return { estado: 502, mensaje: 'El servicio del asistente no está disponible en este momento.' };
  return { estado: 500, mensaje: 'Ocurrió un error inesperado en el asistente.' };
}

export async function POST(request) {
  const { perfil, error: denegado } = await exigirPerfilApi('publico');
  if (denegado) return denegado;
  if (!process.env.ANTHROPIC_API_KEY) return error(503, 'El asistente no está disponible: falta configurar la clave en el servidor.');

  let cuerpo;
  try {
    cuerpo = await request.json();
  } catch {
    return error(400, 'Envíe un JSON con { mensajes: [...] }.');
  }
  const mensajes = prepararMensajes(cuerpo);
  if (!mensajes) return error(400, 'Escriba una pregunta.');

  const ip = (request.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'local';
  if (excedeLimite(`${ip}#${perfil}`)) return error(429, 'Ha hecho muchas preguntas seguidas. Espere unos minutos e intente de nuevo.');

  let contexto;
  try {
    contexto = await construirContexto(perfil);
  } catch (e) {
    console.error('[asistente] No se pudo armar el contexto:', e.message);
    return error(500, 'No se pudieron leer los datos de la plataforma.');
  }

  // new Anthropic() lee ANTHROPIC_API_KEY del entorno (cabecera x-api-key).
  const cliente = new Anthropic();
  const stream = cliente.beta.messages.stream({
    model: MODELO,
    max_tokens: 4000,
    thinking: { type: 'adaptive' },
    output_config: { effort: 'low' },
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system: [
      { type: 'text', text: INSTRUCCIONES },
      { type: 'text', text: contexto, cache_control: { type: 'ephemeral' } },
    ],
    messages: mensajes,
  });
  request.signal?.addEventListener('abort', () => stream.abort());

  // Se espera el primer evento antes de responder: así los errores de la API llegan con su código HTTP.
  const iterador = stream[Symbol.asyncIterator]();
  let primero;
  try {
    primero = await iterador.next();
  } catch (e) {
    const { estado, mensaje } = mensajeError(e);
    console.error(`[asistente] Error de la API (${e?.constructor?.name ?? 'Error'} ${e?.status ?? ''})`);
    return error(estado, mensaje);
  }

  const codificador = new TextEncoder();
  const cuerpoRespuesta = new ReadableStream({
    async start(controlador) {
      const emitir = (evento) => {
        if (evento?.type === 'content_block_delta' && evento.delta?.type === 'text_delta') {
          controlador.enqueue(codificador.encode(evento.delta.text));
        }
      };
      try {
        if (!primero.done) emitir(primero.value);
        for (let paso = await iterador.next(); !paso.done; paso = await iterador.next()) emitir(paso.value);
        const final = await stream.finalMessage();
        if (final.stop_reason === 'refusal') {
          controlador.enqueue(codificador.encode('\n\nNo puedo responder esa consulta. Pruebe con una pregunta sobre los rankings o la calidad de datos.'));
        } else if (final.stop_reason === 'max_tokens') {
          controlador.enqueue(codificador.encode('\n\n(Respuesta recortada por longitud.)'));
        }
        const u = final.usage || {};
        console.log(`[asistente] ${perfil}: entrada=${u.input_tokens} cache_lectura=${u.cache_read_input_tokens} cache_escritura=${u.cache_creation_input_tokens} salida=${u.output_tokens}`);
      } catch (e) {
        if (!request.signal?.aborted && !stream.aborted) {
          controlador.enqueue(codificador.encode(`\n\n${mensajeError(e).mensaje}`));
        }
      } finally {
        try { controlador.close(); } catch { /* ya cerrado */ }
      }
    },
    cancel() {
      stream.abort();
    },
  });

  return new Response(cuerpoRespuesta, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' },
  });
}
