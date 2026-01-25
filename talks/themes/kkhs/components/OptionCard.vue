<script setup lang="ts">
import { computed } from 'vue'
import CardBase from './CardBase.vue'
import CardContent from './CardContent.vue'

const props = defineProps<{
  title: string
  status?: 'selected' | 'rejected' | 'neutral'
  statusText?: string
}>()

// Map status to variant and bordered
const cardVariant = computed(() => {
  if (props.status === 'selected') return 'primary'
  if (props.status === 'rejected') return 'error'
  return 'neutral'
})

const isBordered = computed(() => props.status === 'selected')
</script>

<template>
  <CardBase :variant="cardVariant" :bordered="isBordered" padding="md">
    <CardContent :title="title">
      <slot />
    </CardContent>
    <p v-if="statusText" class="status" :class="[status || 'neutral']">{{ statusText }}</p>
  </CardBase>
</template>

<style scoped>
:deep(.title) {
  @apply mb-2;
}

.status {
  @apply mt-2 mb-0 text-xs;
}

.status.rejected {
  @apply text-red-600;
}

.status.selected {
  @apply font-bold;
  color: var(--slidev-theme-primary);
}

.status.neutral {
  @apply text-slate-500;
}
</style>
