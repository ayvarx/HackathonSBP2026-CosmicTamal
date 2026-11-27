// Crea o reemplaza una cuenta de acceso.
// Uso:  node scripts/crear-usuario.js <usuario> <publico|analista|admin> <clave>
// La clave se cifra y no se guarda en texto. El archivo usuarios.json no se sube al repositorio.
import { crearUsuario, ROLES, ARCHIVO_USUARIOS } from "../src/auth.js";

const [usuario, rol, clave] = process.argv.slice(2);
if (!usuario || !rol || !clave) {
  console.error(`Uso: node scripts/crear-usuario.js <usuario> <${ROLES.join("|")}> <clave>`);
  process.exit(1);
}
try {
  crearUsuario(usuario, rol, clave);
  console.log(`Cuenta "${usuario}" creada con rol "${rol}" en ${ARCHIVO_USUARIOS}`);
} catch (e) {
  console.error(e.message);
  process.exit(1);
}
