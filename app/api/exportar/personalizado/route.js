// GET /api/exportar/personalizado — CSV del reporte personalizado (solo analista o administrador). Filtros opcionales por URL: fechas, rankings, bancos, columnas (listas separadas por coma o repetidas).
import { responderExportacion } from '../_comun';

export const dynamic = 'force-dynamic';

export function GET(request) {
  return responderExportacion(request, 'personalizado', 'analista');
}
