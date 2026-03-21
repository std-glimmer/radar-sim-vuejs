export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface RadarParams {
  maxRangeMeters: number;
  radarAltitudeMeters: number;
  radarAzimuthDeg: number;
  fovDeg: number;
  beamElevationDeg: number;
  scanLinesCount: number;
  autoBeamElevationByScanLines: boolean;
  elevationFovDeg: number;
  scanSpeedDegPerSec: number;
  azimuthScanSpanDeg: number;
  antennaTiltDeg: number;
  zoneAzimuthOffsetDeg: number;
}

export interface Target {
  id: string;
  position: Vec3;
  velocity: Vec3;
}

export interface Detection {
  targetId: string;
  distanceMeters: number;
  groundDistanceMeters: number;
  relativeAltitudeMeters: number;
  bearingRad: number;
  elevationRad: number;
  strength: number;
}

export interface SimulationFrame {
  simTimeSec: number;
  sweepAngleRad: number;
  sweepElevationRad: number;
  targets: Target[];
  detections: Detection[];
}

export interface EngineState {
  simTimeSec: number;
  sweepAngleRad: number;
  targets: Target[];
}

export interface NewTargetInput {
  position: Vec3;
  velocity: Vec3;
}
