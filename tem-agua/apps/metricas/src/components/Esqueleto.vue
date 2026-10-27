<script setup lang="ts">
// Esqueleto do primeiro carregamento: o mesmo layout do painel (indicadores e cartões com as mesmas
// classes), com blocos cinza que brilham. Quando os dados chegam, o conteúdo entra no lugar sem a
// página pular. Estilos em metricas.css (.ta-met__sk*); sem animação com prefers-reduced-motion.

// Alturas das colunas do gráfico de barras e do ranking (fixas: o esqueleto não muda a cada render).
const COLUNAS = [38, 62, 48, 80, 55, 70, 44, 90, 66, 52, 75, 58, 84, 47];
const RANKING = [100, 86, 74, 66, 58, 50, 44, 38];
</script>

<template>
  <div class="ta-met__sk-raiz" aria-busy="true">
    <p class="ta-met__sr" role="status">Carregando métricas…</p>

    <section class="ta-met__kpis" aria-hidden="true">
      <article class="ta-met__hero">
        <span class="ta-met__sk ta-met__sk--rotulo"></span>
        <span class="ta-met__sk ta-met__sk--numero-grande"></span>
        <span class="ta-met__sk ta-met__sk--linha" style="width: 70%"></span>
      </article>
      <article v-for="i in 4" :key="i" class="ta-met__tile">
        <span class="ta-met__sk ta-met__sk--rotulo"></span>
        <span class="ta-met__sk ta-met__sk--numero"></span>
        <span class="ta-met__sk ta-met__sk--linha" style="width: 80%"></span>
      </article>
    </section>

    <section class="ta-met__grid" aria-hidden="true">
      <!-- Relatos por dia: colunas -->
      <article class="ta-met__card ta-met__card--full">
        <span class="ta-met__sk ta-met__sk--titulo"></span>
        <span class="ta-met__sk ta-met__sk--sub"></span>
        <div class="ta-met__sk-colunas">
          <span v-for="(h, i) in COLUNAS" :key="i" class="ta-met__sk" :style="{ height: `${h}%` }"></span>
        </div>
      </article>

      <!-- Quando falta água: grade dia da semana × hora -->
      <article class="ta-met__card">
        <span class="ta-met__sk ta-met__sk--titulo"></span>
        <span class="ta-met__sk ta-met__sk--sub"></span>
        <div class="ta-met__sk-grade">
          <span v-for="i in 7 * 12" :key="i" class="ta-met__sk"></span>
        </div>
      </article>

      <!-- Bairros mais afetados: barras horizontais -->
      <article class="ta-met__card">
        <span class="ta-met__sk ta-met__sk--titulo"></span>
        <span class="ta-met__sk ta-met__sk--sub"></span>
        <div class="ta-met__sk-ranking">
          <div v-for="(w, i) in RANKING" :key="i" class="ta-met__sk-ranking-linha">
            <span class="ta-met__sk ta-met__sk--nome"></span>
            <span class="ta-met__sk ta-met__sk--barra" :style="{ width: `${w}%` }"></span>
          </div>
        </div>
      </article>

      <!-- Onde os relatos se concentram: mapa -->
      <article class="ta-met__card">
        <span class="ta-met__sk ta-met__sk--titulo"></span>
        <span class="ta-met__sk ta-met__sk--sub"></span>
        <span class="ta-met__sk ta-met__sk--mapa"></span>
      </article>

      <!-- Por bairro: tabela -->
      <article class="ta-met__card">
        <span class="ta-met__sk ta-met__sk--titulo"></span>
        <span class="ta-met__sk ta-met__sk--sub"></span>
        <div class="ta-met__sk-tabela">
          <span v-for="i in 8" :key="i" class="ta-met__sk ta-met__sk--linha-tabela"></span>
        </div>
      </article>
    </section>
  </div>
</template>
