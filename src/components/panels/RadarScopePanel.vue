<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { Detection, RadarParams } from '../../core/types';
import { RadarCanvasRenderer } from '../../renderers/canvas/RadarCanvasRenderer';

const props = defineProps<{
  sweepAngleRad: number;
  detections: Detection[];
  params: RadarParams;
}>();

const canvasRef = ref<HTMLCanvasElement | null>(null);
let renderer: RadarCanvasRenderer | null = null;

function redraw(): void {
  if (!renderer) {
    return;
  }

  renderer.render(props.sweepAngleRad, props.detections, props.params);
}

function onResize(): void {
  renderer?.resize();
  redraw();
}

onMounted(() => {
  if (!canvasRef.value) {
    return;
  }

  renderer = new RadarCanvasRenderer(canvasRef.value);
  renderer.resize();
  redraw();

  window.addEventListener('resize', onResize);
});

watch(
  () => [props.sweepAngleRad, props.detections, props.params],
  redraw,
  { deep: true },
);

onBeforeUnmount(() => {
  window.removeEventListener('resize', onResize);
  renderer = null;
});
</script>

<template>
  <canvas ref="canvasRef" class="scope-canvas"></canvas>
</template>

<style scoped>
.scope-canvas {
  width: 100%;
  height: 100%;
  display: block;
}
</style>
