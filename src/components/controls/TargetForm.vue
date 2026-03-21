<script setup lang="ts">
import { reactive } from 'vue';
import type { NewTargetInput } from '../../core/types';

const emit = defineEmits<{
  submit: [payload: NewTargetInput];
}>();

const form = reactive({
  x: 30000,
  y: 6000,
  z: 50000,
});

function submitForm(): void {
  emit('submit', {
    position: {
      x: Number(form.x),
      y: Number(form.y),
      z: Number(form.z),
    },
  });
}
</script>

<template>
  <form class="target-form" @submit.prevent="submitForm">
    <label>x <input v-model.number="form.x" type="number" /></label>
    <label>y <input v-model.number="form.y" type="number" /></label>
    <label>z <input v-model.number="form.z" type="number" /></label>
    <button type="submit">Добавить цель</button>
  </form>
</template>

<style scoped>
.target-form {
  display: grid;
  grid-template-columns: repeat(3, minmax(70px, 1fr)) 140px;
  gap: 6px;
  align-items: end;
}

label {
  display: grid;
  gap: 4px;
  color: #c3d6e8;
  font-size: 11px;
}

input {
  width: 100%;
  border: 1px solid rgba(180, 212, 236, 0.28);
  background: rgba(8, 17, 27, 0.82);
  color: #e7f4ff;
  border-radius: 6px;
  padding: 5px 7px;
}

button {
  border: 1px solid rgba(129, 227, 178, 0.45);
  border-radius: 6px;
  padding: 7px 8px;
  color: #d8ffe8;
  background: rgba(16, 65, 43, 0.75);
  cursor: pointer;
}

@media (max-width: 980px) {
  .target-form {
    grid-template-columns: repeat(3, minmax(70px, 1fr));
  }

  button {
    grid-column: 1 / -1;
  }
}
</style>
