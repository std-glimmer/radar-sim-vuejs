<script setup lang="ts">
import { computed } from 'vue';
import { ref } from 'vue';
import type {
  Mig29RadarMode,
  Mig29ZonePosition,
  RadarControlMode,
  RadarParams,
  RadarScopeMode,
} from '../../core/types';

const props = defineProps<{
  params: RadarParams;
  scopeMode: RadarScopeMode;
  controlMode: RadarControlMode;
  mig29RadarMode: Mig29RadarMode;
  mig29DeltaH: number;
  mig29ZonePosition: Mig29ZonePosition;
}>();

const emit = defineEmits<{
  update: [payload: Partial<RadarParams>];
  updateScopeMode: [payload: RadarScopeMode];
  updateControlMode: [payload: RadarControlMode];
  updateMig29RadarMode: [payload: Mig29RadarMode];
  updateMig29DeltaH: [payload: number];
  updateMig29ZonePosition: [payload: Mig29ZonePosition];
}>();

const mig29DeltaHOptions = [-6, -4, -2, -1, 0, 1, 2, 4, 6, 8, 10];
const mig29RadarModeOptions: Array<{ value: Mig29RadarMode; label: string }> = [
  { value: 'auto', label: 'Авт.' },
  { value: 'v', label: 'В' },
  { value: 'd', label: 'Д' },
];
const mig29ZonePositions: Mig29ZonePosition[] = ['left', 'center', 'right'];

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
      scanSpeedDegPerSec: 50,
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

const mig29ZoneIndex = computed(() => Math.max(0, mig29ZonePositions.indexOf(props.mig29ZonePosition)));

const headingDialDeg = computed(() => {
  const heading = normalizeHeadingDeg(props.params.radarAzimuthDeg);
  return heading;
});

function normalizeHeadingDeg(rawDeg: number): number {
  let heading = rawDeg % 360;
  if (heading < 0) {
    heading += 360;
  }
  return heading;
}

function getRotaryOptionStyle(index: number, total: number): { transform: string } {
  const startDeg = -120;
  const spanDeg = 240;
  const stepDeg = total > 1 ? spanDeg / (total - 1) : 0;
  const angle = startDeg + stepDeg * index;
  const radius = 42;
  return {
    transform: `translate(-50%, -50%) rotate(${angle}deg) translate(${radius}px) rotate(${-angle}deg)`,
  };
}

function getDeltaHOptionStyle(value: number): { transform: string } {
  const positiveOrder = [0, 1, 2, 4, 6, 8, 10];
  const negativeOrder = [0, -1, -2, -4, -6];
  let angle = 180;

  if (value >= 0) {
    const index = Math.max(0, positiveOrder.indexOf(value));
    const step = 180 / Math.max(1, positiveOrder.length - 1);
    angle = 180 + index * step;
  } else {
    const index = Math.max(0, negativeOrder.indexOf(value));
    const step = 120 / Math.max(1, negativeOrder.length - 1);
    angle = 180 - index * step;
  }

  const radius = 42;
  return {
    transform: `translate(-50%, -50%) rotate(${angle}deg) translate(${radius}px) rotate(${-angle}deg)`,
  };
}

function updateZoneByIndex(index: number): void {
  const clampedIndex = Math.max(0, Math.min(2, index));
  emit('updateMig29ZonePosition', mig29ZonePositions[clampedIndex]);
}

function updateAltitudeDial(raw: string): void {
  emitNumericUpdate('radarAltitudeMeters', raw);
}

function updateHeadingDial(raw: string): void {
  emitNumericUpdate('radarAzimuthDeg', raw);
}
</script>

