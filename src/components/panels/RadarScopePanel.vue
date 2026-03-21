<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { Detection, RadarCursorState, RadarParams } from '../../core/types';
import { RadarCanvasRenderer } from '../../renderers/canvas/RadarCanvasRenderer';

const props = defineProps<{
  sweepAngleRad: number;
  detections: Detection[];
  params: RadarParams;
  cursor: RadarCursorState;
}>();

const emit = defineEmits<{
  updateCursor: [payload: RadarCursorState | null];
}>();

const canvasRef = ref<HTMLCanvasElement | null>(null);
let renderer: RadarCanvasRenderer | null = null;

function redraw(): void {
  if (!renderer) {
    return;
  }

  renderer.render(props.sweepAngleRad, props.detections, props.params, props.cursor);
}
function updateCursorFromPointer(event: PointerEvent): void {
  if (!renderer || !canvasRef.value) {
    return;
  }

  const rect = canvasRef.value.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  const nextCursor = renderer.toCursorStateFromCanvasPoint(x, y, props.params.maxRangeMeters);
  if (nextCursor) {
    emit('updateCursor', nextCursor);
  }
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
  () => [props.sweepAngleRad, props.detections, props.params, props.cursor],
  redraw,
  { deep: true },
);

onBeforeUnmount(() => {
  window.removeEventListener('resize', onResize);
  renderer = null;
});
</script>

<template>
  <div class="scope-shell">
    <canvas
      ref="canvasRef"
      class="scope-canvas"
      @pointerdown.left="updateCursorFromPointer"
    ></canvas>
    <div class="hint">LMB: set cursor | arrows: move cursor</div>
  </div>
</template>

<style scoped>
.scope-shell {
  width: 100%;
  height: 100%;
  position: relative;
}

.scope-canvas {
  width: 100%;
  height: 100%;
  display: block;
}

.hint {
  position: absolute;
  left: 10px;
  bottom: 8px;
  color: rgba(110, 255, 170, 0.88);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.02em;
  text-shadow: 0 0 4px rgba(19, 74, 45, 0.9);
  user-select: none;
  pointer-events: none;
}
</style>
