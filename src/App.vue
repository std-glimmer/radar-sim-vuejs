<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import RadarParamsControls from './components/controls/RadarParamsControls.vue';
import SimulationLayout from './components/layout/SimulationLayout.vue';
import RadarScopePanel from './components/panels/RadarScopePanel.vue';
import Scene3DPanel from './components/panels/Scene3DPanel.vue';
import SideProjectionPanel from './components/panels/SideProjectionPanel.vue';
import TargetsWidget from './components/panels/TargetsWidget.vue';
import { bearingRad, clamp, elevationRad, magnitude, normalizeAngleRad as normalizePositiveAngleRad, shortestAngleDiffRad as shortestAngleDiffRadCore } from './core/math';
import { SimulationRuntime } from './core/simulationRuntime';
import type {
  Mig29RadarMode,
  Mig29ZonePosition,
  NewTargetInput,
  RadarControlMode,
  RadarCursorState,
  RadarParams,
  RadarScopeMode,
  Target,
} from './core/types';
import { useRadarStore } from './stores/radarStore';
import { useSimStore } from './stores/simStore';
import { useTargetsStore } from './stores/targetsStore';

const radarStore = useRadarStore();
const simStore = useSimStore();
const targetsStore = useTargetsStore();

const { params, detections, sweepAngleRad, sweepElevationRad, simTimeSec } = storeToRefs(radarStore);
const { targets, count } = storeToRefs(targetsStore);
const { isRunning } = storeToRefs(simStore);
const cursorRangeMeters = ref(params.value.maxRangeMeters * 0.5);
const cursorAzimuthOffsetRad = ref(0);
const showRadarBeam = ref(false);
const showRadarGrid = ref(false);
const scopeMode = ref<RadarScopeMode>('ppi');
const controlMode = ref<RadarControlMode>('mig29');
const mig29RadarMode = ref<Mig29RadarMode>('auto');
const mig29DeltaH = ref(0);
const mig29ZonePosition = ref<Mig29ZonePosition>('center');
const hoveredTargetId = ref<string | null>(null);
const showTargetAltitudeLabels = ref(false);
const manualParamsSnapshot = ref<RadarParams | null>(null);
const migBaseCursorWidth = ref(params.value.cursorWidthMeters);
const migBaseCursorLength = ref(params.value.cursorLengthMeters);
const MIG29_MIN_SCAN_ZONE_EDGE_DEG = -38;
const MIG29_MAX_SCAN_ZONE_EDGE_DEG = 60;

const effectiveScopeMode = computed<RadarScopeMode>(() =>
  controlMode.value === 'mig29' ? 'b-scope' : scopeMode.value,
);

const mig29RangeTickKm = computed<number>(() => {
  if (mig29RadarMode.value === 'v') {
    return 30;
  }

  if (mig29RadarMode.value === 'd') {
    return 10;
  }

  return 20;
});

const inFovTargetIds = computed<string[]>(() =>
  targets.value
    .filter((target) => {
      const state = classifyTargetForScan(target, params.value);
      return state.inRange && state.inAzimuth && state.inElevation;
    })
    .map((target) => target.id),
);

const rangeAzimuthOnlyTargetIds = computed<string[]>(() =>
  targets.value
    .filter((target) => {
      const state = classifyTargetForScan(target, params.value);
      return state.inRange && state.inAzimuth && !state.inElevation;
    })
    .map((target) => target.id),
);

const outOfAzimuthInRangeTargetIds = computed<string[]>(() =>
  targets.value
    .filter((target) => {
      const state = classifyTargetForScan(target, params.value);
      return state.inRange && !state.inAzimuth;
    })
    .map((target) => target.id),
);

const outOfRangeTargetIds = computed<string[]>(() =>
  targets.value
    .filter((target) => {
      const state = classifyTargetForScan(target, params.value);
      return !state.inRange;
    })
    .map((target) => target.id),
);

const cursor = computed<RadarCursorState>(() => {
  const clampedOffset = clampCursorAzimuthOffset(cursorAzimuthOffsetRad.value, params.value.azimuthScanSpanDeg);
  const clampedRange = clampNumber(cursorRangeMeters.value, 0, params.value.maxRangeMeters);
  return {
    rangeMeters: clampedRange,
    azimuthRad: normalizeAngleRad(getScanCenterAzimuthRad(params.value) + clampedOffset),
  };
});

