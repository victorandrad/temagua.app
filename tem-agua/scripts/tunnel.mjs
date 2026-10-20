// Abre um túnel HTTPS público para o shell e mostra o link.
//
//   node scripts/tunnel.mjs ngrok        → ngrok (SDK oficial @ngrok/ngrok, precisa de authtoken)
//   node scripts/tunnel.mjs cloudflared  → Quick Tunnel do cloudflared (sem conta)
//
// O link é público enquanto este processo roda. O "npm run stop" encerra o túnel pelo PID
// salvo em .tunnel-pid; o link fica em .tunnel-url.

import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { c, waitForUrls } from './lib.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const URL_FILE = join(ROOT, '.tunnel-url');
const PID_FILE = join(ROOT, '.tunnel-pid');
const SHELL = 'localhost:4200';

const provider = process.argv[2] ?? 'cloudflared';

const cleanup = () => {
  rmSync(URL_FILE, { force: true });
  rmSync(PID_FILE, { force: true });
};

function announce(url, note) {
  writeFileSync(URL_FILE, url + '\n');
  const line = `  Link público (abra no celular): ${url}  `;
  const bar = '═'.repeat(line.length);
  console.log(c.green(`\n╔${bar}╗\n║${c.bold(line)}║\n╚${bar}╝`));
  console.log(c.yellow('  Qualquer pessoa com o link acessa enquanto o túnel estiver aberto.'));
  if (note) console.log(c.yellow(`  ${note}`));
  console.log();
}

// ---------------------------------------------------------------- ngrok

/** Lê tem-agua/.env.local (fora do git) no formato CHAVE=valor. */
function readEnvLocal() {
  const file = join(ROOT, '.env.local');
  if (!existsSync(file)) return {};
  const env = {};
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"#\r\n]*?)"?\s*$/);
    if (m) env[m[1]] = m[2];
  }
  return env;
}

/** Token já configurado com "ngrok config add-authtoken", se houver. */
function ngrokConfigToken() {
  const candidates = [
    process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, 'ngrok', 'ngrok.yml'),
    join(homedir(), 'Library', 'Application Support', 'ngrok', 'ngrok.yml'),
    join(homedir(), '.config', 'ngrok', 'ngrok.yml'),
  ].filter(Boolean);
  for (const file of candidates) {
    if (!existsSync(file)) continue;
    const m = readFileSync(file, 'utf8').match(/^\s*authtoken:\s*"?([^"\s]+)"?/m);
    if (m) return m[1];
  }
  return undefined;
}

async function runNgrok() {
  const envLocal = readEnvLocal();
  const authtoken = process.env.NGROK_AUTHTOKEN || envLocal.NGROK_AUTHTOKEN || ngrokConfigToken();
  const domain = process.env.NGROK_DOMAIN || envLocal.NGROK_DOMAIN || undefined;

  if (!authtoken) {
    console.log(c.yellow('\nngrok sem authtoken — o app segue rodando só em http://localhost:4200.'));
    console.log('Para ativar o link público:');
    console.log(`  1. Crie uma conta gratuita em ${c.cyan('https://dashboard.ngrok.com/signup')}`);
    console.log(`  2. Copie seu token em ${c.cyan('https://dashboard.ngrok.com/get-started/your-authtoken')}`);
    console.log(`  3. Crie o arquivo ${c.bold('tem-agua/.env.local')} com a linha:  NGROK_AUTHTOKEN=seu_token`);
    console.log('     (opcional: NGROK_DOMAIN=seu-dominio.ngrok-free.app para ter um link fixo)');
    console.log(`  4. Rode ${c.bold('npm run stop')} e ${c.bold('npm run dev:ngrok')} de novo.\n`);
    return;
  }

  const { default: ngrok } = await import('@ngrok/ngrok');
  await waitForUrls([`http://${SHELL}/`]);
  console.log('Abrindo túnel ngrok…');

  // O túnel roda dentro deste processo; o "npm run stop" encerra este PID.
  writeFileSync(PID_FILE, String(process.pid));
  let listener;
  try {
    listener = await ngrok.forward({ addr: SHELL, authtoken, ...(domain && { domain }) });
  } catch (err) {
    cleanup();
    console.log(c.red(`ngrok recusou o túnel: ${err.message}`));
    console.log('Confira o NGROK_AUTHTOKEN (e o NGROK_DOMAIN, se usar). O app segue rodando em http://localhost:4200.');
    return;
  }
  announce(listener.url(), 'No plano gratuito o ngrok mostra uma tela de aviso na primeira visita: toque em "Visit Site".');

  const close = async () => {
    await ngrok.disconnect().catch(() => {});
    cleanup();
    process.exit(0);
  };
  process.on('SIGINT', close);
  process.on('SIGTERM', close);
  // Mantém o processo vivo enquanto o túnel estiver aberto.
  setInterval(() => {}, 1 << 30);
}

// ---------------------------------------------------------- cloudflared

async function runCloudflared() {
  if (spawnSync('cloudflared', ['--version'], { stdio: 'ignore' }).error) {
    console.log(c.yellow('cloudflared não encontrado — o app segue rodando só em http://localhost:4200.'));
    console.log(`Para ter o link HTTPS (celular/GPS), instale: ${c.bold('winget install --id Cloudflare.cloudflared')}`);
    return;
  }

  await waitForUrls([`http://${SHELL}/`]);
  console.log('Abrindo túnel cloudflared…');

  const child = spawn('cloudflared', ['tunnel', '--no-autoupdate', '--url', `http://${SHELL}`], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  writeFileSync(PID_FILE, String(child.pid));

  let announced = false;
  const onOutput = (chunk) => {
    const text = chunk.toString();
    const match = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
    if (match && !announced) {
      announced = true;
      announce(match[0]);
    }
    // Só repassa erros; o resto do log do cloudflared é muito verboso.
    for (const l of text.split(/\r?\n/)) if (/\bERR\b/.test(l) && !/canceled by remote/.test(l)) console.log(l);
  };
  child.stdout.on('data', onOutput);
  child.stderr.on('data', onOutput);

  child.on('exit', (code) => {
    cleanup();
    process.exit(code ?? 0);
  });
  for (const sig of ['SIGINT', 'SIGTERM']) {
    process.on(sig, () => {
      child.kill();
      cleanup();
      process.exit(0);
    });
  }
}

// ----------------------------------------------------------------------

if (provider === 'ngrok') await runNgrok();
else if (provider === 'cloudflared') await runCloudflared();
else {
  console.error(c.red(`Túnel desconhecido: "${provider}". Use ngrok ou cloudflared.`));
  process.exit(1);
}
