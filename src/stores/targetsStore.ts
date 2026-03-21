import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import type { NewTargetInput, Target } from '../core/types';

let targetSeq = 1;

function makeTargetId(): string {
  const id = `T-${String(targetSeq).padStart(3, '0')}`;
  targetSeq += 1;
  return id;
}

export const useTargetsStore = defineStore('targets', () => {
  const targets = ref<Target[]>([]);

  const count = computed(() => targets.value.length);

  function addTarget(input: NewTargetInput): void {
    targets.value.push({
      id: makeTargetId(),
      position: { ...input.position },
      velocity: { ...input.velocity },
    });
  }

  function removeTarget(id: string): void {
    targets.value = targets.value.filter((target) => target.id !== id);
  }

  function replaceTargets(nextTargets: Target[]): void {
    targets.value = nextTargets.map((target) => ({
      id: target.id,
      position: { ...target.position },
      velocity: { ...target.velocity },
    }));
  }

  return {
    targets,
    count,
    addTarget,
    removeTarget,
    replaceTargets,
  };
});
