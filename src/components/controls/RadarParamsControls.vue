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
      <div class="control-row">
        <input
          id="max-range"
          type="range"
          min="20000"
          max="200000"
          step="1000"
          :value="props.params.maxRangeMeters"
          @input="emitNumericUpdate('maxRangeMeters', ($event.target as HTMLInputElement).value)"
        />
        <input
          type="number"
          min="20000"
          max="200000"
          step="1000"
          :value="props.params.maxRangeMeters"
          @input="emitNumericUpdate('maxRangeMeters', ($event.target as HTMLInputElement).value)"
        />
      </div>
    </div>

    <div class="param-item">
      <label for="fov-az">Azimuth FOV (deg)</label>
      <div class="control-row">
        <input
          id="fov-az"
          type="range"
          min="1"
          max="40"
          step="1"
          :value="props.params.fovDeg"
          @input="emitNumericUpdate('fovDeg', ($event.target as HTMLInputElement).value)"
        />
        <input
          type="number"
          min="1"
          max="40"
          step="1"
          :value="props.params.fovDeg"
          @input="emitNumericUpdate('fovDeg', ($event.target as HTMLInputElement).value)"
        />
      </div>
    </div>

    <div class="param-item">
      <label for="fov-el">Elevation FOV (deg)</label>
      <div class="control-row">
        <input
          id="fov-el"
          type="range"
          min="5"
          max="90"
          step="1"
          :value="props.params.elevationFovDeg"
          @input="emitNumericUpdate('elevationFovDeg', ($event.target as HTMLInputElement).value)"
        />
        <input
          type="number"
          min="5"
          max="90"
          step="1"
          :value="props.params.elevationFovDeg"
          @input="emitNumericUpdate('elevationFovDeg', ($event.target as HTMLInputElement).value)"
        />
      </div>
    </div>

    <div class="param-item">
      <label for="scan-speed">Scan speed (deg/s)</label>
      <div class="control-row">
        <input
          id="scan-speed"
          type="range"
          min="20"
          max="360"
          step="5"
          :value="props.params.scanSpeedDegPerSec"
          @input="emitNumericUpdate('scanSpeedDegPerSec', ($event.target as HTMLInputElement).value)"
        />
        <input
          type="number"
          min="20"
          max="360"
          step="5"
          :value="props.params.scanSpeedDegPerSec"
          @input="emitNumericUpdate('scanSpeedDegPerSec', ($event.target as HTMLInputElement).value)"
        />
      </div>
    </div>
  </section>
</template>

<style scoped>
.radar-params {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 280px;
  height: 100%;
  overflow-y: auto;
}

.param-item {
  border: 1px solid rgba(119, 163, 196, 0.25);
  background: rgba(8, 19, 29, 0.72);
  border-radius: 8px;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

label {
  color: #c6ddf2;
  font-size: 11px;
}

.control-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

input[type='range'] {
  flex: 1;
}

input[type='number'] {
  width: 92px;
  border: 1px solid rgba(145, 183, 212, 0.4);
  background: rgba(6, 14, 23, 0.86);
  color: #d8ebff;
  border-radius: 6px;
  padding: 4px 6px;
}

@media (max-width: 1280px) {
  .radar-params {
    width: 250px;
  }
}

@media (max-width: 980px) {
  .radar-params {
    width: 100%;
    max-height: 220px;
  }
}
</style>
