export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface RadarParams {
  maxRangeMeters: number;
  fovDeg: number;
  elevationFovDeg: number;
  scanSpeedDegPerSec: number;
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
  bearingRad: number;
  elevationRad: number;
  strength: number;
}

export interface SimulationFrame {
  simTimeSec: number;
  sweepAngleRad: number;
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