const runtime = new SimulationRuntime({
  getParams: () => params.value,
  getTargets: () => targets.value,
  isRunning: () => isRunning.value,
  commitFrame: (frame) => {
    radarStore.commitFrame({
      simTimeSec: frame.simTimeSec,
      sweepAngleRad: frame.sweepAngleRad,
      sweepElevationRad: frame.sweepElevationRad,
      detections: frame.detections,
    });
  },
  commitTargets: (nextTargets) => {
    targetsStore.replaceTargets(nextTargets);
  },
});

function addTarget(input: NewTargetInput): void {
  targetsStore.addTarget(input);
}

function addTargetFromScene(payload: { x: number; z: number }): void {
  addTarget({
    position: {
      x: payload.x,
      y: 5000,
      z: payload.z,
    },
  });
}

function addTargetFromPolar(input: { azimuthOffsetDeg: number; rangeKm: number; altitudeKm: number }): void {
  const centerAzimuthRad = getScanCenterAzimuthRad(params.value);
  const azimuthRad = centerAzimuthRad + (input.azimuthOffsetDeg * Math.PI) / 180;
  const rangeMeters = Math.max(0, input.rangeKm) * 1000;
  const altitudeMeters = input.altitudeKm * 1000;

  addTarget({
    position: {
      x: Math.sin(azimuthRad) * rangeMeters,
      y: altitudeMeters,
      z: Math.cos(azimuthRad) * rangeMeters,
    },
  });
}

function buildFixedMig29Targets(): NewTargetInput[] {
  const points = [
    { rangeKm: 18, azDeg: -58, altitude: 900 },
    { rangeKm: 22, azDeg: -34, altitude: 2400 },
    { rangeKm: 27, azDeg: -10, altitude: 4100 },
    { rangeKm: 32, azDeg: 16, altitude: 6200 },
    { rangeKm: 38, azDeg: 42, altitude: 1700 },

    { rangeKm: 46, azDeg: -54, altitude: 5200 },
    { rangeKm: 52, azDeg: -26, altitude: 7600 },
    { rangeKm: 58, azDeg: 2, altitude: 9800 },
    { rangeKm: 66, azDeg: 24, altitude: 3200 },
    { rangeKm: 74, azDeg: 50, altitude: 11800 },

    { rangeKm: 84, azDeg: -60, altitude: 14000 },
    { rangeKm: 92, azDeg: -38, altitude: 10800 },
    { rangeKm: 101, azDeg: -14, altitude: 4300 },
    { rangeKm: 110, azDeg: 12, altitude: 8600 },
    { rangeKm: 122, azDeg: 36, altitude: 15200 },

    { rangeKm: 134, azDeg: 58, altitude: 6700 },
    { rangeKm: 145, azDeg: -48, altitude: 12800 },
    { rangeKm: 156, azDeg: -4, altitude: 18200 },
    { rangeKm: 168, azDeg: 30, altitude: 5400 },
    { rangeKm: 178, azDeg: 54, altitude: 19600 },
  ];

  return points.map((point) => {
    const azimuthRad = (point.azDeg * Math.PI) / 180;
    const rangeMeters = point.rangeKm * 1000;
    return {
      position: {
        x: Math.sin(azimuthRad) * rangeMeters,
        y: point.altitude,
        z: Math.cos(azimuthRad) * rangeMeters,
      },
    };
  });
}

function initDefaultMig29Targets(): void {
  const fixedTargets = buildFixedMig29Targets().map((target, index) => ({
    id: `TGT-${String(index + 1).padStart(2, '0')}`,
    position: { ...target.position },
  }));
  targetsStore.replaceTargets(fixedTargets);
}

function removeTarget(targetId: string): void {
  targetsStore.removeTarget(targetId);
}

function toggleRunState(): void {
  simStore.setRunning(!isRunning.value);
}

function updateRadarParams(nextParams: Partial<RadarParams>): void {
  if (controlMode.value === 'mig29') {
    const mergedElevationFovDeg =
      typeof nextParams.elevationFovDeg === 'number' ? nextParams.elevationFovDeg : params.value.elevationFovDeg;
    const mergedAntennaTiltDeg =
      typeof nextParams.antennaTiltDeg === 'number' ? nextParams.antennaTiltDeg : params.value.antennaTiltDeg;

    radarStore.updateParams({
      ...nextParams,
      antennaTiltDeg: clampMig29AntennaTiltByZoneBounds(mergedAntennaTiltDeg, mergedElevationFovDeg),
    });
    return;
  }

  radarStore.updateParams(nextParams);
}

