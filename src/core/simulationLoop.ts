import type { SimulationFrame } from './types';

interface LoopOptions {
  fixedTimeStepSec?: number;
  onStep: (dtSec: number) => SimulationFrame;
  onFrame: (frame: SimulationFrame) => void;
}

export class SimulationLoop {
  private readonly fixedTimeStepSec: number;
  private readonly onStep: (dtSec: number) => SimulationFrame;
  private readonly onFrame: (frame: SimulationFrame) => void;

  private rafId: number | null = null;
  private accumulatorSec = 0;
  private lastTimestampMs = 0;
  private latestFrame: SimulationFrame | null = null;

  constructor(options: LoopOptions) {
    this.fixedTimeStepSec = options.fixedTimeStepSec ?? 1 / 60;
    this.onStep = options.onStep;
    this.onFrame = options.onFrame;
  }

  start(): void {
    if (this.rafId !== null) {
      return;
    }

    this.lastTimestampMs = performance.now();
    this.rafId = requestAnimationFrame(this.tick);
  }

  stop(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
    }

    this.rafId = null;
    this.accumulatorSec = 0;
  }

  private tick = (timestampMs: number): void => {
    const deltaMs = timestampMs - this.lastTimestampMs;
    this.lastTimestampMs = timestampMs;

    const deltaSec = Math.min(deltaMs / 1000, 0.25);
    this.accumulatorSec += deltaSec;

    while (this.accumulatorSec >= this.fixedTimeStepSec) {
      this.latestFrame = this.onStep(this.fixedTimeStepSec);
      this.accumulatorSec -= this.fixedTimeStepSec;
    }

    if (this.latestFrame) {
      this.onFrame(this.latestFrame);
    }

    this.rafId = requestAnimationFrame(this.tick);
  };
}
