<script setup lang="ts">
defineProps<{
  cols?: 2 | 3 | 4
}>()
</script>

<template>
  <div class="card-grid" :class="[`cols-${cols || 3}`]">
    <slot />
  </div>
</template>

<style scoped>
.card-grid {
  @apply grid gap-4;
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
</style>
