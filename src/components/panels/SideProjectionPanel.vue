<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { Detection, RadarControlMode, RadarCursorState, RadarParams, Target } from '../../core/types';
import { SideViewRenderer } from '../../renderers/canvas/SideViewRenderer';

const props = defineProps<{
  targets: Target[];
  detections: Detection[];
  params: RadarParams;
  sweepElevationRad: number;
  cursor: RadarCursorState | null;
  controlMode: RadarControlMode;
  hoveredTargetId: string | null;
  inZoneTargetIds: string[];
}>();

const emit = defineEmits<{
  hoverTarget: [targetId: string | null];
}>();

const canvasRef = ref<HTMLCanvasElement | null>(null);
let renderer: SideViewRenderer | null = null;

function redraw(): void {
  renderer?.render(
    props.targets,
    props.detections,
    props.params,
    props.sweepElevationRad,
    props.cursor,
    props.controlMode === 'mig29',
    props.hoveredTargetId,
    props.inZoneTargetIds,
  );
}

function handlePointerMove(event: PointerEvent): void {
  if (!canvasRef.value || !renderer) {
    return;
  }

  const rect = canvasRef.value.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  emit('hoverTarget', renderer.pickTargetAt(x, y));
}

function handlePointerLeave(): void {
  emit('hoverTarget', null);
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
  () => [
    props.targets,
    props.detections,
    props.params,
    props.sweepElevationRad,
    props.cursor,
    props.controlMode,
    props.hoveredTargetId,
    props.inZoneTargetIds,
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
  <canvas
    ref="canvasRef"
    class="side-canvas"
    @pointermove="handlePointerMove"
    @pointerleave="handlePointerLeave"
  ></canvas>
</template>

<style scoped>
.side-canvas {
  width: 100%;
  height: 100%;
  display: block;
}
</style>
