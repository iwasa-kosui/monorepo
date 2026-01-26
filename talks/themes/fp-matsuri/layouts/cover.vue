<script setup lang="ts">
import { computed } from 'vue'
import { handleBackground } from '../layoutHelper'

const props = defineProps({
  background: {
    default: '',
  },
})

const style = computed(() => handleBackground(props.background, true))
</script>

<template>
  <div class="slidev-layout cover" :style="style">
    <div class="my-auto w-full">
      <slot />
    </div>
    <div class='text-[100px] absolute right-8 bottom-8'>
      <slot name="icon" />
    </div>
  </div>
</template>
