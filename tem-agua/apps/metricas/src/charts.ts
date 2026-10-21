// Configuração dos gráficos (ECharts, só os módulos usados, renderer SVG para imprimir nítido).
//
// Cores: "sem água" e "água voltou" são STATUS (vermelho/verde, as mesmas do mapa). O par fica na faixa
// de daltonismo 6–8 ΔE (deutan 6,8 no validador), então nunca carrega significado sozinho: legenda
// sempre presente, posição fixa na pilha (falta embaixo, volta em cima), 2 px de espaço entre partes,
// tooltip e tabela. O heatmap usa uma rampa sequencial de um tom só (monotônica, validada).

import * as echarts from 'echarts/core';
import { BarChart, HeatmapChart } from 'echarts/charts';
import { GridComponent, LegendComponent, TooltipComponent, VisualMapComponent } from 'echarts/components';
import { SVGRenderer } from 'echarts/renderers';
import type { Metricas } from './api';
import { compacto, dataBr, DIAS_SEMANA, esc, nf } from './format';

echarts.use([BarChart, HeatmapChart, GridComponent, LegendComponent, TooltipComponent, VisualMapComponent, SVGRenderer]);

export { echarts };
export type Option = echarts.EChartsCoreOption;

export const COR = {
  semAgua: '#E11900',
  voltou: '#05A357',
  superficie: '#ffffff',
  texto: '#000000',
  textoSec: '#5e5e5e',
  mudo: '#8a8a8a',
  grade: '#ececec',
  eixo: '#cfcfcf',
};

/** Rampa sequencial (vermelho, claro → escuro) para quantidade de relatos. */
export const RAMPA = ['#f7f1ef', '#fbb9ab', '#f47e66', '#e11900', '#a31200'];

/** Rampa sequencial verde (claro → escuro) para "água voltou" no modo monitoramento. */
export const RAMPA_VOLTOU = ['#eaf6ef', '#a6dcbd', '#4fbf85', '#05a357', '#03753e'];

const FONTE = 'Inter, system-ui, -apple-system, "Segoe UI", sans-serif';

const tooltipBase = {
  backgroundColor: '#ffffff',
  borderColor: 'rgba(0,0,0,0.08)',
  borderWidth: 1,
  padding: [10, 12],
  textStyle: { color: COR.texto, fontFamily: FONTE, fontSize: 13 },
  extraCssText: 'box-shadow: 0 6px 20px rgba(0,0,0,0.14); border-radius: 10px;',
};

const eixoCategoria = {
  axisLine: { lineStyle: { color: COR.eixo } },
  axisTick: { show: false },
  axisLabel: { color: COR.mudo, fontFamily: FONTE, fontSize: 11 },
};

const eixoValor = {
  axisLine: { show: false },
  axisTick: { show: false },
  splitLine: { lineStyle: { color: COR.grade, width: 1, type: 'solid' } },
  axisLabel: { color: COR.mudo, fontFamily: FONTE, fontSize: 11, formatter: (v: number) => compacto(v) },
  minInterval: 1,
};

/** Linha de tooltip: valor em destaque, nome depois, chave em traço (não caixa). */
function linha(cor: string, valor: number, nome: string): string {
  return `<div style="display:flex;align-items:center;gap:8px;margin-top:4px">
    <span style="width:12px;height:3px;border-radius:2px;background:${cor}"></span>
    <b style="font-weight:600">${nf.format(valor)}</b><span style="color:${COR.textoSec}">${esc(nome)}</span></div>`;
}

export function rotuloSerie(t: string, granularidade: 'hora' | 'dia'): string {
  if (granularidade === 'dia') return dataBr(t, true);
  const hora = t.slice(11, 13);
  return hora === '00' ? `${dataBr(t, true)} 0h` : `${Number(hora)}h`;
}

