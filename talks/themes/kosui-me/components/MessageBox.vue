<script setup lang="ts">
defineProps<{
  variant?: 'primary' | 'neutral'
}>()
</script>

<template>
  <div class="message-box" :class="[variant || 'primary']">
    <slot />
  </div>
</template>

<style scoped>
.message-box {
  @apply p-4 rounded-lg mb-4;
}

.message-box.primary {
  background-color: color-mix(in srgb, var(--theme-primary) 10%, white);
}

.message-box.neutral {
  @apply bg-slate-50;
}

.message-box :deep(p) {
  @apply text-xl font-bold text-center my-0;
}
</style>
