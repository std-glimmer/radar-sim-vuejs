import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import type { NewTargetInput, Target } from '../core/types';

let targetSeq = 1;

function makeTargetId(): string {
  const id = `TGT-${String(targetSeq).padStart(2, '0')}`;
  targetSeq += 1;
  return id;
}

function reseedTargetSeq(existingTargets: Target[]): void {
  let maxSeq = 0;
  for (const target of existingTargets) {
    const match = /^TGT-(\d+)$/.exec(target.id);
    if (!match) {
      continue;
    }
    maxSeq = Math.max(maxSeq, Number(match[1]));
  }

  targetSeq = maxSeq + 1;
}

export const useTargetsStore = defineStore('targets', () => {
  const targets = ref<Target[]>([]);

  const count = computed(() => targets.value.length);

  function addTarget(input: NewTargetInput): void {
    targets.value.push({
      id: makeTargetId(),
      position: { ...input.position },
    });
  }

  function removeTarget(id: string): void {
    targets.value = targets.value.filter((target) => target.id !== id);
  }

  function replaceTargets(nextTargets: Target[]): void {
    targets.value = nextTargets.map((target) => ({
      id: target.id,
      position: { ...target.position },
    }));
    reseedTargetSeq(targets.value);
  }

  return {
    targets,
    count,
    addTarget,
    removeTarget,
    replaceTargets,
  };
});
