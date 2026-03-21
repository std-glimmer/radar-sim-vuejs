import type {
  Detection,
  Mig29RadarMode,
  Mig29ZonePosition,
  RadarControlMode,
  RadarCursorState,
  RadarParams,
  RadarScopeMode,
} from '../../core/types';

interface BScopeContactMark {
  x: number;
  y: number;
  alpha: number;
  dashLen: number;
}

export class RadarCanvasRenderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly bScopeLineMarks = new Map<number, Map<string, BScopeContactMark>>();
  private bScopeLastLine: number | null = null;
  private bScopeSignature = '';

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
    sweepElevationRad: number,
    detections: Detection[],
    params: RadarParams,
    cursor: RadarCursorState | null,
    showBeam: boolean,
    showGrid: boolean,
    scopeMode: RadarScopeMode,
    controlMode: RadarControlMode,
    mig29RadarMode: Mig29RadarMode,
    mig29ZonePosition: Mig29ZonePosition,
    mig29RangeTickKm: number,
  ): void {
    if (scopeMode === 'b-scope') {
      this.renderBScope(
        sweepAngleRad,
        sweepElevationRad,
        detections,
        params,
        cursor,
        showBeam,
        showGrid,
        controlMode,
        mig29RadarMode,
        mig29ZonePosition,
        mig29RangeTickKm,
      );
      return;
    }

    this.renderPpiScope(sweepAngleRad, sweepElevationRad, detections, params, cursor, showBeam);
  }

  toCursorStateFromCanvasPoint(
    canvasX: number,
    canvasY: number,
    params: RadarParams,
    scopeMode: RadarScopeMode,
  ): RadarCursorState | null {
    if (scopeMode === 'b-scope') {
      return this.toCursorStateFromBScopePoint(canvasX, canvasY, params);
    }

    return this.toCursorStateFromPpiPoint(canvasX, canvasY, params.maxRangeMeters, params.azimuthScanSpanDeg);
  }

  private renderPpiScope(
    sweepAngleRad: number,
    sweepElevationRad: number,
    detections: Detection[],
    params: RadarParams,
    cursor: RadarCursorState | null,
    showBeam: boolean,
  ): void {
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    const { cx, cy, radius } = this.getScopeLayout(width, height, params.azimuthScanSpanDeg);

    this.fadeBackground(width, height);
    this.drawScope(cx, cy, radius, params);
    this.drawScanZoneSector(cx, cy, radius, params);
    if (showBeam) {
      this.drawScanConeSector(cx, cy, radius, sweepAngleRad, params.fovDeg);
      this.drawSweep(cx, cy, radius, sweepAngleRad);
    }
    this.drawDetections(cx, cy, radius, detections, params.maxRangeMeters);
    this.drawCursor(cx, cy, radius, params, cursor);
    this.drawIndicators(width, height, params, sweepElevationRad);
  }

  private renderBScope(
    sweepAngleRad: number,
    sweepElevationRad: number,
    detections: Detection[],
    params: RadarParams,
    cursor: RadarCursorState | null,
    showBeam: boolean,
    showGrid: boolean,
    controlMode: RadarControlMode,
    mig29RadarMode: Mig29RadarMode,
    mig29ZonePosition: Mig29ZonePosition,
    mig29RangeTickKm: number,
  ): void {
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    const pad = 24;
    const maxSquare = Math.max(1, Math.min(width - pad * 2, height - pad * 2));
    const squareSize = Math.max(1, maxSquare * 0.86);
    const plotW = squareSize;
    const plotH = squareSize;
    const offsetX = (width - squareSize) * 0.5;
    const offsetY = (height - squareSize) * 0.5 + 8;
    const spanDeg = Math.max(10, Math.min(360, params.azimuthScanSpanDeg));
    const spanRad = spanDeg >= 359.9 ? Math.PI * 2 : (spanDeg * Math.PI) / 180;
    const centerAz = this.getScanCenterAzimuthRad(params);
    const scanLine = this.computeCurrentScanLine(params, sweepElevationRad);
    const nextSignature = [
      Math.round(params.maxRangeMeters),
      Math.round(params.scanLinesCount),
      spanDeg.toFixed(2),
      plotW.toFixed(2),
      plotH.toFixed(2),
    ].join('|');

    if (nextSignature !== this.bScopeSignature) {
      this.bScopeLineMarks.clear();
      this.bScopeLastLine = null;
      this.bScopeSignature = nextSignature;
    }

    if (this.bScopeLastLine !== scanLine) {
      this.bScopeLineMarks.set(scanLine, new Map());
      this.bScopeLastLine = scanLine;
    }

    const lineMarks = this.bScopeLineMarks.get(scanLine) ?? new Map<string, BScopeContactMark>();
    this.bScopeLineMarks.set(scanLine, lineMarks);

    this.fadeBackground(width, height);

    this.ctx.save();
    this.ctx.translate(offsetX, offsetY);

    this.ctx.strokeStyle = 'rgba(103, 255, 179, 0.5)';
    this.ctx.lineWidth = 1;
    this.ctx.beginPath();
    this.ctx.moveTo(0, 0);
    this.ctx.lineTo(0, plotH);
    this.ctx.moveTo(plotW, 0);
    this.ctx.lineTo(plotW, plotH);
    this.ctx.stroke();

    if (showGrid) {
      const tickKm = controlMode === 'mig29' ? mig29RangeTickKm : Math.max(10, Math.round((params.maxRangeMeters / 1000) / 5));
      const maxKm = params.maxRangeMeters / 1000;
      const rangeTicks = Math.max(1, Math.floor(maxKm / Math.max(1, tickKm)));
      this.ctx.strokeStyle = 'rgba(103, 255, 179, 0.3)';

      for (let i = 1; i < rangeTicks; i += 1) {
        const km = i * tickKm;
        const y = (1 - km / Math.max(1, maxKm)) * plotH;
        this.ctx.beginPath();
        this.ctx.moveTo(0, y);
        this.ctx.lineTo(plotW, y);
        this.ctx.stroke();
      }

      const halfSpanDeg = spanDeg * 0.5;
      for (let deg = -Math.floor(halfSpanDeg / 10) * 10; deg <= Math.floor(halfSpanDeg / 10) * 10; deg += 10) {
        const x = ((deg + halfSpanDeg) / Math.max(1, spanDeg)) * plotW;
        this.ctx.beginPath();
        this.ctx.moveTo(x, 0);
        this.ctx.lineTo(x, plotH);
        this.ctx.stroke();
      }
    }

    if (showBeam) {
      const beamHalf = (Math.max(1, params.fovDeg) * Math.PI) / 360;
      const rel = this.shortestAngleDiffRad(sweepAngleRad, centerAz);
      const xCenter = ((rel / spanRad) + 0.5) * plotW;
      const xMin = ((rel - beamHalf) / spanRad + 0.5) * plotW;
      const xMax = ((rel + beamHalf) / spanRad + 0.5) * plotW;

      this.ctx.fillStyle = 'rgba(96, 255, 162, 0.09)';
      this.ctx.fillRect(xMin, 0, xMax - xMin, plotH);

      this.ctx.strokeStyle = 'rgba(110, 255, 170, 0.85)';
      this.ctx.lineWidth = 2;
      this.ctx.beginPath();
      this.ctx.moveTo(xCenter, 0);
      this.ctx.lineTo(xCenter, plotH);
      this.ctx.stroke();
    }

    for (const detection of detections) {
      const rel = this.shortestAngleDiffRad(detection.bearingRad, centerAz);
      if (Math.abs(rel) > spanRad * 0.5 + 1e-6 && spanDeg < 359.9) {
        continue;
      }

      const x = ((rel / spanRad) + 0.5) * plotW;
      const y = (1 - detection.distanceMeters / Math.max(1, params.maxRangeMeters)) * plotH;
      const alpha = 0.3 + detection.strength * 0.7;
      const cursorWidthPx = Math.max(6, (params.cursorWidthMeters / Math.max(1, params.maxRangeMeters)) * plotW);
      const dashLen = Math.max(3, (cursorWidthPx * 0.85) / 1.5);
      lineMarks.set(detection.targetId, { x, y, alpha, dashLen });
    }

    this.ctx.save();
    this.ctx.lineWidth = 2;
    this.ctx.setLineDash([3, 2]);
    for (const marksByTarget of this.bScopeLineMarks.values()) {
      for (const mark of marksByTarget.values()) {
        this.ctx.strokeStyle = `rgba(196, 255, 216, ${mark.alpha})`;
        this.ctx.beginPath();
        this.ctx.moveTo(mark.x - mark.dashLen * 0.5, mark.y);
        this.ctx.lineTo(mark.x + mark.dashLen * 0.5, mark.y);
        this.ctx.stroke();
      }
    }
    this.ctx.restore();

    if (cursor) {
      const rel = this.shortestAngleDiffRad(cursor.azimuthRad, centerAz);
      const rawX = ((rel / spanRad) + 0.5) * plotW;
      const rawY = (1 - cursor.rangeMeters / Math.max(1, params.maxRangeMeters)) * plotH;
      const widthPx = Math.max(6, (params.cursorWidthMeters / Math.max(1, params.maxRangeMeters)) * plotW);
      const lengthPx = Math.max(6, (params.cursorLengthMeters / Math.max(1, params.maxRangeMeters)) * plotH);

      this.ctx.strokeStyle = 'rgba(151, 255, 186, 1)';
      this.ctx.lineWidth = 1.5;
      let drawWidth = widthPx;
      let drawHeight = lengthPx;
      if (controlMode === 'mig29' && mig29RadarMode === 'v') {
        drawWidth = widthPx * 0.5;
        drawHeight = Math.max(5, lengthPx * 0.35);
      }
      const halfW = drawWidth * 0.5;
      const halfH = drawHeight * 0.5;
      const x = Math.max(halfW, Math.min(plotW - halfW, rawX));
      const y = Math.max(halfH, Math.min(plotH - halfH, rawY));
      this.ctx.strokeRect(x - drawWidth * 0.5, y - drawHeight * 0.5, drawWidth, drawHeight);
    }

    this.ctx.restore();

    this.drawRightEdgeMarker(offsetX, offsetY, squareSize);

    if (controlMode === 'mig29') {
      this.drawMig29RangeScale(offsetX, offsetY, squareSize, params.maxRangeMeters, mig29RangeTickKm);
      this.drawMig29ZoneIndicator(offsetX, offsetY, squareSize, mig29ZonePosition);
      this.drawCompassScale(offsetX, offsetY, squareSize, centerAz);
      this.drawMig29RlLabel(offsetX, offsetY, squareSize, params.maxRangeMeters, mig29RangeTickKm);
      this.drawMig29SpatialIndicator(offsetX, offsetY, squareSize, params, mig29RadarMode);
    }

    this.drawIndicators(width, height, params, sweepElevationRad, {
      externalRight: true,
      altitudeX: offsetX + squareSize - 18,
      altitudeY: offsetY - 30,
      scanLineX: offsetX + squareSize + 22,
      scanLineY: offsetY + squareSize - 4,
    });
  }

  private drawMig29RangeScale(
    offsetX: number,
    offsetY: number,
    squareSize: number,
    maxRangeMeters: number,
    tickKm: number,
  ): void {
    const maxKm = maxRangeMeters / 1000;
    const ticks = Math.max(1, Math.floor(maxKm / Math.max(1, tickKm)));

    this.ctx.save();
    this.ctx.strokeStyle = 'rgba(121, 255, 180, 0.95)';
    this.ctx.fillStyle = 'rgba(121, 255, 180, 0.95)';
    this.ctx.font = '20px sans-serif';
    this.ctx.textAlign = 'right';
    this.ctx.textBaseline = 'middle';

    this.ctx.beginPath();
    this.ctx.moveTo(offsetX - 8, offsetY + squareSize);
    this.ctx.lineTo(offsetX - 2, offsetY + squareSize);
    this.ctx.stroke();

    for (let i = 1; i <= ticks; i += 1) {
      const km = i * tickKm;
      const norm = Math.max(0, Math.min(1, km / Math.max(1, maxKm)));
      const y = offsetY + squareSize * (1 - norm);
      this.ctx.beginPath();
      this.ctx.moveTo(offsetX - 8, y);
      this.ctx.lineTo(offsetX - 2, y);
      this.ctx.stroke();
      this.ctx.fillText(`${km}`, Math.max(2, offsetX - 12), y);
    }

    this.ctx.restore();
  }

  private drawMig29ZoneIndicator(
    offsetX: number,
    offsetY: number,
    squareSize: number,
    zonePosition: Mig29ZonePosition,
  ): void {
    const indicatorW = squareSize / 3;
    const y = offsetY + squareSize + 8;

    let x = offsetX + (squareSize - indicatorW) * 0.5;
    if (zonePosition === 'left') {
      x = offsetX;
    } else if (zonePosition === 'right') {
      x = offsetX + squareSize - indicatorW;
    }

    this.ctx.save();
    this.ctx.strokeStyle = 'rgba(121, 255, 180, 0.95)';
    this.ctx.lineWidth = 2;
    this.ctx.beginPath();
    this.ctx.moveTo(x, y);
    this.ctx.lineTo(x + indicatorW, y);
    this.ctx.stroke();
    this.ctx.restore();
  }

  private drawCompassScale(offsetX: number, offsetY: number, squareSize: number, centerAzimuthRad: number): void {
    const y = offsetY - 10;
    const centerX = offsetX + squareSize * 0.5;
    const widthFactor = 0.36;

    this.ctx.save();
    this.ctx.strokeStyle = 'rgba(121, 255, 180, 0.95)';
    this.ctx.fillStyle = 'rgba(121, 255, 180, 0.95)';
    this.ctx.lineWidth = 1;
    this.ctx.font = '20px sans-serif';

    for (let deg = -30; deg <= 30; deg += 10) {
      const x = centerX + (deg / 60) * squareSize * widthFactor;
      this.ctx.beginPath();
      this.ctx.moveTo(x, y - 6);
      this.ctx.lineTo(x, y);
      this.ctx.stroke();

      if (deg === -10 || deg === 10) {
        const absolute = this.normalizeAngleDeg((centerAzimuthRad * 180) / Math.PI + deg);
        this.ctx.fillText(`${Math.round(absolute / 10)}`, x - 12, y - 8);
      }
    }

    this.ctx.beginPath();
    this.ctx.moveTo(centerX, y + 7);
    this.ctx.lineTo(centerX - 5, y + 1);
    this.ctx.lineTo(centerX + 5, y + 1);
    this.ctx.closePath();
    this.ctx.fill();

    this.ctx.restore();
  }

  private drawMig29RlLabel(
    offsetX: number,
    offsetY: number,
    squareSize: number,
    maxRangeMeters: number,
    tickKm: number,
  ): void {
    const maxKm = maxRangeMeters / 1000;
    const ticks = Math.max(1, Math.floor(maxKm / Math.max(1, tickKm)));
    if (ticks < 2) {
      return;
    }

    const km = (ticks - 1) * tickKm;

    this.ctx.save();
    this.ctx.fillStyle = 'rgba(121, 255, 180, 0.95)';
    this.ctx.font = '36px sans-serif';

    const y = offsetY + squareSize * (1 - km / Math.max(1, maxKm));
    this.ctx.fillText('РЛ', Math.max(2, offsetX - 118), y + 36);

    this.ctx.restore();
  }

  private drawRightEdgeMarker(offsetX: number, offsetY: number, squareSize: number): void {
    const x = offsetX + squareSize;
    const y = offsetY + squareSize * 0.5;

    this.ctx.save();
    this.ctx.strokeStyle = 'rgba(121, 255, 180, 0.95)';
    this.ctx.lineWidth = 1.5;
    this.ctx.beginPath();
    this.ctx.moveTo(x - 2, y);
    this.ctx.lineTo(x - 12, y - 7);
    this.ctx.lineTo(x - 12, y + 7);
    this.ctx.closePath();
    this.ctx.stroke();
    this.ctx.restore();
  }

  private drawMig29SpatialIndicator(
    offsetX: number,
    offsetY: number,
    squareSize: number,
    params: RadarParams,
    mig29RadarMode: Mig29RadarMode,
  ): void {
    if (mig29RadarMode !== 'auto') {
      return;
    }

    const maxKm = Math.max(1, params.maxRangeMeters / 1000);
    const centerX = offsetX + squareSize * 0.5;
    const centerY = offsetY + squareSize * 0.5;
    const y75 = offsetY + squareSize * (1 - 75 / maxKm);
    const y60 = offsetY + squareSize * (1 - 60 / maxKm);
    const yTop = Math.min(y75, y60);
    const yBottom = Math.max(y75, y60);
    const lineY = centerY;
    const halfCursorWidthPx = Math.max(3, (params.cursorWidthMeters / Math.max(1, params.maxRangeMeters)) * squareSize * 0.5);
    const halfCursorHeightPx = Math.max(3, (params.cursorLengthMeters / Math.max(1, params.maxRangeMeters)) * squareSize * 0.5);
    const delta15DegPx = (Math.min(15, params.azimuthScanSpanDeg * 0.5) / Math.max(1, params.azimuthScanSpanDeg)) * squareSize;
    const rightStartX = centerX + halfCursorWidthPx;
    const leftStartX = centerX - halfCursorWidthPx;
    const rightEndX = centerX + delta15DegPx;
    const leftEndX = centerX - delta15DegPx;
    const tickLen = Math.max(3, halfCursorHeightPx);

    this.ctx.save();
    this.ctx.strokeStyle = 'rgba(121, 255, 180, 0.95)';
    this.ctx.lineWidth = 1.5;

    this.ctx.beginPath();
    this.ctx.moveTo(centerX, yTop + 2);
    this.ctx.lineTo(centerX, yBottom + 8);

    this.ctx.moveTo(rightStartX, lineY);
    this.ctx.lineTo(rightEndX, lineY);
    const rightTickX = centerX + (rightEndX - centerX) / 3;
    this.ctx.moveTo(rightTickX, lineY);
    this.ctx.lineTo(rightTickX, lineY + tickLen);

    this.ctx.moveTo(leftStartX, lineY);
    this.ctx.lineTo(leftEndX, lineY);
    const leftTickX = centerX - (centerX - leftEndX) / 3;
    this.ctx.moveTo(leftTickX, lineY);
    this.ctx.lineTo(leftTickX, lineY + tickLen);

    this.ctx.stroke();
    this.ctx.restore();
  }

  private getScopeLayout(
    width: number,
    height: number,
    azimuthSpanDeg: number,
  ): { cx: number; cy: number; radius: number } {
    const cx = width * 0.5;
    const baseRadius = Math.min(width, height) * 0.43;
    const spanNorm = Math.max(0, Math.min(1, (360 - Math.max(10, Math.min(360, azimuthSpanDeg))) / 350));
    const cy = height * (0.5 + spanNorm * 0.34);
    const zoomFactor = 1 + spanNorm * 0.55;
    const radius = Math.min(baseRadius * zoomFactor, Math.max(width, height) * 0.9);
    return { cx, cy, radius };
  }

  private toCursorStateFromPpiPoint(
    canvasX: number,
    canvasY: number,
    maxRangeMeters: number,
    azimuthSpanDeg: number,
  ): RadarCursorState | null {
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    const { cx, cy, radius } = this.getScopeLayout(width, height, azimuthSpanDeg);

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

  private toCursorStateFromBScopePoint(
    canvasX: number,
    canvasY: number,
    params: RadarParams,
  ): RadarCursorState | null {
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    const pad = 24;
    const maxSquare = Math.max(1, Math.min(width - pad * 2, height - pad * 2));
    const squareSize = Math.max(1, maxSquare * 0.86);
    const plotW = squareSize;
    const plotH = squareSize;
    const offsetX = (width - squareSize) * 0.5;
    const offsetY = (height - squareSize) * 0.5 + 8;
    const x = canvasX - offsetX;
    const y = canvasY - offsetY;

    if (x < 0 || x > plotW || y < 0 || y > plotH) {
      return null;
    }

    const spanDeg = Math.max(10, Math.min(360, params.azimuthScanSpanDeg));
    const spanRad = spanDeg >= 359.9 ? Math.PI * 2 : (spanDeg * Math.PI) / 180;
    const centerAz = this.getScanCenterAzimuthRad(params);
    const azOffsetNorm = x / Math.max(1, plotW) - 0.5;
    const azimuthRad = this.normalizeAngleRad(centerAz + azOffsetNorm * spanRad);
    const rangeMeters = (1 - y / Math.max(1, plotH)) * params.maxRangeMeters;

    return {
      rangeMeters,
      azimuthRad,
    };
  }

  private fadeBackground(width: number, height: number): void {
    this.ctx.fillStyle = 'rgba(2, 12, 8, 0.18)';
    this.ctx.fillRect(0, 0, width, height);
  }

  private drawScope(cx: number, cy: number, radius: number, params: RadarParams): void {
    this.ctx.save();
    this.ctx.strokeStyle = 'rgba(103, 255, 179, 0.35)';
    this.ctx.lineWidth = 1;

    const spanDeg = Math.max(10, Math.min(360, params.azimuthScanSpanDeg));
    const centerAzimuthRad = ((params.radarAzimuthDeg + params.zoneAzimuthOffsetDeg) * Math.PI) / 180;
    const halfSpanRad = (spanDeg * Math.PI) / 360;
    const start = centerAzimuthRad - halfSpanRad - Math.PI / 2;
    const end = centerAzimuthRad + halfSpanRad - Math.PI / 2;

    for (let ring = 1; ring <= 4; ring += 1) {
      this.ctx.beginPath();
      if (spanDeg >= 359.9) {
        this.ctx.arc(cx, cy, (radius * ring) / 4, 0, Math.PI * 2);
      } else {
        this.ctx.arc(cx, cy, (radius * ring) / 4, start, end, false);
      }
      this.ctx.stroke();
    }

    this.ctx.beginPath();
    if (spanDeg >= 359.9) {
      this.ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    } else {
      this.ctx.arc(cx, cy, radius, start, end, false);
    }
    this.ctx.strokeStyle = 'rgba(130, 255, 196, 0.6)';
    this.ctx.stroke();

    if (spanDeg < 359.9) {
      this.ctx.strokeStyle = 'rgba(130, 255, 196, 0.55)';
      this.ctx.beginPath();
      this.ctx.moveTo(cx, cy);
      this.ctx.lineTo(cx + Math.cos(start) * radius, cy + Math.sin(start) * radius);
      this.ctx.moveTo(cx, cy);
      this.ctx.lineTo(cx + Math.cos(end) * radius, cy + Math.sin(end) * radius);
      this.ctx.stroke();
    }

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

  private drawScanZoneSector(cx: number, cy: number, radius: number, params: RadarParams): void {
    const spanDeg = Math.max(10, Math.min(360, params.azimuthScanSpanDeg));
    const centerAzimuthRad = ((params.radarAzimuthDeg + params.zoneAzimuthOffsetDeg) * Math.PI) / 180;
    const halfSpanRad = (spanDeg * Math.PI) / 360;

    if (spanDeg >= 359.9) {
      this.ctx.save();
      this.ctx.beginPath();
      this.ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      this.ctx.strokeStyle = 'rgba(92, 218, 255, 0.28)';
      this.ctx.lineWidth = 1;
      this.ctx.stroke();
      this.ctx.restore();
      return;
    }

    const start = centerAzimuthRad - halfSpanRad - Math.PI / 2;
    const end = centerAzimuthRad + halfSpanRad - Math.PI / 2;

    this.ctx.save();
    this.ctx.beginPath();
    this.ctx.moveTo(cx, cy);
    this.ctx.arc(cx, cy, radius, start, end, false);
    this.ctx.closePath();
    this.ctx.fillStyle = 'rgba(74, 179, 216, 0.08)';
    this.ctx.fill();

    this.ctx.strokeStyle = 'rgba(101, 212, 255, 0.45)';
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

  private drawIndicators(
    width: number,
    height: number,
    params: RadarParams,
    sweepElevationRad: number,
    options?: {
      externalRight?: boolean;
      altitudeX?: number;
      altitudeY?: number;
      scanLineX?: number;
      scanLineY?: number;
    },
  ): void {
    const lineColor = 'rgba(121, 255, 180, 0.95)';
    const scanLine = this.computeCurrentScanLine(params, sweepElevationRad);
    const roundedAltitude = Math.round(params.radarAltitudeMeters / 100) * 100;
    const externalRight = options?.externalRight ?? false;
    const altitudeX = options?.altitudeX ?? width - 6;
    const altitudeY = options?.altitudeY ?? 2;
    const scanLineX = options?.scanLineX ?? width - 6;
    const scanLineY = options?.scanLineY ?? height - 6;

    this.ctx.save();
    this.ctx.fillStyle = lineColor;

    if (externalRight) {
      this.ctx.textAlign = 'left';
      this.ctx.textBaseline = 'top';
    } else {
      this.ctx.textAlign = 'right';
      this.ctx.textBaseline = 'top';
    }

    this.ctx.font = '36px sans-serif';
    this.ctx.fillText(`${roundedAltitude}`, altitudeX, altitudeY);
    this.ctx.textBaseline = 'top';
    this.ctx.font = '30px sans-serif';
    this.ctx.fillText(`${scanLine}`, scanLineX, scanLineY);
    this.ctx.textAlign = 'start';
    this.ctx.textBaseline = 'alphabetic';
    this.ctx.restore();
  }

  private computeCurrentScanLine(params: RadarParams, sweepElevationRad: number): number {
    const lines = Math.max(1, Math.round(params.scanLinesCount));
    if (lines <= 1) {
      return 1;
    }

    const tiltRad = (params.antennaTiltDeg * Math.PI) / 180;
    const halfZone = (Math.max(5, Math.min(90, params.elevationFovDeg)) * Math.PI) / 360;
    const top = halfZone;
    const bottom = -halfZone;
    const rel = Math.max(bottom, Math.min(top, sweepElevationRad - tiltRad));
    const step = (top - bottom) / Math.max(1, lines - 1);
    const line = Math.round((top - rel) / Math.max(1e-6, step)) + 1;
    return Math.max(1, Math.min(lines, line));
  }

  private getScanCenterAzimuthRad(params: RadarParams): number {
    return this.normalizeAngleRad(((params.radarAzimuthDeg + params.zoneAzimuthOffsetDeg) * Math.PI) / 180);
  }

  private shortestAngleDiffRad(to: number, from: number): number {
    return this.normalizeAngleRad(to - from);
  }

  private normalizeAngleRad(angleRad: number): number {
    const tau = Math.PI * 2;
    let next = angleRad % tau;
    if (next <= -Math.PI) {
      next += tau;
    } else if (next > Math.PI) {
      next -= tau;
    }
    return next;
  }

  private normalizeAngleDeg(angleDeg: number): number {
    let next = angleDeg % 360;
    if (next < 0) {
      next += 360;
    }
    return next;
  }
}
