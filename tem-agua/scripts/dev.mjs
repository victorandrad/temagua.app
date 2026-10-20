// Sobe tudo com um comando:  npm run dev
// Com link HTTPS público:      npm run dev:ngrok  (ou  npm run dev:tunnel  para o cloudflared)
//
// 1. Instala dependências se faltar node_modules
// 2. Confere versão do Node e se as portas estão livres
// 3. Sobe API + remotos (mapa, painel); o shell só sobe depois que os remotos respondem
// 4. Com --tunnel=ngrok|cloudflared: abre o túnel e mostra o link público

import { existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { c, listeningPids, processName, SERVICES } from './lib.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const tunnelArg = process.argv.find((a) => a.startsWith('--tunnel'));
const tunnel = tunnelArg ? tunnelArg.split('=')[1] || 'cloudflared' : null;

// ---- 1. Node ----
const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 20 || (major === 20 && minor < 19)) {
  console.error(c.red(`Node ${process.versions.node} é antigo demais. Use Node 20.19 ou mais novo.`));
  process.exit(1);
}

// ---- 2. Dependências ----
if (!existsSync(join(root, 'node_modules'))) {
  console.log(c.yellow('Instalando dependências (primeira execução)…'));
  execSync('npm install', { cwd: root, stdio: 'inherit' });
}

// ---- 3. Portas ----
const busy = SERVICES.flatMap(({ name, port }) =>
  listeningPids(port).map((pid) => ({ name, port, pid, proc: processName(pid) })),
);
if (busy.length) {
  console.error(c.red('\nPortas ocupadas — o app (ou outra coisa) já está rodando:\n'));
  for (const b of busy) console.error(`  ${b.port} (${b.name}) ← PID ${b.pid} ${b.proc}`);
  console.error(`\nSe for o próprio app, use o que já está rodando em ${c.cyan('http://localhost:4200')}`);
  console.error(`ou derrube tudo com ${c.bold('npm run stop')} e rode de novo.\n`);
  process.exit(1);
}

// ---- 4. Processos ----
const { default: concurrently } = await import('concurrently');
const remotesReady = SERVICES.filter((s) => s.name !== 'shell').map((s) => s.ready);

const commands = [
  { name: 'api', command: 'npm run dev -w apps/api', prefixColor: 'yellow' },
  { name: 'mapa', command: 'npm run serve -w apps/mapa', prefixColor: 'blue' },
  { name: 'painel', command: 'npm run serve -w apps/painel', prefixColor: 'green' },
  {
    name: 'shell',
    command: `node scripts/wait-for.mjs ${remotesReady.join(' ')} && npm start -w apps/shell`,
    prefixColor: 'red',
  },
];
if (tunnel) commands.push({ name: tunnel, command: `node scripts/tunnel.mjs ${tunnel}`, prefixColor: 'magenta' });

const { result } = concurrently(commands, {
  cwd: root,
  prefix: 'name',
  // Se um processo falhar, derruba os outros; Ctrl+C derruba todos.
  killOthersOn: ['failure'],
});

result.then(
  () => process.exit(0),
  () => process.exit(1),
);
