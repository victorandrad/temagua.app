<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import {
  BAIRROS,
  distanceKm,
  emit,
  on,
  type Bairro,
  type MapCenter,
  type Report,
  type WaterStatus,
} from '@tem-agua/contracts';

const RADIUS_KM = 0.8;
const WINDOW_MS = 6 * 60 * 60 * 1000;

const reports = ref<Report[]>([]);
const center = ref<MapCenter | null>(null);
const expanded = ref(false);
const sent = ref<WaterStatus | null>(null);
const peek = ref<HTMLElement | null>(null);
const now = ref(Date.now());

const recent = computed(() => reports.value.filter((r) => now.value - r.createdAt < WINDOW_MS));

const nearby = computed(() => {
  const c = center.value;
  if (!c) return [];
  return recent.value.filter((r) => distanceKm(c.lng, c.lat, r.lng, r.lat) <= RADIUS_KM);
});

const semAgua = computed(() => nearby.value.filter((r) => r.status === 'sem-agua'));

const status = computed<'sem-dados' | WaterStatus>(() => {
  if (!nearby.value.length) return 'sem-dados';
  const latest = (s: WaterStatus) =>
    Math.max(0, ...nearby.value.filter((r) => r.status === s).map((r) => r.createdAt));
  return latest('voltou') > latest('sem-agua') ? 'voltou' : 'sem-agua';
});

const headline = computed(
  () =>
    ({
      'sem-dados': 'Sem relatos por aqui',
      'sem-agua': 'Provável falta de água',
      voltou: 'Água voltando',
    })[status.value],
);

const subline = computed(() => {
  const bairro = center.value?.bairro ?? 'Salto';
  if (!nearby.value.length) return `${bairro} · nenhum relato nas últimas 6 h`;
  const latest = Math.max(...nearby.value.map((r) => r.createdAt));
  const n = semAgua.value.length;
  const relatos = n === 1 ? '1 vizinho sem água' : `${n} vizinhos sem água`;
  return `${bairro} · ${relatos} · último ${formatAgo(latest)}`;
});

const ranking = computed(() => {
  const counts = new Map<string, number>();
  for (const r of recent.value) {
    if (r.status === 'sem-agua') counts.set(r.bairro, (counts.get(r.bairro) ?? 0) + 1);
  }
  return [...counts]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([nome, total]) => ({ nome, total, bairro: BAIRROS.find((b) => b.nome === nome) }));
});

function formatAgo(ts: number): string {
  const min = Math.round((now.value - ts) / 60000);
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} min`;
  return `há ${Math.round(min / 60)} h`;
}

let sentTimer: ReturnType<typeof setTimeout> | undefined;

function report(s: WaterStatus) {
  emit('report-submit', { status: s });
  sent.value = s;
  clearTimeout(sentTimer);
  sentTimer = setTimeout(() => (sent.value = null), 3500);
}

function goTo(b?: Bairro) {
  if (b) emit('fly-to', { lng: b.lng, lat: b.lat, zoom: 15 });
  expanded.value = false;
}

// ---- Arrastar o "grip" para expandir/recolher, como num bottom sheet nativo ----
let dragStartY: number | null = null;

function onPointerDown(e: PointerEvent) {
  dragStartY = e.clientY;
  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
}

function onPointerUp(e: PointerEvent) {
  if (dragStartY === null) return;
  const dy = e.clientY - dragStartY;
  dragStartY = null;
  if (dy < -24) expanded.value = true;
  else if (dy > 24) expanded.value = false;
  else expanded.value = !expanded.value;
}

const offs: Array<() => void> = [];
let resizeObserver: ResizeObserver | undefined;
let clock: ReturnType<typeof setInterval> | undefined;

onMounted(() => {
  offs.push(on('reports', (r) => (reports.value = r)));
  offs.push(on('center', (c) => (center.value = c)));
  clock = setInterval(() => (now.value = Date.now()), 30_000);

  // Só a parte recolhida conta para o padding do mapa; expandido, o painel cobre o mapa (como no Uber).
  resizeObserver = new ResizeObserver(() => {
    if (peek.value) emit('sheet-height', Math.round(peek.value.getBoundingClientRect().height));
  });
  if (peek.value) resizeObserver.observe(peek.value);
});

onBeforeUnmount(() => {
  offs.forEach((off) => off());
  resizeObserver?.disconnect();
  clearInterval(clock);
  clearTimeout(sentTimer);
});
</script>

<template>
  <section class="ta-sheet" :class="{ 'is-expanded': expanded }" aria-label="Situação da água">
    <div ref="peek" class="ta-sheet__peek">
      <div
        class="ta-sheet__grip"
        role="button"
        tabindex="0"
        :aria-expanded="expanded"
        aria-label="Expandir ou recolher painel"
        @pointerdown="onPointerDown"
        @pointerup="onPointerUp"
        @keydown.enter="expanded = !expanded"
        @keydown.space.prevent="expanded = !expanded"
      >
        <span></span>
      </div>

      <div v-if="sent" class="ta-done" role="status">
        <div class="ta-done__icon" :class="`is-${sent}`">
          <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true">
            <path d="M5 12.5 10 17l9-10" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </div>
        <p class="ta-done__title">Obrigado pelo relato!</p>
        <p class="ta-done__sub">Ele já aparece no mapa de {{ center?.bairro ?? 'Salto' }} e ajuda seus vizinhos.</p>
      </div>

      <template v-else>
        <div class="ta-status">
          <span class="ta-status__dot" :class="`is-${status}`"></span>
          <div class="ta-status__text">
            <p class="ta-status__title">{{ headline }}</p>
            <p class="ta-status__sub">{{ subline }}</p>
          </div>
        </div>

        <h2 class="ta-sheet__question">Como está a água aí?</h2>
        <div class="ta-actions">
          <button type="button" class="ta-btn ta-btn--primary" @click="report('sem-agua')">Estou sem água</button>
          <button type="button" class="ta-btn ta-btn--secondary" @click="report('voltou')">A água voltou</button>
        </div>
      </template>
    </div>

    <div v-show="expanded" class="ta-sheet__more">
      <h3 class="ta-sheet__section">Bairros com mais relatos · 6 h</h3>
      <ul v-if="ranking.length" class="ta-rank">
        <li v-for="(item, i) in ranking" :key="item.nome">
          <button type="button" class="ta-rank__item" @click="goTo(item.bairro)">
            <span class="ta-rank__pos">{{ i + 1 }}</span>
            <span class="ta-rank__name">{{ item.nome }}</span>
            <span class="ta-rank__count">{{ item.total }}</span>
          </button>
        </li>
      </ul>
      <p v-else class="ta-empty">Nenhum relato de falta de água nas últimas 6 horas.</p>

      <p class="ta-privacy">
        Para os outros moradores, sua posição aparece arredondada para cerca de 10 m. Nunca mostramos endereços.
      </p>
    </div>
  </section>
</template>
