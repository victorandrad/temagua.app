<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { echarts, type Option } from '../charts';

const props = defineProps<{ option: Option; height: number; label: string }>();

const el = ref<HTMLDivElement | null>(null);
let chart: ReturnType<typeof echarts.init> | undefined;
let resizeObserver: ResizeObserver | undefined;

onMounted(() => {
  chart = echarts.init(el.value!, undefined, { renderer: 'svg' });
  chart.setOption(props.option);
  resizeObserver = new ResizeObserver(() => chart?.resize());
  resizeObserver.observe(el.value!);
});

watch(
  () => props.option,
  (option) => chart?.setOption(option, { notMerge: true }),
);

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  chart?.dispose();
});
</script>

<template>
  <div ref="el" class="ta-met-chart" role="img" :aria-label="label" :style="{ height: `${height}px` }"></div>
</template>
