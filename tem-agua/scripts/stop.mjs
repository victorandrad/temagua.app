// Derruba tudo que o "npm run dev" sobe: processos nas portas do app e o túnel do cloudflared
// aberto pelo scripts/tunnel.mjs (só ele: outros túneis seus não são afetados).

import { execSync } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { c, killTree, listeningPids, processName, SERVICES } from './lib.mjs';

let stopped = 0;

for (const { name, port } of SERVICES) {
  for (const pid of listeningPids(port)) {
    const proc = processName(pid);
    // Encerrar um processo costuma derrubar os outros em cascata (concurrently), então uma falha
    // aqui pode só significar que ele já tinha saído: confere se a porta ainda está ocupada.
    if (killTree(pid) || !listeningPids(port).includes(pid)) {
      stopped++;
      console.log(`${c.green('✓')} ${name} (porta ${port}) — PID ${pid} ${proc}`);
    } else {
      console.log(`${c.red('✗')} não consegui encerrar PID ${pid} (${proc}) na porta ${port}`);
    }
  }
}

// Túnel: não escuta porta local; o tunnel.mjs guarda o PID num arquivo.
const pidFile = join(dirname(fileURLToPath(import.meta.url)), '..', '.tunnel-pid');
try {
  const pid = Number(readFileSync(pidFile, 'utf8'));
  if (pid && killTree(pid)) {
    stopped++;
    console.log(`${c.green('✓')} túnel cloudflared — PID ${pid}`);
  }
  rmSync(pidFile, { force: true });
  rmSync(join(dirname(pidFile), '.tunnel-url'), { force: true });
} catch {
  // nenhum túnel aberto pelo script
}

// Banco: para o container "db" do npm run dev, a menos que a stack Docker completa esteja no ar
// (aí a API do container depende dele; use npm run docker:down).
const compose = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'compose.yaml');
try {
  const apiDocker = execSync(`docker compose -f "${compose}" ps -q --status running api`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  const db = execSync(`docker compose -f "${compose}" ps -q --status running db`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  if (db && !apiDocker) {
    execSync(`docker compose -f "${compose}" stop db`, { stdio: 'ignore' });
    stopped++;
    console.log(`${c.green('✓')} banco (container db) — os dados ficam no volume`);
  }
} catch {
  // sem Docker: nada a parar
}

const stillBusy = SERVICES.filter(({ port }) => listeningPids(port).length);
if (stillBusy.length) {
  console.log(c.red(`\nAinda ocupadas: ${stillBusy.map((s) => s.port).join(', ')}. Feche o terminal do app ou rode de novo.`));
  process.exit(1);
}
console.log(stopped ? c.green('\nTudo parado.') : 'Nada rodando.');
