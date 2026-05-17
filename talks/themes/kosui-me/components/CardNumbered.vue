<script setup lang="ts">
import CardBase from './CardBase.vue'
import CardBadge from './CardBadge.vue'
import CardContent from './CardContent.vue'

defineProps<{
  number: number | string
  title: string
  description?: string
}>()
</script>

<template>
  <CardBase variant="neutral" padding="md" align="center">
    <CardBadge :value="number" size="xl" />
    <CardContent :title="title" :description="description" titleSize="lg">
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
  @apply text-base mt-1;
}
</style>
