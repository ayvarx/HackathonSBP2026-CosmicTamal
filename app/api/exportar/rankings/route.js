// GET /api/exportar/rankings — CSV del entregable 2 (rankings por período). Filtros opcionales por URL: fecha, ranking, banco.
import { responderExportacion } from '../_comun';

export const dynamic = 'force-dynamic';

export function GET(request) {
  return responderExportacion(request, 'rankings', 'publico');
}