function updateCursorFromAbsolute(nextCursor: RadarCursorState | null): void {
  if (!nextCursor) {
    return;
  }

  const center = getScanCenterAzimuthRad(params.value);
  const offset = shortestAngleDiffRad(nextCursor.azimuthRad, center);
  cursorAzimuthOffsetRad.value = clampCursorAzimuthOffset(offset, params.value.azimuthScanSpanDeg);
  cursorRangeMeters.value = clampNumber(nextCursor.rangeMeters, 0, params.value.maxRangeMeters);
}

function updateRadarBeamVisibility(nextVisible: boolean): void {
  showRadarBeam.value = nextVisible;
}

function updateRadarGridVisibility(nextVisible: boolean): void {
  showRadarGrid.value = nextVisible;
}

function updateScopeMode(nextMode: RadarScopeMode): void {
  if (controlMode.value === 'mig29') {
    return;
  }

  scopeMode.value = nextMode;
}

function updateControlMode(nextMode: RadarControlMode): void {
  if (nextMode === controlMode.value) {
    return;
  }

  if (nextMode === 'mig29') {
    manualParamsSnapshot.value = { ...params.value };
    migBaseCursorWidth.value = params.value.cursorWidthMeters;
    migBaseCursorLength.value = params.value.cursorLengthMeters;
    controlMode.value = 'mig29';
    applyMig29Params();
    return;
  }

  controlMode.value = 'manual';
  if (manualParamsSnapshot.value) {
    radarStore.updateParams(manualParamsSnapshot.value);
  }
}

function updateMig29RadarMode(nextMode: Mig29RadarMode): void {
  const rangeNorm = cursorRangeMeters.value / Math.max(1, params.value.maxRangeMeters);
  mig29RadarMode.value = nextMode;

  const nextMaxRangeMeters = nextMode === 'v' ? 150000 : nextMode === 'd' ? 50000 : 100000;
  cursorRangeMeters.value = clampNumber(rangeNorm * nextMaxRangeMeters, 0, nextMaxRangeMeters);
}

function updateMig29DeltaH(nextValue: number): void {
  mig29DeltaH.value = nextValue;
}

function updateMig29ZonePosition(nextPosition: Mig29ZonePosition): void {
  mig29ZonePosition.value = nextPosition;
}

function updateHoveredTarget(nextTargetId: string | null): void {
  hoveredTargetId.value = nextTargetId;
}

function updateTargetAltitudeLabelsVisibility(visible: boolean): void {
  showTargetAltitudeLabels.value = visible;
}

function centerCursorOnScanZone(): void {
  updateCursorFromAbsolute({
    rangeMeters: params.value.maxRangeMeters * 0.5,
    azimuthRad: getScanCenterAzimuthRad(params.value),
  });
}

function applyMig29Params(): void {
  if (controlMode.value !== 'mig29') {
    return;
  }

  const mode = mig29RadarMode.value;
  const cursorRangeKm = Math.max(1, cursor.value.rangeMeters / 1000);
  const cursorRangeThresholdMeters = 20000;

  const rangeKm = mode === 'v' ? 150 : mode === 'd' ? 50 : 100;
  const zoneAzOffsetDeg =
    mig29ZonePosition.value === 'left' ? -40 : mig29ZonePosition.value === 'right' ? 40 : 0;

  let elevationFovDeg = 11;
  if (mode === 'd') {
    elevationFovDeg = cursor.value.rangeMeters > cursorRangeThresholdMeters ? 13 : 16;
  } else {
    elevationFovDeg = cursor.value.rangeMeters > cursorRangeThresholdMeters ? 11 : 13;
  }

  const rawAntennaTiltDeg = (Math.atan2(mig29DeltaH.value, cursorRangeKm) * 180) / Math.PI;
  const antennaTiltDeg = clampMig29AntennaTiltByZoneBounds(rawAntennaTiltDeg, elevationFovDeg);
  const cursorWidthMeters = migBaseCursorWidth.value;
  const cursorLengthMeters =
    mode === 'v' ? migBaseCursorLength.value * 0.5 : mode === 'd' ? migBaseCursorLength.value * 1.5 : migBaseCursorLength.value;

  radarStore.updateParams({
    maxRangeMeters: rangeKm * 1000,
    scanSpeedDegPerSec: 50,
    fovDeg: 3.5,
    beamElevationDeg: 3.5,
    scanLinesCount: 4,
    autoBeamElevationByScanLines: false,
    azimuthScanSpanDeg: 50,
    elevationFovDeg,
    antennaTiltDeg,
    zoneAzimuthOffsetDeg: zoneAzOffsetDeg,
    cursorWidthMeters,
    cursorLengthMeters,
  });
}

