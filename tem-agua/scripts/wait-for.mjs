// Espera as URLs passadas como argumento responderem antes de seguir.
// Uso: node scripts/wait-for.mjs http://localhost:4201/... http://localhost:4202/...

import { c, waitForUrls } from './lib.mjs';

const urls = process.argv.slice(2);
console.log(`Aguardando ${urls.length} serviço(s) ficarem prontos…`);
try {
  await waitForUrls(urls);
  console.log(c.green('Remotos prontos, subindo o shell.'));
} catch (err) {
  console.error(c.red(err.message));
  process.exit(1);
}
