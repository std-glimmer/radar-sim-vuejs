<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { onBeforeUnmount, onMounted } from 'vue';
import RadarParamsControls from './components/controls/RadarParamsControls.vue';
import TargetForm from './components/controls/TargetForm.vue';
import SimulationLayout from './components/layout/SimulationLayout.vue';
import RadarScopePanel from './components/panels/RadarScopePanel.vue';
import Scene3DPanel from './components/panels/Scene3DPanel.vue';
import SideProjectionPanel from './components/panels/SideProjectionPanel.vue';
import { SimulationRuntime } from './core/simulationRuntime';
import type { NewTargetInput, RadarParams } from './core/types';
import { useRadarStore } from './stores/radarStore';
import { useSimStore } from './stores/simStore';
import { useTargetsStore } from './stores/targetsStore';

const radarStore = useRadarStore();
const simStore = useSimStore();
const targetsStore = useTargetsStore();

const { params, detections, sweepAngleRad, sweepElevationRad, simTimeSec } = storeToRefs(radarStore);
const { targets, count } = storeToRefs(targetsStore);
const { isRunning } = storeToRefs(simStore);

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
    velocity: {
      x: 0,
      y: 0,
      z: -180,
    },
  });
}

function removeTarget(targetId: string): void {
  targetsStore.removeTarget(targetId);
}

function toggleRunState(): void {
  simStore.setRunning(!isRunning.value);
}

function updateRadarParams(nextParams: Partial<RadarParams>): void {
  radarStore.updateParams(nextParams);
}

onMounted(() => {
  addTarget({
    position: { x: -28000, y: 3200, z: 76000 },
    velocity: { x: 60, y: 0, z: -200 },
  });
  addTarget({
    position: { x: 15000, y: 9000, z: 42000 },
    velocity: { x: -20, y: -8, z: -130 },
  });
  addTarget({
    position: { x: 48000, y: 2500, z: 102000 },
    velocity: { x: -75, y: 1, z: -230 },
  });

  runtime.start();
});

onBeforeUnmount(() => {
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

    <TargetForm @submit="addTarget" />

    <section class="targets-panel">
      <div v-for="target in targets" :key="target.id" class="target-item">
        <span>{{ target.id }} · x {{ target.position.x.toFixed(0) }} · y {{ target.position.y.toFixed(0) }} · z {{ target.position.z.toFixed(0) }}</span>
        <button type="button" @click="removeTarget(target.id)">Remove</button>
      </div>
    </section>

    <main class="sim-stage">
      <SimulationLayout>
        <template #scene>
          <Scene3DPanel
            :targets="targets"
            :sweep-angle-rad="sweepAngleRad"
            :sweep-elevation-rad="sweepElevationRad"
            :params="params"
            @add-from-scene="addTargetFromScene"
          />
        </template>

        <template #controls>
          <RadarParamsControls :params="params" @update="updateRadarParams" />
        </template>

        <template #side>
          <SideProjectionPanel
            :detections="detections"
            :params="params"
            :sweep-elevation-rad="sweepElevationRad"
          />
        </template>

        <template #radar>
          <RadarScopePanel :detections="detections" :params="params" :sweep-angle-rad="sweepAngleRad" />
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
  grid-template-rows: auto auto auto 1fr;
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

.actions button,
.targets-panel button {
  border: 1px solid rgba(145, 201, 246, 0.4);
  background: rgba(29, 51, 73, 0.8);
  color: #e9f4ff;
  padding: 6px 10px;
  border-radius: 6px;
  cursor: pointer;
}

.targets-panel {
  display: flex;
  gap: 8px;
  overflow-x: auto;
}

.target-item {
  border: 1px solid rgba(132, 157, 178, 0.3);
  background: rgba(8, 20, 32, 0.72);
  border-radius: 6px;
  padding: 6px 8px;
  display: flex;
  align-items: center;
  gap: 8px;
  color: #d6e8fa;
  font-size: 12px;
  white-space: nowrap;
}

.sim-stage {
  min-height: 0;
}

.sim-stage :deep(.scope-canvas) {
  border-radius: 8px;
}

@media (max-width: 980px) {
  .app-shell {
    grid-template-rows: auto auto auto auto;
    height: auto;
    min-height: 100vh;
  }

  .control-bar {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
