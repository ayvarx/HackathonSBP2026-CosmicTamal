// GET /api/exportar/subactividades — CSV del entregable 3 (desglose por subactividad). Filtros opcionales por URL: fecha, ranking, banco.
import { responderExportacion } from '../_comun';

export const dynamic = 'force-dynamic';

export function GET(request) {
  return responderExportacion(request, 'subactividades', 'publico');
}
