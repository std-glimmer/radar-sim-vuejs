<template>
  <div class="sim-layout">
    <div class="left-pane">
      <slot name="left" />
    </div>
    <div class="right-top-pane">
      <slot name="right-top" />
    </div>
    <div class="right-bottom-pane">
      <slot name="right-bottom" />
    </div>
  </div>
</template>

<style scoped>
.sim-layout {
  display: grid;
  gap: 12px;
  grid-template-columns: 1.35fr 1fr;
  grid-template-rows: 1fr 1fr;
  height: 100%;
}

.left-pane,
.right-top-pane,
.right-bottom-pane {
  min-height: 0;
  border: 1px solid rgba(131, 159, 183, 0.22);
  border-radius: 10px;
  overflow: hidden;
}

.left-pane {
  grid-row: 1 / 3;
  background: linear-gradient(165deg, #152432 0%, #0b131b 62%, #090e14 100%);
}

.right-top-pane {
  background: #0e1721;
}

.right-bottom-pane {
  background: #020a06;
}

@media (max-width: 980px) {
  .sim-layout {
    grid-template-columns: 1fr;
    grid-template-rows: minmax(300px, 1fr) minmax(220px, 0.7fr) minmax(220px, 0.7fr);
  }

  .left-pane {
    grid-row: auto;
  }
}
</style>
