// scripts/setup.mjs — Crea .env.local la primera vez (npm run setup).
//
// * Si .env.local no existe, lo copia de .env.example.
// * Si SESSION_SECRET está vacío, genera uno aleatorio (32 bytes) y lo escribe.
// * Nunca muestra el secreto en pantalla ni toca un .env.local que ya tenga secreto.
// .env.local está en .gitignore: el secreto no llega al repositorio (regla R5).
import fs from 'node:fs';
import { randomBytes } from 'node:crypto';

const DESTINO = '.env.local';
const PLANTILLA = '.env.example';

let texto = fs.existsSync(DESTINO)
  ? fs.readFileSync(DESTINO, 'utf8')
  : fs.readFileSync(PLANTILLA, 'utf8');
const creado = !fs.existsSync(DESTINO);

const linea = /^SESSION_SECRET=(.*)$/m.exec(texto);
let generado = false;
if (!linea || linea[1].trim().length < 16) {
  const secreto = randomBytes(32).toString('hex');
  texto = linea
    ? texto.replace(/^SESSION_SECRET=.*$/m, `SESSION_SECRET=${secreto}`)
    : `${texto.trimEnd()}\nSESSION_SECRET=${secreto}\n`;
  generado = true;
}

if (creado || generado) fs.writeFileSync(DESTINO, texto, { mode: 0o600 });

console.log(creado ? `✓ Se creó ${DESTINO} a partir de ${PLANTILLA}.` : `- ${DESTINO} ya existía.`);
console.log(generado ? '✓ Se generó un SESSION_SECRET aleatorio (no se muestra).' : '- SESSION_SECRET ya estaba definido; no se cambió.');
console.log(/^DATABASE_URL=\S+/m.test(texto)
  ? '· DATABASE_URL definida: se usará Postgres (Supabase).'
  : '· DATABASE_URL vacía: se usará la base embebida PGlite en .pgdata (sin internet).');
