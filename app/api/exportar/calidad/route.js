// GET /api/exportar/calidad — CSV del entregable 4 (calidad de datos E1–E4). Filtros opcionales por URL: fecha.
import { responderExportacion } from '../_comun';

export const dynamic = 'force-dynamic';

export function GET(request) {
  return responderExportacion(request, 'calidad', 'publico');
}
