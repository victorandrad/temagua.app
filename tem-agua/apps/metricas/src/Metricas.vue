<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { on } from '@tem-agua/contracts';
import { csvUrl, fetchBairros, fetchMetricas, type Filtros, type Metricas } from './api';
import { opcaoBairros, opcaoHeatmap, opcaoSerie, rotuloSerie } from './charts';
import { dataBr, dataHoraBr, DIAS_SEMANA, hojeEmSalto, horaBr, nf, somaDias, variacao } from './format';
import EChart from './components/EChart.vue';
import MapaPontos from './components/MapaPontos.vue';
import MonitorMapa from './components/MonitorMapa.vue';
import Relatorio from './components/Relatorio.vue';

type Preset = 'hoje' | '7d' | '30d' | '90d' | 'custom';
const PRESETS: Array<{ id: Preset; label: string }> = [
  { id: 'hoje', label: 'Hoje' },
  { id: '7d', label: '7 dias' },
  { id: '30d', label: '30 dias' },
  { id: '90d', label: '90 dias' },
  { id: 'custom', label: 'Personalizado' },
];

const preset = ref<Preset>('7d');
const customDe = ref(somaDias(hojeEmSalto(), -6));
const customAte = ref(hojeEmSalto());
const bairro = ref<string | null>(null);
const demo = ref(true);

const m = ref<Metricas | null>(null);
const erro = ref<string | null>(null);
const carregando = ref(false);
const bairros = ref<string[]>([]);
const tabela = ref({ serie: false, heatmap: false });

// ---- Modo monitoramento (mapa de calor em tela cheia) ----
// Também abre direto pela URL /metricas?modo=monitor (para deixar numa TV).
const monitor = ref(new URLSearchParams(location.search).get('modo') === 'monitor');
const monitorTelaCheia = ref(false);

function marcarUrl(ativo: boolean) {
  const url = new URL(location.href);
  if (ativo) url.searchParams.set('modo', 'monitor');
  else url.searchParams.delete('modo');
  history.replaceState(history.state, '', url);
}

function abrirMonitor() {
  monitorTelaCheia.value = true; // veio de um clique: o navegador permite pedir tela cheia
  monitor.value = true;
  marcarUrl(true);
}

function fecharMonitor() {
  monitor.value = false;
  monitorTelaCheia.value = false;
  marcarUrl(false);
  carregar(); // o painel ficou parado enquanto o monitoramento estava aberto
}

const filtros = computed<Filtros>(() => {
  const hoje = hojeEmSalto();
  const dias = { hoje: 1, '7d': 7, '30d': 30, '90d': 90 } as const;
  if (preset.value === 'custom') return { de: customDe.value, ate: customAte.value, bairro: bairro.value, demo: demo.value };
  return { de: somaDias(hoje, 1 - dias[preset.value]), ate: hoje, bairro: bairro.value, demo: demo.value };
});

const periodoTexto = computed(() => {
  const f = filtros.value;
  return f.de === f.ate ? dataBr(f.de) : `${dataBr(f.de)} a ${dataBr(f.ate)}`;
});

// ---- Dados ----

let controller: AbortController | undefined;

async function carregar() {
  if (monitor.value) return; // o monitoramento tem a própria atualização
  if (gerandoPdf.value) return; // não mexe nos dados enquanto o relatório está sendo impresso
  controller?.abort();
  controller = new AbortController();
  carregando.value = true;
  try {
    m.value = await fetchMetricas(filtros.value, controller.signal);
    erro.value = null;
  } catch (e) {
    if ((e as Error).name !== 'AbortError') erro.value = (e as Error).message;
  } finally {
    carregando.value = false;
  }
}

watch(filtros, carregar, { deep: true });

// Tempo real: o shell avisa pelo barramento quando chega um relato (WebSocket); recarrega
// com um pequeno atraso para agrupar rajadas. A cada minuto também, para a "última hora" andar.
let debounce: ReturnType<typeof setTimeout> | undefined;
let relogio: ReturnType<typeof setInterval> | undefined;
let offReports: (() => void) | undefined;

onMounted(async () => {
  await carregar();
  bairros.value = await fetchBairros();
  offReports = on(
    'reports',
    () => {
      clearTimeout(debounce);
      debounce = setTimeout(carregar, 1500);
    },
    { replay: false },
  );
  relogio = setInterval(carregar, 60_000);
});

onBeforeUnmount(() => {
  controller?.abort();
  offReports?.();
  clearTimeout(debounce);
  clearInterval(relogio);
});

// ---- Indicadores ----

