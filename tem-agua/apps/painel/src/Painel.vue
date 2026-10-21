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

// ---- Ranking de bairros: filtro de período + visual diferente no desktop e no celular ----

const HORA = 60 * 60 * 1000;
const PERIODOS = [
  { id: '1h', label: '1 h', ms: HORA, texto: 'na última hora' },
  { id: '6h', label: '6 h', ms: 6 * HORA, texto: 'nas últimas 6 horas' },
  { id: '24h', label: '24 h', ms: 24 * HORA, texto: 'nas últimas 24 horas' },
  { id: '7d', label: '7 dias', ms: 7 * 24 * HORA, texto: 'nos últimos 7 dias' },
] as const;
type PeriodoId = (typeof PERIODOS)[number]['id'];
const PERIODO_KEY = 'tem-agua:ranking-periodo';

function periodoSalvo(): PeriodoId {
  try {
    const v = localStorage.getItem(PERIODO_KEY);
    if (PERIODOS.some((p) => p.id === v)) return v as PeriodoId;
  } catch {
    // armazenamento bloqueado: usa o padrão
  }
  return '24h';
}

const periodo = ref<PeriodoId>(periodoSalvo());
const periodoAtual = computed(() => PERIODOS.find((p) => p.id === periodo.value)!);
function escolherPeriodo(id: PeriodoId) {
  periodo.value = id;
  try {
    localStorage.setItem(PERIODO_KEY, id);
  } catch {
    // só não lembra a escolha
  }
}

// Desktop (painel flutuante à esquerda) tem espaço: lista sempre visível, top 10, com detalhe.
// Celular (bottom sheet): lista compacta, top 5, dentro do painel expandido.
const desktopMq = window.matchMedia('(min-width: 768px)');
const desktop = ref(desktopMq.matches);
const onMq = (e: MediaQueryListEvent) => (desktop.value = e.matches);
const verTodos = ref(false);

interface LinhaRanking {
  nome: string;
  semAgua: number;
  voltou: number;
  total: number;
  ultimo: number;
  ultimoFalta: number;
  ultimaVolta: number;
  bairro?: Bairro;
}

const porBairro = computed<LinhaRanking[]>(() => {
  const desde = now.value - periodoAtual.value.ms;
  const mapa = new Map<string, LinhaRanking>();
  for (const r of reports.value) {
    if (r.createdAt < desde) continue;
    const l = mapa.get(r.bairro) ?? { nome: r.bairro, semAgua: 0, voltou: 0, total: 0, ultimo: 0, ultimoFalta: 0, ultimaVolta: 0 };
    if (r.status === 'sem-agua') {
      l.semAgua++;
      l.ultimoFalta = Math.max(l.ultimoFalta, r.createdAt);
    } else {
      l.voltou++;
      l.ultimaVolta = Math.max(l.ultimaVolta, r.createdAt);
    }
    l.total++;
    l.ultimo = Math.max(l.ultimo, r.createdAt);
    mapa.set(r.bairro, l);
  }
  return [...mapa.values()].map((l) => ({ ...l, bairro: BAIRROS.find((b) => b.nome === l.nome) }));
});

/** Ranking de FALTA: só bairros com ao menos um relato de falta no período. */
const rankingCompleto = computed(() =>
  porBairro.value.filter((l) => l.semAgua > 0).sort((a, b) => b.semAgua - a.semAgua || b.ultimoFalta - a.ultimoFalta),
);

/** Onde o relato mais recente do período é "água voltou" (fora do ranking de falta). */
const voltando = computed(() =>
  porBairro.value.filter((l) => l.ultimaVolta > l.ultimoFalta).sort((a, b) => b.ultimaVolta - a.ultimaVolta),
);

const limite = computed(() => (verTodos.value ? Infinity : desktop.value ? 10 : 5));
const ranking = computed(() => rankingCompleto.value.slice(0, limite.value));
const escalaMax = computed(() => Math.max(1, ...ranking.value.map((l) => (desktop.value ? l.total : l.semAgua))));
const pct = (n: number) => `${(n / escalaMax.value) * 100}%`;

