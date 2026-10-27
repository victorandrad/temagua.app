<script setup lang="ts">
// Relatório em PDF: layout próprio para A4 (não é a tela impressa). É montado fora da tela só
// quando o usuário pede o PDF; avisa "pronto" quando gráficos e mapa terminaram de desenhar.

import { computed, nextTick, onMounted, ref } from 'vue';
import type { Metricas } from '../api';
import { COR, opcaoBairros, opcaoHeatmap, opcaoSerie, type Option } from '../charts';
import { dataBr, dataHoraBr, horaBr, nf, textoBairros, variacao } from '../format';
import EChart from './EChart.vue';
import MapaImagem from './MapaImagem.vue';

const props = defineProps<{ m: Metricas }>();
const emit = defineEmits<{ pronto: [] }>();

const r = computed(() => props.m.resumo);
const f = computed(() => props.m.filtros);
/** Bairros escolhidos no filtro (vazio = todos). */
const escolhidos = computed(() => f.value.bairros);
const periodo = computed(() => (f.value.de === f.value.ate ? dataBr(f.value.de) : `${dataBr(f.value.de)} a ${dataBr(f.value.ate)}`));
const geradoEm = computed(() =>
  new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }).format(new Date(props.m.geradoEm)),
);
const delta = computed(() => variacao(r.value.semAgua, r.value.anterior.semAgua));

// Gráficos sem animação: o PDF não pode pegar um quadro no meio da transição.
const semAnimacao = (o: Option): Option => ({ ...o, animation: false });
const opSerie = computed(() => semAnimacao(opcaoSerie(props.m)));
const opHeatmap = computed(() => semAnimacao(opcaoHeatmap(props.m)));
const opBairros = computed(() => semAnimacao(opcaoBairros(props.m)));
const alturaBairros = computed(() => Math.max(120, Math.min(10, props.m.bairros.filter((b) => b.semAgua).length) * 28 + 16));

const DIAS_LONGOS = ['segundas-feiras', 'terças-feiras', 'quartas-feiras', 'quintas-feiras', 'sextas-feiras', 'sábados', 'domingos'];

/** Dia da semana com mais relatos de falta (para o resumo). */
const diaPico = computed(() => {
  const soma = new Map<number, number>();
  for (const c of props.m.semanaHora) soma.set(c.dow, (soma.get(c.dow) ?? 0) + c.semAgua);
  let melhor: number | null = null;
  for (const [dow, n] of soma) if (melhor === null || n > soma.get(melhor)!) melhor = dow;
  return melhor === null ? null : DIAS_LONGOS[melhor - 1];
});

const totalFalta = computed(() => props.m.bairros.reduce((s, b) => s + b.semAgua, 0));
const pctDoTotal = (n: number) => (totalFalta.value ? `${Math.round((n / totalFalta.value) * 100)}%` : '—');

/** Resumo executivo escrito a partir dos números (frases só com o que os dados sustentam). */
const resumo = computed(() => {
  const x = r.value;
  if (!x.semAgua) return [`Nenhum relato de falta d'água ${escolhidos.value.length ? `em ${textoBairros(escolhidos.value)} ` : ''}${f.value.de === f.value.ate ? `em ${periodo.value}` : `entre ${dataBr(f.value.de)} e ${dataBr(f.value.ate)}`}.`];
  const frases: string[] = [];
  const sel = escolhidos.value;
  let onde = x.bairrosAfetados === 1 ? 'em 1 bairro de Salto' : `em ${x.bairrosAfetados} bairros de Salto`;
  if (sel.length === 1) onde = `em ${sel[0]}`;
  else if (sel.length) onde = `em ${x.bairrosAfetados} dos ${sel.length} bairros escolhidos`;
  frases.push(
    `${f.value.de === f.value.ate ? `Em ${periodo.value}` : `Entre ${dataBr(f.value.de)} e ${dataBr(f.value.ate)}`}, foram registrados ${nf.format(x.semAgua)} ${x.semAgua === 1 ? 'relato' : 'relatos'} de falta d'água ${onde}.`,
  );
  if (delta.value === null) frases.push('Não há relatos no período anterior para comparação.');
  else if (delta.value === 0) frases.push(`O número é igual ao do período anterior (${dataBr(x.anterior.de)} a ${dataBr(x.anterior.ate)}).`);
  else
    frases.push(
      `Isso é ${Math.abs(delta.value)}% ${delta.value > 0 ? 'a mais' : 'a menos'} que no período anterior de mesma duração (${dataBr(x.anterior.de)} a ${dataBr(x.anterior.ate)}, ${nf.format(x.anterior.semAgua)} relatos).`,
    );
  // A lista de bairros ignora o filtro (dá contexto da cidade); com vários escolhidos, o destaque é entre eles.
  const top = sel.length ? props.m.bairros.find((b) => sel.includes(b.bairro)) : props.m.bairros[0];
  if (sel.length !== 1 && top?.semAgua)
    frases.push(`O bairro mais afetado foi ${top.bairro}, com ${nf.format(top.semAgua)} relatos (${Math.round((top.semAgua / x.semAgua) * 100)}% do total).`);
  if (x.horaPico !== null) frases.push(`As faltas se concentraram por volta das ${x.horaPico}h${diaPico.value ? `, sobretudo às ${diaPico.value}` : ''}.`);
  frases.push(`Houve ${nf.format(x.voltou)} ${x.voltou === 1 ? 'aviso' : 'avisos'} de que a água voltou.`);
  return frases;
});

