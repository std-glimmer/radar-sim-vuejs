<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type {
  Detection,
  Mig29RadarMode,
  Mig29ZonePosition,
  RadarControlMode,
  RadarCursorState,
  RadarParams,
  RadarScopeMode,
} from '../../core/types';
import { RadarCanvasRenderer } from '../../renderers/canvas/RadarCanvasRenderer';

const props = defineProps<{
  sweepAngleRad: number;
  sweepElevationRad: number;
  detections: Detection[];
  params: RadarParams;
  cursor: RadarCursorState;
  showBeam: boolean;
  showGrid: boolean;
  scopeMode: RadarScopeMode;
  controlMode: RadarControlMode;
  mig29RadarMode: Mig29RadarMode;
  mig29ZonePosition: Mig29ZonePosition;
  mig29RangeTickKm: number;
}>();

const emit = defineEmits<{
  updateCursor: [payload: RadarCursorState | null];
  updateBeamVisibility: [payload: boolean];
  updateGridVisibility: [payload: boolean];
}>();

const canvasRef = ref<HTMLCanvasElement | null>(null);
let renderer: RadarCanvasRenderer | null = null;

const azZoneText = computed(() => `${Math.max(10, Math.min(360, props.params.azimuthScanSpanDeg)).toFixed(1)} deg`);
const antennaElevText = computed(() => `${props.params.antennaTiltDeg.toFixed(1)} deg`);

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
    props.showGrid,
    props.scopeMode,
    props.controlMode,
    props.mig29RadarMode,
    props.mig29ZonePosition,
    props.mig29RangeTickKm,
  );
}

function recenterCursor(): void {
  const centerAzimuthRad = ((props.params.radarAzimuthDeg + props.params.zoneAzimuthOffsetDeg) * Math.PI) / 180;
  emit('updateCursor', {
    rangeMeters: props.params.maxRangeMeters * 0.5,
    azimuthRad: centerAzimuthRad,
  });
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
    props.showGrid,
    props.scopeMode,
    props.controlMode,
    props.mig29RadarMode,
    props.mig29ZonePosition,
    props.mig29RangeTickKm,
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

    <section class="tech-panel">
      <h3>Radar</h3>
      <div class="tech-row">
        <span>Az zone</span>
        <span>{{ azZoneText }}</span>
      </div>
      <div class="tech-row">
        <span>Antenna elev</span>
        <span>{{ antennaElevText }}</span>
      </div>
    </section>

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

      <label>
        <input
          :checked="props.showGrid"
          type="checkbox"
          @change="emit('updateGridVisibility', ($event.target as HTMLInputElement).checked)"
        />
        Grid on scope
      </label>

      <button class="recenter-btn" type="button" @click="recenterCursor">Center cursor</button>
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

.tech-panel {
  position: absolute;
  left: 10px;
  bottom: 126px;
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

.tech-panel h3 {
  margin: 0 0 2px;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: #9fc7e6;
}

.tech-row {
  display: flex;
  justify-content: space-between;
  gap: 8px;
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

.recenter-btn {
  margin-top: 2px;
  border: 1px solid rgba(151, 188, 215, 0.38);
  background: rgba(22, 38, 53, 0.72);
  color: #d5e8fb;
  border-radius: 6px;
  font-size: 12px;
  padding: 5px 8px;
  cursor: pointer;
}

.recenter-btn:hover {
  background: rgba(32, 55, 76, 0.82);
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