function formatAgo(ts: number): string {
  const min = Math.round((now.value - ts) / 60000);
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 48) return `há ${h} h`;
  return `há ${Math.round(h / 24)} dias`;
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
  // No celular o painel cobre o mapa: recolhe para mostrar o bairro. No desktop fica aberto.
  if (!desktop.value) expanded.value = false;
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

// ---- Animação de abrir/fechar o painel (só no celular) ----
// O sheet fica preso embaixo, então animar a altura da parte de baixo faz ele "subir" da borda.
const ABRIR_MS = 320;
const FECHAR_MS = 240;
const EASING = 'cubic-bezier(0.2, 0.8, 0.2, 1)';
const reduzirMovimento = window.matchMedia('(prefers-reduced-motion: reduce)');

function semAnimacao(): boolean {
  return desktop.value || reduzirMovimento.matches || typeof HTMLElement.prototype.animate !== 'function';
}

/** Estado "aberto" da parte de baixo: altura, espaçamentos e borda reais (box-sizing: border-box). */
function quadroAberto(el: HTMLElement, altura: number): Keyframe {
  const cs = getComputedStyle(el);
  return {
    height: `${altura}px`,
    paddingTop: cs.paddingTop,
    paddingBottom: cs.paddingBottom,
    borderTopWidth: cs.borderTopWidth,
    opacity: 1,
    transform: 'none',
  };
}

// Fechado: tudo zerado — com border-box, só zerar a altura deixaria borda e padding (~30 px) e o
// painel daria um salto no fim da animação.
const QUADRO_FECHADO: Keyframe = {
  height: '0px',
  paddingTop: '0px',
  paddingBottom: '0px',
  borderTopWidth: '0px',
  opacity: 0,
  transform: 'translateY(12px)',
};

function animar(el: HTMLElement, quadros: Keyframe[], ms: number, done: () => void) {
  el.style.overflow = 'hidden'; // o conteúdo não vaza enquanto a altura muda
  const anim = el.animate(quadros, { duration: ms, easing: EASING });
  const fim = () => {
    el.style.overflow = '';
    done();
  };
  anim.onfinish = fim;
  anim.oncancel = fim;
}

function abrir(el: Element, done: () => void) {
  if (semAnimacao()) return done();
  const alvo = el as HTMLElement;
  // Anima só até o que cabe na tela: o sheet tem altura máxima, e animar até a altura total do
  // conteúdo faria ele bater no limite logo no começo (pareceria um salto, sem animação).
  const sheet = alvo.closest('.ta-sheet') as HTMLElement | null;
  const max = sheet ? parseFloat(getComputedStyle(sheet).maxHeight) : NaN;
  const livre = Number.isFinite(max) && peek.value ? max - peek.value.offsetHeight : Infinity;
  animar(alvo, [QUADRO_FECHADO, quadroAberto(alvo, Math.min(alvo.offsetHeight, livre))], ABRIR_MS, done);
}

function fechar(el: Element, done: () => void) {
  if (semAnimacao()) return done();
  const alvo = el as HTMLElement;
  animar(alvo, [quadroAberto(alvo, alvo.offsetHeight), QUADRO_FECHADO], FECHAR_MS, done);
}

const offs: Array<() => void> = [];
let resizeObserver: ResizeObserver | undefined;
let clock: ReturnType<typeof setInterval> | undefined;

onMounted(() => {
  offs.push(on('reports', (r) => (reports.value = r)));
  offs.push(on('center', (c) => (center.value = c)));
  clock = setInterval(() => (now.value = Date.now()), 30_000);
  desktopMq.addEventListener('change', onMq);

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
  desktopMq.removeEventListener('change', onMq);
});
</script>

