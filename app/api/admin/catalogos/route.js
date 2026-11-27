// /api/admin/catalogos — Reemplazar un catálogo (bancos, cinu o sb21) desde un CSV. SOLO Administrador.
//   POST multipart/form-data: tipo = bancos | cinu | sb21, archivo = CSV con el encabezado exacto.
// cargarCatalogo (lib/ingesta.js) valida encabezado, celdas vacías y códigos repetidos; reemplaza
// el catálogo en una transacción, recalcula el motor y lo anota en la bitácora.
import { exigirPerfilApi } from "@/lib/auth";
import { cargarCatalogo } from "@/lib/ingesta";
import { registrarBitacora } from "@/lib/consultas";

export const dynamic = "force-dynamic";

const TIPOS = ["bancos", "cinu", "sb21"];
const MAX_BYTES = 1024 * 1024; // los catálogos pesan pocos KB

export async function POST(request) {
  const { perfil, error } = await exigirPerfilApi("administrador");
  if (error) {
    await registrarBitacora({ perfil, operacion: "carga_catalogo", detalle: `Intento rechazado: el perfil ${perfil} no tiene permiso (se requiere administrador).`, resultado: "error" });
    return error;
  }
  let formulario;
  try {
    formulario = await request.formData();
  } catch {
    return Response.json({ ok: false, mensaje: 'Envíe un formulario con los campos "tipo" y "archivo".' }, { status: 400 });
  }
  const tipo = String(formulario.get("tipo") ?? "");
  const archivo = formulario.get("archivo");
  if (!TIPOS.includes(tipo)) {
    return Response.json({ ok: false, mensaje: "Elija el catálogo a reemplazar: bancos, cinu o sb21." }, { status: 400 });
  }
  if (!archivo || typeof archivo === "string" || archivo.size === 0) {
    return Response.json({ ok: false, mensaje: "Seleccione el archivo CSV del catálogo." }, { status: 400 });
  }
  if (archivo.size > MAX_BYTES) {
    return Response.json({ ok: false, mensaje: "El archivo es demasiado grande para ser un catálogo (máximo 1 MB)." }, { status: 413 });
  }
  const contenido = Buffer.from(await archivo.arrayBuffer());
  const resultado = await cargarCatalogo({ tipo, contenido, nombreArchivo: archivo.name, perfil });
  return Response.json(resultado, { status: resultado.ok ? 200 : 422 });
}
