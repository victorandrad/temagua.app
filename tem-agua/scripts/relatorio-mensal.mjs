// Gera o PDF do relatório mensal a partir da página pública /relatorios/AAAA-MM (Chrome headless).
//
//   node relatorio-mensal.mjs <site> [AAAA-MM] [saida.pdf]
//
// Sem mês, usa o mês anterior (no fuso de Salto): roda no dia 1 pelo workflow relatorio-mensal.yml.
// Precisa de puppeteer-core instalado ao lado deste arquivo (o workflow instala numa pasta temporária,
// para não entrar nas dependências do projeto) e do Chrome em CHROME_PATH (padrão: google-chrome do runner).

import { stat } from 'node:fs/promises';
import puppeteer from 'puppeteer-core';

const [site, mesArg, saidaArg] = process.argv.slice(2);
if (!site) {
  console.error('uso: node relatorio-mensal.mjs <site> [AAAA-MM] [saida.pdf]');
  process.exit(2);
}

const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
const [a, m] = hoje.split('-').map(Number);
const mes = mesArg || new Date(Date.UTC(a, m - 2, 1)).toISOString().slice(0, 7);
if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) {
  console.error(`mês inválido: ${mes}`);
  process.exit(2);
}
const saida = saidaArg || `${mes}.pdf`;
const url = `${site.replace(/\/+$/, '')}/relatorios/${mes}`;

const navegador = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome',
  headless: true,
  args: ['--no-sandbox', '--hide-scrollbars', '--ignore-gpu-blocklist'],
});
try {
  const pagina = await navegador.newPage();
  await pagina.setViewport({ width: 1280, height: 900, deviceScaleFactor: 2 });
  console.log(`abrindo ${url}`);
  await pagina.goto(url, { waitUntil: 'networkidle2', timeout: 120_000 });
  // RelatoriosMensais.vue marca <html data-relatorio-pronto> quando gráficos e mapa terminaram.
  await pagina.waitForSelector('html[data-relatorio-pronto]', { timeout: 120_000 });
  await pagina.emulateMediaType('print');
  await pagina.pdf({ path: saida, preferCSSPageSize: true, printBackground: true });
  const { size } = await stat(saida);
  if (size < 20_000) throw new Error(`PDF pequeno demais (${size} bytes): a página carregou?`);
  console.log(`${saida}: ${(size / 1024).toFixed(0)} KB`);
} finally {
  await navegador.close();
}
