<script setup lang="ts">
import { computed } from 'vue';
import { ref } from 'vue';
import type { RadarParams } from '../../core/types';

const props = defineProps<{
  params: RadarParams;
}>();

const emit = defineEmits<{
  update: [payload: Partial<RadarParams>];
}>();

type RadarProfileId = 'mig29-9-12' | 'circular-surveillance';

interface RadarProfilePreset {
  id: RadarProfileId;
  name: string;
  params: Partial<RadarParams>;
}

const radarProfiles: RadarProfilePreset[] = [
  {
    id: 'mig29-9-12',
    name: 'MiG-29 9-12',
    params: {
      fovDeg: 3.5,
      beamElevationDeg: 3.5,
      scanLinesCount: 4,
      azimuthScanSpanDeg: 50,
      elevationFovDeg: 11,
      autoBeamElevationByScanLines: false,
    },
  },
  {
    id: 'circular-surveillance',
    name: 'Radar Circular Surveillance',
    params: {
      azimuthScanSpanDeg: 360,
      elevationFovDeg: 60,
      fovDeg: 3.5,
      beamElevationDeg: 3.5,
      scanLinesCount: 1,
      autoBeamElevationByScanLines: true,
    },
  },
];

const selectedProfileId = ref<RadarProfileId>('mig29-9-12');

function emitNumericUpdate<K extends keyof RadarParams>(key: K, raw: string): void {
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    return;
  }

  emit('update', { [key]: value } as Partial<RadarParams>);
}

function emitRangeKmUpdate(raw: string): void {
  const valueKm = Number(raw);
  if (!Number.isFinite(valueKm)) {
    return;
  }

  emit('update', { maxRangeMeters: valueKm * 1000 });
}

function applySelectedProfile(): void {
  const profile = radarProfiles.find((item) => item.id === selectedProfileId.value);
  if (!profile) {
    return;
  }

  emit('update', profile.params);
}

const effectiveBeamElevationDeg = computed(() => {
  const lines = Math.max(1, Math.round(props.params.scanLinesCount));
  const zoneElevation = Math.max(5, Math.min(90, props.params.elevationFovDeg));

  if (lines === 1) {
    return zoneElevation;
  }

  if (props.params.autoBeamElevationByScanLines) {
    return Math.max(1, Math.min(45, zoneElevation / lines));
  }

  return Math.max(1, Math.min(45, props.params.beamElevationDeg));
});
</script>

