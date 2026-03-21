import {
  bearingRad,
  clamp,
  elevationRad,
  groundDistance,
  magnitude,
  normalizeAngleRad,
  shortestAngleDiffRad,
} from './math';
import type { Detection, RadarParams, SimulationFrame, Target } from './types';

function cloneTargets(targets: Target[]): Target[] {
  return targets.map((target) => ({
    id: target.id,
    position: { ...target.position },
    velocity: { ...target.velocity },
  }));
}

export class RadarEngine {
  private simTimeSec = 0;
  private sweepAngleRad = 0;
  private targets: Target[] = [];

  private params: RadarParams;

  constructor(params: RadarParams) {
    this.params = { ...params };
  }

  setParams(params: RadarParams): void {
    this.params = { ...params };
  }

  setTargets(targets: Target[]): void {
    this.targets = cloneTargets(targets);
  }

  step(dtSec: number): SimulationFrame {
    const boundedDt = clamp(dtSec, 0, 0.2);
    this.simTimeSec += boundedDt;
    this.updateSweep(boundedDt);
    this.integrateTargets(boundedDt);

    return {
      simTimeSec: this.simTimeSec,
      sweepAngleRad: this.sweepAngleRad,
      targets: cloneTargets(this.targets),
      detections: this.computeDetections(),
    };
  }

  private updateSweep(dtSec: number): void {
    const scanSpeedRadPerSec = (this.params.scanSpeedDegPerSec * Math.PI) / 180;
    this.sweepAngleRad = normalizeAngleRad(this.sweepAngleRad + scanSpeedRadPerSec * dtSec);
  }

  private integrateTargets(dtSec: number): void {
    for (const target of this.targets) {
      target.position.x += target.velocity.x * dtSec;
      target.position.y += target.velocity.y * dtSec;
      target.position.z += target.velocity.z * dtSec;
    }
  }

  private computeDetections(): Detection[] {
    const detections: Detection[] = [];
    const halfFovRad = ((this.params.fovDeg * Math.PI) / 180) * 0.5;
    const halfElevFovRad = ((this.params.elevationFovDeg * Math.PI) / 180) * 0.5;

    for (const target of this.targets) {
      const distanceMeters = magnitude(target.position);
      if (distanceMeters > this.params.maxRangeMeters) {
        continue;
      }

      const bearing = bearingRad(target.position);
      const elevation = elevationRad(target.position);

      const azimuthDelta = Math.abs(shortestAngleDiffRad(bearing, this.sweepAngleRad));
      const inAzimuth = azimuthDelta <= halfFovRad;
      const inElevation = Math.abs(elevation) <= halfElevFovRad;

      if (!inAzimuth || !inElevation) {
        continue;
      }

      const strength = 1 - distanceMeters / this.params.maxRangeMeters;
      detections.push({
        targetId: target.id,
        distanceMeters,
        groundDistanceMeters: groundDistance(target.position),
        bearingRad: bearing,
        elevationRad: elevation,
        strength: clamp(strength, 0.05, 1),
      });
    }

    return detections;
  }
}