// ---- Pronto para imprimir: gráficos desenhados (síncrono, sem animação) + imagem do mapa ----
const mapaPronto = ref(props.m.pontos.features.length === 0);
const montado = ref(false);
function talvezPronto() {
  if (montado.value && mapaPronto.value) emit('pronto');
}
function onMapaPronto() {
  mapaPronto.value = true;
  talvezPronto();
}
onMounted(async () => {
  await nextTick();
  await new Promise((res) => setTimeout(res, 300)); // ResizeObserver do ECharts ajusta o tamanho
  montado.value = true;
  talvezPronto();
});
</script>

<template>
  <article class="ta-rel" aria-hidden="true">
    <!-- ================= Página 1: resumo ================= -->
    <header class="ta-rel__capa">
      <div class="ta-rel__marca">
        <span class="ta-rel__gota">
          <svg viewBox="0 0 24 24" width="16" height="16"><path d="M12 3s6 6.6 6 11a6 6 0 0 1-12 0c0-4.4 6-11 6-11z" fill="currentColor" /></svg>
        </span>
        <div>
          <p class="ta-rel__app">Tem Água? · Salto/SP</p>
          <h1 class="ta-rel__titulo">Relatório de falta d'água</h1>
        </div>
      </div>
      <dl class="ta-rel__meta">
        <div><dt>Período</dt><dd>{{ periodo }}</dd></div>
        <div><dt>{{ escolhidos.length > 1 ? 'Bairros' : 'Bairro' }}</dt><dd>{{ escolhidos.length ? escolhidos.join(', ') : 'Todos' }}</dd></div>
        <div><dt>Gerado em</dt><dd>{{ geradoEm }}</dd></div>
      </dl>
    </header>


    <section class="ta-rel__secao">
      <h2 class="ta-rel__h2">Resumo</h2>
      <p class="ta-rel__texto">{{ resumo.join(' ') }}</p>
    </section>

    <section class="ta-rel__kpis">
      <div class="ta-rel__kpi ta-rel__kpi--destaque">
        <span>Relatos de falta</span>
        <b>{{ nf.format(r.semAgua) }}</b>
        <small v-if="delta !== null">{{ delta > 0 ? '▲' : delta < 0 ? '▼' : '■' }} {{ Math.abs(delta) }}% vs período anterior</small>
        <small v-else>sem base de comparação</small>
      </div>
      <div class="ta-rel__kpi"><span>Água voltou</span><b>{{ nf.format(r.voltou) }}</b><small>avisos</small></div>
      <div class="ta-rel__kpi"><span>Bairros afetados</span><b>{{ nf.format(r.bairrosAfetados) }}</b><small>com falta</small></div>
      <div class="ta-rel__kpi"><span>Horário de pico</span><b>{{ r.horaPico === null ? '—' : `${r.horaPico}h` }}</b><small>mais faltas</small></div>
      <div class="ta-rel__kpi"><span>Total de relatos</span><b>{{ nf.format(r.total) }}</b><small>falta + volta</small></div>
    </section>

    <section class="ta-rel__secao ta-rel__figura">
      <h2 class="ta-rel__h2">Relatos {{ m.serie.granularidade === 'hora' ? 'por hora' : 'por dia' }}</h2>
      <EChart :option="opSerie" :height="250" label="Relatos de falta e de normalização ao longo do período" />
    </section>

    <section class="ta-rel__secao ta-rel__figura">
      <h2 class="ta-rel__h2">Onde os relatos se concentram</h2>
      <p class="ta-rel__legenda">Áreas de ~200 m; o tamanho do círculo é proporcional ao número de relatos.</p>
      <MapaImagem v-if="m.pontos.features.length" :pontos="m.pontos" :largura="700" :altura="280" @pronto="onMapaPronto" />
      <p v-else class="ta-rel__texto">Sem relatos com localização no período.</p>
    </section>

    <!-- ================= Página 2: padrões e sobre os dados ================= -->
    <section class="ta-rel__secao ta-rel__figura ta-rel__nova-pagina">
      <h2 class="ta-rel__h2">Quando falta água</h2>
      <p class="ta-rel__legenda">Relatos de falta por dia da semana e hora do dia.</p>
      <EChart :option="opHeatmap" :height="270" label="Relatos de falta por dia da semana e hora" />
    </section>

    <section class="ta-rel__secao ta-rel__figura">
      <h2 class="ta-rel__h2">Bairros mais afetados</h2>
      <p class="ta-rel__legenda">Relatos de falta d'água · 10 primeiros.</p>
      <EChart :option="opBairros" :height="alturaBairros" label="Bairros com mais relatos de falta" />
    </section>


    <section class="ta-rel__secao ta-rel__metodo">
      <h2 class="ta-rel__h2">Sobre os dados</h2>
      <ul>
        <li><b>Fonte:</b> relatos enviados pelos moradores no app Tem Água? (dados colaborativos, não oficiais).</li>
        <li><b>Cada relato</b> registra o status (sem água ou água voltou), o bairro mais próximo, as coordenadas e a data/hora no fuso de Brasília.</li>
        <li><b>Privacidade:</b> as coordenadas são arredondadas para cerca de 10 m antes de serem gravadas; o app não guarda endereço nem identidade.</li>
        <li><b>Horário de pico:</b> hora do dia com mais relatos de falta no período.</li>
        <li><b>Variação:</b> comparação com o período imediatamente anterior, de mesma duração.</li>
        <li><b>Mapa:</b> relatos agrupados em áreas de ~200 m. Mapa © OpenFreeMap, © OpenMapTiles, dados © colaboradores do OpenStreetMap.</li>
      </ul>
    </section>

    <!-- ================= Página 3: tabelas ================= -->
    <section class="ta-rel__secao ta-rel__nova-pagina">
      <h2 class="ta-rel__h2">Relatos por bairro</h2>
      <table class="ta-rel__tabela">
        <thead>
          <tr><th>Bairro</th><th class="num">Sem água</th><th class="num">% das faltas</th><th class="num">Água voltou</th><th>Último relato</th></tr>
        </thead>
        <tbody>
          <tr v-for="b in m.bairros" :key="b.bairro">
            <td>{{ b.bairro }}</td>
            <td class="num">{{ nf.format(b.semAgua) }}</td>
            <td class="num">{{ pctDoTotal(b.semAgua) }}</td>
            <td class="num">{{ nf.format(b.voltou) }}</td>
            <td>{{ dataHoraBr(b.ultimo) }}</td>
          </tr>
        </tbody>
      </table>
    </section>

    <section class="ta-rel__secao">
      <h2 class="ta-rel__h2">Relatos mais recentes</h2>
      <table class="ta-rel__tabela ta-rel__tabela--compacta">
        <thead>
          <tr><th>Data</th><th>Hora</th><th>Bairro</th><th>Status</th><th>Coordenadas</th></tr>
        </thead>
        <tbody>
          <tr v-for="x in m.recentes.slice(0, 20)" :key="x.id">
            <td>{{ dataBr(x.dia) }}</td>
            <td>{{ horaBr(x.criadoEm) }}</td>
            <td>{{ x.bairro }}</td>
            <td>
              <span class="ta-rel__status"><i :style="{ background: x.status === 'sem-agua' ? COR.semAgua : COR.voltou }"></i>{{ x.status === 'sem-agua' ? 'Sem água' : 'Água voltou' }}</span>
            </td>
            <td>{{ x.lat.toFixed(4) }}, {{ x.lng.toFixed(4) }}</td>
          </tr>
        </tbody>
      </table>
      <p class="ta-rel__nota">
        Mostrando os 20 mais recentes. A lista completa, com
        dia, hora e coordenadas de cada relato, está no CSV exportado pelo painel.
      </p>
    </section>

  </article>
</template>
