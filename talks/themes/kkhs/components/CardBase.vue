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
  background-color: var(--theme-accent-bg);
}

.card-base.primary {
  background-color: color-mix(in srgb, var(--theme-primary) 8%, var(--theme-bg));
}

.card-base.error {
  background-color: color-mix(in srgb, var(--theme-negative) 6%, var(--theme-bg));
}

/* Bordered style (for selected state) */
.card-base.bordered {
  @apply border-2;
  border-color: color-mix(in srgb, var(--theme-primary) 90%, white);
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
