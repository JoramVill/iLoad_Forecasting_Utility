# iLoad Forecasting Utility - Implementation Context

## Project Overview
Complete Electron + Vue + Node.js application replicating the iLoad demand forecasting module from the original C++ iPool application.

## Current Status: Phase 2 (In Progress)

### Completed Work

#### Phase 1: Project Foundation ✅
- **Node.js + TypeScript Setup** - Complete
  - Initialized npm project
  - Installed dependencies: TypeScript, Electron, Vue, Vite, papaparse, luxon
  - Created tsconfig.json with proper configuration

- **Project Structure** - Complete
  ```
  src/
    core/
      constants/      - Core constants and enums
      types/          - TypeScript interfaces and type definitions
      utils/          - Utility functions (weather, timeperiod, intervals)
      parsers/        - CSV parsers (demand, temperature)
      analyzers/      - [PENDING] Statistical analysis engine
      forecasters/    - [PENDING] Forecasting engine
      models/         - [PENDING] Data models
    main/            - [PENDING] Electron main process
    renderer/        - [PENDING] Vue frontend
    public/          - [PENDING] Static assets
  ```

- **Core Constants** - Complete (`src/core/constants/index.ts`)
  - MAX_INTERVAL = 48
  - Weather categories (HOTDAY, WARMDAY, NORMDAY, COOLDAY, COLDDAY, ALLDAYS)
  - Temperature thresholds (32°C, 28°C, 22°C, 15°C)
  - Time periods (WORKDAY, WEEKEND, HOLIDAY)
  - Correlation factor = 0.2
  - All required enums and constants

- **Type Definitions** - Complete (`src/core/types/index.ts`)
  - IntervalData interface
  - WeatherData interface
  - DemandProfile interface
  - StatisticalList class (with insert and calculate methods)
  - ForecastConfig interface
  - All supporting types

- **Utility Functions** - Complete
  - Weather classification (`src/core/utils/weather.ts`)
    - classifyWeather() - Based on temperature thresholds
    - getWeatherCategoryName()
    - parseWeatherCategory()

  - Time period management (`src/core/utils/timeperiod.ts`)
    - Calendar class for holiday management
    - getTimePeriod() - Determines WORKDAY/WEEKEND/HOLIDAY
    - calculateChronologicalWeight() - Fortnight-based weighting
    - Custom day type rules support

  - Interval utilities (`src/core/utils/intervals.ts`)
    - intervalToTime() - Convert 1-48 to "HH:MM"
    - timeToInterval() - Convert time to interval number
    - isPeakInterval() - Check peak vs off-peak
    - datetimeToInterval()

- **CSV Parsers** - Complete (2 of 3)
  - Demand CSV Parser (`src/core/parsers/demand-csv-parser.ts`)
    - parseDemandCsv() - Parse DateTimeEnding format
    - groupDemandByDate() - Organize by date and profile
    - validateDemandContinuity() - Check for missing intervals
    - Supports multiple regions/meters

  - Temperature CSV Parser (`src/core/parsers/temperature-csv-parser.ts`)
    - parseTemperatureCsv() - Auto-detects format
    - Supports simple format (Date, Max, Min columns)
    - Supports alternative format (REGION_Max, REGION_Min)
    - Fahrenheit to Celsius conversion
    - convertToWeatherData() - Convert to WeatherData objects

#### Phase 2: File I/O (In Progress)
- ✅ Demand CSV Reader
- ✅ Temperature CSV Reader
- 🔄 Demand Model CSV Reader/Writer (PENDING)
- 🔄 Forecast CSV Writer (PENDING)

### Remaining Work

#### Phase 3: Statistical Analysis Engine (CRITICAL)
**Priority: HIGH**

Files to create:
- `src/core/analyzers/demand-analyzer.ts`

