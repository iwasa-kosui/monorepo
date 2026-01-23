<script setup lang="ts">
defineProps<{
  number: number | string
  title: string
  description?: string
}>()
</script>

<template>
  <div class="list-card">
    <h4 class="title">{{ title }}</h4>
    <p v-if="description" class="description" v-html="description.replace(/\n/g, '<br>')"></p>
    <slot />
  </div>
</template>

<style scoped>
.list-card {
  @apply p-4 bg-slate-50 rounded-lg text-center;
}

.title {
  @apply font-bold text-sm mb-1;
}

.description {
  @apply text-xs text-slate-600 mt-1 mb-0;
}
</style>
