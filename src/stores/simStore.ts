import { defineStore } from 'pinia';
import { ref } from 'vue';

export const useSimStore = defineStore('sim', () => {
  const isRunning = ref(true);

  function setRunning(nextState: boolean): void {
    isRunning.value = nextState;
  }

  return {
    isRunning,
    setRunning,
  };
});
