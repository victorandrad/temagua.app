<script setup lang="ts">
// Filtro de bairros do painel: um, vários ou todos. Lista vazia = todos os bairros.
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { textoBairros } from '../format';

const props = defineProps<{ opcoes: string[] }>();
const selecionados = defineModel<string[]>({ required: true });

const aberto = ref(false);
const busca = ref('');
const raiz = ref<HTMLElement | null>(null);
const botao = ref<HTMLButtonElement | null>(null);
const campoBusca = ref<HTMLInputElement | null>(null);

const rotulo = computed(() => {
  const sel = selecionados.value;
  if (sel.length > 1) return `${sel.length} bairros`;
  return textoBairros(sel, 'Todos os bairros');
});

const semAcento = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
const filtradas = computed(() => {
  const q = semAcento(busca.value.trim());
  return q ? props.opcoes.filter((b) => semAcento(b).includes(q)) : props.opcoes;
});

/** Guarda na ordem da lista (rótulo e endereço estáveis); marcou todos = volta a "todos". */
function definir(nova: Set<string>) {
  const lista = props.opcoes.filter((b) => nova.has(b));
  selecionados.value = lista.length === props.opcoes.length ? [] : lista;
}

function alternar(b: string) {
  const nova = new Set(selecionados.value);
  if (nova.has(b)) nova.delete(b);
  else nova.add(b);
  definir(nova);
}

function fechar(focarBotao = false) {
  aberto.value = false;
  busca.value = '';
  if (focarBotao) botao.value?.focus();
}

watch(aberto, async (sim) => {
  if (!sim) return;
  await nextTick();
  campoBusca.value?.focus();
});

function fora(e: PointerEvent) {
  if (aberto.value && !raiz.value?.contains(e.target as Node)) fechar();
}
function tecla(e: KeyboardEvent) {
  if (aberto.value && e.key === 'Escape') {
    e.stopPropagation();
    fechar(true);
  }
}
onMounted(() => {
  document.addEventListener('pointerdown', fora);
  document.addEventListener('keydown', tecla, true);
});
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', fora);
  document.removeEventListener('keydown', tecla, true);
});
</script>

<template>
  <div ref="raiz" class="ta-met__campo ta-met__bairros">
    <button
      ref="botao"
      type="button"
      class="ta-met__select"
      aria-haspopup="dialog"
      :aria-expanded="aberto"
      :title="selecionados.length > 1 ? selecionados.join(', ') : undefined"
      @click="aberto ? fechar() : (aberto = true)"
    >
      <span class="ta-met__sr">Bairros: </span>
      <span class="ta-met__select-texto">{{ rotulo }}</span>
      <svg class="ta-seta" viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
        <path d="M3 4.5 6 7.5 9 4.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    </button>

    <div v-if="aberto" class="ta-filtro ta-met__bairros-pop" role="dialog" aria-label="Escolher bairros">
      <div v-if="opcoes.length > 8" class="ta-met__bairros-busca">
        <input ref="campoBusca" v-model="busca" type="search" placeholder="Buscar bairro" aria-label="Buscar bairro" />
      </div>
      <ul class="ta-filtro__lista">
        <li v-if="!busca">
          <label>
            <input type="checkbox" :checked="!selecionados.length" @change="selecionados = []" />
            <span class="ta-filtro__nome"><b>Todos os bairros</b></span>
          </label>
        </li>
        <li v-for="b in filtradas" :key="b">
          <label>
            <input type="checkbox" :checked="selecionados.includes(b)" @change="alternar(b)" />
            <span class="ta-filtro__nome">{{ b }}</span>
          </label>
          <button type="button" class="ta-filtro__so" :aria-label="`Só ${b}`" @click="definir(new Set([b]))">só este</button>
        </li>
        <li v-if="!filtradas.length" class="ta-met__bairros-nada">Nenhum bairro com relatos com esse nome.</li>
      </ul>
      <div class="ta-met__bairros-rodape">
        <span>{{ selecionados.length ? `${selecionados.length} de ${opcoes.length} marcados` : `Todos os ${opcoes.length}` }}</span>
        <button type="button" class="ta-met__btn ta-met__btn--primary" @click="fechar(true)">Pronto</button>
      </div>
    </div>
  </div>
</template>
