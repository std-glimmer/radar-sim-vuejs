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
  }));
}

export class RadarEngine {
  private simTimeSec = 0;
  private sweepAngleRad = 0;
  private sweepElevationRad = 0;
  private scanAzimuthRelRad = 0;
  private scanElevationRelRad = 0;
  private scanHorizontalDirection: 1 | -1 = 1;
  private scanPhase: 'scan' | 'return-left' | 'return-up' = 'scan';
  private scanInitialized = false;
  private scanSignature = '';
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
    const scanLinesCount = Math.max(1, Math.round(clamp(this.params.scanLinesCount, 1, 60)));
    const effectiveBeamElevationDeg = this.getEffectiveBeamElevationDeg(scanLinesCount);
    const antennaTiltRad = (clamp(this.params.antennaTiltDeg, -60, 60) * Math.PI) / 180;
    const radarAzimuthRad = (clamp(this.params.radarAzimuthDeg, -180, 180) * Math.PI) / 180;
    const zoneOffsetAzimuthRad = (clamp(this.params.zoneAzimuthOffsetDeg, -180, 180) * Math.PI) / 180;
    const scanCenterAzimuthRad = normalizeAngleRad(radarAzimuthRad + zoneOffsetAzimuthRad);

    const zoneAzHalfRad = ((clamp(this.params.azimuthScanSpanDeg, 10, 360) * Math.PI) / 180) * 0.5;
    const zoneElHalfRad = ((clamp(this.params.elevationFovDeg, 5, 90) * Math.PI) / 180) * 0.5;

    const beamAzHalfRad = Math.min(
      zoneAzHalfRad,
      ((clamp(this.params.fovDeg, 1, 40) * Math.PI) / 180) * 0.5,
    );
    const beamElHalfRad = Math.min(
      zoneElHalfRad,
      ((effectiveBeamElevationDeg * Math.PI) / 180) * 0.5,
    );

    const azMin = -zoneAzHalfRad + beamAzHalfRad;
    const azMax = zoneAzHalfRad - beamAzHalfRad;
    const elTop = zoneElHalfRad - beamElHalfRad;
    const elBottom = -zoneElHalfRad + beamElHalfRad;

    const signature = `${azMin.toFixed(6)}|${azMax.toFixed(6)}|${elTop.toFixed(6)}|${elBottom.toFixed(6)}|${scanSpeedRadPerSec.toFixed(6)}|${scanLinesCount}`;
    if (!this.scanInitialized || this.scanSignature !== signature) {
      this.scanAzimuthRelRad = azMin <= azMax ? azMin : 0;
      this.scanElevationRelRad = elBottom <= elTop ? elTop : 0;
      this.scanHorizontalDirection = 1;
      this.scanPhase = 'scan';
      this.scanSignature = signature;
      this.scanInitialized = true;
    }

    const azRange = Math.max(0, azMax - azMin);
    const elRange = Math.max(0, elTop - elBottom);

    if (azRange <= 1e-7 && elRange <= 1e-7) {
      this.scanAzimuthRelRad = 0;
      this.scanElevationRelRad = 0;
    } else {
      this.advanceRasterSweep(scanSpeedRadPerSec * dtSec, azMin, azMax, elTop, elBottom, scanLinesCount);
    }