<template>
  <section class="radar-params">
    <div class="param-group">
      <h3>Radar Mode</h3>

      <div class="param-item">
        <label for="control-mode">Configuration mode</label>
        <div class="control-row profile-row">
          <select
            id="control-mode"
            :value="props.controlMode"
            @change="emit('updateControlMode', ($event.target as HTMLSelectElement).value as RadarControlMode)"
          >
            <option value="mig29">MiG-29</option>
            <option value="manual">Manual setup</option>
          </select>
        </div>
      </div>
    </div>

    <template v-if="props.controlMode === 'mig29'">
      <div class="param-group">
        <h3>MiG-29 Radar Controls</h3>

        <div class="mig29-top-grid">
          <div class="param-item">
            <label>Radar mode</label>
            <div class="rotary-shell">
              <div class="rotary-dial">
                <button
                  v-for="(mode, index) in mig29RadarModeOptions"
                  :key="mode.value"
                  type="button"
                  class="rotary-option"
                  :class="{ active: props.mig29RadarMode === mode.value }"
                  :style="getRotaryOptionStyle(index, mig29RadarModeOptions.length)"
                  @click="emit('updateMig29RadarMode', mode.value)"
                >
                  {{ mode.label }}
                </button>
                <span class="rotary-cap" aria-hidden="true"></span>
              </div>
            </div>
          </div>

          <div class="param-item">
            <label>Delta H</label>
            <div class="rotary-shell">
              <div class="rotary-dial delta-dial">
                <button
                  v-for="value in mig29DeltaHOptions"
                  :key="value"
                  type="button"
                  class="rotary-option delta-option"
                  :class="{ active: props.mig29DeltaH === value }"
                  :style="getDeltaHOptionStyle(value)"
                  @click="emit('updateMig29DeltaH', value)"
                >
                  {{ value }}
                </button>
                <span class="rotary-cap" aria-hidden="true"></span>
              </div>
              <div class="rotary-readout">Selected: {{ props.mig29DeltaH }}</div>
            </div>
          </div>

          <div class="param-item">
            <label>Zone</label>
            <div class="zone-toggle" role="group" aria-label="Zone selector">
              <span
                class="zone-thumb"
                :style="{ transform: `translateX(${mig29ZoneIndex * 100}%)` }"
                aria-hidden="true"
              ></span>
              <button
                v-for="(zone, index) in mig29ZonePositions"
                :key="zone"
                type="button"
                class="zone-button"
                :class="{ active: props.mig29ZonePosition === zone }"
                @click="updateZoneByIndex(index)"
              >
                {{ zone === 'left' ? 'L' : zone === 'center' ? 'C' : 'R' }}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div class="param-group">
        <h3>Aircraft Position Setters</h3>

        <div class="mig29-bottom-grid">
          <div class="param-item">
            <label>Flight heading setter</label>
            <div class="instrument-shell">
              <div class="instrument-dial compass-dial">
                <div class="instrument-pointer compass-pointer" :style="{ transform: `translate(-50%, -100%) rotate(${headingDialDeg}deg)` }"></div>
                <div class="instrument-center"></div>
                <div class="instrument-mark n">N</div>
                <div class="instrument-mark e">E</div>
                <div class="instrument-mark s">S</div>
                <div class="instrument-mark w">W</div>
              </div>
              <div class="instrument-readout">{{ normalizeHeadingDeg(props.params.radarAzimuthDeg).toFixed(1) }} deg</div>
              <input
                type="range"
                min="-180"
                max="180"
                step="1"
                :value="props.params.radarAzimuthDeg"
                @input="updateHeadingDial(($event.target as HTMLInputElement).value)"
              />
            </div>
          </div>

          <div class="param-item altitude-slider-item">
            <label>Flight altitude setter</label>
            <div class="vertical-altitude-shell">
              <div class="altitude-slider-readout">{{ Math.round(props.params.radarAltitudeMeters) }} m</div>
              <input
                class="vertical-altitude-slider"
                type="range"
                min="0"
                max="20000"
                step="100"
                :value="Math.max(0, Math.min(20000, props.params.radarAltitudeMeters))"
                @input="updateAltitudeDial(($event.target as HTMLInputElement).value)"
              />
            </div>
          </div>
        </div>
      </div>
    </template>

    <template v-else>
    <div class="param-group">
      <h3>Radar Scope</h3>

      <div class="param-item">
        <label for="scope-mode">Display mode</label>
        <div class="control-row profile-row">
          <select
            id="scope-mode"
            :value="props.scopeMode"
            @change="emit('updateScopeMode', ($event.target as HTMLSelectElement).value as RadarScopeMode)"
          >
            <option value="ppi">PPI (radial)</option>
            <option value="b-scope">B-Scope (rectangular)</option>
          </select>
        </div>
      </div>
    </div>

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
    </template>
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

.toggle-row {
  display: flex;
  gap: 6px;
}

.mig29-top-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}

