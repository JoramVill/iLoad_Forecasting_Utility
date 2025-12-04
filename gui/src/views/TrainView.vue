<script setup lang="ts">
import { ref, computed } from 'vue'
import DropZone from '../components/DropZone.vue'
import ConsoleOutput from '../components/ConsoleOutput.vue'

interface FileInfo {
  path: string
  name: string
  size: number
}

const demandFiles = ref<FileInfo[]>([])
const weatherFiles = ref<FileInfo[]>([])
const modelType = ref('both')
const outputDir = ref('./output')
const isRunning = ref(false)
const consoleLines = ref<{ text: string; type?: 'normal' | 'error' | 'success' }[]>([])

const canRun = computed(() => {
  return demandFiles.value.length > 0 && weatherFiles.value.length > 0 && !isRunning.value
})

function handleDemandFiles(files: FileInfo[]) {
  demandFiles.value = files
}

function handleWeatherFiles(files: FileInfo[]) {
  weatherFiles.value = [...weatherFiles.value, ...files]
}

function removeDemandFile(index: number) {
  demandFiles.value.splice(index, 1)
}

function removeWeatherFile(index: number) {
  weatherFiles.value.splice(index, 1)
}

async function selectOutputDir() {
  if (window.electronAPI) {
    const dir = await window.electronAPI.selectDirectory()
    if (dir) {
      outputDir.value = dir
    }
  }
}

async function runTraining() {
  if (!canRun.value) return

  isRunning.value = true
  consoleLines.value = []

  consoleLines.value.push({ text: '> Starting training...', type: 'normal' })

  const args = [
    'train',
    '-d', demandFiles.value[0].path,
    '-w', ...weatherFiles.value.map(f => f.path),
    '-o', outputDir.value,
    '--model', modelType.value
  ]

  consoleLines.value.push({ text: `> iload ${args.join(' ')}`, type: 'normal' })

  try {
    if (window.electronAPI) {
      const result = await window.electronAPI.runCommand('iload', args)

      // Parse output lines
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
        consoleLines.value.push({ text: '\n✅ Training completed successfully!', type: 'success' })
      } else {
        consoleLines.value.push({ text: `\n❌ Training failed with code ${result.code}`, type: 'error' })
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
      <h2>Train Model</h2>
      <p>Train forecasting models using historical demand and weather data</p>
    </div>

    <div class="card">
      <div class="card-header">
        <h3>Historical Demand Data</h3>
      </div>
      <DropZone
        label="Drop Demand CSV File"
        :files="demandFiles"
        @files-dropped="handleDemandFiles"
        @file-removed="removeDemandFile"
      />
    </div>

    <div class="card">
      <div class="card-header">
        <h3>Weather Data</h3>
      </div>
      <DropZone
        label="Drop Weather CSV Files (one per region)"
        :files="weatherFiles"
        :multiple="true"
        @files-dropped="handleWeatherFiles"
        @file-removed="removeWeatherFile"
      />
    </div>

    <div class="card">
      <div class="card-header">
        <h3>Training Options</h3>
      </div>

      <div class="row">
        <div class="col">
          <div class="form-group">
            <label>Model Type</label>
            <select v-model="modelType" class="form-control">
              <option value="regression">Regression Only</option>
              <option value="xgboost">XGBoost Only</option>
              <option value="both">Both (Compare)</option>
            </select>
          </div>
        </div>
        <div class="col">
          <div class="form-group">
            <label>Output Directory</label>
            <div style="display: flex; gap: 8px;">
              <input v-model="outputDir" class="form-control" readonly />
              <button class="btn btn-secondary" @click="selectOutputDir">Browse</button>
            </div>
          </div>
        </div>
      </div>

      <button class="btn btn-primary" :disabled="!canRun" @click="runTraining">
        {{ isRunning ? 'Training...' : 'Start Training' }}
      </button>
    </div>

    <div class="card">
      <div class="card-header">
        <h3>Output</h3>
      </div>
      <ConsoleOutput :lines="consoleLines" />
    </div>
  </div>
</template>