function clampMig29AntennaTiltByZoneBounds(antennaTiltDeg: number, elevationFovDeg: number): number {
  const halfZoneDeg = Math.max(5, Math.min(90, elevationFovDeg)) * 0.5;
  const maxSpanDeg = MIG29_MAX_SCAN_ZONE_EDGE_DEG - MIG29_MIN_SCAN_ZONE_EDGE_DEG;
  if (halfZoneDeg * 2 >= maxSpanDeg - 1e-6) {
    return (MIG29_MIN_SCAN_ZONE_EDGE_DEG + MIG29_MAX_SCAN_ZONE_EDGE_DEG) * 0.5;
  }

  let clampedTiltDeg = antennaTiltDeg;

  const topEdgeDeg = clampedTiltDeg + halfZoneDeg;
  if (topEdgeDeg > MIG29_MAX_SCAN_ZONE_EDGE_DEG) {
    clampedTiltDeg -= topEdgeDeg - MIG29_MAX_SCAN_ZONE_EDGE_DEG;
  }

  const bottomEdgeDeg = clampedTiltDeg - halfZoneDeg;
  if (bottomEdgeDeg < MIG29_MIN_SCAN_ZONE_EDGE_DEG) {
    clampedTiltDeg += MIG29_MIN_SCAN_ZONE_EDGE_DEG - bottomEdgeDeg;
  }

  return clampNumber(
    clampedTiltDeg,
    MIG29_MIN_SCAN_ZONE_EDGE_DEG + halfZoneDeg,
    MIG29_MAX_SCAN_ZONE_EDGE_DEG - halfZoneDeg,
  );
}

function enforceMig29VerticalZoneLimits(): void {
  if (controlMode.value !== 'mig29') {
    return;
  }

  const clampedTiltDeg = clampMig29AntennaTiltByZoneBounds(
    params.value.antennaTiltDeg,
    params.value.elevationFovDeg,
  );

  if (Math.abs(clampedTiltDeg - params.value.antennaTiltDeg) > 1e-6) {
    radarStore.updateParams({ antennaTiltDeg: clampedTiltDeg });
  }
}

function handleCursorKeydown(event: KeyboardEvent): void {
  const target = event.target as HTMLElement | null;
  if (target) {
    const tag = target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
      return;
    }
  }

  const key = event.key;
  if (key !== 'ArrowUp' && key !== 'ArrowDown' && key !== 'ArrowLeft' && key !== 'ArrowRight') {
    return;
  }

  event.preventDefault();

  const rangeStep = Math.max(250, params.value.maxRangeMeters * 0.01);
  const azimuthStepRad = (1 * Math.PI) / 180;

  if (key === 'ArrowUp') {
    cursorRangeMeters.value = clampNumber(cursorRangeMeters.value + rangeStep, 0, params.value.maxRangeMeters);
    return;
  }

  if (key === 'ArrowDown') {
    cursorRangeMeters.value = clampNumber(cursorRangeMeters.value - rangeStep, 0, params.value.maxRangeMeters);
    return;
  }

  if (key === 'ArrowLeft') {
    cursorAzimuthOffsetRad.value = clampCursorAzimuthOffset(
      cursorAzimuthOffsetRad.value - azimuthStepRad,
      params.value.azimuthScanSpanDeg,
    );
    return;
  }

  cursorAzimuthOffsetRad.value = clampCursorAzimuthOffset(
    cursorAzimuthOffsetRad.value + azimuthStepRad,
    params.value.azimuthScanSpanDeg,
  );
}

function normalizeAngleRad(angleRad: number): number {
  const tau = Math.PI * 2;
  let next = angleRad % tau;
  if (next <= -Math.PI) {
    next += tau;
  } else if (next > Math.PI) {
    next -= tau;
  }
  return next;
}

