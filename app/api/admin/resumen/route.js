// /api/admin/resumen?periodo=AAAAMMDD — "Qué cambió con este corte" en JSON. SOLO Administrador.
// Sin ?periodo devuelve el resumen del período más reciente. Las cifras salen del motor SQL.
import { exigirPerfilApi } from "@/lib/auth";
import { esPeriodo, periodoMasReciente, resumenCorte } from "@/lib/consultas-admin";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const { error } = await exigirPerfilApi("administrador");
  if (error) return error;
  const pedido = new URL(request.url).searchParams.get("periodo");
  if (pedido && !esPeriodo(pedido)) {
    return Response.json({ ok: false, mensaje: "El período debe tener formato AAAAMMDD (por ejemplo 20260930)." }, { status: 400 });
  }
  const periodo = pedido || (await periodoMasReciente());
  const resumen = periodo ? await resumenCorte(periodo) : null;
  if (!resumen) {
    return Response.json({ ok: false, mensaje: periodo ? `El período ${periodo} no está cargado.` : "Aún no hay cortes cargados." }, { status: 404 });
  }
  return Response.json({ ok: true, resumen });
}
