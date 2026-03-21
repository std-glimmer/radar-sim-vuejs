import { defineStore } from 'pinia';
import { ref } from 'vue';
import { clamp } from '../core/math';
import type { Detection, RadarParams } from '../core/types';

const defaultRadarParams: RadarParams = {
  maxRangeMeters: 120000,
  radarAltitudeMeters: 5000,
  radarAzimuthDeg: 0,
  fovDeg: 8,
  beamElevationDeg: 6,
  scanLinesCount: 8,
  autoBeamElevationByScanLines: true,
  elevationFovDeg: 40,
  scanSpeedDegPerSec: 120,
  azimuthScanSpanDeg: 360,
  antennaTiltDeg: 0,
  zoneAzimuthOffsetDeg: 0,
  cursorWidthMeters: 13500,
  cursorLengthMeters: 9000,
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
      radarAltitudeMeters: clamp(merged.radarAltitudeMeters, -500, 25000),
      radarAzimuthDeg: clamp(merged.radarAzimuthDeg, -180, 180),
      fovDeg: clamp(merged.fovDeg, 1, 40),
      beamElevationDeg: clamp(merged.beamElevationDeg, 1, 45),
      scanLinesCount: Math.round(clamp(merged.scanLinesCount, 1, 60)),
      autoBeamElevationByScanLines: Boolean(merged.autoBeamElevationByScanLines),
      elevationFovDeg: clamp(merged.elevationFovDeg, 5, 90),
      scanSpeedDegPerSec: clamp(merged.scanSpeedDegPerSec, 20, 360),
      azimuthScanSpanDeg: clamp(merged.azimuthScanSpanDeg, 10, 360),
      antennaTiltDeg: clamp(merged.antennaTiltDeg, -60, 60),
      zoneAzimuthOffsetDeg: clamp(merged.zoneAzimuthOffsetDeg, -180, 180),
      cursorWidthMeters: clamp(merged.cursorWidthMeters, 500, 20000),
      cursorLengthMeters: clamp(merged.cursorLengthMeters, 500, 20000),
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
