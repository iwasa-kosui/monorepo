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
    <CardContent :title="title" titleSize="lg">
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

.insight-card .error {

  ul {
    list-style: none;

    li {
      @apply mb-2 relative pl-6;

      &::before {
        content: '';
        position: absolute;
        left: 0;
        top: 0.7em;
        width: 8px;
        height: 8px;
        background-color: var(--theme-negative);
        border-radius: 4px;
      }
    }

    ul li::before {
      background-color: var(--theme-negative);
      width: 6px;
      height: 6px;
    }
  }
}
</style>
