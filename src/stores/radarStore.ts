import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { Detection, RadarParams } from '../core/types';

const defaultRadarParams: RadarParams = {
  maxRangeMeters: 120000,
  fovDeg: 8,
  elevationFovDeg: 40,
  scanSpeedDegPerSec: 120,
};

export const useRadarStore = defineStore('radar', () => {
  const params = ref<RadarParams>({ ...defaultRadarParams });
  const sweepAngleRad = ref(0);
  const detections = ref<Detection[]>([]);
  const simTimeSec = ref(0);

  function updateParams(nextParams: Partial<RadarParams>): void {
    params.value = {
      ...params.value,
      ...nextParams,
    };
  }

  function commitFrame(payload: {
    sweepAngleRad: number;
    detections: Detection[];
    simTimeSec: number;
  }): void {
    sweepAngleRad.value = payload.sweepAngleRad;
    detections.value = payload.detections;
    simTimeSec.value = payload.simTimeSec;
  }

  return {
    params,
    sweepAngleRad,
    detections,
    simTimeSec,
    updateParams,
    commitFrame,
  };
});
