import type { Vec3 } from './types';

export const TAU = Math.PI * 2;

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function normalizeAngleRad(angle: number): number {
  const normalized = angle % TAU;
  return normalized >= 0 ? normalized : normalized + TAU;
}

export function shortestAngleDiffRad(a: number, b: number): number {
  const diff = normalizeAngleRad(a - b);
  return diff > Math.PI ? diff - TAU : diff;
}

export function magnitude(v: Vec3): number {
  return Math.hypot(v.x, v.y, v.z);
}

export function groundDistance(v: Vec3): number {
  return Math.hypot(v.x, v.z);
}

export function bearingRad(v: Vec3): number {
  return normalizeAngleRad(Math.atan2(v.x, v.z));
}

export function elevationRad(v: Vec3): number {
  return Math.atan2(v.y, groundDistance(v));
}
