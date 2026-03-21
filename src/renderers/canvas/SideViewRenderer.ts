import type { Detection, RadarCursorState, RadarParams, Target } from '../../core/types';

const SIDE_VIEW_MIN_ALTITUDE_METERS = 0;
const SIDE_VIEW_MAX_ALTITUDE_METERS = 20000;

export class SideViewRenderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private projectedTargets: Array<{ id: string; x: number; y: number }> = [];

  constructor(canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('2D context is not available for side projection canvas');
    }

    this.canvas = canvas;
    this.ctx = ctx;
  }

  resize(): void {
    const dpr = Math.min(window.devicePixelRatio, 2);
    const width = Math.max(1, this.canvas.clientWidth);
    const height = Math.max(1, this.canvas.clientHeight);

    this.canvas.width = Math.floor(width * dpr);
    this.canvas.height = Math.floor(height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  render(
    targets: Target[],
    detections: Detection[],
    params: RadarParams,
    sweepElevationRad: number,
    cursor: RadarCursorState | null,
    showRadarAircraft: boolean,
    hoveredTargetId: string | null,
    inFovTargetIds: string[],
    rangeAzimuthOnlyTargetIds: string[],
    outOfAzimuthInRangeTargetIds: string[],
    outOfRangeTargetIds: string[],
  ): void {
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    const pad = 28;
    const plotW = width - pad * 2;
    const plotH = height - pad * 2;
    const scale = this.buildAltitudeScale();

    this.ctx.clearRect(0, 0, width, height);
    this.drawBackground(width, height);
    this.drawAxes(pad, width, height, params.maxRangeMeters, scale, cursor, params.antennaTiltDeg);

    this.ctx.save();
    this.ctx.translate(pad, pad);

    this.drawScanCone(plotW, plotH, params, sweepElevationRad, scale);
    this.drawCursorRangeLine(plotW, plotH, params.maxRangeMeters, cursor);
    if (showRadarAircraft) {
      this.drawRadarAircraftMarker(plotH, params, scale);
    }

    const detectedIds = new Set(detections.map((detection) => detection.targetId));
    const inFovIdSet = new Set(inFovTargetIds);
    const rangeAzimuthOnlyIdSet = new Set(rangeAzimuthOnlyTargetIds);
    const outOfAzimuthInRangeIdSet = new Set(outOfAzimuthInRangeTargetIds);
    const outOfRangeIdSet = new Set(outOfRangeTargetIds);
    this.projectedTargets = [];

    for (const target of targets) {
      const groundDistanceMeters = Math.hypot(target.position.x, target.position.z);
      const x = (groundDistanceMeters / params.maxRangeMeters) * plotW;
      if (x < -5 || x > plotW + 5) {
        continue;
      }

      const y = this.altitudeToPlotY(target.position.y, plotH, scale);
      const isDetected = detectedIds.has(target.id);
      const isHovered = hoveredTargetId === target.id;
      const isInFov = inFovIdSet.has(target.id);
      const isRangeAzimuthOnly = rangeAzimuthOnlyIdSet.has(target.id);
      const isOutAzimuthInRange = outOfAzimuthInRangeIdSet.has(target.id);
      const isOutOfRange = outOfRangeIdSet.has(target.id);

      this.projectedTargets.push({ id: target.id, x: pad + x, y: pad + y });

      let fillStyle = 'rgba(255, 138, 138, 0.9)';
      if (isInFov) {
        fillStyle = 'rgba(255, 98, 98, 0.95)';
      } else if (isRangeAzimuthOnly) {
        fillStyle = 'rgba(241, 208, 97, 0.94)';
      } else if (isOutAzimuthInRange) {
        fillStyle = 'rgba(103, 216, 143, 0.92)';
      } else if (isOutOfRange) {
        fillStyle = 'rgba(174, 183, 194, 0.9)';
      }

      const radius = isHovered ? 4.2 : isDetected ? 3.2 : 3;
      this.ctx.fillStyle = fillStyle;
      if (isInFov) {
        this.ctx.beginPath();
        this.ctx.moveTo(x, y - radius - 1.8);
        this.ctx.lineTo(x + radius + 1.8, y + radius + 1.8);
        this.ctx.lineTo(x - radius - 1.8, y + radius + 1.8);
        this.ctx.closePath();
        this.ctx.fill();
      } else if (isRangeAzimuthOnly) {
        const side = radius * 2;
        this.ctx.fillRect(x - side * 0.5, y - side * 0.5, side, side);
      } else {
        this.ctx.beginPath();
        this.ctx.arc(x, y, radius, 0, Math.PI * 2);
        this.ctx.fill();
      }

      if (isRangeAzimuthOnly) {
        this.ctx.strokeStyle = 'rgba(255, 176, 176, 0.9)';
        this.ctx.lineWidth = 1;
        const side = radius * 2 + 3;
        this.ctx.strokeRect(x - side * 0.5, y - side * 0.5, side, side);
      }

      if (isHovered) {
        this.ctx.strokeStyle = 'rgba(255, 232, 200, 0.95)';
        this.ctx.lineWidth = 1;
        if (isRangeAzimuthOnly) {
          const hoverSide = radius * 2 + 5;
          this.ctx.strokeRect(x - hoverSide * 0.5, y - hoverSide * 0.5, hoverSide, hoverSide);
        } else if (isInFov) {
          this.ctx.beginPath();
          this.ctx.moveTo(x, y - radius - 3.5);
          this.ctx.lineTo(x + radius + 3.5, y + radius + 3.5);
          this.ctx.lineTo(x - radius - 3.5, y + radius + 3.5);
          this.ctx.closePath();
          this.ctx.stroke();
        } else {
          this.ctx.beginPath();
          this.ctx.arc(x, y, radius + 2, 0, Math.PI * 2);
          this.ctx.stroke();
        }
      }
    }

    this.ctx.restore();
  }

  pickTargetAt(clientX: number, clientY: number): string | null {
    let closestTarget: { id: string; distanceSq: number } | null = null;
    const maxDistanceSq = 8 * 8;

    for (const target of this.projectedTargets) {
      const dx = target.x - clientX;
      const dy = target.y - clientY;
      const distanceSq = dx * dx + dy * dy;
      if (distanceSq > maxDistanceSq) {
        continue;
      }
      if (!closestTarget || distanceSq < closestTarget.distanceSq) {
        closestTarget = { id: target.id, distanceSq };
      }
    }

    return closestTarget?.id ?? null;
  }

  private drawRadarAircraftMarker(
    plotH: number,
    params: RadarParams,
    scale: { min: number; max: number },
  ): void {
    const x = 0;
    const y = this.altitudeToPlotY(params.radarAltitudeMeters, plotH, scale);

    this.ctx.save();
    this.ctx.strokeStyle = 'rgba(187, 204, 219, 0.95)';
    this.ctx.lineWidth = 1.4;

    this.ctx.beginPath();
    this.ctx.moveTo(x + 2, y);
    this.ctx.lineTo(x + 22, y);
    this.ctx.moveTo(x + 9, y - 3.8);
    this.ctx.lineTo(x + 16, y - 3.8);
    this.ctx.moveTo(x + 12, y - 3.8);
    this.ctx.lineTo(x + 12, y + 4.5);
    this.ctx.moveTo(x + 22, y);
    this.ctx.lineTo(x + 18, y - 2.8);
    this.ctx.moveTo(x + 22, y);
    this.ctx.lineTo(x + 18, y + 2.8);
    this.ctx.stroke();

    this.ctx.restore();
  }

  private drawCursorRangeLine(
    plotW: number,
    plotH: number,
    maxRangeMeters: number,
    cursor: RadarCursorState | null,
  ): void {
    if (!cursor) {
      return;
    }

    const x = (cursor.rangeMeters / Math.max(1, maxRangeMeters)) * plotW;
    const clampedX = Math.max(0, Math.min(plotW, x));

    this.ctx.save();
    this.ctx.strokeStyle = 'rgba(64, 255, 122, 0.9)';
    this.ctx.lineWidth = 1.5;
    this.ctx.beginPath();
    this.ctx.moveTo(clampedX, 0);
    this.ctx.lineTo(clampedX, plotH);
    this.ctx.stroke();
    this.ctx.restore();
  }

  private drawScanCone(
    plotW: number,
    plotH: number,
    params: RadarParams,
    sweepElevationRad: number,
    scale: { min: number; max: number },
  ): void {
    const antennaTiltRad = (Math.max(-60, Math.min(60, params.antennaTiltDeg)) * Math.PI) / 180;
    const halfZoneElevRad = (params.elevationFovDeg * Math.PI) / 360;
    const effectiveBeamElevationDeg = this.getEffectiveBeamElevationDeg(params);
    const halfBeamElevRad = (effectiveBeamElevationDeg * Math.PI) / 360;
    const originX = 0;
    const originY = this.altitudeToPlotY(params.radarAltitudeMeters, plotH, scale, false);
    const farX = plotW;

    const yTop = this.angleToPlotY(antennaTiltRad + halfZoneElevRad, params, plotH, scale, false);
    const yBottom = this.angleToPlotY(antennaTiltRad - halfZoneElevRad, params, plotH, scale, false);

    this.ctx.save();
    this.ctx.fillStyle = 'rgba(128, 209, 255, 0.12)';
    this.ctx.beginPath();
    this.ctx.moveTo(originX, originY);
    this.ctx.lineTo(farX, yTop);
    this.ctx.lineTo(farX, yBottom);
    this.ctx.closePath();
    this.ctx.fill();

    this.ctx.strokeStyle = 'rgba(166, 225, 255, 0.55)';
    this.ctx.lineWidth = 1;
    this.ctx.beginPath();
    this.ctx.moveTo(originX, originY);
    this.ctx.lineTo(farX, yTop);
    this.ctx.moveTo(originX, originY);
    this.ctx.lineTo(farX, yBottom);
    this.ctx.stroke();

    const activeTop = this.angleToPlotY(sweepElevationRad + halfBeamElevRad, params, plotH, scale, false);
    const activeBottom = this.angleToPlotY(sweepElevationRad - halfBeamElevRad, params, plotH, scale, false);

    this.ctx.fillStyle = 'rgba(120, 255, 202, 0.22)';
    this.ctx.beginPath();
    this.ctx.moveTo(originX, originY);
    this.ctx.lineTo(farX, activeTop);
    this.ctx.lineTo(farX, activeBottom);
    this.ctx.closePath();
    this.ctx.fill();

    this.ctx.restore();
  }

  private angleToPlotY(
    elevationRad: number,
    params: RadarParams,
    plotH: number,
    scale: { min: number; max: number },
    clampToPlot = true,
  ): number {
    const clampedElevation = Math.max((-80 * Math.PI) / 180, Math.min((80 * Math.PI) / 180, elevationRad));
    const altitude = params.radarAltitudeMeters + Math.tan(clampedElevation) * params.maxRangeMeters;
    return this.altitudeToPlotY(altitude, plotH, scale, clampToPlot);
  }

  private altitudeToPlotY(
    altitude: number,
    plotH: number,
    scale: { min: number; max: number },
    clampToPlot = true,
  ): number {
    const span = Math.max(1, scale.max - scale.min);
    const yNorm = (scale.max - altitude) / span;
    const y = yNorm * plotH;
    if (!clampToPlot) {
      return y;
    }
    return Math.max(0, Math.min(plotH, y));
  }

  private buildAltitudeScale(): { min: number; max: number } {
    return {
      min: SIDE_VIEW_MIN_ALTITUDE_METERS,
      max: SIDE_VIEW_MAX_ALTITUDE_METERS,
    };
  }

  private getEffectiveBeamElevationDeg(params: RadarParams): number {
    const lines = Math.max(1, Math.round(params.scanLinesCount));
    const zoneElevationDeg = Math.max(5, Math.min(90, params.elevationFovDeg));

    if (lines === 1) {
      return zoneElevationDeg;
    }

    if (params.autoBeamElevationByScanLines) {
      return Math.max(1, Math.min(45, zoneElevationDeg / lines));
    }

    return Math.max(1, Math.min(45, params.beamElevationDeg));
  }

  private drawBackground(width: number, height: number): void {
    this.ctx.fillStyle = '#0e1721';
    this.ctx.fillRect(0, 0, width, height);

    this.ctx.strokeStyle = 'rgba(130, 170, 210, 0.2)';
    this.ctx.lineWidth = 1;

    for (let i = 1; i <= 4; i += 1) {
      const y = (height / 5) * i;
      this.ctx.beginPath();
      this.ctx.moveTo(0, y);
      this.ctx.lineTo(width, y);
      this.ctx.stroke();
    }
  }

  private drawAxes(
    pad: number,
    width: number,
    height: number,
    maxRangeMeters: number,
    altitudeScale: { min: number; max: number },
    cursor: RadarCursorState | null,
    antennaTiltDeg: number,
  ): void {
    this.ctx.strokeStyle = 'rgba(183, 213, 241, 0.6)';
    this.ctx.lineWidth = 1.2;

    this.ctx.beginPath();
    this.ctx.moveTo(pad, height - pad);
    this.ctx.lineTo(width - pad, height - pad);
    this.ctx.lineTo(width - pad - 8, height - pad - 6);
    this.ctx.moveTo(width - pad, height - pad);
    this.ctx.lineTo(width - pad - 8, height - pad + 6);

    this.ctx.moveTo(pad, height - pad);
    this.ctx.lineTo(pad, pad);
    this.ctx.lineTo(pad - 6, pad + 8);
    this.ctx.moveTo(pad, pad);
    this.ctx.lineTo(pad + 6, pad + 8);
    this.ctx.stroke();

    this.ctx.fillStyle = 'rgba(223, 234, 244, 0.78)';
    this.ctx.font = '12px sans-serif';
    this.ctx.fillText('distance', width - pad - 56, height - pad - 8);
    this.ctx.fillText('altitude', pad + 8, pad + 14);

    const xTicks = 4;
    for (let i = 1; i <= xTicks; i += 1) {
      const ratio = i / xTicks;
      const x = pad + (width - pad * 2) * ratio;
      const rangeKm = ((maxRangeMeters * ratio) / 1000).toFixed(0);
      this.ctx.strokeStyle = 'rgba(183, 213, 241, 0.35)';
      this.ctx.beginPath();
      this.ctx.moveTo(x, height - pad - 4);
      this.ctx.lineTo(x, height - pad + 4);
      this.ctx.stroke();
      this.ctx.fillStyle = 'rgba(223, 234, 244, 0.7)';
      this.ctx.font = '10px sans-serif';
      this.ctx.fillText(`${rangeKm} km`, x - 12, height - pad + 16);
    }

    const yTicks = 4;
    for (let i = 0; i < yTicks; i += 1) {
      const ratio = i / yTicks;
      const y = pad + (height - pad * 2) * ratio;
      const altitude = altitudeScale.max - (altitudeScale.max - altitudeScale.min) * ratio;
      const altitudeKm = (altitude / 1000).toFixed(1);
      this.ctx.strokeStyle = 'rgba(183, 213, 241, 0.35)';
      this.ctx.beginPath();
      this.ctx.moveTo(pad - 4, y);
      this.ctx.lineTo(pad + 4, y);
      this.ctx.stroke();
      this.ctx.fillStyle = 'rgba(223, 234, 244, 0.7)';
      this.ctx.font = '10px sans-serif';
      this.ctx.fillText(`${altitudeKm} km`, pad + 8, y + 3);
    }

    const cursorRangeText = cursor ? `${(cursor.rangeMeters / 1000).toFixed(1)} km` : '--';
    const tiltText = `${antennaTiltDeg.toFixed(1)} deg`;
    this.ctx.fillStyle = 'rgba(64, 255, 122, 0.92)';
    this.ctx.font = '11px sans-serif';
    this.ctx.fillText(`cursor ${cursorRangeText} / tilt ${tiltText}`, pad + 8, height - pad - 10);
  }
}
