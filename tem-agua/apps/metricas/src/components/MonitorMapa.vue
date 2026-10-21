<script setup lang="ts">
// Modo monitoramento: só o mapa de calor da falta d'água, em tela cheia, atualizando em tempo real.
// Pensado para ficar aberto numa TV/segundo monitor: relatos recentes pesam mais, relato novo
// pisca no mapa, a tela não apaga (Wake Lock) e o cursor some quando parado.

import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { AttributionControl, Map as MlMap, Marker, setWorkerUrl, type ExpressionSpecification, type GeoJSONSource } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import type { FeatureCollection, Point } from 'geojson';
import { on, SALTO_BOUNDS, SALTO_CENTER } from '@tem-agua/contracts';
import { fetchMonitor, type RelatoMonitor } from '../api';
import { RAMPA, RAMPA_VOLTOU } from '../charts';
import { nf } from '../format';

setWorkerUrl(new URL(workerUrl, import.meta.url).href);

const props = defineProps<{ demo: boolean; telaCheia: boolean }>();
const emit = defineEmits<{ fechar: [] }>();

const JANELAS = [1, 6, 24] as const;
const janela = ref<number>(6);
const relatos = ref<RelatoMonitor[]>([]);
const agora = ref(Date.now());
const erro = ref<string | null>(null);
const atualizadoEm = ref<number | null>(null);
const cursorOculto = ref(false);
const emTelaCheia = ref(false);

const raiz = ref<HTMLElement | null>(null);
const mapaEl = ref<HTMLElement | null>(null);
let map: MlMap | undefined;
let carregado = false;
const vistos = new Set<string>();
let primeiraCarga = true;

const semAgua = computed(() => relatos.value.filter((r) => r.status === 'sem-agua'));
const bairrosComFalta = computed(() => new Set(semAgua.value.map((r) => r.bairro)).size);
const voltouLista = computed(() => relatos.value.filter((r) => r.status === 'voltou'));
const voltou = computed(() => voltouLista.value.length);
const relogio = computed(() =>
  new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(agora.value),
);
const gradiente = `linear-gradient(90deg, ${RAMPA.join(', ')})`;
const gradienteVoltou = `linear-gradient(90deg, ${RAMPA_VOLTOU.join(', ')})`;

/** Peso no calor: 1 para o que acabou de chegar, caindo até 0,15 no fim da janela. */
function geojson(lista: RelatoMonitor[]): FeatureCollection<Point> {
  const janelaMs = janela.value * 3_600_000;
  return {
    type: 'FeatureCollection',
    features: lista.map((r) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [r.lng, r.lat] },
      properties: { peso: Math.max(0.15, 1 - (agora.value - r.createdAt) / janelaMs) },
    })),
  };
}

function desenhar() {
  if (!map || !carregado) return;
  (map.getSource('falta') as GeoJSONSource).setData(geojson(semAgua.value));
  (map.getSource('voltou') as GeoJSONSource).setData(geojson(voltouLista.value));
}

/** Relato novo: um anel que pulsa no ponto (vermelho = falta, verde = voltou) por alguns segundos. */
function pulsar(r: RelatoMonitor) {
  if (!map) return;
  // O MapLibre posiciona o marcador com transform; a animação (scale) fica num filho para não brigar com ele.
  const el = document.createElement('div');
  el.setAttribute('aria-hidden', 'true');
  const anel = document.createElement('div');
  anel.className = `ta-mon__pulso is-${r.status}`;
  el.appendChild(anel);
  const marker = new Marker({ element: el }).setLngLat([r.lng, r.lat]).addTo(map);
  setTimeout(() => marker.remove(), 8000);
}

let controller: AbortController | undefined;
async function carregar() {
  controller?.abort();
  controller = new AbortController();
  try {
    const lista = await fetchMonitor(janela.value, props.demo, controller.signal);
    // Só pisca o que chegou de fato agora: nunca na primeira carga nem ao trocar a janela/filtro, e só
    // relatos criados depois da carga anterior (ampliar a janela traz relatos antigos "inéditos").
    const desde = (atualizadoEm.value ?? Date.now()) - 15_000;
    if (!primeiraCarga) for (const r of lista) if (!vistos.has(r.id) && r.createdAt >= desde) pulsar(r);
    for (const r of lista) vistos.add(r.id);
    primeiraCarga = false;
    relatos.value = lista;
    agora.value = Date.now();
    atualizadoEm.value = agora.value;
    erro.value = null;
    desenhar();
  } catch (e) {
    if ((e as Error).name !== 'AbortError') erro.value = (e as Error).message;
  }
}

