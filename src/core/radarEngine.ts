import {
  bearingRad,
  clamp,
  elevationRad,
  groundDistance,
  magnitude,
  normalizeAngleRad,
  shortestAngleDiffRad,
} from './math';
import type { Detection, RadarParams, ScanPattern, SimulationFrame, Target } from './types';

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
  private sweepElevationRad = 0;
  private sectorAzimuthRad = 0;
  private azimuthDirection = 1;
  private rasterElevationDirection = -1;
  private sweepMode: 'circular' | 'sector' | 'raster' = 'circular';
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
      sweepElevationRad: this.sweepElevationRad,
      targets: cloneTargets(this.targets),
      detections: this.computeDetections(),
    };
  }

  private updateSweep(dtSec: number): void {
    const scanSpeedRadPerSec = (this.params.scanSpeedDegPerSec * Math.PI) / 180;
    const spanDeg = clamp(this.params.azimuthScanSpanDeg, 1, 360);
    const spanRad = (spanDeg * Math.PI) / 180;
    const halfSpanRad = spanRad * 0.5;
    const halfElevationRad = ((this.params.elevationFovDeg * Math.PI) / 180) * 0.5;
    const resolvedMode = this.resolveSweepMode(spanDeg, this.params.scanPattern);

    if (resolvedMode !== this.sweepMode) {
      this.initializeSweepMode(resolvedMode, halfSpanRad, halfElevationRad);
      this.sweepMode = resolvedMode;
    }

    if (resolvedMode === 'circular') {
      this.sweepAngleRad = normalizeAngleRad(this.sweepAngleRad + scanSpeedRadPerSec * dtSec);
      this.sweepElevationRad = 0;
      return;
    }

    const travelRad = scanSpeedRadPerSec * dtSec;
    if (resolvedMode === 'sector') {
      this.advanceAzimuthPingPong(travelRad, halfSpanRad, false, halfElevationRad);
      this.sweepElevationRad = 0;
      return;
    }

    this.advanceAzimuthPingPong(travelRad, halfSpanRad, true, halfElevationRad);
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
    const rasterBeamHalfRad = Math.max(
      (1 * Math.PI) / 180,
      ((Math.max(2, this.params.elevationFovDeg / 6) * Math.PI) / 180) * 0.5,
    );

    for (const target of this.targets) {
      const distanceMeters = magnitude(target.position);
      if (distanceMeters > this.params.maxRangeMeters) {
        continue;
      }

      const bearing = bearingRad(target.position);
      const elevation = elevationRad(target.position);

      const azimuthDelta = Math.abs(shortestAngleDiffRad(bearing, this.sweepAngleRad));
      const inAzimuth = azimuthDelta <= halfFovRad;
      const inElevation =
        this.sweepMode === 'raster'
          ? Math.abs(shortestAngleDiffRad(elevation, this.sweepElevationRad)) <= rasterBeamHalfRad
          : Math.abs(elevation) <= halfElevFovRad;

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

  private resolveSweepMode(spanDeg: number, pattern: ScanPattern): 'circular' | 'sector' | 'raster' {
    if (spanDeg >= 359.9) {
      return 'circular';
    }

    if (pattern === 'raster') {
      return 'raster';
    }

    return 'sector';
  }

  private initializeSweepMode(
    mode: 'circular' | 'sector' | 'raster',
    halfSpanRad: number,
    halfElevationRad: number,
  ): void {
    if (mode === 'circular') {
      this.azimuthDirection = 1;
      this.rasterElevationDirection = -1;
      this.sectorAzimuthRad = 0;
      this.sweepElevationRad = 0;
      return;
    }

    this.sectorAzimuthRad = -halfSpanRad;
    this.sweepAngleRad = normalizeAngleRad(this.sectorAzimuthRad);
    this.azimuthDirection = 1;

    if (mode === 'raster') {
      this.sweepElevationRad = halfElevationRad;
      this.rasterElevationDirection = -1;
      return;
    }

    this.sweepElevationRad = 0;
  }

  private advanceAzimuthPingPong(
    travelRad: number,
    halfSpanRad: number,
    rasterEnabled: boolean,
    halfElevationRad: number,
  ): void {
    let remaining = travelRad;

    while (remaining > 0) {
      const distanceToEdge =
        this.azimuthDirection > 0
          ? halfSpanRad - this.sectorAzimuthRad
          : this.sectorAzimuthRad + halfSpanRad;

      if (distanceToEdge <= 1e-7) {
        this.azimuthDirection *= -1;
        if (rasterEnabled) {
          this.advanceRasterElevation(halfElevationRad);
        }
        continue;
      }

      if (remaining <= distanceToEdge) {
        this.sectorAzimuthRad += this.azimuthDirection * remaining;
        remaining = 0;
      } else {
        this.sectorAzimuthRad += this.azimuthDirection * distanceToEdge;
        remaining -= distanceToEdge;
        this.azimuthDirection *= -1;
        if (rasterEnabled) {
          this.advanceRasterElevation(halfElevationRad);
        }
      }
    }

    this.sectorAzimuthRad = clamp(this.sectorAzimuthRad, -halfSpanRad, halfSpanRad);
    this.sweepAngleRad = normalizeAngleRad(this.sectorAzimuthRad);
  }

  private advanceRasterElevation(halfElevationRad: number): void {
    const lineStepRad = Math.max((1 * Math.PI) / 180, (this.params.elevationFovDeg * Math.PI) / 180 / 8);

    if (halfElevationRad <= lineStepRad * 0.5) {
      this.sweepElevationRad = 0;
      return;
    }

    let next = this.sweepElevationRad + this.rasterElevationDirection * lineStepRad;

    if (next < -halfElevationRad || next > halfElevationRad) {
      this.rasterElevationDirection *= -1;
      next = this.sweepElevationRad + this.rasterElevationDirection * lineStepRad;
    }

    this.sweepElevationRad = clamp(next, -halfElevationRad, halfElevationRad);
  }
}