function shortestAngleDiffRad(to: number, from: number): number {
  return normalizeAngleRad(to - from);
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function getScanCenterAzimuthRad(radarParams: RadarParams): number {
  return normalizeAngleRad(((radarParams.radarAzimuthDeg + radarParams.zoneAzimuthOffsetDeg) * Math.PI) / 180);
}

function clampCursorAzimuthOffset(offsetRad: number, scanSpanDeg: number): number {
  const normalizedOffset = normalizeAngleRad(offsetRad);
  if (scanSpanDeg >= 360) {
    return normalizedOffset;
  }

  const halfSpanRad = (Math.max(10, Math.min(360, scanSpanDeg)) * Math.PI) / 360;
  return clampNumber(normalizedOffset, -halfSpanRad, halfSpanRad);
}

function classifyTargetForScan(
  target: Target,
  radarParams: RadarParams,
): { inRange: boolean; inAzimuth: boolean; inElevation: boolean } {
  const centerAzimuthRad = normalizePositiveAngleRad(
    ((clamp(radarParams.radarAzimuthDeg, -180, 180) + clamp(radarParams.zoneAzimuthOffsetDeg, -180, 180)) * Math.PI) / 180,
  );
  const halfAzimuthSpan = (clamp(radarParams.azimuthScanSpanDeg, 10, 360) * Math.PI) / 360;

  const relativePosition = {
    x: target.position.x,
    y: target.position.y - radarParams.radarAltitudeMeters,
    z: target.position.z,
  };

  const targetBearingRad = bearingRad(relativePosition);
  const azimuthOffset = Math.abs(shortestAngleDiffRadCore(targetBearingRad, centerAzimuthRad));
  const inAzimuth = azimuthOffset <= halfAzimuthSpan + 1e-6;

  const rangeMeters = magnitude(relativePosition);
  const inRange = rangeMeters <= radarParams.maxRangeMeters + 1e-6;

  const targetElevationRad = elevationRad(relativePosition);
  const antennaTiltRad = (clamp(radarParams.antennaTiltDeg, -60, 60) * Math.PI) / 180;
  const halfElevationSpan = (clamp(radarParams.elevationFovDeg, 5, 90) * Math.PI) / 360;
  const inElevation =
    Math.abs(shortestAngleDiffRadCore(targetElevationRad, antennaTiltRad)) <= halfElevationSpan + 1e-6;

  return {
    inRange,
    inAzimuth,
    inElevation,
  };
}

onMounted(() => {
  initDefaultMig29Targets();

  runtime.start();
  window.addEventListener('keydown', handleCursorKeydown);
  applyMig29Params();
  centerCursorOnScanZone();
});

watch(
  () => params.value,
  () => {
    cursorRangeMeters.value = clampNumber(cursorRangeMeters.value, 0, params.value.maxRangeMeters);
    cursorAzimuthOffsetRad.value = clampCursorAzimuthOffset(
      cursorAzimuthOffsetRad.value,
      params.value.azimuthScanSpanDeg,
    );
  },
  { deep: true },
);

watch(
  () => [controlMode.value, mig29RadarMode.value, mig29DeltaH.value, mig29ZonePosition.value, cursor.value.rangeMeters],
  () => applyMig29Params(),
);

watch(
  () => [controlMode.value, params.value.antennaTiltDeg, params.value.elevationFovDeg],
  () => enforceMig29VerticalZoneLimits(),
);

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleCursorKeydown);
  runtime.stop();
});
</script>

