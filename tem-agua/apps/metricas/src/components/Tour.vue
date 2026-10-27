<script setup lang="ts">
// Tour guiado do painel: um "holofote" sobre cada parte (o resto da tela escurece) e um balão com o
// que ela mostra. Abre sozinho na primeira visita (depois que os dados carregam) e pelo botão "Como
// usar". Passos cujo elemento não está na tela (ex.: monitoramento e PDF no celular, cartões de um
// período sem relatos) são pulados. Setas, Enter e Esc funcionam; sem animação com reduced-motion.
// Enquanto está aberto, a pessoa não rola a página (só o tour rola até cada parte).
// Estilos em metricas.css (.ta-tour*).
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';

const props = defineProps<{ aberto: boolean }>();
const emit = defineEmits<{ fechar: [] }>();

interface Passo {
  alvo: string; // valor de data-tour no Metricas.vue
  titulo: string;
  texto: string;
}

const PASSOS: Passo[] = [
  { alvo: 'periodo', titulo: 'Escolha o período', texto: 'Hoje, 7, 30 ou 90 dias, ou datas personalizadas. Todos os números e gráficos abaixo mudam juntos.' },
  { alvo: 'bairro', titulo: 'Filtre por bairro', texto: 'Marque um ou vários bairros para comparar, ou deixe “Todos os bairros” para a cidade inteira.' },
  { alvo: 'total', titulo: 'Total de faltas', texto: 'Quantos relatos de falta d’água houve no período, comparado com o período anterior do mesmo tamanho, e de quantos aparelhos diferentes vieram.' },
  { alvo: 'indicadores', titulo: 'Resumo rápido', texto: 'Quantas vezes a água voltou, quantos bairros foram afetados, a hora em que mais falta água e o que aconteceu na última hora.' },
  { alvo: 'serie', titulo: 'Dia a dia', texto: 'Falta d’água (vermelho) e água voltando (verde) ao longo do tempo. Passe o dedo ou o mouse nas barras para ver os números, ou toque em “Ver tabela”.' },
  { alvo: 'duracao', titulo: 'Quanto tempo a água fica fora', texto: 'Do aviso de falta até a mesma pessoa avisar que a água voltou: a média, a mais longa e o tempo médio por bairro.' },
  { alvo: 'quando', titulo: 'Quando falta água', texto: 'Cada quadradinho é um dia da semana e uma hora. Quanto mais escuro, mais relatos de falta naquele horário.' },
  { alvo: 'bairros', titulo: 'Bairros mais afetados', texto: 'Os 10 bairros com mais relatos de falta no período.' },
  { alvo: 'mapa', titulo: 'Onde se concentram', texto: 'Os relatos agrupados em áreas de uns 200 metros: quanto maior o círculo, mais relatos naquela área.' },
  { alvo: 'reservatorio', titulo: 'Por reservatório', texto: 'Faltas por setor de abastecimento. Quando várias áreas do mesmo setor ficam sem água juntas, o problema costuma ser no reservatório, não na rua.' },
  { alvo: 'compartilhar', titulo: 'Mande esta visão', texto: 'O link guarda o período e os bairros escolhidos: quem abrir vê exatamente o mesmo recorte.' },
  { alvo: 'exportar', titulo: 'Leve os dados', texto: 'Baixe todos os relatos do período numa planilha (abre no Excel).' },
  { alvo: 'pdf', titulo: 'Relatório em PDF', texto: 'Um relatório de 3 páginas, pronto para levar a uma reunião com a Prefeitura, a Câmara ou o SAAE.' },
  { alvo: 'monitor', titulo: 'Monitoramento ao vivo', texto: 'Mapa de calor em tela cheia, que pulsa onde está faltando água agora. Feito para ficar ligado numa TV.' },
];

const MARGEM = 8; // folga do holofote em volta do elemento
const indice = ref(0);
const caixa = ref<{ top: number; left: number; width: number; height: number } | null>(null);
const balao = ref<HTMLElement | null>(null);
const posBalao = ref<Record<string, string>>({});
const celular = ref(false);

const elementoDo = (p: Passo) => {
  const el = document.querySelector<HTMLElement>(`[data-tour="${p.alvo}"]`);
  return el && el.getClientRects().length > 0 ? el : null; // display:none → sem retângulos
};
// Só os passos cujo elemento está na tela agora.
const passos = ref<Passo[]>([]);
const atual = computed(() => passos.value[indice.value] ?? null);

function medir() {
  const p = atual.value;
  const el = p && elementoDo(p);
  if (!el) return;
  const r = el.getBoundingClientRect();
  caixa.value = { top: r.top - MARGEM, left: r.left - MARGEM, width: r.width + 2 * MARGEM, height: r.height + 2 * MARGEM };
  celular.value = innerWidth < 640;
  if (celular.value) {
    posBalao.value = {}; // no celular o balão fica preso embaixo da tela (CSS)
    return;
  }
  // Abaixo do elemento se couber; senão acima; sempre dentro da janela.
  const alturaBalao = balao.value?.offsetHeight ?? 180;
  const larguraBalao = Math.min(360, innerWidth - 32);
  const embaixo = r.bottom + MARGEM + 12 + alturaBalao < innerHeight;
  const top = embaixo ? r.bottom + MARGEM + 12 : Math.max(16, r.top - MARGEM - 12 - alturaBalao);
  const left = Math.min(Math.max(16, r.left), innerWidth - larguraBalao - 16);
  posBalao.value = { top: `${top}px`, left: `${left}px`, width: `${larguraBalao}px` };
}