.mig29-bottom-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
  align-items: center;
}

.rotary-shell {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}

.rotary-dial {
  position: relative;
  width: 124px;
  height: 124px;
  border-radius: 50%;
  background: radial-gradient(circle at 35% 30%, #2c3f52 0%, #172532 48%, #0c1520 100%);
  border: 1px solid rgba(154, 186, 212, 0.42);
  box-shadow: inset 0 0 12px rgba(5, 14, 22, 0.85);
}

.rotary-option {
  position: absolute;
  left: 50%;
  top: 50%;
  min-width: 34px;
  border: 1px solid rgba(145, 183, 212, 0.55);
  background: rgba(10, 24, 37, 0.92);
  color: #d8ebff;
  border-radius: 999px;
  font-size: 10px;
  padding: 2px 6px;
  cursor: pointer;
}

.rotary-option.active {
  border-color: rgba(143, 245, 180, 0.85);
  color: #ddffe9;
  background: rgba(19, 53, 37, 0.95);
}

.delta-option {
  min-width: 30px;
  font-size: 9px;
  padding: 2px 5px;
}

.rotary-cap {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  transform: translate(-50%, -50%);
  background: radial-gradient(circle at 40% 30%, #cad9e8 0%, #6f8194 55%, #344150 100%);
  border: 1px solid rgba(196, 218, 238, 0.4);
}

.rotary-readout {
  font-size: 11px;
  color: #d1e7fa;
}

.zone-toggle {
  position: relative;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0;
  border: 1px solid rgba(145, 183, 212, 0.4);
  border-radius: 999px;
  background: rgba(7, 17, 27, 0.9);
  overflow: hidden;
}

.zone-thumb {
  position: absolute;
  top: 2px;
  left: 2px;
  width: calc((100% - 4px) / 3);
  height: calc(100% - 4px);
  border-radius: 999px;
  background: linear-gradient(180deg, rgba(118, 234, 172, 0.82), rgba(31, 113, 70, 0.92));
  transition: transform 180ms ease;
}

.zone-button {
  flex: 1;
  border: none;
  background: transparent;
  color: #d8ebff;
  border-radius: 0;
  padding: 5px 6px;
  cursor: pointer;
  z-index: 1;
}

.zone-button.active {
  color: #072015;
  font-weight: 700;
}

.instrument-shell {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}

.instrument-dial {
  position: relative;
  width: 124px;
  height: 124px;
  border-radius: 50%;
  border: 1px solid rgba(145, 183, 212, 0.44);
  background: radial-gradient(circle at 50% 46%, #12212f 0%, #0a131d 62%, #070d15 100%);
}

.compass-dial {
  border-color: rgba(153, 190, 216, 0.5);
}

.instrument-pointer {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 3px;
  height: 44px;
  transform-origin: 50% 100%;
  background: linear-gradient(180deg, #9ff8c6 0%, #2a9a66 100%);
  border-radius: 2px;
}

.compass-pointer {
  background: linear-gradient(180deg, #8dd8ff 0%, #2d6fc3 100%);
}

.instrument-center {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  transform: translate(-50%, -50%);
  background: #d8e7f7;
}

.instrument-mark {
  position: absolute;
  color: #d5e9ff;
  font-size: 10px;
}

.instrument-mark.n {
  left: 50%;
  top: 8px;
  transform: translateX(-50%);
}

.instrument-mark.e {
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
}

.instrument-mark.s {
  left: 50%;
  bottom: 8px;
  transform: translateX(-50%);
}

.instrument-mark.w {
  left: 8px;
  top: 50%;
  transform: translateY(-50%);
}

.instrument-readout {
  font-size: 11px;
  color: #d1e7fa;
}

.altitude-slider-item {
  justify-self: end;
}

.vertical-altitude-shell {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.altitude-slider-readout {
  font-size: 11px;
  color: #d1e7fa;
  min-width: 76px;
  text-align: center;
}

.vertical-altitude-slider {
  writing-mode: vertical-lr;
  direction: rtl;
  width: 28px;
  height: 132px;
  accent-color: #7adfb0;
  cursor: ns-resize;
}

@media (max-width: 980px) {
  .mig29-top-grid,
  .mig29-bottom-grid {
    grid-template-columns: 1fr;
  }
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