<template>
  <!-- Celular: com o painel aberto, o mapa escurece; tocar fora fecha. -->
  <Transition name="ta-fundo">
    <div v-if="expanded && !desktop" class="ta-fundo" aria-hidden="true" @click="expanded = false"></div>
  </Transition>

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

    <Transition :css="false" @enter="abrir" @leave="fechar">
    <div v-show="expanded || desktop" class="ta-sheet__more">
      <div class="ta-rank-head">
        <h3 class="ta-sheet__section">Bairros com mais relatos</h3>
        <div class="ta-seg" role="radiogroup" aria-label="Período do ranking">
          <button
            v-for="p in PERIODOS"
            :key="p.id"
            type="button"
            role="radio"
            :aria-checked="periodo === p.id"
            :class="{ 'is-on': periodo === p.id }"
            @click="escolherPeriodo(p.id)"
          >
            {{ p.label }}
          </button>
        </div>
      </div>

      <p v-if="!ranking.length" class="ta-empty">Nenhum relato de falta {{ periodoAtual.texto }}.</p>

      <!-- Desktop: barra empilhada falta + volta, os dois números e o último relato -->
      <template v-else-if="desktop">
        <p class="ta-rank-legenda">
          <span><i class="is-sem-agua" aria-hidden="true"></i>sem água</span>
          <span><i class="is-voltou" aria-hidden="true"></i>água voltou</span>
          <span class="ta-rank-legenda__periodo">{{ periodoAtual.texto }}</span>
        </p>
        <ul class="ta-rankd">
          <li v-for="(item, i) in ranking" :key="item.nome">
            <button
              type="button"
              class="ta-rankd__item"
              :aria-label="`${i + 1}º ${item.nome}: ${item.semAgua} sem água, ${item.voltou} água voltou, último relato ${formatAgo(item.ultimo)}. Ver no mapa`"
              @click="goTo(item.bairro)"
            >
              <span class="ta-rankd__pos">{{ i + 1 }}</span>
              <span class="ta-rankd__corpo">
                <span class="ta-rankd__linha">
                  <span class="ta-rankd__nome">{{ item.nome }}</span>
                  <span class="ta-rankd__nums">
                    <b>{{ item.semAgua }}</b><template v-if="item.voltou"> · <b class="is-voltou">{{ item.voltou }}</b></template>
                  </span>
                </span>
                <span class="ta-rankd__linha ta-rankd__linha--2">
                  <span class="ta-rankd__barra" aria-hidden="true">
                    <span class="is-sem-agua" :style="{ width: pct(item.semAgua) }"></span>
                    <span v-if="item.voltou" class="is-voltou" :style="{ width: pct(item.voltou) }"></span>
                  </span>
                  <span class="ta-rankd__quando">{{ formatAgo(item.ultimo) }}</span>
                </span>
              </span>
            </button>
          </li>
        </ul>
      </template>

      <!-- Celular: compacto, só a falta -->
      <ul v-else class="ta-rank">
        <li v-for="(item, i) in ranking" :key="item.nome">
          <button
            type="button"
            class="ta-rank__item"
            :aria-label="`${i + 1}º ${item.nome}: ${item.semAgua} relatos sem água. Ver no mapa`"
            @click="goTo(item.bairro)"
          >
            <span class="ta-rank__pos">{{ i + 1 }}</span>
            <span class="ta-rank__corpo">
              <span class="ta-rank__name">{{ item.nome }}</span>
              <span class="ta-rank__barra" aria-hidden="true"><span :style="{ width: pct(item.semAgua) }"></span></span>
            </span>
            <span class="ta-rank__count">{{ item.semAgua }}</span>
          </button>
        </li>
      </ul>

      <div v-if="voltando.length" class="ta-voltando">
        <p class="ta-voltando__titulo"><i aria-hidden="true"></i>Água voltando {{ periodoAtual.texto }}</p>
        <div class="ta-voltando__lista">
          <button
            v-for="v in voltando"
            :key="v.nome"
            type="button"
            class="ta-voltando__chip"
            :aria-label="`${v.nome}: água voltou ${formatAgo(v.ultimaVolta)}. Ver no mapa`"
            @click="goTo(v.bairro)"
          >
            {{ v.nome }} <span>{{ formatAgo(v.ultimaVolta) }}</span>
          </button>
        </div>
      </div>

      <button
        v-if="rankingCompleto.length > (desktop ? 10 : 5)"
        type="button"
        class="ta-rank-mais"
        @click="verTodos = !verTodos"
      >
        {{ verTodos ? 'Mostrar menos' : `Ver todos os ${rankingCompleto.length} bairros` }}
      </button>

      <p class="ta-privacy">
        Para os outros moradores, sua posição aparece arredondada para cerca de 10 m. Nunca mostramos endereços.
      </p>
    </div>
    </Transition>
  </section>
</template>
