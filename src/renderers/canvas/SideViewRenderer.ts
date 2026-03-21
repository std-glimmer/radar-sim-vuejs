import type { Detection, RadarParams } from '../../core/types';

export class SideViewRenderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;

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

  render(detections: Detection[], params: RadarParams, sweepElevationRad: number): void {
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    const pad = 28;
    const plotW = width - pad * 2;
    const plotH = height - pad * 2;
    const scale = this.buildAltitudeScale(params);

    this.ctx.clearRect(0, 0, width, height);
    this.drawBackground(width, height);
    this.drawAxes(pad, width, height, params.maxRangeMeters, scale);

    this.ctx.save();
    this.ctx.translate(pad, pad);

    this.drawScanCone(plotW, plotH, params, sweepElevationRad, scale);

    for (const detection of detections) {
      const x = (detection.groundDistanceMeters / params.maxRangeMeters) * plotW;
      const absoluteAltitude = params.radarAltitudeMeters + detection.relativeAltitudeMeters;
      const y = this.altitudeToPlotY(absoluteAltitude, plotH, scale);

      this.ctx.fillStyle = 'rgba(224, 248, 255, 0.9)';
      this.ctx.beginPath();
      this.ctx.arc(x, y, 3, 0, Math.PI * 2);
      this.ctx.fill();
    }

    this.ctx.restore();
  }

  private drawScanCone(
    plotW: number,
    plotH: number,
    params: RadarParams,
    sweepElevationRad: number,
    scale: { min: number; max: number },
  ): void {
    const antennaTiltRad = (params.antennaTiltDeg * Math.PI) / 180;
    const halfZoneElevRad = (params.elevationFovDeg * Math.PI) / 360;
    const effectiveBeamElevationDeg = this.getEffectiveBeamElevationDeg(params);
    const halfBeamElevRad = (effectiveBeamElevationDeg * Math.PI) / 360;
    const originX = 0;
    const originY = plotH * 0.5;
    const farX = plotW;

    const yTop = this.angleToPlotY(antennaTiltRad + halfZoneElevRad, params, plotH, scale);
    const yBottom = this.angleToPlotY(antennaTiltRad - halfZoneElevRad, params, plotH, scale);

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

    const activeTop = this.angleToPlotY(sweepElevationRad + halfBeamElevRad, params, plotH, scale);
    const activeBottom = this.angleToPlotY(sweepElevationRad - halfBeamElevRad, params, plotH, scale);

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
  ): number {
    const clampedElevation = Math.max((-80 * Math.PI) / 180, Math.min((80 * Math.PI) / 180, elevationRad));
    const altitude = params.radarAltitudeMeters + Math.tan(clampedElevation) * params.maxRangeMeters;
    return this.altitudeToPlotY(altitude, plotH, scale);
  }

  private altitudeToPlotY(altitude: number, plotH: number, scale: { min: number; max: number }): number {
    const span = Math.max(1, scale.max - scale.min);
    const yNorm = (scale.max - altitude) / span;
    return Math.max(0, Math.min(plotH, yNorm * plotH));
  }

  private buildAltitudeScale(params: RadarParams): { min: number; max: number } {
    const halfZoneElevRad = (params.elevationFovDeg * Math.PI) / 360;
    const antennaTiltRad = (params.antennaTiltDeg * Math.PI) / 180;

    const topAngle = Math.max((-80 * Math.PI) / 180, Math.min((80 * Math.PI) / 180, antennaTiltRad + halfZoneElevRad));
    const bottomAngle = Math.max((-80 * Math.PI) / 180, Math.min((80 * Math.PI) / 180, antennaTiltRad - halfZoneElevRad));

    const topAlt = params.radarAltitudeMeters + Math.tan(topAngle) * params.maxRangeMeters;
    const bottomAlt = params.radarAltitudeMeters + Math.tan(bottomAngle) * params.maxRangeMeters;

    const min = Math.min(topAlt, bottomAlt);
    const max = Math.max(topAlt, bottomAlt);
    const padding = (max - min) * 0.08 + 200;

    return {
      min: min - padding,
      max: max + padding,
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
    for (let i = 0; i <= xTicks; i += 1) {
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
    for (let i = 0; i <= yTicks; i += 1) {
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
  }
}
