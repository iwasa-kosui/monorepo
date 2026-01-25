<script setup lang="ts">
defineProps<{
  gap?: 'sm' | 'md' | 'lg'
}>()
</script>

<template>
  <div class="card-header" :class="[gap || 'md']">
    <div v-if="$slots.badge" class="badge-slot">
      <slot name="badge" />
    </div>
    <div v-if="$slots.title" class="title-slot">
      <slot name="title" />
    </div>
  </div>
</template>

<style scoped>
.card-header {
  @apply flex items-center mb-2;
}

.card-header.sm {
  @apply gap-2;
}

.card-header.md {
  @apply gap-3;
}

.card-header.lg {
  @apply gap-4;
}

.title-slot {
  @apply font-bold;
}
</style>