    this.sweepAngleRad = normalizeAngleRad(scanCenterAzimuthRad + this.scanAzimuthRelRad);
    this.sweepElevationRad = this.scanElevationRelRad + antennaTiltRad;
  }

  private computeDetections(): Detection[] {
    const detections: Detection[] = [];
    const halfFovRad = ((clamp(this.params.fovDeg, 1, 40) * Math.PI) / 180) * 0.5;
    const scanLinesCount = Math.max(1, Math.round(clamp(this.params.scanLinesCount, 1, 60)));
    const effectiveBeamElevationDeg = this.getEffectiveBeamElevationDeg(scanLinesCount);
    const halfBeamElevRad = ((effectiveBeamElevationDeg * Math.PI) / 180) * 0.5;

    for (const target of this.targets) {
      const relativePosition = {
        x: target.position.x,
        y: target.position.y - this.params.radarAltitudeMeters,
        z: target.position.z,
      };

      const distanceMeters = magnitude(relativePosition);
      if (distanceMeters > this.params.maxRangeMeters) {
        continue;
      }

      const bearing = bearingRad(relativePosition);
      const elevation = elevationRad(relativePosition);

      const azimuthDelta = Math.abs(shortestAngleDiffRad(bearing, this.sweepAngleRad));
      const inAzimuth = azimuthDelta <= halfFovRad;
      const inElevation = Math.abs(shortestAngleDiffRad(elevation, this.sweepElevationRad)) <= halfBeamElevRad;

      if (!inAzimuth || !inElevation) {
        continue;
      }

      const strength = 1 - distanceMeters / this.params.maxRangeMeters;
      detections.push({
        targetId: target.id,
        distanceMeters,
        groundDistanceMeters: groundDistance(relativePosition),
        relativeAltitudeMeters: relativePosition.y,
        bearingRad: bearing,
        elevationRad: elevation,
        strength: clamp(strength, 0.05, 1),
      });
    }

    return detections;
  }

  private advanceRasterSweep(
    travelRad: number,
    azMin: number,
    azMax: number,
    elTop: number,
    elBottom: number,
    scanLinesCount: number,
  ): void {
    let remaining = travelRad;

    if (scanLinesCount <= 1) {
      this.advanceSingleRowSweep(remaining, azMin, azMax);
      return;
    }

    if (azMax <= azMin + 1e-7) {
      this.scanAzimuthRelRad = azMin;
      this.handleVerticalOnly(remaining, elTop, elBottom);
      return;
    }

    while (remaining > 0) {
      if (this.scanPhase === 'return-left') {
        const toLeft = this.scanAzimuthRelRad - azMin;
        const step = Math.min(remaining, Math.max(0, toLeft));
        this.scanAzimuthRelRad -= step;
        remaining -= step;

        if (this.scanAzimuthRelRad <= azMin + 1e-7) {
          this.scanAzimuthRelRad = azMin;
          this.scanPhase = 'return-up';
        }
        continue;
      }

      if (this.scanPhase === 'return-up') {
        const toTop = elTop - this.scanElevationRelRad;
        const step = Math.min(remaining, Math.max(0, toTop));
        this.scanElevationRelRad += step;
        remaining -= step;

        if (this.scanElevationRelRad >= elTop - 1e-7) {
          this.scanElevationRelRad = elTop;
          this.scanPhase = 'scan';
          this.scanHorizontalDirection = 1;
          this.scanAzimuthRelRad = azMin;
        }
        continue;
      }

      const distanceToEdge =
        this.scanHorizontalDirection > 0
          ? azMax - this.scanAzimuthRelRad
          : this.scanAzimuthRelRad - azMin;

      if (distanceToEdge <= 1e-7) {
        this.scanAzimuthRelRad = this.scanHorizontalDirection > 0 ? azMax : azMin;
        this.advanceRasterRow(elTop, elBottom, scanLinesCount);
        continue;
      }

      const step = Math.min(remaining, distanceToEdge);
      this.scanAzimuthRelRad += this.scanHorizontalDirection * step;
      remaining -= step;

      const atEdge =
        this.scanHorizontalDirection > 0
          ? this.scanAzimuthRelRad >= azMax - 1e-7
          : this.scanAzimuthRelRad <= azMin + 1e-7;

      if (atEdge) {
        this.scanAzimuthRelRad = this.scanHorizontalDirection > 0 ? azMax : azMin;
        this.advanceRasterRow(elTop, elBottom, scanLinesCount);
      }
    }
  }

  private advanceRasterRow(elTop: number, elBottom: number, scanLinesCount: number): void {
    const rowStep = (elTop - elBottom) / Math.max(1, scanLinesCount - 1);
    if (elTop <= elBottom + 1e-7) {
      this.scanElevationRelRad = 0;
      return;
    }

    this.scanHorizontalDirection = this.scanHorizontalDirection > 0 ? -1 : 1;

    const next = this.scanElevationRelRad - rowStep;
    if (next < elBottom - 1e-7) {
      this.scanPhase = 'return-left';
      this.scanElevationRelRad = elBottom;
      return;
    }

    this.scanElevationRelRad = clamp(next, elBottom, elTop);
  }

  private advanceSingleRowSweep(travelRad: number, azMin: number, azMax: number): void {
    let remaining = travelRad;
    this.scanElevationRelRad = 0;

    while (remaining > 0) {
      if (this.scanPhase === 'return-left') {
        const toLeft = this.scanAzimuthRelRad - azMin;
        const step = Math.min(remaining, Math.max(0, toLeft));
        this.scanAzimuthRelRad -= step;
        remaining -= step;

        if (this.scanAzimuthRelRad <= azMin + 1e-7) {
          this.scanAzimuthRelRad = azMin;
          this.scanPhase = 'scan';
          this.scanHorizontalDirection = 1;
        }
        continue;
      }

      const toRight = azMax - this.scanAzimuthRelRad;
      const step = Math.min(remaining, Math.max(0, toRight));
      this.scanAzimuthRelRad += step;
      remaining -= step;

      if (this.scanAzimuthRelRad >= azMax - 1e-7) {
        this.scanAzimuthRelRad = azMax;
        this.scanPhase = 'return-left';
      }
    }
  }

  private handleVerticalOnly(
    travelRad: number,
    elTop: number,
    elBottom: number,
  ): void {
    let remaining = travelRad;

    while (remaining > 0) {
      if (this.scanPhase === 'return-up') {
        const toTop = elTop - this.scanElevationRelRad;
        const step = Math.min(remaining, Math.max(0, toTop));
        this.scanElevationRelRad += step;
        remaining -= step;
        if (this.scanElevationRelRad >= elTop - 1e-7) {
          this.scanElevationRelRad = elTop;
          this.scanPhase = 'scan';
        }
        continue;
      }

      const toBottom = this.scanElevationRelRad - elBottom;
      const step = Math.min(remaining, Math.max(0, toBottom));
      this.scanElevationRelRad -= step;
      remaining -= step;
      if (this.scanElevationRelRad <= elBottom + 1e-7) {
        this.scanElevationRelRad = elBottom;
        this.scanPhase = 'return-up';
      }
    }
  }

  private getEffectiveBeamElevationDeg(scanLinesCount: number): number {
    const clampedLines = Math.max(1, Math.round(scanLinesCount));
    const zoneElevationDeg = clamp(this.params.elevationFovDeg, 5, 90);

    if (clampedLines === 1) {
      return zoneElevationDeg;
    }

    if (this.params.autoBeamElevationByScanLines) {
      // Ensures contiguous vertical coverage for evenly spaced scan lines.
      return clamp(zoneElevationDeg / clampedLines, 1, 45);
    }

    return clamp(this.params.beamElevationDeg, 1, 45);
  }
}
