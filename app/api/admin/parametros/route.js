// /api/admin/parametros — Umbrales de "movimiento significativo". SOLO Administrador.
//   GET   lista los parámetros vigentes y la regla en palabras.
//   POST  { "clave": "min_cambio_posicion", "valor": "3" }  cambia un parámetro.
// guardarParametro (lib/consultas.js) valida el valor y anota cada cambio en la bitácora.
// El cambio aplica de inmediato: la marca "significativo" se calcula en SQL al consultar.
import { exigirPerfilApi } from "@/lib/auth";
import { guardarParametro, parametros, registrarBitacora } from "@/lib/consultas";
import { reglaSignificativo } from "@/lib/consultas-admin";

export const dynamic = "force-dynamic";

export async function GET() {
  const { error } = await exigirPerfilApi("administrador");
  if (error) return error;
  const [lista, regla] = await Promise.all([parametros(), reglaSignificativo()]);
  return Response.json({ ok: true, parametros: lista, regla: regla.texto });
}

export async function POST(request) {
  const { perfil, error } = await exigirPerfilApi("administrador");
  if (error) {
    await registrarBitacora({ perfil, operacion: "parametro", detalle: `Intento de cambio rechazado: el perfil ${perfil} no tiene permiso (se requiere administrador).`, resultado: "error" });
    return error;
  }
  let cuerpo;
  try {
    cuerpo = await request.json();
  } catch {
    return Response.json({ ok: false, mensaje: 'Envíe un JSON con la forma {"clave": "...", "valor": "..."}.' }, { status: 400 });
  }
  const resultado = await guardarParametro(String(cuerpo?.clave ?? ""), String(cuerpo?.valor ?? ""), perfil);
  if (!resultado.ok) return Response.json(resultado, { status: 422 });
  const regla = await reglaSignificativo();
  return Response.json({ ...resultado, regla: regla.texto });
}
