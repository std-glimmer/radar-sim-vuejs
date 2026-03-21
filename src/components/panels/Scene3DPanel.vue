<script setup lang="ts">
import { onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import type { Detection, RadarControlMode, RadarCursorState, RadarParams, Target } from '../../core/types';
import { ThreeSceneRenderer } from '../../renderers/three/ThreeSceneRenderer';

const props = defineProps<{
  targets: Target[];
  detections: Detection[];
  sweepAngleRad: number;
  sweepElevationRad: number;
  params: RadarParams;
  cursor: RadarCursorState | null;
  controlMode: RadarControlMode;
  hoveredTargetId: string | null;
  inZoneTargetIds: string[];
}>();

const emit = defineEmits<{
  addFromScene: [payload: { x: number; z: number }];
  hoverTarget: [targetId: string | null];
}>();

const hostRef = ref<HTMLDivElement | null>(null);
let renderer: ThreeSceneRenderer | null = null;
let rafId: number | null = null;

const displaySettings = reactive({
  showFullRegion: true,
  showFullRegionVerticalFaces: true,
  showActiveSector: true,
  showActiveSectorVerticalFaces: true,
  showOrientationGuides: false,
});

function onResize(): void {
  renderer?.resize();
}

function centerCamera(): void {
  renderer?.resetCameraToDefault();
}

function centerCameraOnScanZone(): void {
  renderer?.centerCameraOnScanZone(props.params);
}

function autoCenterForMig29(): void {
  if (props.controlMode !== 'mig29') {
    return;
  }

  renderer?.centerCameraOnScanZone(props.params);
}

function syncRadarAircraftMarker(): void {
  renderer?.setRadarAircraftVisible(props.controlMode === 'mig29');
  renderer?.setOriginMarkerVisible(props.controlMode !== 'mig29');
}

onMounted(() => {
  if (!hostRef.value) {
    return;
  }

  renderer = new ThreeSceneRenderer(hostRef.value, {
    onAddTargetFromGroundPoint: (x, z) => emit('addFromScene', { x, z }),
    onHoverTarget: (targetId) => emit('hoverTarget', targetId),
  });
  renderer.syncTargets(props.targets);
  renderer.updateDetectionFlashes(props.detections);
  renderer.setTargetHighlights(props.hoveredTargetId, props.inZoneTargetIds);
  renderer.setDisplaySettings(displaySettings);
  renderer.updateScanCone(props.sweepAngleRad, props.sweepElevationRad, props.params);
  renderer.updateCursor(props.cursor, props.params);
  syncRadarAircraftMarker();
  autoCenterForMig29();

  window.addEventListener('resize', onResize);

  const loop = () => {
    renderer?.render();
    rafId = requestAnimationFrame(loop);
  };

  rafId = requestAnimationFrame(loop);
});

watch(
  () => props.targets,
  (targets) => renderer?.syncTargets(targets),
  { deep: true },
);

watch(
  () => props.detections,
  (detections) => renderer?.updateDetectionFlashes(detections),
  { deep: true },
);

watch(
  () => [props.hoveredTargetId, props.inZoneTargetIds],
  () => renderer?.setTargetHighlights(props.hoveredTargetId, props.inZoneTargetIds),
  { deep: true },
);

watch(
  () => [props.sweepAngleRad, props.sweepElevationRad, props.params],
  () => {
    renderer?.updateScanCone(props.sweepAngleRad, props.sweepElevationRad, props.params);
    renderer?.updateCursor(props.cursor, props.params);
  },
  { deep: true },
);

watch(
  () => [props.cursor, props.params],
  () => renderer?.updateCursor(props.cursor, props.params),
  { deep: true },
);

watch(
  () => props.controlMode,
  autoCenterForMig29,
);

watch(
  () => props.controlMode,
  syncRadarAircraftMarker,
);

watch(
  () => displaySettings,
  () => renderer?.setDisplaySettings(displaySettings),
  { deep: true },
);

onBeforeUnmount(() => {
  window.removeEventListener('resize', onResize);
  if (rafId !== null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
  renderer?.dispose();
  renderer = null;
});
</script>

<template>
  <div class="scene-shell">
    <div ref="hostRef" class="scene-host"></div>

    <section class="display-panel panel-block">
        <h3>Display</h3>

        <label>
          <input v-model="displaySettings.showFullRegion" type="checkbox" />
          Full region
        </label>

        <label>
          <input v-model="displaySettings.showFullRegionVerticalFaces" type="checkbox" />
          Full region vertical faces
        </label>

        <label>
          <input v-model="displaySettings.showActiveSector" type="checkbox" />
          Active sector
        </label>

        <label>
          <input v-model="displaySettings.showActiveSectorVerticalFaces" type="checkbox" />
          Active sector vertical faces
        </label>

        <label>
          <input v-model="displaySettings.showOrientationGuides" type="checkbox" />
          Show north/up/down marks
        </label>

        <button type="button" class="center-button" @click="centerCamera">Center Camera</button>
        <button type="button" class="center-button" @click="centerCameraOnScanZone">Center On Scan Zone</button>
      </section>
  </div>
</template>

<style scoped>
.scene-shell {
  width: 100%;
  height: 100%;
  position: relative;
}

.scene-host {
  width: 100%;
  height: 100%;
}

.panel-block {
  border: 1px solid rgba(151, 188, 215, 0.38);
  background: rgba(5, 13, 21, 0.78);
  backdrop-filter: blur(3px);
  border-radius: 8px;
  padding: 8px 10px;
  color: #d5e8fb;
}

.display-panel {
  position: absolute;
  left: 10px;
  bottom: 10px;
  width: 220px;
  margin-top: auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
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

.center-button {
  margin-top: 2px;
  border: 1px solid rgba(145, 201, 246, 0.4);
  background: rgba(29, 51, 73, 0.82);
  color: #e9f4ff;
  border-radius: 6px;
  padding: 5px 8px;
  cursor: pointer;
}

@media (max-width: 980px) {
  .display-panel {
    min-width: 180px;
    font-size: 11px;
  }
}
</style>