<template>
  <section class="radar-params">
    <div class="param-group">
      <h3>Profiles</h3>

      <div class="param-item">
        <label for="profile-select">Preset profile</label>
        <div class="control-row profile-row">
          <select id="profile-select" v-model="selectedProfileId">
            <option v-for="profile in radarProfiles" :key="profile.id" :value="profile.id">
              {{ profile.name }}
            </option>
          </select>
          <button type="button" class="apply-button" @click="applySelectedProfile">Apply</button>
        </div>
      </div>
    </div>

    <div class="param-group">
      <h3>Radar Positioning</h3>

      <div class="param-item">
        <label for="radar-alt">Radar altitude (m)</label>
        <div class="control-row">
          <input
            id="radar-alt"
            type="range"
            min="-500"
            max="25000"
            step="100"
            :value="props.params.radarAltitudeMeters"
            @input="emitNumericUpdate('radarAltitudeMeters', ($event.target as HTMLInputElement).value)"
          />
          <input
            type="number"
            min="-500"
            max="25000"
            step="100"
            :value="props.params.radarAltitudeMeters"
            @change="emitNumericUpdate('radarAltitudeMeters', ($event.target as HTMLInputElement).value)"
          />
        </div>
      </div>

      <div class="param-item">
        <label for="radar-az">Radar azimuth (deg)</label>
        <div class="control-row">
          <input
            id="radar-az"
            type="range"
            min="-180"
            max="180"
            step="1"
            :value="props.params.radarAzimuthDeg"
            @input="emitNumericUpdate('radarAzimuthDeg', ($event.target as HTMLInputElement).value)"
          />
          <input
            type="number"
            min="-180"
            max="180"
            step="0.1"
            :value="props.params.radarAzimuthDeg"
            @change="emitNumericUpdate('radarAzimuthDeg', ($event.target as HTMLInputElement).value)"
          />
        </div>
      </div>
    </div>

    <div class="param-group">
      <h3>Beam Settings</h3>

      <div class="param-item">
        <label for="fov-az">Beam azimuth size (deg)</label>
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
            step="0.1"
            :value="props.params.fovDeg"
            @change="emitNumericUpdate('fovDeg', ($event.target as HTMLInputElement).value)"
          />
        </div>
      </div>

      <div class="param-item">
        <label for="beam-el">Beam elevation size (deg)</label>
        <div class="control-row">
          <input
            id="beam-el"
            type="range"
            min="1"
            max="45"
            step="1"
            :value="props.params.beamElevationDeg"
            @input="emitNumericUpdate('beamElevationDeg', ($event.target as HTMLInputElement).value)"
            :disabled="props.params.autoBeamElevationByScanLines"
          />
          <input
            type="number"
            min="1"
            max="45"
            step="0.1"
            :value="props.params.beamElevationDeg"
            @change="emitNumericUpdate('beamElevationDeg', ($event.target as HTMLInputElement).value)"
            :disabled="props.params.autoBeamElevationByScanLines"
          />
        </div>
        <p v-if="props.params.autoBeamElevationByScanLines" class="hint-text">
          Auto vertical coverage: {{ effectiveBeamElevationDeg.toFixed(2) }} deg
        </p>
      </div>

      <div class="param-item">
        <label for="scan-lines">Scan lines count</label>
        <div class="control-row">
          <input
            id="scan-lines"
            type="range"
            min="1"
            max="60"
            step="1"
            :value="props.params.scanLinesCount"
            @input="emitNumericUpdate('scanLinesCount', ($event.target as HTMLInputElement).value)"
          />
          <input
            type="number"
            min="1"
            max="60"
            step="1"
            :value="props.params.scanLinesCount"
            @change="emitNumericUpdate('scanLinesCount', ($event.target as HTMLInputElement).value)"
          />
        </div>
      </div>

      <div class="param-item checkbox-item">
        <label class="checkbox-label">
          <input
            type="checkbox"
            :checked="props.params.autoBeamElevationByScanLines"
            @change="emit('update', { autoBeamElevationByScanLines: ($event.target as HTMLInputElement).checked })"
          />
          Auto vertical beam coverage by lines
        </label>
      </div>

      <div class="param-item">
        <label for="scan-speed">Scan speed (deg/s)</label>
        <div class="control-row">
          <input
            id="scan-speed"
            type="range"
            min="20"
            max="360"
            step="1"
            :value="props.params.scanSpeedDegPerSec"
            @input="emitNumericUpdate('scanSpeedDegPerSec', ($event.target as HTMLInputElement).value)"
          />
          <input
            type="number"
            min="20"
            max="360"
            step="0.1"
            :value="props.params.scanSpeedDegPerSec"
            @change="emitNumericUpdate('scanSpeedDegPerSec', ($event.target as HTMLInputElement).value)"
          />
        </div>
      </div>
    </div>

    <div class="param-group">
      <h3>Scan Zone Settings</h3>

      <div class="param-item">
        <label for="scan-span">Zone azimuth span (deg)</label>
        <div class="control-row">
          <input
            id="scan-span"
            type="range"
            min="10"
            max="360"
            step="1"
            :value="props.params.azimuthScanSpanDeg"
            @input="emitNumericUpdate('azimuthScanSpanDeg', ($event.target as HTMLInputElement).value)"
          />
          <input
            type="number"
            min="10"
            max="360"
            step="0.1"
            :value="props.params.azimuthScanSpanDeg"
            @change="emitNumericUpdate('azimuthScanSpanDeg', ($event.target as HTMLInputElement).value)"
          />
        </div>
      </div>

      <div class="param-item">
        <label for="zone-el">Zone elevation span (deg)</label>
        <div class="control-row">
          <input
            id="zone-el"
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
            step="0.1"
            :value="props.params.elevationFovDeg"
            @change="emitNumericUpdate('elevationFovDeg', ($event.target as HTMLInputElement).value)"
          />
        </div>
      </div>
    </div>

    <div class="param-group">
      <h3>Operator Control</h3>

      <div class="param-item">
        <label for="max-range">Range (km)</label>
        <div class="control-row">
          <input
            id="max-range"
            type="range"
            min="20"
            max="200"
            step="1"
            :value="props.params.maxRangeMeters / 1000"
            @input="emitRangeKmUpdate(($event.target as HTMLInputElement).value)"
          />
          <input
            type="number"
            min="20"
            max="200"
            step="0.1"
            :value="props.params.maxRangeMeters / 1000"
            @change="emitRangeKmUpdate(($event.target as HTMLInputElement).value)"
          />
        </div>
      </div>

      <div class="param-item">
        <label for="antenna-tilt">Antenna tilt (deg)</label>
        <div class="control-row">
          <input
            id="antenna-tilt"
            type="range"
            min="-60"
            max="60"
            step="1"
            :value="props.params.antennaTiltDeg"
            @input="emitNumericUpdate('antennaTiltDeg', ($event.target as HTMLInputElement).value)"
          />
          <input
            type="number"
            min="-60"
            max="60"
            step="0.1"
            :value="props.params.antennaTiltDeg"
            @change="emitNumericUpdate('antennaTiltDeg', ($event.target as HTMLInputElement).value)"
          />
        </div>
      </div>

      <div class="param-item">
        <label for="zone-az-offset">Zone azimuth offset (deg)</label>
        <div class="control-row">
          <input
            id="zone-az-offset"
            type="range"
            min="-180"
            max="180"
            step="1"
            :value="props.params.zoneAzimuthOffsetDeg"
            @input="emitNumericUpdate('zoneAzimuthOffsetDeg', ($event.target as HTMLInputElement).value)"
          />
          <input
            type="number"
            min="-180"
            max="180"
            step="0.1"
            :value="props.params.zoneAzimuthOffsetDeg"
            @change="emitNumericUpdate('zoneAzimuthOffsetDeg', ($event.target as HTMLInputElement).value)"
          />
        </div>
      </div>

      <div class="param-item">
        <label for="cursor-width">Cursor width (m)</label>
        <div class="control-row">
          <input
            id="cursor-width"
            type="range"
            min="500"
            max="20000"
            step="100"
            :value="props.params.cursorWidthMeters"
            @input="emitNumericUpdate('cursorWidthMeters', ($event.target as HTMLInputElement).value)"
          />
          <input
            type="number"
            min="500"
            max="20000"
            step="1"
            :value="props.params.cursorWidthMeters"
            @change="emitNumericUpdate('cursorWidthMeters', ($event.target as HTMLInputElement).value)"
          />
        </div>
      </div>

      <div class="param-item">
        <label for="cursor-length">Cursor length (m)</label>
        <div class="control-row">
          <input
            id="cursor-length"
            type="range"
            min="500"
            max="20000"
            step="100"
            :value="props.params.cursorLengthMeters"
            @input="emitNumericUpdate('cursorLengthMeters', ($event.target as HTMLInputElement).value)"
          />
          <input
            type="number"
            min="500"
            max="20000"
            step="1"
            :value="props.params.cursorLengthMeters"
            @change="emitNumericUpdate('cursorLengthMeters', ($event.target as HTMLInputElement).value)"
          />
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.radar-params {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
  height: 100%;
  overflow-y: auto;
  box-sizing: border-box;
  padding: 8px;
}