Key algorithm from original C++ (diload.cpp lines 1069-1859):
```cpp
// Initialize statistical lists for each:
// - Time period (WORKDAY, WEEKEND)
// - Weather category (0-5)
// - Interval (1-48)

DList** LPTMax;  // temperature max
DList** LPTMin;  // temperature min
DList** LPData;  // all intervals
DList** LPHot;   // hot day intervals
DList** LPWarm;  // warm day intervals
DList** LPNorm;  // normal day intervals
DList** LPCool;  // cool day intervals
DList** LPCold;  // cold day intervals

// Loop through historical days:
for each day:
  - Get time period (WORKDAY/WEEKEND/HOLIDAY)
  - Get weather classification
  - Calculate chronological weight = floor(dayIndex / 14) + 1
  - Add interval demands to appropriate lists (with weight)
  - Add temperature data to lists (with weight)

// Calculate statistics for each combination:
for each (time_period, weather_category):
  - Calculate temperature stats (max, median, min)
  - Calculate demand stats for each interval
  - Create DemandProfile with interval statistics
  - Set weather temperature ranges
  - Write to demand model CSV
```

**Implementation Tasks:**
1. Create DemandAnalyzer class
2. Implement Analyze() method
3. Use StatisticalList for calculations
4. Generate demand model CSV output

#### Phase 4: Forecasting Engine (CRITICAL)
**Priority: HIGH**

Files to create:
- `src/core/forecasters/demand-forecaster.ts`

Key algorithm from original C++ (EProf.cpp lines 580-636):

**Linear Interpolation - Hot Weather (uses max temperature):**
```
Given: D1=min, D2=median, D3=max demand from model
       T1=min, T2=median, T3=max temperature from model
       Tx = forecast temperature

If Tx > T3:       Dx = D3 + CoFac * |T3-Tx| * |D3-D2| / |T3-T2|
If T2 < Tx ≤ T3:  Dx = D2 + |T2-Tx| * |D3-D2| / |T3-T2|
If T1 < Tx ≤ T2:  Dx = D1 + |T1-Tx| * |D2-D1| / |T2-T1|
If Tx ≤ T1:       Dx = D1 - CoFac * |T1-Tx| * |D2-D1| / |T2-T1|

where CoFac = 0.2
```

**Linear Interpolation - Cold Weather (uses min temperature, inverse):**
- Similar formula but uses minimum temperature
- Inverse relationship (lower temp = higher demand)

**Forecasting Orchestration (diload.cpp lines 2100-2346):**
```cpp
for each forecast day:
  - Determine time period
  - Get forecast weather
  - Select appropriate demand profile
  - If weather correlation enabled:
      For each interval:
        Apply linear interpolation
  - Else:
      Use model values directly
  - Apply growth factor
  - Smooth day boundaries
  - Create forecast profile
  - Write to forecast CSV
```

**Implementation Tasks:**
1. Create DemandForecaster class
2. Implement ForecastLP() - Linear interpolation
3. Implement Forecast() - Main orchestration
4. Implement profile selection logic
5. Implement day boundary smoothing

#### Phase 5: Demand Model CSV Reader/Writer
**Priority: HIGH**

Files to create:
- `src/core/parsers/demand-model-csv-parser.ts`
- `src/core/writers/demand-model-csv-writer.ts`

**Format:**
```csv
ProfID,TimePeriod,Weather,StatCode,1,2,...,48
REGION1,DEFAULT,ALLDAYS,Wth,35.0,35.2,...,27.0,0
REGION1,DEFAULT,ALLDAYS,Max,5814.5,5789.2,...,6234.8
REGION1,DEFAULT,ALLDAYS,Med,5512.8,5487.9,...,5987.4
REGION1,DEFAULT,ALLDAYS,Min,5234.7,5198.4,...,5734.2
REGION1,DEFAULT,ALLDAYS,Ave,5523.6,5491.8,...,5985.5
```

Each profile has 5-6 lines:
- Wth: Temperature statistics (max, median, min)
- Max: Maximum demand for each interval
- Med: Median demand for each interval
- Min: Minimum demand for each interval
- Ave: Average demand for each interval

#### Phase 6: Electron + Vue UI
**Priority: MEDIUM**

Files to create:
- `src/main/index.ts` - Electron main process
- `src/renderer/App.vue` - Main Vue application
- `src/renderer/components/` - Vue components
  - FileSelector.vue
  - AnalysisPanel.vue
  - ForecastPanel.vue
  - ResultsViewer.vue
- `vite.config.ts` - Vite configuration
- `electron-builder.config.js` - Build configuration

**UI Features:**
1. File selection for demand, temperature, models
2. Configuration panel (thresholds, weighting, growth factor)
3. Analysis execution and progress
4. Forecast execution and progress
5. Results visualization (tables, charts)
6. Export functionality

#### Phase 7: Testing and Validation
**Priority: HIGH**

