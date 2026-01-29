<script setup lang="ts">
defineProps<{
  value: number | string
  size?: 'sm' | 'md' | 'lg' | 'xl'
  variant?: 'primary' | 'secondary'
}>()
</script>

<template>
  <div class="card-badge" :class="[size || 'md', variant || 'primary']">
    {{ value }}
  </div>
</template>

<style scoped>
.card-badge {
  @apply flex items-center justify-center font-bold rounded-full;
  background-color: var(--theme-primary);
  color: white;
}

/* Variant styles */
.card-badge.secondary {
  background-color: color-mix(in srgb, var(--theme-primary) 60%, white);
}

/* Size styles */
.card-badge.sm {
  @apply w-5 h-5 text-xs;
}

.card-badge.md {
  @apply w-6 h-6 text-sm;
}

.card-badge.lg {
  @apply w-8 h-8 text-base;
}

.card-badge.xl {
  @apply text-3xl mb-2;
  width: auto;
  height: auto;
  background-color: transparent;
  color: var(--theme-primary);
}
</style>
