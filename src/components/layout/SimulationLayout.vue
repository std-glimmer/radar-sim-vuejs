<template>
  <div class="sim-layout">
    <div class="scene-pane">
      <slot name="scene" />
    </div>

    <div class="controls-pane">
      <slot name="controls" />
    </div>

    <div class="side-pane">
      <slot name="side" />
    </div>

    <div class="radar-pane">
      <slot name="radar" />
    </div>
  </div>
</template>

<style scoped>
.sim-layout {
  display: grid;
  gap: 12px;
  grid-template-columns: 1.35fr 0.9fr 1fr;
  grid-template-rows: 1fr 1fr;
  height: 100%;
}

.scene-pane,
.controls-pane,
.side-pane,
.radar-pane {
  min-height: 0;
  border: 1px solid rgba(131, 159, 183, 0.22);
  border-radius: 10px;
  overflow: hidden;
}

.scene-pane {
  grid-column: 1;
  grid-row: 1 / 3;
  background: linear-gradient(165deg, #152432 0%, #0b131b 62%, #090e14 100%);
}

.controls-pane {
  grid-column: 2;
  grid-row: 1 / 3;
  background: rgba(7, 16, 26, 0.92);
}

.side-pane {
  grid-column: 3;
  grid-row: 1;
  background: #0e1721;
}

.radar-pane {
  grid-column: 3;
  grid-row: 2;
  background: #020a06;
}

@media (max-width: 980px) {
  .sim-layout {
    grid-template-columns: 1fr;
    grid-template-rows: minmax(300px, 1fr) minmax(220px, 0.7fr) minmax(220px, 0.7fr) minmax(220px, 0.7fr);
  }

  .scene-pane,
  .controls-pane,
  .side-pane,
  .radar-pane {
    grid-column: auto;
    grid-row: auto;
  }
}
</style>