const r = computed(() => m.value?.resumo);
const delta = computed(() => (r.value ? variacao(r.value.semAgua, r.value.anterior.semAgua) : null));
const vazio = computed(() => r.value?.total === 0);

const opSerie = computed(() => (m.value ? opcaoSerie(m.value) : {}));
const opHeatmap = computed(() => (m.value ? opcaoHeatmap(m.value) : {}));
const opBairros = computed(() => (m.value ? opcaoBairros(m.value) : {}));
const alturaBairros = computed(() => Math.max(120, Math.min(10, m.value?.bairros.filter((b) => b.semAgua).length ?? 0) * 34 + 16));

const heatmapTabela = computed(() => {
  const v = new Map((m.value?.semanaHora ?? []).map((c) => [`${c.dow}-${c.hora}`, c.semAgua]));
  return DIAS_SEMANA.map((nome, i) => ({ nome, horas: Array.from({ length: 24 }, (_, h) => v.get(`${i + 1}-${h}`) ?? 0) }));
});

// ---- Relatório em PDF ----
// Monta o relatório (layout A4 próprio) fora da tela, espera gráficos e mapa ficarem prontos e
// abre a impressão do navegador ("Salvar como PDF"). Ctrl+P sem isso imprime a tela do painel.
const gerandoPdf = ref(false);
let timeoutPdf: ReturnType<typeof setTimeout> | undefined;

function gerarPdf() {
  if (!m.value || gerandoPdf.value) return;
  gerandoPdf.value = true;
  // Garantia: se algo não avisar "pronto" (ex.: tiles do mapa sem rede), imprime assim mesmo.
  timeoutPdf = setTimeout(imprimirRelatorio, 15_000);
}

function imprimirRelatorio() {
  clearTimeout(timeoutPdf);
  if (!gerandoPdf.value) return;
  window.addEventListener('afterprint', fimPdf, { once: true });
  window.print();
}

function fimPdf() {
  gerandoPdf.value = false;
}
</script>

