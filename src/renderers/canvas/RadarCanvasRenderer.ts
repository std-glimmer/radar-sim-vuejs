import type { Detection, RadarCursorState, RadarParams } from '../../core/types';

export class RadarCanvasRenderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;

  constructor(canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('2D context is not available for radar canvas');
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
    sweepAngleRad: number,
    detections: Detection[],
    params: RadarParams,
    cursor: RadarCursorState | null,
  ): void {
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    const cx = width * 0.5;
    const cy = height * 0.5;
    const radius = Math.min(width, height) * 0.45;

    this.fadeBackground(width, height);
    this.drawScope(cx, cy, radius);
    this.drawScanConeSector(cx, cy, radius, sweepAngleRad, params.fovDeg);
    this.drawSweep(cx, cy, radius, sweepAngleRad);
    this.drawDetections(cx, cy, radius, detections, params.maxRangeMeters);
    this.drawCursor(cx, cy, radius, params, cursor);
  }

  toCursorStateFromCanvasPoint(
    canvasX: number,
    canvasY: number,
    maxRangeMeters: number,
  ): RadarCursorState | null {
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    const cx = width * 0.5;
    const cy = height * 0.5;
    const radius = Math.min(width, height) * 0.45;

    const dx = canvasX - cx;
    const dy = canvasY - cy;
    const pixelDistance = Math.sqrt(dx * dx + dy * dy);

    if (pixelDistance > radius) {
      return null;
    }

    const rangeMeters = (pixelDistance / Math.max(1, radius)) * Math.max(1, maxRangeMeters);
    const azimuthRad = Math.atan2(dx, -dy);

    return {
      rangeMeters,
      azimuthRad,
    };
  }

  private fadeBackground(width: number, height: number): void {
    this.ctx.fillStyle = 'rgba(2, 12, 8, 0.18)';
    this.ctx.fillRect(0, 0, width, height);
  }

  private drawScope(cx: number, cy: number, radius: number): void {
    this.ctx.save();
    this.ctx.strokeStyle = 'rgba(103, 255, 179, 0.35)';
    this.ctx.lineWidth = 1;

    for (let ring = 1; ring <= 4; ring += 1) {
      this.ctx.beginPath();
      this.ctx.arc(cx, cy, (radius * ring) / 4, 0, Math.PI * 2);
      this.ctx.stroke();
    }

    this.ctx.beginPath();
    this.ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    this.ctx.strokeStyle = 'rgba(130, 255, 196, 0.6)';
    this.ctx.stroke();

    this.ctx.restore();
  }

  private drawSweep(cx: number, cy: number, radius: number, sweepAngleRad: number): void {
    const x = cx + Math.sin(sweepAngleRad) * radius;
    const y = cy - Math.cos(sweepAngleRad) * radius;

    this.ctx.save();

    const gradient = this.ctx.createLinearGradient(cx, cy, x, y);
    gradient.addColorStop(0, 'rgba(110, 255, 170, 0.0)');
    gradient.addColorStop(1, 'rgba(110, 255, 170, 0.85)');

    this.ctx.strokeStyle = gradient;
    this.ctx.lineWidth = 2;
    this.ctx.beginPath();
    this.ctx.moveTo(cx, cy);
    this.ctx.lineTo(x, y);
    this.ctx.stroke();

    this.ctx.restore();
  }

  private drawScanConeSector(
    cx: number,
    cy: number,
    radius: number,
    sweepAngleRad: number,
    fovDeg: number,
  ): void {
    const halfFovRad = (fovDeg * Math.PI) / 360;
    const start = sweepAngleRad - halfFovRad - Math.PI / 2;
    const end = sweepAngleRad + halfFovRad - Math.PI / 2;

    this.ctx.save();
    this.ctx.beginPath();
    this.ctx.moveTo(cx, cy);
    this.ctx.arc(cx, cy, radius, start, end, false);
    this.ctx.closePath();
    this.ctx.fillStyle = 'rgba(96, 255, 162, 0.08)';
    this.ctx.fill();

    this.ctx.strokeStyle = 'rgba(131, 255, 191, 0.28)';
    this.ctx.lineWidth = 1;
    this.ctx.beginPath();
    this.ctx.moveTo(cx, cy);
    this.ctx.lineTo(cx + Math.cos(start) * radius, cy + Math.sin(start) * radius);
    this.ctx.moveTo(cx, cy);
    this.ctx.lineTo(cx + Math.cos(end) * radius, cy + Math.sin(end) * radius);
    this.ctx.stroke();
    this.ctx.restore();
  }

  private drawDetections(
    cx: number,
    cy: number,
    radius: number,
    detections: Detection[],
    maxRangeMeters: number,
  ): void {
    this.ctx.save();

    for (const detection of detections) {
      const normalizedRange = detection.distanceMeters / maxRangeMeters;
      const px = cx + Math.sin(detection.bearingRad) * radius * normalizedRange;
      const py = cy - Math.cos(detection.bearingRad) * radius * normalizedRange;

      const alpha = 0.3 + detection.strength * 0.7;
      this.ctx.fillStyle = `rgba(196, 255, 216, ${alpha})`;
      this.ctx.beginPath();
      this.ctx.arc(px, py, 2 + detection.strength * 3, 0, Math.PI * 2);
      this.ctx.fill();
    }

    this.ctx.restore();
  }

  private drawCursor(
    cx: number,
    cy: number,
    radius: number,
    params: RadarParams,
    cursor: RadarCursorState | null,
  ): void {
    if (!cursor) {
      return;
    }

    const normalizedRange = Math.max(0, Math.min(1, cursor.rangeMeters / Math.max(1, params.maxRangeMeters)));
    const px = cx + Math.sin(cursor.azimuthRad) * radius * normalizedRange;
    const py = cy - Math.cos(cursor.azimuthRad) * radius * normalizedRange;
    const pixelPerMeter = radius / Math.max(1, params.maxRangeMeters);
    const widthPx = Math.max(6, params.cursorWidthMeters * pixelPerMeter);
    const lengthPx = Math.max(6, params.cursorLengthMeters * pixelPerMeter);

    this.ctx.save();
    this.ctx.translate(px, py);
    this.ctx.rotate(cursor.azimuthRad);
    this.ctx.strokeStyle = 'rgba(151, 255, 186, 1)';
    this.ctx.lineWidth = 1.5;
    this.ctx.strokeRect(-widthPx * 0.5, -lengthPx * 0.5, widthPx, lengthPx);
    this.ctx.restore();
  }
}
