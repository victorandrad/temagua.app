<script setup lang="ts">
// Escolha dos setores de abastecimento visíveis: um, vários ou todos (mesma lógica do filtro da home).
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { SETORES_RESUMO } from '@tem-agua/contracts';

const props = defineProps<{ selecionados: string[] | null }>();
const emit = defineEmits<{ mudar: [setores: string[] | null]; fechar: [] }>();

const TODOS = SETORES_RESUMO.map((s) => s.id);
const raiz = ref<HTMLElement | null>(null);

const resumo = computed(() => {
  const sel = props.selecionados;
  if (sel === null) return `Todos os ${TODOS.length} setores visíveis`;
  if (!sel.length) return 'Nenhum setor visível';
  return `${sel.length} de ${TODOS.length} setores visíveis`;
});

const visivel = (id: string) => props.selecionados === null || props.selecionados.includes(id);

function alternar(id: string) {
  const atual = props.selecionados ?? TODOS;
  const nova = atual.includes(id) ? atual.filter((x) => x !== id) : [...atual, id];
  // Marcou todos de novo: volta a "todos" (null).
  emit('mudar', nova.length === TODOS.length ? null : nova);
}

/** Toque fora fecha (o botão que abre/fecha cuida do próprio clique). */
function foraDoFiltro(e: PointerEvent) {
  const alvo = e.target as Element | null;
  if (!alvo || raiz.value?.contains(alvo) || alvo.closest('.ta-filtro-chip')) return;
  emit('fechar');
}
onMounted(() => document.addEventListener('pointerdown', foraDoFiltro));
onBeforeUnmount(() => document.removeEventListener('pointerdown', foraDoFiltro));
</script>

<template>
  <div ref="raiz" class="ta-filtro" role="dialog" aria-label="Setores de abastecimento no mapa">
    <header class="ta-filtro__cabeca">
      <div>
        <p class="ta-filtro__titulo">Setores no mapa</p>
        <p class="ta-filtro__sub">{{ resumo }}</p>
      </div>
      <button type="button" class="ta-filtro__fechar" aria-label="Fechar" @click="emit('fechar')">✕</button>
    </header>
    <div class="ta-filtro__acoes">
      <button type="button" :class="{ 'is-on': selecionados === null }" @click="emit('mudar', null)">Todos</button>
      <button type="button" :class="{ 'is-on': selecionados?.length === 0 }" @click="emit('mudar', [])">Nenhum</button>
    </div>
    <ul class="ta-filtro__lista">
      <li v-for="s in SETORES_RESUMO" :key="s.id" :class="{ 'is-off': !visivel(s.id) }">
        <label>
          <input type="checkbox" :checked="visivel(s.id)" @change="alternar(s.id)" />
          <i class="ta-filtro__cor" :style="{ background: s.cor }" aria-hidden="true"></i>
          <span class="ta-filtro__nome">{{ s.nome }}</span>
          <small>{{ s.areas }} {{ s.areas === 1 ? 'área' : 'áreas' }}</small>
        </label>
        <button type="button" class="ta-filtro__so" :aria-label="`Mostrar só o setor ${s.nome}`" @click="emit('mudar', [s.id])">
          só este
        </button>
      </li>
    </ul>
  </div>
</template>
