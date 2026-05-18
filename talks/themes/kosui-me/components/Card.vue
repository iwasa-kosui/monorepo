<script setup lang="ts">
import CardBase from './CardBase.vue'
import CardContent from './CardContent.vue'

defineProps<{
  title: string
  description?: string
}>()
</script>

<template>
  <CardBase variant="neutral" padding="md" align="center">
    <CardContent :title="title" :description="description" titleSize="md">
      <slot />
    </CardContent>
  </CardBase>
</template>

<style scoped>
:deep(.card-content) {
  @apply text-center;
}

:deep(.title) {
  @apply mb-1;
}

:deep(.description) {
  @apply mt-1;
}
</style>