<template>
  <div class="app-shell">
    <header class="control-bar">
      <div class="meta">
        <h1>MiG-29 Radar Sim</h1>
        <p>
          SIM {{ simTimeSec.toFixed(1) }}s | targets {{ count }} | detections {{ detections.length }}
        </p>
      </div>

      <div class="actions">
        <button type="button" @click="toggleRunState">{{ isRunning ? 'Pause' : 'Run' }}</button>
      </div>
    </header>

    <main class="sim-stage">
      <SimulationLayout>
        <template #scene>
          <div class="scene-with-widget">
            <TargetsWidget
              :targets="targets"
              :detections="detections"
              :params="params"
              :hovered-target-id="hoveredTargetId"
              :in-fov-target-ids="inFovTargetIds"
              :range-azimuth-only-target-ids="rangeAzimuthOnlyTargetIds"
              :out-of-azimuth-in-range-target-ids="outOfAzimuthInRangeTargetIds"
              :out-of-range-target-ids="outOfRangeTargetIds"
              @add-target-polar="addTargetFromPolar"
              @remove-target="removeTarget"
              @hover-target="updateHoveredTarget"
            />

            <Scene3DPanel
              :targets="targets"
              :detections="detections"
              :sweep-angle-rad="sweepAngleRad"
              :sweep-elevation-rad="sweepElevationRad"
              :params="params"
              :cursor="cursor"
              :control-mode="controlMode"
              :mig29-radar-mode="mig29RadarMode"
              :hovered-target-id="hoveredTargetId"
              :in-fov-target-ids="inFovTargetIds"
              :range-azimuth-only-target-ids="rangeAzimuthOnlyTargetIds"
              :out-of-azimuth-in-range-target-ids="outOfAzimuthInRangeTargetIds"
              :out-of-range-target-ids="outOfRangeTargetIds"
              :show-target-altitude-labels="showTargetAltitudeLabels"
              @add-from-scene="addTargetFromScene"
              @hover-target="updateHoveredTarget"
              @update-target-altitude-labels-visibility="updateTargetAltitudeLabelsVisibility"
            />
          </div>
        </template>

        <template #controls>
          <RadarParamsControls
            :params="params"
            :scope-mode="scopeMode"
            :control-mode="controlMode"
            :mig29-radar-mode="mig29RadarMode"
            :mig29-delta-h="mig29DeltaH"
            :mig29-zone-position="mig29ZonePosition"
            @update="updateRadarParams"
            @update-scope-mode="updateScopeMode"
            @update-control-mode="updateControlMode"
            @update-mig29-radar-mode="updateMig29RadarMode"
            @update-mig29-delta-h="updateMig29DeltaH"
            @update-mig29-zone-position="updateMig29ZonePosition"
          />
        </template>

        <template #side>
          <SideProjectionPanel
            :targets="targets"
            :detections="detections"
            :params="params"
            :sweep-elevation-rad="sweepElevationRad"
            :cursor="cursor"
            :control-mode="controlMode"
            :hovered-target-id="hoveredTargetId"
            :in-fov-target-ids="inFovTargetIds"
            :range-azimuth-only-target-ids="rangeAzimuthOnlyTargetIds"
            :out-of-azimuth-in-range-target-ids="outOfAzimuthInRangeTargetIds"
            :out-of-range-target-ids="outOfRangeTargetIds"
            :show-target-altitude-labels="showTargetAltitudeLabels"
            @hover-target="updateHoveredTarget"
          />
        </template>

        <template #radar>
          <RadarScopePanel
            :detections="detections"
            :params="params"
            :sweep-angle-rad="sweepAngleRad"
            :sweep-elevation-rad="sweepElevationRad"
            :cursor="cursor"
            :show-beam="showRadarBeam"
            :show-grid="showRadarGrid"
            :scope-mode="effectiveScopeMode"
            :control-mode="controlMode"
            :mig29-radar-mode="mig29RadarMode"
            :mig29-zone-position="mig29ZonePosition"
            :mig29-range-tick-km="mig29RangeTickKm"
            @update-cursor="updateCursorFromAbsolute"
            @update-beam-visibility="updateRadarBeamVisibility"
            @update-grid-visibility="updateRadarGridVisibility"
          />
        </template>
      </SimulationLayout>
    </main>
  </div>
</template>

<style scoped>
.app-shell {
  height: 100vh;
  padding: 12px;
  display: grid;
  grid-template-rows: auto 1fr;
  gap: 10px;
}

.control-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}

.meta h1 {
  margin: 0;
  font-size: 18px;
  letter-spacing: 0.04em;
  color: #e8f2fd;
}

.meta p {
  margin: 4px 0 0;
  color: rgba(193, 216, 238, 0.76);
  font-size: 13px;
}

.actions button {
  border: 1px solid rgba(145, 201, 246, 0.4);
  background: rgba(29, 51, 73, 0.8);
  color: #e9f4ff;
  padding: 6px 10px;
  border-radius: 6px;
  cursor: pointer;
}

.sim-stage {
  min-height: 0;
}

.scene-with-widget {
  width: 100%;
  height: 100%;
  display: flex;
  min-height: 0;
}

.scene-with-widget :deep(.scene-shell) {
  flex: 1;
  min-width: 0;
}

.sim-stage :deep(.scope-canvas) {
  border-radius: 8px;
}

@media (max-width: 980px) {
  .app-shell {
    grid-template-rows: auto auto;
    height: auto;
    min-height: 100vh;
  }

  .control-bar {
    flex-direction: column;
    align-items: flex-start;
  }

  .scene-with-widget {
    flex-direction: column;
  }
}
</style>
