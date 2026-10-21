// Utilitários compartilhados pelos scripts de dev (dev.mjs, stop.mjs).

import { execSync } from 'node:child_process';

export const SERVICES = [
  { name: 'api', port: 4300, ready: 'http://localhost:4300/api/reports' },
  { name: 'mapa', port: 4201, ready: 'http://localhost:4201/remotes/mapa/remoteEntry.js' },
  { name: 'painel', port: 4202, ready: 'http://localhost:4202/remotes/painel/remoteEntry.js' },
  { name: 'metricas', port: 4203, ready: 'http://localhost:4203/remotes/metricas/remoteEntry.js' },
  { name: 'shell', port: 4200, ready: 'http://localhost:4200/' },
];

const isWindows = process.platform === 'win32';

/** PIDs escutando numa porta TCP local. */
export function listeningPids(port) {
  try {
    if (isWindows) {
      const out = execSync('netstat -ano', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
      const pids = new Set();
      for (const line of out.split(/\r?\n/)) {
        const m = line.match(/^\s*TCP\s+\S+:(\d+)\s+\S+\s+LISTENING\s+(\d+)/);
        if (m && Number(m[1]) === port && m[2] !== '0') pids.add(Number(m[2]));
      }
      return [...pids];
    }
    const out = execSync(`lsof -nP -iTCP:${port} -sTCP:LISTEN -t`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    return [...new Set(out.split(/\s+/).filter(Boolean).map(Number))];
  } catch {
    return [];
  }
}

export function processName(pid) {
  try {
    if (isWindows) {
      const out = execSync(`tasklist /FI "PID eq ${pid}" /FO CSV /NH`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
      return out.split(',')[0]?.replaceAll('"', '').trim() || '?';
    }
    return execSync(`ps -p ${pid} -o comm=`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() || '?';
  } catch {
    return '?';
  }
}

/** Encerra o processo e os filhos dele. */
export function killTree(pid) {
  try {
    if (isWindows) execSync(`taskkill /PID ${pid} /T /F`, { stdio: 'ignore' });
    else process.kill(pid, 'SIGTERM');
    return true;
  } catch {
    return false;
  }
}

/** Espera até todas as URLs responderem 2xx. */
export async function waitForUrls(urls, { timeoutMs = 180_000, intervalMs = 500 } = {}) {
  const deadline = Date.now() + timeoutMs;
  for (const url of urls) {
    for (;;) {
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
        if (res.ok) break;
      } catch {
        // ainda subindo
      }
      if (Date.now() > deadline) throw new Error(`Tempo esgotado esperando ${url}`);
      await new Promise((r) => setTimeout(r, intervalMs));
    }
  }
}

export const c = {
  bold: (s) => `\x1b[1m${s}\x1b[22m`,
  green: (s) => `\x1b[32m${s}\x1b[39m`,
  yellow: (s) => `\x1b[33m${s}\x1b[39m`,
  red: (s) => `\x1b[31m${s}\x1b[39m`,
  cyan: (s) => `\x1b[36m${s}\x1b[39m`,
};
