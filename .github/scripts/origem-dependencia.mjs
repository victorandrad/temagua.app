// De onde vem um pacote do monorepo tem-agua (usado nas issues de segurança):
//   node .github/scripts/origem-dependencia.mjs vite@7.3.6
//   → {"partes":["frontend"],"producao":{"backend":false,"frontend":false,"ferramentas":false},"arvore":"…npm ls…"}
// partes: backend (apps/api), frontend (shell, mapa, painel, metricas, contracts) ou ferramentas (dependências
// da raiz, como o ESLint). producao[parte]: aparece mesmo sem as devDependencies (vai para o site ou para a
// API); senão é só de build e desenvolvimento. Precisa do node_modules instalado em tem-agua/.
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const MONOREPO = fileURLToPath(new URL('../../tem-agua/', import.meta.url));

// npm ls sai com erro quando a árvore tem algo "invalid"/"extraneous", mas a saída continua válida.
function npmLs(spec, extra) {
  try {
    // No Windows o npm é npm.cmd (só para testar localmente; o CI roda no Linux).
    return execFileSync('npm', ['ls', spec, '--all', ...extra], {
      cwd: MONOREPO,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      shell: process.platform === 'win32',
    });
  } catch (err) {
    return err.stdout ?? '';
  }
}
const arvoreJson = (spec, extra = []) => JSON.parse(npmLs(spec, ['--json', ...extra]) || '{}').dependencies ?? {};

const parteDe = (dep) => {
  const caminho = dep.resolved ?? '';
  if (caminho === 'file:../apps/api') return 'backend';
  if (caminho.startsWith('file:../apps/') || caminho.startsWith('file:../packages/')) return 'frontend';
  return 'ferramentas';
};

export function origem(spec) {
  const partes = [...new Set(Object.values(arvoreJson(spec)).map(parteDe))].sort();
  const producao = { backend: false, frontend: false, ferramentas: false };
  for (const dep of Object.values(arvoreJson(spec, ['--omit=dev']))) producao[parteDe(dep)] = true;
  const arvore = npmLs(spec, []).trim().split('\n').slice(0, 40).join('\n');
  return { partes: partes.length ? partes : ['ferramentas'], producao, arvore };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!process.argv[2]) {
    console.error('Uso: node origem-dependencia.mjs <pacote@versão>');
    process.exit(2);
  }
  console.log(JSON.stringify(origem(process.argv[2])));
}
