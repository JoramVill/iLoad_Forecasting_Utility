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
const startDate = ref('')
const endDate = ref('')
const modelType = ref('regression')
const scalePercent = ref('0')
const outputFile = ref('')
const isRunning = ref(false)
const consoleLines = ref<{ text: string; type?: 'normal' | 'error' | 'success' }[]>([])

// Set default dates
const today = new Date()
const tomorrow = new Date(today)
tomorrow.setDate(tomorrow.getDate() + 1)
const nextWeek = new Date(today)
nextWeek.setDate(nextWeek.getDate() + 7)

startDate.value = tomorrow.toISOString().split('T')[0]
endDate.value = nextWeek.toISOString().split('T')[0]

const canRun = computed(() => {
  return demandFiles.value.length > 0 && startDate.value && endDate.value && outputFile.value && !isRunning.value
})

function handleDemandFiles(files: FileInfo[]) {
  demandFiles.value = files
}

function removeDemandFile(index: number) {
  demandFiles.value.splice(index, 1)
}

async function selectOutputFile() {
  if (window.electronAPI) {
    const file = await window.electronAPI.saveFile({
      defaultPath: 'DemandHr_FCast.csv',
      filters: [{ name: 'CSV Files', extensions: ['csv'] }]
    })
    if (file) {
      outputFile.value = file
    }
  }
}

async function runForecast() {
  if (!canRun.value) return

  isRunning.value = true
  consoleLines.value = []

  consoleLines.value.push({ text: '> Starting forecast generation...', type: 'normal' })

  const args = [
    'forecast',
    '-d', demandFiles.value[0].path,
    '-s', startDate.value,
    '-e', endDate.value,
    '-o', outputFile.value,
    '--model', modelType.value
  ]

  if (parseFloat(scalePercent.value) !== 0) {
    args.push('--scale', scalePercent.value)
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
        consoleLines.value.push({ text: '\n✅ Forecast generated successfully!', type: 'success' })
      } else {
        consoleLines.value.push({ text: `\n❌ Forecast failed with code ${result.code}`, type: 'error' })
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
      <h2>Generate Forecast</h2>
      <p>Generate demand forecast with automatic weather data fetching</p>
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
        <h3>Forecast Options</h3>
      </div>

      <div class="row">
        <div class="col">
          <div class="form-group">
            <label>Start Date</label>
            <input type="date" v-model="startDate" class="form-control" />
          </div>
        </div>
        <div class="col">
          <div class="form-group">
            <label>End Date</label>
            <input type="date" v-model="endDate" class="form-control" />
          </div>
        </div>
      </div>

      <div class="row">
        <div class="col">
          <div class="form-group">
            <label>Model Type</label>
            <select v-model="modelType" class="form-control">
              <option value="regression">Regression</option>
              <option value="xgboost">XGBoost</option>
            </select>
          </div>
        </div>
        <div class="col">
          <div class="form-group">
            <label>Scale Adjustment (%)</label>
            <input type="number" v-model="scalePercent" class="form-control" placeholder="0" step="0.5" />
            <small style="color: #64748b; font-size: 0.75rem;">
              e.g., 5 for +5%, -3 for -3%
            </small>
          </div>
        </div>
      </div>

      <div class="form-group">
        <label>Output File</label>
        <div style="display: flex; gap: 8px;">
          <input v-model="outputFile" class="form-control" placeholder="Select output file..." readonly />
          <button class="btn btn-secondary" @click="selectOutputFile">Browse</button>
        </div>
      </div>

      <button class="btn btn-primary" :disabled="!canRun" @click="runForecast">
        {{ isRunning ? 'Generating...' : 'Generate Forecast' }}
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
