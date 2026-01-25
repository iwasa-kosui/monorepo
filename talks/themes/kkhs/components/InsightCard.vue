<script setup lang="ts">
import { computed } from 'vue'
import CardBase from './CardBase.vue'
import CardContent from './CardContent.vue'

const props = defineProps<{
  title: string
  variant?: 'neutral' | 'positive' | 'negative'
}>()

// Map positive/negative to primary/error for CardBase
const cardVariant = computed(() => {
  if (props.variant === 'positive') return 'primary'
  if (props.variant === 'negative') return 'error'
  return 'neutral'
})
</script>

<template>
  <CardBase :variant="cardVariant" padding="md" class="insight-card">
    <CardContent :title="title" titleSize="sm">
      <slot />
    </CardContent>
  </CardBase>
</template>

<style scoped>
.insight-card {
  @apply mt-2;
}

.insight-card :deep(.title) {
  @apply mb-2;
}
</style>
