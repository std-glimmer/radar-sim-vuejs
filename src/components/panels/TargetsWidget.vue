<script setup lang="ts">
import { computed, reactive } from 'vue';
import type { Detection, RadarParams, Target } from '../../core/types';

const props = defineProps<{
  targets: Target[];
  detections: Detection[];
  params: RadarParams;
  hoveredTargetId: string | null;
  inFovTargetIds: string[];
  rangeAzimuthOnlyTargetIds: string[];
  outOfAzimuthInRangeTargetIds: string[];
  outOfRangeTargetIds: string[];
}>();

const emit = defineEmits<{
  addTargetPolar: [payload: { azimuthOffsetDeg: number; rangeKm: number; altitudeKm: number }];
  removeTarget: [targetId: string];
  hoverTarget: [targetId: string | null];
}>();

const form = reactive({
  azimuthOffsetDeg: 0,
  rangeKm: 45,
  altitudeKm: 6,
});

const detectedTargetIds = computed(() => new Set(props.detections.map((detection) => detection.targetId)));

function formatAzimuthDeg(target: Target): string {
  const targetAzimuthDeg = (Math.atan2(target.position.x, target.position.z) * 180) / Math.PI;
  const centerAzimuthDeg = props.params.radarAzimuthDeg + props.params.zoneAzimuthOffsetDeg;
  let azimuthDeg = targetAzimuthDeg - centerAzimuthDeg;
  while (azimuthDeg <= -180) {
    azimuthDeg += 360;
  }
  while (azimuthDeg > 180) {
    azimuthDeg -= 360;
  }
  return `${azimuthDeg >= 0 ? '+' : ''}${azimuthDeg.toFixed(1)}`;
}

function formatRangeKm(target: Target): string {
  return (Math.hypot(target.position.x, target.position.z) / 1000).toFixed(1);
}

function formatAltitudeKm(target: Target): string {
  return (target.position.y / 1000).toFixed(1);
}

function submitTarget(): void {
  emit('addTargetPolar', {
    azimuthOffsetDeg: Number(form.azimuthOffsetDeg),
    rangeKm: Number(form.rangeKm),
    altitudeKm: Number(form.altitudeKm),
  });
}
</script>

<template>
  <aside class="targets-widget">
    <section class="targets-add-panel panel-block">
      <h3>Target</h3>
      <div class="target-grid">
        <label>
          az center deg
          <input v-model.number="form.azimuthOffsetDeg" type="number" />
        </label>
        <label>
          range km
          <input v-model.number="form.rangeKm" type="number" min="0" />
        </label>
        <label>
          altitude km
          <input v-model.number="form.altitudeKm" type="number" />
        </label>
      </div>
      <button type="button" class="compact-button" @click="submitTarget">Add</button>
    </section>

    <section class="targets-list-panel panel-block">
      <h3>Targets {{ props.targets.length }}</h3>
      <div class="targets-list">
        <div
          v-for="target in props.targets"
          :key="target.id"
          class="target-row"
          :class="{
            'is-hovered': props.hoveredTargetId === target.id,
            'is-in-fov': props.inFovTargetIds.includes(target.id),
            'is-range-azimuth-only': props.rangeAzimuthOnlyTargetIds.includes(target.id),
            'is-out-azimuth-in-range': props.outOfAzimuthInRangeTargetIds.includes(target.id),
            'is-out-of-range': props.outOfRangeTargetIds.includes(target.id),
            'is-detected': detectedTargetIds.has(target.id),
          }"
          @mouseenter="emit('hoverTarget', target.id)"
          @mouseleave="emit('hoverTarget', null)"
        >
          <span>{{ target.id }} · az {{ formatAzimuthDeg(target) }} deg · r {{ formatRangeKm(target) }} km · h {{ formatAltitudeKm(target) }} km</span>
          <button type="button" class="compact-button" @click="emit('removeTarget', target.id)">x</button>
        </div>
      </div>
    </section>
  </aside>
</template>

<style scoped>
.targets-widget {
  width: 320px;
  min-width: 280px;
  max-width: 360px;
  height: 100%;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  border-right: 1px solid rgba(151, 188, 215, 0.2);
  background: rgba(7, 15, 24, 0.75);
}

.panel-block {
  border: 1px solid rgba(151, 188, 215, 0.38);
  background: rgba(5, 13, 21, 0.78);
  backdrop-filter: blur(3px);
  border-radius: 8px;
  padding: 8px 10px;
  color: #d5e8fb;
}

.targets-add-panel,
.targets-list-panel {
  font-size: 11px;
}

.targets-list-panel {
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 5px;
  flex: 1;
}

.targets-add-panel h3,
.targets-list-panel h3 {
  margin: 0 0 4px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: #9fc7e6;
}

.target-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 6px;
  margin-bottom: 6px;
}

.target-grid label {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.target-grid input {
  border: 1px solid rgba(180, 212, 236, 0.28);
  background: rgba(8, 17, 27, 0.82);
  color: #e7f4ff;
  border-radius: 5px;
  padding: 3px 5px;
  font-size: 11px;
}

.targets-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  overflow: auto;
}

.target-row {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 6px;
  align-items: center;
  color: #ffd2d2;
  font-size: 10px;
  white-space: nowrap;
  border: 1px solid transparent;
  border-radius: 5px;
  padding: 2px 4px;
}

.target-row.is-out-azimuth-in-range {
  border-color: rgba(113, 220, 147, 0.5);
  background: rgba(24, 78, 41, 0.45);
  color: #c7ffd5;
}

.target-row.is-range-azimuth-only {
  border-color: rgba(233, 214, 130, 0.5);
  background: rgba(96, 79, 29, 0.45);
  color: #ffefb2;
}

.target-row.is-in-fov {
  border-color: rgba(255, 142, 142, 0.6);
  background: rgba(128, 37, 37, 0.5);
  color: #ffd6d6;
}

.target-row.is-out-of-range {
  border-color: rgba(169, 178, 190, 0.45);
  background: rgba(72, 79, 88, 0.45);
  color: #d5dce4;
}

.target-row.is-detected {
  color: #ffffff;
  background: rgba(210, 210, 210, 0.2);
}

.target-row.is-hovered {
  border-color: rgba(255, 210, 180, 0.74);
  background: rgba(116, 58, 42, 0.5);
  color: #ffe4cf;
}

.compact-button {
  border: 1px solid rgba(150, 205, 255, 0.55);
  background: rgba(34, 68, 113, 0.9);
  color: #e8f4ff;
  border-radius: 5px;
  padding: 3px 6px;
  cursor: pointer;
}

@media (max-width: 980px) {
  .targets-widget {
    width: 100%;
    max-width: none;
    height: auto;
    border-right: 0;
    border-bottom: 1px solid rgba(151, 188, 215, 0.2);
  }
}
</style>
