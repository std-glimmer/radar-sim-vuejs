<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { Target } from '../../core/types';
import { ThreeSceneRenderer } from '../../renderers/three/ThreeSceneRenderer';

const props = defineProps<{
  targets: Target[];
}>();

const emit = defineEmits<{
  addFromScene: [payload: { x: number; z: number }];
}>();

const hostRef = ref<HTMLDivElement | null>(null);
let renderer: ThreeSceneRenderer | null = null;
let rafId: number | null = null;

function onResize(): void {
  renderer?.resize();
}

onMounted(() => {
  if (!hostRef.value) {
    return;
  }

  renderer = new ThreeSceneRenderer(hostRef.value, {
    onAddTargetFromGroundPoint: (x, z) => emit('addFromScene', { x, z }),
  });
  renderer.syncTargets(props.targets);

  window.addEventListener('resize', onResize);

  const loop = () => {
    renderer?.render();
    rafId = requestAnimationFrame(loop);
  };

  rafId = requestAnimationFrame(loop);
});

watch(
  () => props.targets,
  (targets) => renderer?.syncTargets(targets),
  { deep: true },
);

onBeforeUnmount(() => {
  window.removeEventListener('resize', onResize);
  if (rafId !== null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
  renderer?.dispose();
  renderer = null;
});
</script>

<template>
  <div ref="hostRef" class="scene-host"></div>
</template>

<style scoped>
.scene-host {
  width: 100%;
  height: 100%;
}
</style>