async function mostrar(i: number) {
  indice.value = i;
  const p = atual.value;
  const el = p && elementoDo(p);
  if (!el) return;
  const reduzido = matchMedia('(prefers-reduced-motion: reduce)').matches;
  // No celular sobra a parte de cima da tela (o balão fica embaixo): o elemento vai para o topo.
  el.scrollIntoView({ block: innerWidth < 640 ? 'start' : 'center', behavior: reduzido ? 'auto' : 'smooth' });
  await nextTick();
  medir();
  // Depois da rolagem suave, mede de novo (a posição muda durante a animação).
  setTimeout(medir, reduzido ? 0 : 450);
  balao.value?.focus({ preventScroll: true });
}

function fechar() {
  caixa.value = null;
  soltarRolagem();
  emit('fechar');
}
const proximo = () => (indice.value < passos.value.length - 1 ? mostrar(indice.value + 1) : fechar());
const anterior = () => indice.value > 0 && mostrar(indice.value - 1);

// Teclas que rolariam a página: bloqueadas enquanto o tour está aberto.
const TECLAS_DE_ROLAGEM = new Set([' ', 'PageUp', 'PageDown', 'Home', 'End', 'ArrowUp', 'ArrowDown']);

function tecla(e: KeyboardEvent) {
  if (!props.aberto) return;
  if (e.key === 'Escape') fechar();
  else if (e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); proximo(); }
  else if (e.key === 'ArrowLeft') { e.preventDefault(); anterior(); }
  else if (TECLAS_DE_ROLAGEM.has(e.key) && !(e.target as HTMLElement | null)?.closest('button')) e.preventDefault();
}

// ---- Rolagem travada durante o tour ----
// Só a pessoa não rola: o próprio tour continua levando cada parte ao centro (scrollIntoView funciona
// com overflow: hidden). Roda do mouse e dedo são bloqueados também, porque no iPhone o overflow da
// página não basta. A largura da barra de rolagem que some vira padding, para o conteúdo não pular.
const bloquear = (e: Event) => e.preventDefault();
let estiloAnterior: { overflow: string; paddingRight: string } | null = null;

function travarRolagem() {
  const raiz = document.documentElement;
  estiloAnterior = { overflow: raiz.style.overflow, paddingRight: raiz.style.paddingRight };
  const barra = innerWidth - raiz.clientWidth;
  raiz.style.overflow = 'hidden';
  if (barra > 0) raiz.style.paddingRight = `${barra}px`;
  addEventListener('wheel', bloquear, { passive: false });
  addEventListener('touchmove', bloquear, { passive: false });
}

function soltarRolagem() {
  if (!estiloAnterior) return;
  const raiz = document.documentElement;
  raiz.style.overflow = estiloAnterior.overflow;
  raiz.style.paddingRight = estiloAnterior.paddingRight;
  estiloAnterior = null;
  removeEventListener('wheel', bloquear);
  removeEventListener('touchmove', bloquear);
}

async function comecar() {
  await nextTick();
  passos.value = PASSOS.filter((p) => elementoDo(p));
  if (!passos.value.length) return fechar();
  travarRolagem();
  await mostrar(0);
}

defineExpose({ comecar });

onMounted(() => {
  addEventListener('keydown', tecla);
  addEventListener('resize', medir);
  addEventListener('scroll', medir, { passive: true, capture: true });
  if (props.aberto) void comecar();
});
onBeforeUnmount(() => {
  soltarRolagem();
  removeEventListener('keydown', tecla);
  removeEventListener('resize', medir);
  removeEventListener('scroll', medir, { capture: true });
});
</script>

<template>
  <Teleport to="body">
    <div v-if="aberto && atual && caixa" class="ta-tour" :class="{ 'is-celular': celular }">
      <!-- Clique fora do holofote também avança, como nos tours de apps. -->
      <div class="ta-tour__fundo" @click="proximo"></div>
      <div
        class="ta-tour__holofote"
        :style="{ top: `${caixa.top}px`, left: `${caixa.left}px`, width: `${caixa.width}px`, height: `${caixa.height}px` }"
      ></div>
      <section
        ref="balao"
        class="ta-tour__balao"
        :style="posBalao"
        role="dialog"
        aria-modal="true"
        :aria-label="`Como usar o painel: passo ${indice + 1} de ${passos.length}`"
        tabindex="-1"
      >
        <p class="ta-tour__passo">{{ indice + 1 }} de {{ passos.length }}</p>
        <h2 class="ta-tour__titulo">{{ atual.titulo }}</h2>
        <p class="ta-tour__texto">{{ atual.texto }}</p>
        <div class="ta-tour__acoes">
          <button type="button" class="ta-tour__pular" @click="fechar">Pular</button>
          <span class="ta-tour__pontos" aria-hidden="true">
            <i v-for="(p, i) in passos" :key="p.alvo" :class="{ 'is-on': i === indice }"></i>
          </span>
          <button v-if="indice > 0" type="button" class="ta-tour__btn ta-tour__btn--sec" @click="anterior">Voltar</button>
          <button type="button" class="ta-tour__btn" @click="proximo">{{ indice < passos.length - 1 ? 'Próximo' : 'Concluir' }}</button>
        </div>
      </section>
    </div>
  </Teleport>
</template>
