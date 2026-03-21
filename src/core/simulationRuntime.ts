import { RadarEngine } from './radarEngine';
import { SimulationLoop } from './simulationLoop';
import type { RadarParams, SimulationFrame, Target } from './types';

interface RuntimeDeps {
  getParams: () => RadarParams;
  getTargets: () => Target[];
  isRunning: () => boolean;
  commitFrame: (frame: SimulationFrame) => void;
  commitTargets: (targets: Target[]) => void;
}

export class SimulationRuntime {
  private readonly deps: RuntimeDeps;
  private readonly engine: RadarEngine;
  private readonly loop: SimulationLoop;

  constructor(deps: RuntimeDeps) {
    this.deps = deps;
    this.engine = new RadarEngine(deps.getParams());
    this.loop = new SimulationLoop({
      onStep: (dtSec) => {
        this.engine.setParams(this.deps.getParams());
        this.engine.setTargets(this.deps.getTargets());
        return this.engine.step(this.deps.isRunning() ? dtSec : 0);
      },
      onFrame: (frame) => {
        this.deps.commitFrame(frame);
        this.deps.commitTargets(frame.targets);
      },
    });
  }

  start(): void {
    this.loop.start();
  }

  stop(): void {
    this.loop.stop();
  }
}
