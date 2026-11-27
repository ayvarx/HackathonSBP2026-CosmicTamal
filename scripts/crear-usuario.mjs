// Crea o reemplaza una cuenta de acceso.
// Uso: npm run usuario -- <usuario> <publico|analista|administrador> <clave>
import fs from "node:fs";

if (fs.existsSync(".env.local")) process.loadEnvFile(".env.local");

const [usuario, rol, clave] = process.argv.slice(2);
if (!usuario || !rol || !clave) {
  console.error("Uso: npm run usuario -- <usuario> <publico|analista|administrador> <clave>");
  process.exit(1);
}

const { crearUsuario } = await import("../lib/usuarios.js");
try {
  await crearUsuario(usuario, rol, clave);
  console.log(`Cuenta "${usuario}" lista con rol ${rol}.`);
  process.exit(0);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
