// Lógica común de las rutas de exportación: control de acceso en el SERVIDOR,
// lectura de filtros, generación del CSV y registro en la bitácora.
import { exigirPerfilApi } from '@/lib/auth';
import { registrarBitacora } from '@/lib/consultas';
import { ErrorExportacion, generarExportacion, leerFiltros } from '@/lib/consultas-reportes';

const json = (estado, cuerpo) => Response.json(cuerpo, { status: estado });

/**
 * Responde una exportación CSV.
 * @param {Request} request
 * @param {string} conjunto  rankings | subactividades | calidad | exclusiones | movimientos | personalizado
 * @param {'publico'|'analista'|'administrador'} perfilMinimo  quien no lo alcanza recibe 403
 */
export async function responderExportacion(request, conjunto, perfilMinimo) {
  const { perfil, error } = await exigirPerfilApi(perfilMinimo);
  if (error) return error;

  const inicio = Date.now();
  try {
    const filtros = leerFiltros(new URL(request.url).searchParams);
    const { csv, nombreArchivo, filas } = await generarExportacion(conjunto, filtros);
    // La bitácora nunca debe impedir una descarga.
    await registrarBitacora({
      perfil, operacion: 'exportar', detalle: `${nombreArchivo} (${filas} filas)`, resultado: 'ok', duracion_ms: Date.now() - inicio,
    }).catch(() => {});
    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${nombreArchivo}"`,
        'Cache-Control': 'no-store',
        'X-Filas': String(filas),
      },
    });
  } catch (e) {
    if (e instanceof ErrorExportacion) return json(e.estado, { error: 'solicitud_invalida', mensaje: e.message });
    console.error(`Error al exportar ${conjunto}:`, e);
    return json(500, { error: 'error_interno', mensaje: 'No se pudo generar el archivo. Intente de nuevo; si persiste, avise al administrador.' });
  }
}
