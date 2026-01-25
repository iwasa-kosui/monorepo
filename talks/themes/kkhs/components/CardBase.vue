<script setup lang="ts">
defineProps<{
  variant?: 'neutral' | 'primary' | 'error'
  bordered?: boolean
  padding?: 'sm' | 'md' | 'lg'
  align?: 'left' | 'center'
}>()
</script>

<template>
  <div
    class="card-base"
    :class="[
      variant || 'neutral',
      padding || 'md',
      { bordered, 'text-center': align === 'center' }
    ]"
  >
    <slot />
  </div>
</template>

<style scoped>
.card-base {
  @apply rounded-lg;
}

/* Variant styles */
.card-base.neutral {
  background-color: var(--card-bg-neutral);
}

.card-base.primary {
  background-color: var(--card-bg-primary);
}

.card-base.error {
  background-color: var(--card-bg-error);
}

/* Bordered style (for selected state) */
.card-base.bordered {
  @apply border-2;
  border-color: var(--card-border-selected);
}

/* Padding styles */
.card-base.sm {
  padding: var(--card-padding-sm);
}

.card-base.md {
  padding: var(--card-padding-md);
}

.card-base.lg {
  padding: var(--card-padding-lg);
}
</style>