function recarregarSemPulsos() {
  primeiraCarga = true;
  carregar();
}
watch(janela, recarregarSemPulsos);
watch(() => props.demo, recarregarSemPulsos);

// ---- Tela cheia, teclado, cursor e tela sempre acesa ----

async function alternarTelaCheia() {
  if (document.fullscreenElement) await document.exitFullscreen().catch(() => {});
  else await raiz.value?.requestFullscreen?.().catch(() => {});
}

function onFullscreenChange() {
  const ativo = document.fullscreenElement === raiz.value;
  // Saiu da tela cheia pelo Esc do navegador: sai do monitoramento também.
  if (emTelaCheia.value && !ativo) emit('fechar');
  emTelaCheia.value = ativo;
}

function onKey(e: KeyboardEvent) {
  if (e.key !== 'Escape') return;
  // Em tela cheia, sair dela já fecha o monitoramento (onFullscreenChange); fora dela, fecha direto.
  if (document.fullscreenElement) document.exitFullscreen().catch(() => emit('fechar'));
  else emit('fechar');
}

let cursorTimer: ReturnType<typeof setTimeout> | undefined;
function onPointerMove() {
  cursorOculto.value = false;
  clearTimeout(cursorTimer);
  cursorTimer = setTimeout(() => (cursorOculto.value = true), 3000);
}

let wakeLock: { release(): Promise<void> } | null = null;
async function manterTelaAcesa() {
  try {
    const nav = navigator as Navigator & { wakeLock?: { request(type: 'screen'): Promise<{ release(): Promise<void> }> } };
    wakeLock = (await nav.wakeLock?.request('screen')) ?? null;
  } catch {
    wakeLock = null; // sem suporte ou sem permissão: segue normal
  }
}
function onVisibility() {
  // O navegador solta o Wake Lock quando a aba fica oculta; pede de novo ao voltar.
  if (document.visibilityState === 'visible') manterTelaAcesa();
}

// ---- Pulsação contínua do calor ----
// O calor "respira" o tempo todo (intensidade e opacidade sobem e descem), qualquer que seja a
// janela escolhida e mesmo sem relato novo — para a tela de monitoramento nunca parecer parada.
// Com "reduzir movimento" no sistema, fica estático.

const PERIODO_MS = 2400;
const QUADRO_MS = 50; // ~20 quadros/s: suave e barato
let animacao = 0;
let ultimoQuadro = 0;
const reduzirMovimento = window.matchMedia('(prefers-reduced-motion: reduce)');

function intensidade(fase: number): ExpressionSpecification {
  // fase 0 → 1: base mais baixa e pico mais alto que o valor estático (1,3 / 2,6).
  return ['interpolate', ['linear'], ['zoom'], 11, 0.9 + fase * 1.0, 15, 1.8 + fase * 1.8];
}

function pulsarCalor(t: number) {
  animacao = requestAnimationFrame(pulsarCalor);
  if (!map || !carregado || t - ultimoQuadro < QUADRO_MS) return;
  ultimoQuadro = t;
  const fase = (Math.sin((t / PERIODO_MS) * 2 * Math.PI) + 1) / 2;
  // Vermelho e verde pulsam em contrafase: além da cor, o ritmo diferencia falta e volta
  // (vermelho/verde se confundem para quem tem daltonismo deuteranopia/protanopia).
  const faseVoltou = 1 - fase;
  map.setPaintProperty('falta-calor', 'heatmap-intensity', intensidade(fase));
  map.setPaintProperty('falta-calor', 'heatmap-opacity', 0.62 + fase * 0.33);
  map.setPaintProperty('voltou-calor', 'heatmap-intensity', intensidade(faseVoltou));
  map.setPaintProperty('voltou-calor', 'heatmap-opacity', 0.5 + faseVoltou * 0.35);
}

