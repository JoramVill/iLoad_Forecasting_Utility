<script setup lang="ts">
import { ref, computed } from 'vue'
import DropZone from '../components/DropZone.vue'
import ConsoleOutput from '../components/ConsoleOutput.vue'

interface FileInfo {
  path: string
  name: string
  size: number
}

const forecastFiles = ref<FileInfo[]>([])
const actualFiles = ref<FileInfo[]>([])
const outputFile = ref('')
const isRunning = ref(false)
const consoleLines = ref<{ text: string; type?: 'normal' | 'error' | 'success' }[]>([])

const canRun = computed(() => {
  return forecastFiles.value.length > 0 && actualFiles.value.length > 0 && !isRunning.value
})

function handleForecastFiles(files: FileInfo[]) {
  forecastFiles.value = files
}

function handleActualFiles(files: FileInfo[]) {
  actualFiles.value = files
}

function removeForecastFile(index: number) {
  forecastFiles.value.splice(index, 1)
}

function removeActualFile(index: number) {
  actualFiles.value.splice(index, 1)
}

async function selectOutputFile() {
  if (window.electronAPI) {
    const file = await window.electronAPI.saveFile({
      defaultPath: 'evaluation_report.md',
      filters: [{ name: 'Markdown', extensions: ['md'] }]
    })
    if (file) {
      outputFile.value = file
    }
  }
}

async function runEvaluation() {
  if (!canRun.value) return

  isRunning.value = true
  consoleLines.value = []

  consoleLines.value.push({ text: '> Starting evaluation...', type: 'normal' })

  const args = [
    'evaluate',
    '-f', forecastFiles.value[0].path,
    '-a', actualFiles.value[0].path
  ]

  if (outputFile.value) {
    args.push('-o', outputFile.value)
  }

  consoleLines.value.push({ text: `> iload ${args.join(' ')}`, type: 'normal' })

  try {
    if (window.electronAPI) {
      const result = await window.electronAPI.runCommand('iload', args)

      const lines = result.stdout.split('\n')
      for (const line of lines) {
        if (line.trim()) {
          const type = line.includes('Error') || line.includes('❌') ? 'error'
            : line.includes('✅') || line.includes('complete') ? 'success'
            : 'normal'
          consoleLines.value.push({ text: line, type })
        }
      }

      if (result.stderr) {
        consoleLines.value.push({ text: result.stderr, type: 'error' })
      }

      if (result.code === 0) {
        consoleLines.value.push({ text: '\n✅ Evaluation completed!', type: 'success' })
      } else {
        consoleLines.value.push({ text: `\n❌ Evaluation failed with code ${result.code}`, type: 'error' })
      }
    } else {
      consoleLines.value.push({ text: 'Electron API not available (running in browser)', type: 'error' })
    }
  } catch (error: any) {
    consoleLines.value.push({ text: `Error: ${error.message}`, type: 'error' })
  }

  isRunning.value = false
}
</script>

<template>
  <div>
    <div class="page-header">
      <h2>Evaluate Forecast</h2>
      <p>Compare forecast accuracy against actual demand data</p>
    </div>

    <div class="card">
      <div class="card-header">
        <h3>Forecast Data</h3>
      </div>
      <DropZone
        label="Drop Forecast CSV File"
        :files="forecastFiles"
        @files-dropped="handleForecastFiles"
        @file-removed="removeForecastFile"
      />
    </div>

    <div class="card">
      <div class="card-header">
        <h3>Actual Demand Data</h3>
      </div>
      <DropZone
        label="Drop Actual Demand CSV File"
        :files="actualFiles"
        @files-dropped="handleActualFiles"
        @file-removed="removeActualFile"
      />
    </div>

    <div class="card">
      <div class="card-header">
        <h3>Options</h3>
      </div>

      <div class="form-group">
        <label>Output Report File (optional)</label>
        <div style="display: flex; gap: 8px;">
          <input v-model="outputFile" class="form-control" placeholder="Optional: Save report to file..." readonly />
          <button class="btn btn-secondary" @click="selectOutputFile">Browse</button>
        </div>
      </div>

      <button class="btn btn-primary" :disabled="!canRun" @click="runEvaluation">
        {{ isRunning ? 'Evaluating...' : 'Run Evaluation' }}
      </button>
    </div>

    <div class="card">
      <div class="card-header">
        <h3>Results</h3>
      </div>
      <ConsoleOutput :lines="consoleLines" />
    </div>
  </div>
</template>
