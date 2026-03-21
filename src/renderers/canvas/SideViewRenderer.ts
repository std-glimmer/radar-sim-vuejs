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

  render(detections: Detection[], params: RadarParams): void {
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    const pad = 28;
    const plotW = width - pad * 2;
    const plotH = height - pad * 2;

    this.ctx.clearRect(0, 0, width, height);
    this.drawBackground(width, height);
    this.drawAxes(pad, width, height);

    this.ctx.save();
    this.ctx.translate(pad, pad);

    this.drawScanCone(plotW, plotH, params);

    for (const detection of detections) {
      const x = (detection.groundDistanceMeters / params.maxRangeMeters) * plotW;
      const elevScale = Math.tan(detection.elevationRad);
      const yNorm = Math.max(0, Math.min(1, 0.5 - elevScale * 0.45));
      const y = yNorm * plotH;

      this.ctx.fillStyle = 'rgba(224, 248, 255, 0.9)';
      this.ctx.beginPath();
      this.ctx.arc(x, y, 3, 0, Math.PI * 2);
      this.ctx.fill();
    }

    this.ctx.restore();
  }

  private drawScanCone(plotW: number, plotH: number, params: RadarParams): void {
    const halfElevRad = (params.elevationFovDeg * Math.PI) / 360;
    const originX = 0;
    const originY = plotH * 0.5;
    const farX = plotW;

    const yTop = this.elevationToCanvasY(halfElevRad, plotH);
    const yBottom = this.elevationToCanvasY(-halfElevRad, plotH);

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
    this.ctx.restore();
  }

  private elevationToCanvasY(elevationRad: number, plotH: number): number {
    const yNorm = Math.max(0, Math.min(1, 0.5 - Math.tan(elevationRad) * 0.45));
    return yNorm * plotH;
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

  private drawAxes(pad: number, width: number, height: number): void {
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
  }
}
