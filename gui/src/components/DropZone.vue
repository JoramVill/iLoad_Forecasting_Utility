<script setup lang="ts">
import { ref } from 'vue'

interface FileInfo {
  path: string
  name: string
  size: number
}

defineProps<{
  label: string
  accept?: string
  multiple?: boolean
  files: FileInfo[]
}>()

const emit = defineEmits<{
  (e: 'files-dropped', files: FileInfo[]): void
  (e: 'file-removed', index: number): void
}>()

const isDragOver = ref(false)

function formatSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

function handleDragOver(e: DragEvent) {
  e.preventDefault()
  isDragOver.value = true
}

function handleDragLeave() {
  isDragOver.value = false
}

function handleDrop(e: DragEvent) {
  e.preventDefault()
  isDragOver.value = false

  const droppedFiles = e.dataTransfer?.files
  if (droppedFiles) {
    const fileInfos: FileInfo[] = []
    for (let i = 0; i < droppedFiles.length; i++) {
      const file = droppedFiles[i]
      fileInfos.push({
        path: (file as any).path || file.name,
        name: file.name,
        size: file.size
      })
    }
    emit('files-dropped', fileInfos)
  }
}

async function handleClick() {
  if (window.electronAPI) {
    const filePath = await window.electronAPI.selectFile({
      filters: [{ name: 'CSV Files', extensions: ['csv'] }]
    })
    if (filePath) {
      const name = filePath.split(/[/\\]/).pop() || filePath
      emit('files-dropped', [{ path: filePath, name, size: 0 }])
    }
  }
}

function removeFile(index: number) {
  emit('file-removed', index)
}
</script>

<template>
  <div>
    <div
      class="drop-zone"
      :class="{ dragover: isDragOver }"
      @dragover="handleDragOver"
      @dragleave="handleDragLeave"
      @drop="handleDrop"
      @click="handleClick"
    >
      <div class="icon">&#128451;</div>
      <h4>{{ label }}</h4>
      <p>Drag and drop files here, or click to browse</p>
    </div>

    <div class="file-list" v-if="files.length > 0">
      <div class="file-item" v-for="(file, index) in files" :key="file.path">
        <div class="file-info">
          <span class="file-icon">&#128196;</span>
          <span class="file-name">{{ file.name }}</span>
          <span class="file-size" v-if="file.size > 0">{{ formatSize(file.size) }}</span>
        </div>
        <button class="remove-btn" @click.stop="removeFile(index)">&#10005;</button>
      </div>
    </div>
  </div>
</template>
