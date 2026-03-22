<script setup lang="ts">
import { onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import type { Detection, Mig29RadarMode, RadarControlMode, RadarCursorState, RadarParams, Target } from '../../core/types';
import { ThreeSceneRenderer } from '../../renderers/three/ThreeSceneRenderer';

const props = defineProps<{
  targets: Target[];
  detections: Detection[];
  sweepAngleRad: number;
  sweepElevationRad: number;
  params: RadarParams;
  cursor: RadarCursorState | null;
  controlMode: RadarControlMode;
  mig29RadarMode: Mig29RadarMode;
  hoveredTargetId: string | null;
  inFovTargetIds: string[];
  rangeAzimuthOnlyTargetIds: string[];
  outOfAzimuthInRangeTargetIds: string[];
  outOfRangeTargetIds: string[];
  showTargetAltitudeLabels: boolean;
}>();

const emit = defineEmits<{
  addFromScene: [payload: { x: number; z: number }];
  hoverTarget: [targetId: string | null];
  updateTargetAltitudeLabelsVisibility: [visible: boolean];
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
const showTargetAltitudeLabelsLocal = ref(props.showTargetAltitudeLabels);

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
  renderer.setTargetHighlights(
    props.hoveredTargetId,
    props.inFovTargetIds,
    props.rangeAzimuthOnlyTargetIds,
    props.outOfAzimuthInRangeTargetIds,
    props.outOfRangeTargetIds,
  );
  renderer.setDisplaySettings(displaySettings);
  renderer.updateScanCone(props.sweepAngleRad, props.sweepElevationRad, props.params);
  renderer.updateCursor(props.cursor, props.params, props.controlMode, props.mig29RadarMode);
  renderer.setTargetAltitudeLabelsVisible(props.showTargetAltitudeLabels);
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
  () => [
    props.hoveredTargetId,
    props.inFovTargetIds,
    props.rangeAzimuthOnlyTargetIds,
    props.outOfAzimuthInRangeTargetIds,
    props.outOfRangeTargetIds,
  ],
  () =>
    renderer?.setTargetHighlights(
      props.hoveredTargetId,
      props.inFovTargetIds,
      props.rangeAzimuthOnlyTargetIds,
      props.outOfAzimuthInRangeTargetIds,
      props.outOfRangeTargetIds,
    ),
  { deep: true },
);

watch(
  () => [props.sweepAngleRad, props.sweepElevationRad, props.params],
  () => {
    renderer?.updateScanCone(props.sweepAngleRad, props.sweepElevationRad, props.params);
    renderer?.updateCursor(props.cursor, props.params, props.controlMode, props.mig29RadarMode);
  },
  { deep: true },
);

watch(
  () => [props.cursor, props.params, props.controlMode, props.mig29RadarMode],
  () => renderer?.updateCursor(props.cursor, props.params, props.controlMode, props.mig29RadarMode),
  { deep: true },
);

watch(
  () => props.showTargetAltitudeLabels,
  (visible) => {
    showTargetAltitudeLabelsLocal.value = visible;
    renderer?.setTargetAltitudeLabelsVisible(visible);
  },
);

watch(showTargetAltitudeLabelsLocal, (visible) => {
  emit('updateTargetAltitudeLabelsVisibility', visible);
});

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

    <section class="legend-panel panel-block">
      <h3>Legend</h3>
      <div class="legend-list">
        <div class="legend-row">
          <span class="legend-icon pyramid-red" aria-hidden="true"></span>
          <span>Red pyramid: in field of view</span>
        </div>
        <div class="legend-row">
          <span class="legend-icon cube-yellow" aria-hidden="true"></span>
          <span>Yellow cube: range + azimuth, out by elevation</span>
        </div>
        <div class="legend-row">
          <span class="legend-icon sphere-green" aria-hidden="true"></span>
          <span>Green sphere: out by azimuth, in range</span>
        </div>
        <div class="legend-row">
          <span class="legend-icon sphere-gray" aria-hidden="true"></span>
          <span>Gray sphere: out of current range</span>
        </div>
      </div>
    </section>

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

        <label>
          <input v-model="showTargetAltitudeLabelsLocal" type="checkbox" />
          Show target altitude labels (3D/2D)
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

.legend-panel {
  position: absolute;
  right: 10px;
  top: 10px;
  width: 320px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 11px;
}

.legend-panel h3 {
  margin: 0;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: #9fc7e6;
}

.legend-list {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.legend-row {
  display: grid;
  grid-template-columns: 16px 1fr;
  align-items: center;
  gap: 8px;
  color: #d7e8f8;
}

.legend-icon {
  width: 12px;
  height: 12px;
  display: inline-block;
}

.pyramid-red {
  width: 0;
  height: 0;
  border-left: 7px solid transparent;
  border-right: 7px solid transparent;
  border-bottom: 12px solid #ff6464;
}

.cube-yellow {
  background: #f1d061;
  border: 1px solid rgba(255, 240, 188, 0.7);
}

.sphere-green {
  background: #67d88f;
  border-radius: 50%;
}

.sphere-gray {
  background: #aeb7c2;
  border-radius: 50%;
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
  .legend-panel {
    width: min(280px, calc(100% - 20px));
    font-size: 10px;
  }

  .display-panel {
    min-width: 180px;
    font-size: 11px;
  }
}
</style>
