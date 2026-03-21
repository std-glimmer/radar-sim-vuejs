<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { Detection, RadarCursorState, RadarParams, RadarScopeMode } from '../../core/types';
import { RadarCanvasRenderer } from '../../renderers/canvas/RadarCanvasRenderer';

const props = defineProps<{
  sweepAngleRad: number;
  sweepElevationRad: number;
  detections: Detection[];
  params: RadarParams;
  cursor: RadarCursorState;
  showBeam: boolean;
  scopeMode: RadarScopeMode;
}>();

const emit = defineEmits<{
  updateCursor: [payload: RadarCursorState | null];
  updateBeamVisibility: [payload: boolean];
}>();

const canvasRef = ref<HTMLCanvasElement | null>(null);
let renderer: RadarCanvasRenderer | null = null;

function redraw(): void {
  if (!renderer) {
    return;
  }

  renderer.render(
    props.sweepAngleRad,
    props.sweepElevationRad,
    props.detections,
    props.params,
    props.cursor,
    props.showBeam,
    props.scopeMode,
  );
}
function updateCursorFromPointer(event: PointerEvent): void {
  if (!renderer || !canvasRef.value) {
    return;
  }

  const rect = canvasRef.value.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  const nextCursor = renderer.toCursorStateFromCanvasPoint(x, y, props.params, props.scopeMode);
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
  () => [
    props.sweepAngleRad,
    props.sweepElevationRad,
    props.detections,
    props.params,
    props.cursor,
    props.showBeam,
    props.scopeMode,
  ],
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

    <section class="display-panel">
      <h3>Display</h3>
      <label>
        <input
          :checked="props.showBeam"
          type="checkbox"
          @change="emit('updateBeamVisibility', ($event.target as HTMLInputElement).checked)"
        />
        Beam on scope
      </label>
    </section>

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

.display-panel {
  position: absolute;
  left: 10px;
  bottom: 10px;
  min-width: 160px;
  border: 1px solid rgba(151, 188, 215, 0.38);
  background: rgba(5, 13, 21, 0.78);
  backdrop-filter: blur(3px);
  border-radius: 8px;
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  color: #d5e8fb;
  font-size: 12px;
}

.display-panel h3 {
  margin: 0 0 2px;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: #9fc7e6;
}

.display-panel label {
  display: flex;
  align-items: center;
  gap: 6px;
  user-select: none;
}

.hint {
  position: absolute;
  left: 50%;
  bottom: 8px;
  transform: translateX(-50%);
  color: rgba(110, 255, 170, 0.88);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.02em;
  text-shadow: 0 0 4px rgba(19, 74, 45, 0.9);
  user-select: none;
  pointer-events: none;
}
</style>
