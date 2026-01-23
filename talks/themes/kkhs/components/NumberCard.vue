<script setup lang="ts">
defineProps<{
  number: number | string
  title: string
  description?: string
}>()
</script>

<template>
  <div class="number-card">
    <div class="number">{{ number }}</div>
    <h4 class="title">{{ title }}</h4>
    <p v-if="description" class="description" v-html="description.replace(/\n/g, '<br>')"></p>
    <slot />
  </div>
</template>

<style scoped>
.number-card {
  @apply p-4 bg-slate-50 rounded-lg text-center;
}

.number {
  @apply text-3xl mb-2 font-bold;
  color: var(--slidev-theme-primary);
}

.title {
  @apply font-bold text-sm mb-1;
}

.description {
  @apply text-xs text-slate-600 mt-1 mb-0;
}
</style>
