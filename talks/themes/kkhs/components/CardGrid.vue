<script setup lang="ts">
defineProps<{
  cols?: 1 | 2 | 3 | 4 | 5
}>()
</script>

<template>
  <div class="card-grid" :class="[`cols-${cols || 3}`]">
    <slot />
  </div>
</template>

<style scoped>
.card-grid {
  @apply grid gap-4 mt-4;
}

.card-grid.cols-1 {
  @apply grid-cols-1;
}

.card-grid.cols-2 {
  @apply grid-cols-2;
}

.card-grid.cols-3 {
  @apply grid-cols-3;
}

.card-grid.cols-4 {
  @apply grid-cols-4;
}

.card-grid.cols-5 {
  @apply grid-cols-5;
}
</style>
