import { defineStore } from 'pinia';
import { ref } from 'vue';
import { clamp } from '../core/math';
import type { Detection, RadarParams } from '../core/types';

const defaultRadarParams: RadarParams = {
  maxRangeMeters: 120000,
  fovDeg: 8,
  elevationFovDeg: 40,
  scanSpeedDegPerSec: 120,
  azimuthScanSpanDeg: 360,
  scanPattern: 'auto',
};

export const useRadarStore = defineStore('radar', () => {
  const params = ref<RadarParams>({ ...defaultRadarParams });
  const sweepAngleRad = ref(0);
  const sweepElevationRad = ref(0);
  const detections = ref<Detection[]>([]);
  const simTimeSec = ref(0);

  function updateParams(nextParams: Partial<RadarParams>): void {
    const merged: RadarParams = {
      ...params.value,
      ...nextParams,
    };

    params.value = {
      maxRangeMeters: clamp(merged.maxRangeMeters, 20000, 200000),
      fovDeg: clamp(merged.fovDeg, 1, 40),
      elevationFovDeg: clamp(merged.elevationFovDeg, 5, 90),
      scanSpeedDegPerSec: clamp(merged.scanSpeedDegPerSec, 20, 360),
      azimuthScanSpanDeg: clamp(merged.azimuthScanSpanDeg, 10, 360),
      scanPattern: merged.scanPattern === 'raster' ? 'raster' : 'auto',
    };
  }

  function commitFrame(payload: {
    sweepAngleRad: number;
    sweepElevationRad: number;
    detections: Detection[];
    simTimeSec: number;
  }): void {
    sweepAngleRad.value = payload.sweepAngleRad;
    sweepElevationRad.value = payload.sweepElevationRad;
    detections.value = payload.detections;
    simTimeSec.value = payload.simTimeSec;
  }

  return {
    params,
    sweepAngleRad,
    sweepElevationRad,
    detections,
    simTimeSec,
    updateParams,
    commitFrame,
  };
});
