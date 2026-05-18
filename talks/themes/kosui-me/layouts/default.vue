<script setup lang="ts">
import { useNav } from '@slidev/client'
const { currentPage } = useNav()
</script>

<template>
  <div class="slidev-layout kosui-default">
    <slot />
    <footer class="kosui-footer">
      <span class="kosui-mark">
        <img
          src="https://icon.kosui.me/"
          alt="kosui icon"
          class="kosui-icon"
        />
        <span class="kosui-name">kosui</span>
      </span>
      <span class="kosui-page">{{ currentPage }}</span>
    </footer>
  </div>
</template>
