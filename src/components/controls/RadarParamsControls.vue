<script setup lang="ts">
import type { RadarParams } from '../../core/types';

const props = defineProps<{
  params: RadarParams;
}>();

const emit = defineEmits<{
  update: [payload: Partial<RadarParams>];
}>();

function emitNumericUpdate<K extends keyof RadarParams>(key: K, raw: string): void {
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    return;
  }

  emit('update', { [key]: value } as Partial<RadarParams>);
}
</script>

<template>
  <section class="radar-params">
    <div class="param-item">
      <label for="max-range">Range (m)</label>
      <input
        id="max-range"
        type="range"
        min="20000"
        max="200000"
        step="1000"
        :value="props.params.maxRangeMeters"
        @input="emitNumericUpdate('maxRangeMeters', ($event.target as HTMLInputElement).value)"
      />
      <output>{{ props.params.maxRangeMeters.toFixed(0) }}</output>
    </div>

    <div class="param-item">
      <label for="fov-az">Azimuth FOV (deg)</label>
      <input
        id="fov-az"
        type="range"
        min="1"
        max="40"
        step="1"
        :value="props.params.fovDeg"
        @input="emitNumericUpdate('fovDeg', ($event.target as HTMLInputElement).value)"
      />
      <output>{{ props.params.fovDeg.toFixed(0) }}</output>
    </div>

    <div class="param-item">
      <label for="fov-el">Elevation FOV (deg)</label>
      <input
        id="fov-el"
        type="range"
        min="5"
        max="90"
        step="1"
        :value="props.params.elevationFovDeg"
        @input="emitNumericUpdate('elevationFovDeg', ($event.target as HTMLInputElement).value)"
      />
      <output>{{ props.params.elevationFovDeg.toFixed(0) }}</output>
    </div>

    <div class="param-item">
      <label for="scan-speed">Scan speed (deg/s)</label>
      <input
        id="scan-speed"
        type="range"
        min="20"
        max="360"
        step="5"
        :value="props.params.scanSpeedDegPerSec"
        @input="emitNumericUpdate('scanSpeedDegPerSec', ($event.target as HTMLInputElement).value)"
      />
      <output>{{ props.params.scanSpeedDegPerSec.toFixed(0) }}</output>
    </div>
  </section>
</template>

<style scoped>
.radar-params {
  display: grid;
  grid-template-columns: repeat(4, minmax(180px, 1fr));
  gap: 8px;
}

.param-item {
  border: 1px solid rgba(119, 163, 196, 0.25);
  background: rgba(8, 19, 29, 0.72);
  border-radius: 8px;
  padding: 8px;
  display: grid;
  gap: 4px;
}

label {
  color: #c6ddf2;
  font-size: 11px;
}

input[type='range'] {
  width: 100%;
}

output {
  color: #9fe3b8;
  font-size: 12px;
  justify-self: end;
}

@media (max-width: 980px) {
  .radar-params {
    grid-template-columns: repeat(2, minmax(140px, 1fr));
  }
}
</style>
