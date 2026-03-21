<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { Detection, RadarCursorState, RadarParams } from '../../core/types';
import { SideViewRenderer } from '../../renderers/canvas/SideViewRenderer';

const props = defineProps<{
  detections: Detection[];
  params: RadarParams;
  sweepElevationRad: number;
  cursor: RadarCursorState | null;
}>();

const canvasRef = ref<HTMLCanvasElement | null>(null);
let renderer: SideViewRenderer | null = null;

function redraw(): void {
  renderer?.render(props.detections, props.params, props.sweepElevationRad, props.cursor);
}

function onResize(): void {
  renderer?.resize();
  redraw();
}

onMounted(() => {
  if (!canvasRef.value) {
    return;
  }

  renderer = new SideViewRenderer(canvasRef.value);
  renderer.resize();
  redraw();

  window.addEventListener('resize', onResize);
});

watch(
  () => [props.detections, props.params, props.sweepElevationRad, props.cursor],
  redraw,
  { deep: true },
);

onBeforeUnmount(() => {
  window.removeEventListener('resize', onResize);
  renderer = null;
});
</script>

<template>
  <canvas ref="canvasRef" class="side-canvas"></canvas>
</template>

<style scoped>
.side-canvas {
  width: 100%;
  height: 100%;
  display: block;
}
</style>
