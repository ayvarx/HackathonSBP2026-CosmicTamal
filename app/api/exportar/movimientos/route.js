// GET /api/exportar/movimientos — CSV del entregable 5 (movimientos de posición, solo analista o administrador). Filtros opcionales por URL: anterior, actual, ranking, banco, extendido=1.
import { responderExportacion } from '../_comun';

export const dynamic = 'force-dynamic';

export function GET(request) {
  return responderExportacion(request, 'movimientos', 'analista');
}
