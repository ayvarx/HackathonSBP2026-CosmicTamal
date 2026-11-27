// GET /api/exportar/exclusiones — CSV de filas excluidas con su filtro E1–E4 (público, igual que la pantalla Calidad). Filtros opcionales por URL: fecha, banco, filtro (E1–E4).
import { responderExportacion } from '../_comun';

export const dynamic = 'force-dynamic';

export function GET(request) {
  return responderExportacion(request, 'exclusiones', 'publico');
}