**Validation Against Original C++:**
1. Prepare test dataset
2. Run through original C++ iPool system
3. Run through new TypeScript implementation
4. Compare outputs:
   - Demand models (statistical values)
   - Forecasts (interval demands)
   - Ensure values within 0.5% tolerance

**Test Cases:**
- 7 days of data → verify statistics
- Multiple weather categories → verify separation
- Linear interpolation edge cases
- Temperature at boundaries
- Extreme extrapolation

## Sample Data Location
`C:\Source_Codes\iLoad_Forecasting_Utility\Data Samples\`
- Demand_Month Historical_1.csv (5-minute intervals)
- DemandHr_Month_Historical_1.csv (hourly data)
- TempHST.csv (temperature data)

**Note:** Sample data is in 5-minute intervals, needs aggregation to 30-minute.

## Reference Documentation
All located in `C:\Source_Codes\iLoad_Forecasting_Utility\`:
- 00_ARCHITECTURE_OVERVIEW.md
- 01_DETAILED_ALGORITHMS.md (CRITICAL for Phase 3 & 4)
- 02_DATA_STRUCTURES.md
- 03_IMPLEMENTATION_GUIDE_CSHARP.md (Good reference for TypeScript)
- 04_IMPLEMENTATION_ROADMAP.md

## Original C++ Source Code
- Main dialog: `C:\Source_Codes\iPoolVS19\iPool2019\iPool\Interface\Dialogs\diload.cpp` (3,258 lines)
- Analyze() method: Lines 1069-1859
- Forecast() method: Lines 2100-2346
- Linear interpolation: `C:\Source_Codes\iPoolVS19\iPool2019\iPool\App\EProf.cpp` lines 580-636

## Next Actions

### Immediate (Phase 3 - Analysis Engine)
1. Create `src/core/analyzers/demand-analyzer.ts`
2. Implement DemandAnalyzer class with Analyze() method
3. Create demand model CSV writer
4. Test with sample data

### Short-term (Phase 4 - Forecasting Engine)
1. Create `src/core/forecasters/demand-forecaster.ts`
2. Implement linear interpolation (hot and cold weather)
3. Implement Forecast() orchestration
4. Create forecast CSV writer
5. Test against original C++ outputs

### Medium-term (Phase 5 & 6 - UI)
1. Set up Electron + Vue integration
2. Create main application window
3. Build file selection and configuration UI
4. Integrate analysis and forecasting engines
5. Add results visualization

## Agent Coordination Strategy

**For Phase 3 (Analysis Engine):**
- Use code-implementer agent to create demand-analyzer.ts
- Provide detailed algorithm from 01_DETAILED_ALGORITHMS.md
- Reference original C++ code (diload.cpp lines 1069-1859)

**For Phase 4 (Forecasting Engine):**
- Use code-implementer agent to create demand-forecaster.ts
- Provide linear interpolation formulas from EProf.cpp
- Reference forecasting orchestration algorithm

**For Phase 6 (UI):**
- Use code-implementer agent for Vue components
- Provide UI mockups and component specifications

**For Phase 7 (Validation):**
- Use problem-analyzer agent to compare outputs
- Identify discrepancies between C++ and TypeScript implementations

## Critical Success Factors
1. **Accuracy:** Outputs must match original C++ within 0.5%
2. **Algorithm Fidelity:** Linear interpolation must be exact
3. **Statistical Correctness:** Chronological weighting must work properly
4. **Data Format Compatibility:** Must read/write same CSV formats as original

## Known Issues / Considerations
1. Sample data is 5-minute intervals - need to aggregate to 30-minute
2. Need to handle missing data gracefully
3. Temperature units (Celsius vs Fahrenheit) must be handled correctly
4. Day boundary smoothing algorithm needs clarification from original code
5. Holiday calendar needs to be configurable

## Development Environment
- Node.js 20+
- TypeScript 5+
- Electron (latest)
- Vue 3 (Composition API)
- Vite (build tool)
- papaparse (CSV parsing)
- luxon (date/time handling)

## Build Commands (to be added to package.json)
```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "electron:dev": "electron .",
    "electron:build": "electron-builder"
  }
}
```

---

**Last Updated:** November 28, 2025
**Status:** Phase 2 (File I/O) - 60% Complete
**Next Milestone:** Complete Phase 3 (Statistical Analysis Engine)
