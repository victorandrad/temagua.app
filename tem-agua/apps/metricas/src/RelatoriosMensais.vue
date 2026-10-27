<script setup lang="ts">
// Relatórios mensais públicos: /relatorios (lista de meses) e /relatorios/AAAA-MM (o relatório do mês,
// o mesmo layout A4 do "Relatório PDF", na tela). Link fixo para mandar a vereadores e à imprensa.
// O PDF de cada mês fechado é gerado sozinho no dia 1 (.github/workflows/relatorio-mensal.yml) e fica
// em /relatorios/AAAA-MM.pdf; enquanto não existe (mês corrente), "Salvar em PDF" usa a impressão.
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { fetchMeses, fetchMetricas, type Metricas, type MesComRelatos } from './api';
import { hojeEmSalto, limitesDoMes, mesPorExtenso, nf, somaMes } from './format';
import Relatorio from './components/Relatorio.vue';

const mes = location.pathname.match(/^\/relatorios\/([^/]+?)\/?$/)?.[1] ?? null;
const hoje = hojeEmSalto();
const mesAtual = hoje.slice(0, 7);
const limites = mes ? limitesDoMes(mes) : null;
const invalido = mes !== null && (!limites || mes > mesAtual);
const parcial = mes === mesAtual;

const m = ref<Metricas | null>(null);
const meses = ref<MesComRelatos[]>([]);
const comPdf = ref(new Set<string>());
const erro = ref<string | null>(null);
const pronto = ref(false);

const titulo = computed(() => (mes ? `Relatório de ${mesPorExtenso(mes)}` : 'Relatórios mensais'));
const capitalizar = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** O PDF gerado existe? (sem ele, o servidor devolve o index.html do app, não um PDF) */
async function temPdf(x: string): Promise<boolean> {
  try {
    const res = await fetch(`/relatorios/${x}.pdf`, { method: 'HEAD' });
    return res.ok && (res.headers.get('content-type') ?? '').includes('pdf');
  } catch {
    return false;
  }
}

// O papel A4 (186 mm ≈ 703 px) encolhe para caber em telas estreitas.
const zoom = ref(1);
const LARGURA_PAPEL = 703 + 2 * 40;
function ajustarZoom() {
  zoom.value = Math.min(1, (window.innerWidth - 24) / LARGURA_PAPEL);
}

onMounted(async () => {
  document.title = `${titulo.value} · Tem Água?`;
  ajustarZoom();
  window.addEventListener('resize', ajustarZoom);
  try {
    if (!mes) {
      meses.value = await fetchMeses();
      const existem = await Promise.all(meses.value.map(async (x) => ((await temPdf(x.mes)) ? x.mes : null)));
      comPdf.value = new Set(existem.filter((x): x is string => x !== null));
    } else if (limites && !invalido) {
      const [dados, pdf] = await Promise.all([
        fetchMetricas({ de: limites.de, ate: parcial ? hoje : limites.ate, bairros: [] }),
        temPdf(mes),
      ]);
      m.value = dados;
      if (pdf) comPdf.value = new Set([mes]);
    }
  } catch (e) {
    erro.value = (e as Error).message;
  }
});
onBeforeUnmount(() => {
  window.removeEventListener('resize', ajustarZoom);
  delete document.documentElement.dataset.relatorioPronto;
});

/** Gráficos e mapa desenhados: avisa o gerador do PDF (scripts/relatorio-mensal.mjs). */
function onPronto() {
  pronto.value = true;
  document.documentElement.dataset.relatorioPronto = '1';
}

function salvarPdf() {
  window.print();
}
</script>

<template>
  <div class="ta-met ta-mensal" :class="{ 'is-relatorio': !!mes }">
    <!-- Lista de meses -->
    <template v-if="!mes">
      <header class="ta-met__head">
        <div>
          <h1 class="ta-met__title">Relatórios mensais</h1>
          <p class="ta-met__sub">Salto/SP · falta d'água relatada pelos moradores, mês a mês</p>
        </div>
      </header>
      <p class="ta-mensal__intro">
        Cada mês tem um link fixo com o relatório completo (resumo, gráficos, mapa e tabelas). O PDF de cada mês fechado
        é gerado automaticamente no dia 1 do mês seguinte.
      </p>
      <p v-if="erro" class="ta-met__alerta ta-met__alerta--erro" role="alert">{{ erro }}</p>
      <p v-else-if="!meses.length" class="ta-met__vazio">Carregando…</p>
      <ul v-else class="ta-mensal__lista">
        <li v-for="x in meses" :key="x.mes">
          <a class="ta-mensal__mes" :href="`/relatorios/${x.mes}`">
            <b>{{ capitalizar(mesPorExtenso(x.mes)) }}</b>
            <span v-if="x.mes === mesAtual" class="ta-mensal__selo">parcial</span>
            <small>
              {{ nf.format(x.semAgua) }} {{ x.semAgua === 1 ? 'relato' : 'relatos' }} de falta ·
              {{ nf.format(x.bairrosAfetados) }} {{ x.bairrosAfetados === 1 ? 'bairro' : 'bairros' }}
            </small>
          </a>
          <a v-if="comPdf.has(x.mes)" class="ta-mensal__pdf" :href="`/relatorios/${x.mes}.pdf`" download>PDF</a>
        </li>
      </ul>
    </template>

    <!-- Um mês -->
    <template v-else>
      <nav class="ta-mensal__barra" aria-label="Relatório do mês">
        <a class="ta-met__btn" href="/relatorios">← Todos os meses</a>
        <span class="ta-met__spacer"></span>
        <a v-if="!invalido" class="ta-met__btn" :href="`/relatorios/${somaMes(mes, -1)}`" :aria-label="`Relatório de ${mesPorExtenso(somaMes(mes, -1))}`">‹</a>
        <a
          v-if="!invalido && mes < mesAtual"
          class="ta-met__btn"
          :href="`/relatorios/${somaMes(mes, 1)}`"
          :aria-label="`Relatório de ${mesPorExtenso(somaMes(mes, 1))}`"
          >›</a
        >
        <a v-if="comPdf.has(mes)" class="ta-met__btn ta-met__btn--primary" :href="`/relatorios/${mes}.pdf`" download>Baixar PDF</a>
        <button v-else-if="m" type="button" class="ta-met__btn ta-met__btn--primary" :disabled="!pronto" @click="salvarPdf">
          {{ pronto ? 'Salvar em PDF' : 'Preparando…' }}
        </button>
      </nav>

      <p v-if="invalido" class="ta-met__vazio">
        Relatório não encontrado. Veja a <a href="/relatorios">lista de relatórios mensais</a>.
      </p>
      <p v-else-if="erro" class="ta-met__alerta ta-met__alerta--erro" role="alert">{{ erro }}</p>
      <p v-else-if="!m" class="ta-met__vazio">Carregando o relatório de {{ mesPorExtenso(mes) }}…</p>
      <template v-else>
        <p v-if="parcial" class="ta-mensal__aviso">
          Mês em andamento: dados até hoje. O relatório fechado (e o PDF) sai no dia 1 do mês que vem.
        </p>
        <div class="ta-mensal__papel" :style="{ zoom }">
          <Relatorio
            :m="m"
            :titulo="`Relatório mensal de falta d'água`"
            :periodo-texto="capitalizar(mesPorExtenso(mes)) + (parcial ? ' (parcial)' : '')"
            @pronto="onPronto"
          />
        </div>
      </template>
    </template>
  </div>
</template>
