<script setup lang="ts">
import { onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import type { RadarCursorState, RadarParams, Target } from '../../core/types';
import { ThreeSceneRenderer } from '../../renderers/three/ThreeSceneRenderer';

const props = defineProps<{
  targets: Target[];
  sweepAngleRad: number;
  sweepElevationRad: number;
  params: RadarParams;
  cursor: RadarCursorState | null;
}>();

const emit = defineEmits<{
  addFromScene: [payload: { x: number; z: number }];
}>();

const hostRef = ref<HTMLDivElement | null>(null);
let renderer: ThreeSceneRenderer | null = null;
let rafId: number | null = null;

const displaySettings = reactive({
  showFullRegion: true,
  showFullRegionVerticalFaces: true,
  showActiveSector: true,
  showActiveSectorVerticalFaces: true,
});

function onResize(): void {
  renderer?.resize();
}

function centerCamera(): void {
  renderer?.resetCameraToDefault();
}

onMounted(() => {
  if (!hostRef.value) {
    return;
  }

  renderer = new ThreeSceneRenderer(hostRef.value, {
    onAddTargetFromGroundPoint: (x, z) => emit('addFromScene', { x, z }),
  });
  renderer.syncTargets(props.targets);
  renderer.setDisplaySettings(displaySettings);
  renderer.updateScanCone(props.sweepAngleRad, props.sweepElevationRad, props.params);
  renderer.updateCursor(props.cursor, props.params);

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

    <section class="display-panel">
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

      <button type="button" class="center-button" @click="centerCamera">Center Camera</button>
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

.display-panel {
  position: absolute;
  left: 10px;
  bottom: 10px;
  min-width: 220px;
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