function iniciarPulsacao() {
  cancelAnimationFrame(animacao);
  if (reduzirMovimento.matches) {
    if (map && carregado) {
      for (const id of ['falta-calor', 'voltou-calor']) {
        map.setPaintProperty(id, 'heatmap-intensity', intensidade(0.5));
        map.setPaintProperty(id, 'heatmap-opacity', 0.8);
      }
    }
    return;
  }
  animacao = requestAnimationFrame(pulsarCalor);
}

// ---- Ciclo de vida ----

let offReports: (() => void) | undefined;
let debounce: ReturnType<typeof setTimeout> | undefined;
let tique: ReturnType<typeof setInterval> | undefined;
let recarga: ReturnType<typeof setInterval> | undefined;

onMounted(async () => {
  document.body.style.overflow = 'hidden';
  document.addEventListener('fullscreenchange', onFullscreenChange);
  document.addEventListener('keydown', onKey);
  document.addEventListener('visibilitychange', onVisibility);
  onPointerMove();
  manterTelaAcesa();
  if (props.telaCheia) alternarTelaCheia();

  map = new MlMap({
    container: mapaEl.value!,
    style: 'https://tiles.openfreemap.org/styles/positron',
    center: [SALTO_CENTER.lng, SALTO_CENTER.lat],
    zoom: 12.6,
    minZoom: 11,
    maxBounds: [
      [SALTO_BOUNDS[0], SALTO_BOUNDS[1]],
      [SALTO_BOUNDS[2], SALTO_BOUNDS[3]],
    ],
    attributionControl: false,
    dragRotate: false,
  });
  map.touchZoomRotate.disableRotation();
  map.addControl(new AttributionControl({ compact: true }), 'bottom-right');

  map.on('load', () => {
    mapaEl.value?.querySelector('.maplibregl-ctrl-attrib')?.classList.remove('maplibregl-compact-show');
    map!.addSource('voltou', { type: 'geojson', data: geojson(voltouLista.value) });
    map!.addSource('falta', { type: 'geojson', data: geojson(semAgua.value) });
    // Verde por baixo do vermelho: onde as duas coisas acontecem, a falta fica em primeiro plano.
    map!.addLayer({
      id: 'voltou-calor',
      type: 'heatmap',
      source: 'voltou',
      paint: {
        'heatmap-weight': ['get', 'peso'],
        'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 11, 1.3, 15, 2.6],
        'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 11, 22, 13, 34, 16, 60],
        'heatmap-color': [
          'interpolate',
          ['linear'],
          ['heatmap-density'],
          0, 'rgba(5, 163, 87, 0)',
          0.15, RAMPA_VOLTOU[1],
          0.4, RAMPA_VOLTOU[2],
          0.7, RAMPA_VOLTOU[3],
          1, RAMPA_VOLTOU[4],
        ],
        'heatmap-opacity': 0.8,
      },
    });
    map!.addLayer({
      id: 'falta-calor',
      type: 'heatmap',
      source: 'falta',
      paint: {
        'heatmap-weight': ['get', 'peso'],
        'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 11, 1.3, 15, 2.6],
        'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 11, 22, 13, 34, 16, 60],
        // Rampa sequencial de um tom (a mesma do painel): transparente onde não há relatos.
        'heatmap-color': [
          'interpolate',
          ['linear'],
          ['heatmap-density'],
          0, 'rgba(225, 25, 0, 0)',
          0.15, RAMPA[1],
          0.4, RAMPA[2],
          0.7, RAMPA[3],
          1, RAMPA[4],
        ],
        'heatmap-opacity': 0.85,
      },
    });
    carregado = true;
    desenhar();
    iniciarPulsacao();
  });
  reduzirMovimento.addEventListener('change', iniciarPulsacao);

  await carregar();

  // Tempo real: o shell avisa pelo barramento quando chega relato (WebSocket).
  offReports = on(
    'reports',
    () => {
      clearTimeout(debounce);
      debounce = setTimeout(carregar, 800);
    },
    { replay: false },
  );
  // Relógio e "esfriamento" do calor a cada segundo/30 s; recarga de garantia a cada minuto.
  tique = setInterval(() => {
    agora.value = Date.now();
    if (Math.floor(agora.value / 1000) % 30 === 0) desenhar();
  }, 1000);
  recarga = setInterval(carregar, 60_000);
});

