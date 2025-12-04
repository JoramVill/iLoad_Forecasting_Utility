<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'

const props = defineProps<{
  lines: { text: string; type?: 'normal' | 'error' | 'success' }[]
}>()

const consoleRef = ref<HTMLElement | null>(null)

watch(() => props.lines.length, async () => {
  await nextTick()
  if (consoleRef.value) {
    consoleRef.value.scrollTop = consoleRef.value.scrollHeight
  }
})
</script>

<template>
  <div class="console-output" ref="consoleRef">
    <div
      v-for="(line, index) in lines"
      :key="index"
      class="line"
      :class="line.type"
    >{{ line.text }}</div>
    <div v-if="lines.length === 0" class="line" style="color: #64748b;">
      Waiting for command...
    </div>
  </div>
</template>