<template>
  <div class="ta-met" :class="{ 'is-loading': carregando && m, 'is-relatorio': gerandoPdf }">
    <header class="ta-met__head">
      <div>
        <h1 class="ta-met__title">Relatório de falta d'água</h1>
        <p class="ta-met__sub">
          Salto/SP · {{ periodoTexto }} · {{ bairro ?? 'todos os bairros' }}
          <template v-if="!demo"> · só relatos reais</template>
        </p>
      </div>
      <p class="ta-met__live" aria-live="polite">
        <span class="ta-met__live-dot" aria-hidden="true"></span>
        Ao vivo<template v-if="m"> · atualizado às {{ horaBr(m.geradoEm) }}</template>
      </p>
    </header>

    <!-- Uma linha de filtros acima de tudo; todos os números abaixo respondem a ela. -->
    <div class="ta-met__filtros" role="toolbar" aria-label="Filtros do relatório">
      <div class="ta-met__seg" role="radiogroup" aria-label="Período">
        <button
          v-for="p in PRESETS"
          :key="p.id"
          type="button"
          role="radio"
          :aria-checked="preset === p.id"
          :class="{ 'is-on': preset === p.id }"
          @click="preset = p.id"
        >
          {{ p.label }}
        </button>
      </div>
      <template v-if="preset === 'custom'">
        <label class="ta-met__campo">De <input v-model="customDe" type="date" :max="customAte" /></label>
        <label class="ta-met__campo">Até <input v-model="customAte" type="date" :min="customDe" :max="hojeEmSalto()" /></label>
      </template>
      <label class="ta-met__campo">
        <span class="ta-met__sr">Bairro</span>
        <select v-model="bairro">
          <option :value="null">Todos os bairros</option>
          <option v-for="b in bairros" :key="b" :value="b">{{ b }}</option>
        </select>
      </label>
      <label class="ta-met__check"><input v-model="demo" type="checkbox" /> Incluir demonstração</label>
      <span class="ta-met__spacer"></span>
      <button type="button" class="ta-met__btn" @click="abrirMonitor">
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
          <path d="M1 1h5v2H3v3H1V1Zm9 0h5v5h-2V3h-3V1ZM1 10h2v3h3v2H1v-5Zm12 0h2v5h-5v-2h3v-3Z" fill="currentColor" />
        </svg>
        Monitoramento
      </button>
      <a class="ta-met__btn" :href="csvUrl(filtros)" download>Exportar CSV</a>
      <button type="button" class="ta-met__btn ta-met__btn--primary" :disabled="!m || gerandoPdf" @click="gerarPdf">
        {{ gerandoPdf ? 'Preparando…' : 'Relatório PDF' }}
      </button>
    </div>

    <p v-if="erro" class="ta-met__alerta ta-met__alerta--erro" role="alert">{{ erro }}</p>
    <p v-if="r?.temDemo && demo" class="ta-met__alerta">
      Este período inclui <b>dados de demonstração</b>. Desmarque "Incluir demonstração" para ver só os relatos reais.
    </p>

    <template v-if="m && r">
      <!-- ---- Indicadores ---- -->
      <section class="ta-met__kpis" aria-label="Indicadores">
        <article class="ta-met__hero">
          <h2 class="ta-met__label">Relatos de falta d'água</h2>
          <p class="ta-met__hero-valor">{{ nf.format(r.semAgua) }}</p>
          <p
            class="ta-met__delta"
            :class="{ 'is-pior': delta !== null && delta > 0, 'is-melhor': delta !== null && delta < 0 }"
          >
            <template v-if="delta === null">sem dados no período anterior</template>
            <template v-else>
              <span aria-hidden="true">{{ delta > 0 ? '▲' : delta < 0 ? '▼' : '■' }}</span>
              {{ delta > 0 ? `${delta}% a mais` : delta < 0 ? `${-delta}% a menos` : 'igual' }}
              que em {{ dataBr(r.anterior.de, true) }}–{{ dataBr(r.anterior.ate, true) }}
            </template>
          </p>
        </article>
        <article class="ta-met__tile">
          <h2 class="ta-met__label">Água voltou</h2>
          <p class="ta-met__valor">{{ nf.format(r.voltou) }}</p>
          <p class="ta-met__nota">relatos de normalização</p>
        </article>
        <article class="ta-met__tile">
          <h2 class="ta-met__label">Bairros afetados</h2>
          <p class="ta-met__valor">{{ nf.format(r.bairrosAfetados) }}</p>
          <p class="ta-met__nota">com ao menos 1 relato de falta</p>
        </article>
        <article class="ta-met__tile">
          <h2 class="ta-met__label">Horário de pico</h2>
          <p class="ta-met__valor">{{ r.horaPico === null ? '—' : `${r.horaPico}h` }}</p>
          <p class="ta-met__nota">hora com mais faltas relatadas</p>
        </article>
        <article class="ta-met__tile">
          <h2 class="ta-met__label">Última hora</h2>
          <p class="ta-met__valor">{{ nf.format(r.ultimaHora.total) }}</p>
          <p class="ta-met__nota">{{ nf.format(r.ultimaHora.semAgua) }} sem água · {{ nf.format(r.ultimaHora.voltou) }} voltou</p>
        </article>
      </section>

      <p v-if="vazio" class="ta-met__vazio">Nenhum relato neste período{{ bairro ? ` em ${bairro}` : '' }}.</p>

      <section v-else class="ta-met__grid">
        <!-- Série temporal -->
        <article class="ta-met__card ta-met__card--full">
          <header class="ta-met__card-head">
            <div>
              <h2 class="ta-met__card-title">Relatos {{ m.serie.granularidade === 'hora' ? 'por hora' : 'por dia' }}</h2>
              <p class="ta-met__card-sub">Falta d'água e normalização no período</p>
            </div>
            <button type="button" class="ta-met__link" :aria-pressed="tabela.serie" @click="tabela.serie = !tabela.serie">
              {{ tabela.serie ? 'Ver gráfico' : 'Ver tabela' }}
            </button>
          </header>
          <div v-if="tabela.serie" class="ta-met__tabela-wrap">
            <table class="ta-met__tabela">
              <thead><tr><th>{{ m.serie.granularidade === 'hora' ? 'Hora' : 'Dia' }}</th><th>Sem água</th><th>Água voltou</th></tr></thead>
              <tbody>
                <tr v-for="p in m.serie.pontos" :key="p.t">
                  <td>{{ rotuloSerie(p.t, m.serie.granularidade) }}</td><td>{{ nf.format(p.semAgua) }}</td><td>{{ nf.format(p.voltou) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <EChart v-else :option="opSerie" :height="280" label="Gráfico de colunas empilhadas com relatos de falta d'água e de normalização ao longo do tempo" />
        </article>

        <!-- Heatmap dia da semana × hora -->
        <article class="ta-met__card">
          <header class="ta-met__card-head">
            <div>
              <h2 class="ta-met__card-title">Quando falta água</h2>
              <p class="ta-met__card-sub">Relatos de falta por dia da semana e hora</p>
            </div>
            <button type="button" class="ta-met__link" :aria-pressed="tabela.heatmap" @click="tabela.heatmap = !tabela.heatmap">
              {{ tabela.heatmap ? 'Ver gráfico' : 'Ver tabela' }}
            </button>
          </header>
          <div v-if="tabela.heatmap" class="ta-met__tabela-wrap">
            <table class="ta-met__tabela ta-met__tabela--densa">
              <thead><tr><th></th><th v-for="h in 24" :key="h">{{ h - 1 }}h</th></tr></thead>
              <tbody>
                <tr v-for="d in heatmapTabela" :key="d.nome"><th>{{ d.nome }}</th><td v-for="(v, h) in d.horas" :key="h">{{ v || '' }}</td></tr>
              </tbody>
            </table>
          </div>
          <EChart v-else :option="opHeatmap" :height="300" label="Mapa de calor da quantidade de relatos de falta por dia da semana e hora" />
        </article>

        <!-- Ranking -->
        <article class="ta-met__card">
          <header class="ta-met__card-head">
            <div>
              <h2 class="ta-met__card-title">Bairros mais afetados</h2>
              <p class="ta-met__card-sub">Relatos de falta d'água · top 10</p>
            </div>
          </header>
          <EChart :option="opBairros" :height="alturaBairros" label="Barras horizontais com os bairros com mais relatos de falta d'água" />
        </article>

        <!-- Mapa -->
        <article class="ta-met__card">
          <header class="ta-met__card-head">
            <div>
              <h2 class="ta-met__card-title">Onde os relatos se concentram</h2>
              <p class="ta-met__card-sub">Áreas de ~200 m · tamanho = número de relatos</p>
            </div>
            <button type="button" class="ta-met__link" @click="abrirMonitor">Tela cheia ao vivo</button>
          </header>
          <MapaPontos :pontos="m.pontos" />
        </article>

        <!-- Tabela por bairro -->
        <article class="ta-met__card">
          <header class="ta-met__card-head">
            <div>
              <h2 class="ta-met__card-title">Por bairro</h2>
              <p class="ta-met__card-sub">Todos os bairros com relatos no período</p>
            </div>
          </header>
          <div class="ta-met__tabela-wrap ta-met__tabela-wrap--alta">
            <table class="ta-met__tabela">
              <thead><tr><th>Bairro</th><th>Sem água</th><th>Voltou</th><th>Último relato</th></tr></thead>
              <tbody>
                <tr v-for="b in m.bairros" :key="b.bairro">
                  <td>{{ b.bairro }}</td><td>{{ nf.format(b.semAgua) }}</td><td>{{ nf.format(b.voltou) }}</td><td>{{ dataHoraBr(b.ultimo) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </article>

        <!-- Últimos relatos -->
        <article class="ta-met__card ta-met__card--full">
          <header class="ta-met__card-head">
            <div>
              <h2 class="ta-met__card-title">Últimos relatos</h2>
              <p class="ta-met__card-sub">Os 50 mais recentes · o CSV traz todos, com dia, hora e coordenadas</p>
            </div>
          </header>
          <div class="ta-met__tabela-wrap ta-met__tabela-wrap--alta">
            <table class="ta-met__tabela">
              <thead><tr><th>Dia</th><th>Hora</th><th>Bairro</th><th>Status</th><th>Coordenadas</th><th>Origem</th></tr></thead>
              <tbody>
                <tr v-for="x in m.recentes" :key="x.id">
                  <td>{{ dataBr(x.dia) }}</td>
                  <td>{{ horaBr(x.criadoEm) }}</td>
                  <td>{{ x.bairro }}</td>
                  <td>
                    <span class="ta-met__status" :class="`is-${x.status}`">
                      <i aria-hidden="true"></i>{{ x.status === 'sem-agua' ? 'Sem água' : 'Água voltou' }}
                    </span>
                  </td>
                  <td class="ta-met__coord">{{ x.lat.toFixed(4) }}, {{ x.lng.toFixed(4) }}</td>
                  <td>{{ x.origem === 'demo' ? 'demonstração' : 'app' }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </article>
      </section>

      <p class="ta-met__rodape">
        Gerado em {{ dataHoraBr(m.geradoEm) }} · Tem Água? · Posições arredondadas para ~10 m · Mapa © OpenFreeMap, © OpenStreetMap
      </p>
    </template>

    <p v-else-if="!erro" class="ta-met__vazio">Carregando métricas…</p>

    <Relatorio v-if="gerandoPdf && m" :m="m" :demo="demo" @pronto="imprimirRelatorio" />
    <p v-if="gerandoPdf" class="ta-met__preparando" role="status">Preparando o relatório em PDF…</p>

    <MonitorMapa v-if="monitor" :demo="demo" :tela-cheia="monitorTelaCheia" @fechar="fecharMonitor" />
  </div>
</template>