onBeforeUnmount(() => {
  document.body.style.overflow = '';
  document.removeEventListener('fullscreenchange', onFullscreenChange);
  document.removeEventListener('keydown', onKey);
  document.removeEventListener('visibilitychange', onVisibility);
  if (document.fullscreenElement === raiz.value) document.exitFullscreen().catch(() => {});
  wakeLock?.release().catch(() => {});
  controller?.abort();
  offReports?.();
  clearTimeout(debounce);
  clearTimeout(cursorTimer);
  clearInterval(tique);
  clearInterval(recarga);
  cancelAnimationFrame(animacao);
  reduzirMovimento.removeEventListener('change', iniciarPulsacao);
  map?.remove();
});
</script>

<template>
  <Teleport to="body">
    <section
      ref="raiz"
      class="ta-mon"
      :class="{ 'is-cursor-oculto': cursorOculto }"
      role="region"
      aria-label="Monitoramento em tempo real da falta d'água"
      @pointermove="onPointerMove"
    >
      <div ref="mapaEl" class="ta-mon__mapa"></div>

      <header class="ta-mon__hud ta-mon__hud--titulo">
        <h2 class="ta-mon__titulo">Falta d'água em Salto/SP</h2>
        <p class="ta-mon__live" aria-live="off">
          <span class="ta-mon__dot" aria-hidden="true"></span>
          Ao vivo · <span class="ta-mon__relogio">{{ relogio }}</span>
        </p>
      </header>

      <div class="ta-mon__hud ta-mon__hud--acoes">
        <div class="ta-mon__seg" role="radiogroup" aria-label="Janela de tempo">
          <button
            v-for="h in JANELAS"
            :key="h"
            type="button"
            role="radio"
            :aria-checked="janela === h"
            :class="{ 'is-on': janela === h }"
            @click="janela = h"
          >
            {{ h }} h
          </button>
        </div>
        <button type="button" class="ta-mon__btn" @click="alternarTelaCheia">
          {{ emTelaCheia ? 'Sair da tela cheia' : 'Tela cheia' }}
        </button>
        <button type="button" class="ta-mon__btn ta-mon__btn--fechar" aria-label="Fechar monitoramento (Esc)" @click="emit('fechar')">
          ✕
        </button>
      </div>

      <div class="ta-mon__hud ta-mon__hud--numeros" aria-live="polite">
        <p class="ta-mon__num">
          <b>{{ nf.format(semAgua.length) }}</b>
          <span>relatos de falta {{ janela === 1 ? 'na última hora' : `nas últimas ${janela} h` }}</span>
        </p>
        <p class="ta-mon__num">
          <b>{{ nf.format(bairrosComFalta) }}</b>
          <span>{{ bairrosComFalta === 1 ? 'bairro com falta' : 'bairros com falta' }}</span>
        </p>
        <p class="ta-mon__num">
          <b>{{ nf.format(voltou) }}</b>
          <span>avisos de água voltando</span>
        </p>
      </div>

      <div class="ta-mon__hud ta-mon__hud--legenda">
        <p class="ta-mon__legenda-titulo">Falta d'água</p>
        <div class="ta-mon__escala" :style="{ background: gradiente }"></div>
        <p class="ta-mon__legenda-titulo ta-mon__legenda-titulo--segundo">Água voltou</p>
        <div class="ta-mon__escala" :style="{ background: gradienteVoltou }"></div>
        <div class="ta-mon__escala-rotulos"><span>poucos relatos</span><span>muitos</span></div>
        <p class="ta-mon__legenda-nota">Relatos recentes pesam mais. Vermelho e verde pulsam em tempos alternados.</p>
        <p class="ta-mon__legenda-nota">
          <span class="ta-mon__chave-item"><span class="ta-mon__chave is-sem-agua"></span>novo relato de falta</span>
          <span class="ta-mon__chave-item"><span class="ta-mon__chave is-voltou"></span>água voltou</span>
        </p>
        <p v-if="demo" class="ta-mon__legenda-nota">Inclui dados de demonstração.</p>
      </div>

      <p v-if="erro" class="ta-mon__erro" role="alert">{{ erro }} Tentando de novo…</p>
    </section>
  </Teleport>
</template>