export function opcaoSerie(m: Metricas): Option {
  const { pontos, granularidade } = m.serie;
  const categorias = pontos.map((p) => rotuloSerie(p.t, granularidade));
  // Cantos arredondados só no topo de cada coluna (4 px), retos na base.
  const topo = [4, 4, 0, 0];
  return {
    textStyle: { fontFamily: FONTE },
    grid: { left: 8, right: 8, top: 36, bottom: 4, containLabel: true },
    legend: {
      left: 0,
      top: 0,
      icon: 'roundRect',
      itemWidth: 12,
      itemHeight: 12,
      textStyle: { color: COR.textoSec, fontSize: 12 },
      data: ['Sem água', 'Água voltou'],
    },
    tooltip: {
      ...tooltipBase,
      trigger: 'axis',
      axisPointer: { type: 'shadow', shadowStyle: { color: 'rgba(0,0,0,0.04)' } },
      formatter: (params: Array<{ dataIndex: number }>) => {
        const p = pontos[params[0].dataIndex];
        const titulo = granularidade === 'dia' ? dataBr(p.t) : `${dataBr(p.t)} · ${Number(p.t.slice(11, 13))}h`;
        return `<div style="color:${COR.textoSec};font-size:12px">${titulo}</div>` +
          linha(COR.semAgua, p.semAgua, 'sem água') + linha(COR.voltou, p.voltou, 'água voltou');
      },
    },
    xAxis: { type: 'category', data: categorias, ...eixoCategoria },
    yAxis: { type: 'value', ...eixoValor },
    series: [
      {
        name: 'Sem água',
        type: 'bar',
        stack: 'relatos',
        barMaxWidth: 24,
        itemStyle: { color: COR.semAgua, borderColor: COR.superficie, borderWidth: 1 },
        emphasis: { itemStyle: { opacity: 0.85 } },
        data: pontos.map((p) => ({ value: p.semAgua, itemStyle: { borderRadius: p.voltou ? 0 : topo } })),
      },
      {
        name: 'Água voltou',
        type: 'bar',
        stack: 'relatos',
        barMaxWidth: 24,
        itemStyle: { color: COR.voltou, borderColor: COR.superficie, borderWidth: 1, borderRadius: topo },
        emphasis: { itemStyle: { opacity: 0.85 } },
        data: pontos.map((p) => p.voltou),
      },
    ],
  };
}

export function opcaoHeatmap(m: Metricas): Option {
  const valores = new Map(m.semanaHora.map((c) => [`${c.dow}-${c.hora}`, c.semAgua]));
  const dados: Array<[number, number, number]> = [];
  for (let dow = 1; dow <= 7; dow++) {
    for (let hora = 0; hora < 24; hora++) dados.push([hora, dow - 1, valores.get(`${dow}-${hora}`) ?? 0]);
  }
  const max = Math.max(1, ...dados.map((d) => d[2]));
  return {
    textStyle: { fontFamily: FONTE },
    grid: { left: 8, right: 8, top: 4, bottom: 52, containLabel: true },
    tooltip: {
      ...tooltipBase,
      formatter: (p: { data: [number, number, number] }) => {
        const [hora, dia, valor] = p.data;
        return `<div style="color:${COR.textoSec};font-size:12px">${DIAS_SEMANA[dia]} · ${hora}h às ${hora + 1}h</div>` +
          linha(COR.semAgua, valor, valor === 1 ? 'relato de falta' : 'relatos de falta');
      },
    },
    xAxis: {
      type: 'category',
      data: Array.from({ length: 24 }, (_, h) => `${h}h`),
      ...eixoCategoria,
      axisLine: { show: false },
      axisLabel: { ...eixoCategoria.axisLabel, interval: 2 },
      splitArea: { show: false },
    },
    yAxis: {
      type: 'category',
      data: DIAS_SEMANA,
      inverse: true,
      ...eixoCategoria,
      axisLine: { show: false },
    },
    visualMap: {
      min: 0,
      max,
      calculable: false,
      orient: 'horizontal',
      left: 'center',
      bottom: 0,
      itemWidth: 12,
      itemHeight: 160,
      text: [`${nf.format(max)} relatos`, '0'],
      textStyle: { color: COR.mudo, fontSize: 11 },
      inRange: { color: RAMPA },
    },
    series: [
      {
        type: 'heatmap',
        data: dados,
        itemStyle: { borderColor: COR.superficie, borderWidth: 2, borderRadius: 3 },
        emphasis: { itemStyle: { borderColor: COR.texto, borderWidth: 1 } },
      },
    ],
  };
}

export function opcaoBairros(m: Metricas): Option {
  const top = m.bairros.filter((b) => b.semAgua > 0).slice(0, 10);
  return {
    textStyle: { fontFamily: FONTE },
    grid: { left: 8, right: 40, top: 4, bottom: 4, containLabel: true },
    tooltip: {
      ...tooltipBase,
      trigger: 'item',
      formatter: (p: { dataIndex: number }) => {
        const b = top[p.dataIndex];
        return `<div style="color:${COR.textoSec};font-size:12px">${esc(b.bairro)}</div>` +
          linha(COR.semAgua, b.semAgua, 'sem água') + linha(COR.voltou, b.voltou, 'água voltou');
      },
    },
    xAxis: { type: 'value', ...eixoValor, splitLine: { show: false }, axisLabel: { show: false } },
    yAxis: {
      type: 'category',
      inverse: true,
      data: top.map((b) => b.bairro),
      ...eixoCategoria,
      axisLabel: { ...eixoCategoria.axisLabel, color: COR.texto, fontSize: 12, width: 170, overflow: 'truncate' },
    },
    series: [
      {
        type: 'bar',
        barMaxWidth: 16,
        itemStyle: { color: COR.semAgua, borderRadius: [0, 4, 4, 0] },
        // Barras: valor na ponta (texto na cor de texto, nunca na cor do dado).
        label: { show: true, position: 'right', color: COR.textoSec, fontSize: 12, formatter: (p: { value: number }) => nf.format(p.value) },
        data: top.map((b) => b.semAgua),
      },
    ],
  };
}