.param-group {
  border: 1px solid rgba(119, 163, 196, 0.28);
  background: rgba(8, 19, 29, 0.72);
  border-radius: 8px;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.param-group h3 {
  margin: 0;
  color: #d5e9ff;
  font-size: 11px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.param-item {
  border: 1px solid rgba(119, 163, 196, 0.22);
  background: rgba(5, 14, 23, 0.62);
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

.checkbox-item {
  gap: 0;
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
}

.hint-text {
  margin: 2px 0 0;
  color: rgba(193, 216, 238, 0.78);
  font-size: 11px;
}

.profile-row {
  align-items: stretch;
}

select {
  flex: 1;
  border: 1px solid rgba(145, 183, 212, 0.4);
  background: rgba(6, 14, 23, 0.86);
  color: #d8ebff;
  border-radius: 6px;
  padding: 4px 6px;
}

.apply-button {
  border: 1px solid rgba(145, 201, 246, 0.4);
  background: rgba(29, 51, 73, 0.8);
  color: #e9f4ff;
  border-radius: 6px;
  padding: 4px 10px;
  cursor: pointer;
}

@media (max-width: 1280px) {
  .radar-params {
    width: 100%;
  }
}

@media (max-width: 980px) {
  .radar-params {
    width: 100%;
    max-height: 220px;
  }
}
</style>
