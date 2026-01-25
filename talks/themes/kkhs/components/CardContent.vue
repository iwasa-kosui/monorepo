<script setup lang="ts">
defineProps<{
  title?: string
  description?: string
  subdescription?: string
  titleSize?: 'sm' | 'md' | 'lg'
}>()
</script>

<template>
  <div class="card-content">
    <h4 v-if="title" class="title" :class="[titleSize || 'md']">{{ title }}</h4>
    <p v-if="description" class="description">{{ description }}</p>
    <p v-if="subdescription" class="subdescription">{{ subdescription }}</p>
    <div v-if="$slots.default" class="slot-content">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.card-content {
  @apply flex flex-col;
}

.title {
  @apply font-bold my-0;
}

.title.sm {
  @apply text-sm;
}

.title.md {
  @apply text-base;
}

.title.lg {
  @apply text-lg;
}

.description {
  @apply text-sm text-slate-600 my-0;
  white-space: pre-line;
}

.subdescription {
  @apply text-xs text-slate-500 mt-1 mb-0;
  white-space: pre-line;
}

.slot-content {
  @apply text-xs text-slate-600;
}

.slot-content :deep(p) {
  @apply my-0;
}

.slot-content :deep(.highlight) {
  @apply font-bold;
}
</style>
