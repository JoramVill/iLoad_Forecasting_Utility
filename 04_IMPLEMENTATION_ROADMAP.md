# iLoad Forecasting - Implementation Roadmap

## Overview

This document provides a structured roadmap for implementing the iLoad demand forecasting module in either C# or Node.js. It breaks down the implementation into manageable phases with clear deliverables and testing criteria.

## Implementation Approach

### Recommended Strategy: Incremental Development
1. Start with core data structures
2. Implement file I/O for one format at a time
3. Build statistical analysis engine
4. Add forecasting capabilities
5. Enhance with additional features

### Testing Strategy: Test-Driven Development
- Write unit tests before implementing each component
- Use known data sets for validation
- Compare outputs with original C++ system where possible

---

## Phase 1: Foundation (Week 1)

### Goal
Establish project structure and core data models without algorithm complexity.

### Deliverables

#### 1.1 Project Setup
**C# .NET 6+:**
```
- Create solution structure
- Add NuGet packages (CsvHelper, Serilog, System.CommandLine)
- Set up logging framework
- Create unit test project
```

**Node.js/TypeScript:**
```
- Initialize npm project
- Add dependencies (csv-parse, csv-stringify, luxon, commander)
- Configure TypeScript
- Set up Jest for testing
```

#### 1.2 Core Constants and Enums
**Files to Create:**
- `Constants.cs` or `constants.ts`
- Define all numeric constants (MAX_INTERVAL, weather categories, etc.)
- Define temperature thresholds
- Define time formats

**Test Criteria:**
- All constants accessible
- Default values match original system

#### 1.3 Basic Data Classes
**Classes to Implement:**
1. **IntervalData** - Single 30-minute interval
   - Properties: Interval, Time, Demand, Max, Med, Min, Ave
   - Methods: Clone(), Scale()

2. **WeatherData** - Daily weather information
   - Properties: Date, DailyMax/MinTemp, WeatherCategory
   - Methods: ClassifyWeather(), Temperature conversion

3. **DemandProfile** - Collection of intervals for a day/period
   - Properties: Id, Date, TimePeriod, Intervals[], Statistics
   - Methods: AddInterval(), CalculateStatistics(), GetDemand()

**Test Criteria:**
- Create instances with sample data
- Verify property access
- Test calculation methods with known inputs

#### 1.4 Configuration System
**Configuration Class:**
```csharp
public class ForecastConfig
{
    public double HotThreshold { get; set; } = 32.0;
    public double WarmThreshold { get; set; } = 28.0;
    public double CoolThreshold { get; set; } = 22.0;
    public double ColdThreshold { get; set; } = 15.0;
    public double CorrelationFactor { get; set; } = 0.2;
    public bool UseWeatherCorrelation { get; set; } = true;
    public bool UseChronologicalWeighting { get; set; } = true;
    public int MaxInterval { get; set; } = 48;
    public int IntervalMinutes { get; set; } = 30;
}
```

**Test Criteria:**
- Load from JSON/config file
- Override with command-line parameters
- Validate ranges

### Estimated Effort: 3-5 days

---

## Phase 2: File I/O (Week 1-2)

### Goal
Read and write all CSV file formats accurately.

### Deliverables

#### 2.1 CSV Reader for Demand Data
**Requirements:**
- Read DateTimeEnding column
- Parse multiple region/meter columns
- Handle missing values gracefully
- Support both AEMO (30-min) and WESM (60-min) formats

**Implementation Steps:**
1. Create `DemandCsvReader` class
2. Parse header row for column names
3. Parse data rows with date/time and demands
4. Validate data continuity (no missing intervals)
5. Create `DemandProfile` objects organized by date

**Test Cases:**
- Read sample file with 1 region, 1 day
- Read sample file with 3 regions, 7 days
- Handle CSV with missing columns
- Handle invalid date formats
- Verify demand values match input

#### 2.2 CSV Reader for Temperature Data
**Requirements:**
- Support Format 1 (simple: Date, Max, Min per region)
- Support Format 2 (Meralco: hourly observations)
- Handle Celsius and Fahrenheit
- Create `WeatherData` objects

**Implementation Steps:**
1. Create `TemperatureCsvReader` class
2. Detect format from header
3. Parse simple format (daily max/min)
4. Parse detailed format (hourly observations → daily max/min)
5. Convert Fahrenheit to Celsius if needed
6. Classify weather category

**Test Cases:**
- Read simple format file
- Read detailed format file
- Verify max/min calculation from hourly data
- Test Fahrenheit conversion
- Verify weather classification

#### 2.3 CSV Reader for Demand Models
**Requirements:**
- Read statistical profiles (Max, Med, Min, Ave)
- Read weather statistics (Wth line)
- Organize by Profile ID, Time Period, Weather

**Implementation Steps:**
1. Create `DemandModelCsvReader` class
2. Parse header row
3. For each profile group (5-6 lines):
   - Read Wth line for temperature statistics
   - Read Max, Med, Min, Ave lines for interval statistics
4. Create `DemandProfile` objects with interval statistics
5. Set weather temperature ranges

**Test Cases:**
- Read model with 1 region, ALLDAYS only
- Read model with 1 region, all weather categories
- Verify temperature statistics
- Verify interval statistics
- Check profile completeness

#### 2.4 CSV Writers
**Requirements:**
- Write demand model (analysis output)
- Write forecast demand (forecast output)
- Write load factor report

**Implementation Steps:**
1. Create `DemandModelCsvWriter` class
2. Create `DemandForecastCsvWriter` class
3. Format output to match expected structure
4. Add header rows
5. Format numbers appropriately (1 decimal for demand)

**Test Cases:**
- Write and re-read demand model
- Verify data integrity
- Check CSV format compliance

### Estimated Effort: 4-6 days

---

## Phase 3: Statistical Analysis Engine (Week 2-3)

### Goal
Implement the core statistical analysis algorithm.

### Deliverables

#### 3.1 Statistical List Implementation
**Class: `StatisticalList`**
- Maintains list of double values
- Calculates max, median, min, average, std dev
- Supports weighted insertion

**Implementation Steps:**
1. Create `StatisticalList` class
2. Implement `Insert(value)` and `Insert(value, weight)`
3. Implement `Calculate()` method:
   - Sort values
   - Calculate max (last element)
   - Calculate min (first element)
   - Calculate median (middle element)
   - Calculate average (sum / count)
   - Calculate std deviation

**Test Cases:**
- Single value → all stats equal
- Even count → median calculation
- Odd count → median calculation
- Weighted values → verify distribution
- Empty list → zero stats

#### 3.2 Time Period Classification
**Requirements:**
- Determine time period for a date (WORKDAY, WEEKEND, HOLIDAY)
- Support custom calendar definitions
- Priority-based selection

**Implementation Steps:**
1. Create `TimePeriod` class
2. Create `Calendar` class with day type rules
3. Implement `GetTimePeriod(date)` method
4. Support holiday definitions

**Test Cases:**
- Monday-Friday → WORKDAY
- Saturday-Sunday → WEEKEND
- Holiday dates → HOLIDAY
- Custom calendar rules

#### 3.3 Weather Classification
**Requirements:**
- Classify weather based on temperature thresholds
- Support configurable thresholds

**Implementation Steps:**
1. Implement `ClassifyWeather(maxTemp, minTemp)` in `WeatherData`
2. Use configuration thresholds
3. Return weather category constant

**Test Cases:**
- Temperature at each threshold boundary
- Temperature between thresholds
- Extreme temperatures

#### 3.4 Statistical Aggregation
**Class: `DemandAnalyzer`**
- Main analysis orchestration
- Creates demand models from historical data

**Implementation Steps:**
1. Create `DemandAnalyzer` class
2. Implement `Analyze()` method:
   ```
   a. Initialize statistical lists for each:
      - Time period (WORKDAY, WEEKEND)
      - Weather category (0-5)
      - Interval (1-48)

   b. Loop through historical days:
      - Get time period
      - Get weather classification
      - Calculate chronological weight
      - Add interval demands to appropriate lists
      - Add temperature data to lists

   c. Calculate statistics for each combination:
      - Calculate temperature stats
      - Calculate demand stats for each interval
      - Create DemandProfile with interval statistics
      - Set weather temperature ranges

   d. Write demand model to file
   ```

**Test Cases:**
- Analyze 7 days of data → verify statistics
- Analyze with chronological weighting → verify weights applied
- Analyze multiple weather days → verify separation
- Compare output with original C++ system

### Estimated Effort: 5-7 days

---

## Phase 4: Forecasting Engine (Week 3-4)

### Goal
Implement weather-correlated forecasting with linear interpolation.

### Deliverables

#### 4.1 Profile Selection
**Requirements:**
- Select appropriate demand profile for forecast date
- Match by time period and weather
- Fall back to ALLDAYS if specific weather not available

**Implementation Steps:**
1. Implement `GetByPeriodAndWeather()` in `DemandProfileCollection`
2. Try exact match first
3. Fall back to ALLDAYS
4. Return null if no profile found

**Test Cases:**
- Exact match available → return it
- Only ALLDAYS available → return it
- No profile available → return null

#### 4.2 Linear Interpolation - Hot Weather
**Requirements:**
- Implement hot weather interpolation logic
- Use daily maximum temperature
- Handle extrapolation beyond historical range

**Implementation Steps:**
1. Create `InterpolateHotWeather()` method
2. Implement 4 cases:
   ```
   If Tx > T3: Extrapolate above (with CoFac)
   If T2 < Tx <= T3: Interpolate between median and max
   If T1 < Tx <= T2: Interpolate between min and median
   If Tx <= T1: Extrapolate below (with CoFac)
   ```

**Test Cases:**
- Temperature in each range
- Temperature at boundaries
- Extreme extrapolation

#### 4.3 Linear Interpolation - Cold Weather
**Requirements:**
- Implement cold weather interpolation logic
- Use daily minimum temperature
- Inverse relationship (lower temp = higher demand)

**Implementation Steps:**
1. Create `InterpolateColdWeather()` method
2. Implement 4 cases with inverse logic
3. Use appropriate temperature statistics

**Test Cases:**
- Temperature in each range
- Verify inverse relationship
- Compare with hot weather logic

#### 4.4 Forecasting Orchestration
**Class: `DemandForecaster`**
- Main forecasting engine
- Applies interpolation to all intervals

**Implementation Steps:**
1. Create `DemandForecaster` class
2. Implement `Forecast()` method:
   ```
   a. For each forecast day:
      - Determine time period
      - Get forecast weather
      - Select appropriate demand profile
      - If weather correlation enabled:
          Apply linear interpolation to each interval
      - Else:
          Use model values directly
      - Apply growth factor
      - Smooth day boundaries
      - Create forecast profile

   b. Write forecast to file
   ```

**Test Cases:**
- Forecast with exact model match
- Forecast requiring interpolation
- Forecast with growth factor
- Verify smooth day transitions
- Compare with original C++ system

### Estimated Effort: 5-7 days

---

## Phase 5: Additional Features (Week 4-5)

### Goal
Implement supporting features and enhancements.

### Deliverables

#### 5.1 Simple Calendar-Based Forecasting
**Class: `SimpleDemandForecaster`**
- No weather dependency
- Day-of-week and day-of-year matching

**Implementation Steps:**
1. Create `SimpleDemandForecaster` class
2. Implement `Forecast2()` method:
   ```
   For each forecast day:
   - Find similar historical day (by DOY, DOW, holiday)
   - Copy intervals
   - Apply growth factor
   ```

**Test Cases:**
- Match by day of year
- Match by day of week
- Apply growth factor

#### 5.2 Forecast Comparison
**Class: `ForecastComparer`**
- Compare forecast vs actual
- Calculate accuracy metrics

**Implementation Steps:**
1. Create `ForecastComparer` class
2. Implement `Compare()` method:
   ```
   For each interval:
   - Calculate absolute error
   - Calculate percentage error
   - Calculate signed error
   - Aggregate metrics (MAPE, RMSE)
   ```

**Test Cases:**
- Perfect forecast → zero errors
- Known error → verify calculations
- Generate comparison report

#### 5.3 Hour-Ahead Refinement
**Class: `ForecastRefiner`**
- Adjust forecast based on recent errors
- Update remaining intervals

**Implementation Steps:**
1. Create `ForecastRefiner` class
2. Implement `ReForecast()` method:
   ```
   - Load actual demand (partial day)
   - Load original forecast
   - Calculate error from last 2 intervals
   - Apply average error to future intervals
   - Keep actual values for completed intervals
   - Write updated forecast
   ```

**Test Cases:**
- Refine with consistent error → verify correction
- Refine with varying error → verify average
- Preserve actual values

#### 5.4 Reporting
**Requirements:**
- Load factor report
- Forecast accuracy report
- Model statistics report

**Implementation Steps:**
1. Create `ReportGenerator` class
2. Generate CSV reports
3. Optional: Generate HTML reports

### Estimated Effort: 3-5 days

---

## Phase 6: Command-Line Interface (Week 5)

### Goal
Create user-friendly CLI for all operations.

### Deliverables

#### 6.1 CLI Framework
**C# - System.CommandLine:**
```csharp
var rootCommand = new RootCommand("iLoad Forecasting Tool");

var analyzeCommand = new Command("analyze", "Analyze historical demand");
var forecastCommand = new Command("forecast", "Generate forecast");
var compareCommand = new Command("compare", "Compare forecast vs actual");
var refineCommand = new Command("refine", "Refine hour-ahead forecast");

// Add options and handlers
```

**Node.js - Commander:**
```typescript
program
  .command('analyze')
  .description('Analyze historical demand')
  .option('-d, --demand <file>', 'Historical demand file')
  .option('-t, --temperature <file>', 'Historical temperature file')
  .action(analyzeCommand);
```

#### 6.2 Commands Implementation
1. **analyze** - Run statistical analysis
2. **forecast** - Generate weather-correlated forecast
3. **forecast-simple** - Generate simple calendar-based forecast
4. **compare** - Compare forecast vs actual
5. **refine** - Hour-ahead refinement

#### 6.3 Configuration
- Support config file (JSON)
- Support command-line overrides
- Validate all inputs

**Test Cases:**
- Run each command with sample data
- Test error handling
- Verify help messages

### Estimated Effort: 2-3 days

---

## Phase 7: Testing and Validation (Week 6)

### Goal
Comprehensive testing against original C++ system.

### Deliverables

#### 7.1 Unit Test Coverage
- All data classes
- All statistical calculations
- All interpolation formulas
- All file I/O operations

**Target: 80%+ code coverage**

#### 7.2 Integration Tests
- End-to-end analysis
- End-to-end forecasting
- Complete workflow

#### 7.3 Validation Against Original
**Process:**
1. Prepare test data set
2. Run through original C++ system
3. Run through new implementation
4. Compare outputs:
   - Demand models (statistical values)
   - Forecasts (interval demands)
   - Reports (metrics)

**Acceptance Criteria:**
- Statistical values within 0.1% (rounding differences)
- Forecast values within 0.5% (interpolation precision)
- Reports match (formatting differences OK)

#### 7.4 Performance Testing
- Measure processing time for various data sizes
- Profile memory usage
- Identify bottlenecks

**Targets:**
- Process 365 days in < 5 seconds
- Memory usage < 100 MB for typical dataset
- No memory leaks

### Estimated Effort: 3-5 days

---

## Phase 8: Documentation and Deployment (Week 6-7)

### Goal
Complete documentation and prepare for deployment.

### Deliverables

#### 8.1 Code Documentation
- XML comments for all public APIs (C#)
- JSDoc comments for all exports (TypeScript)
- Generate API documentation

#### 8.2 User Documentation
- Installation guide
- Quick start guide
- Command reference
- Examples and tutorials
- Troubleshooting guide

#### 8.3 Deployment
**C#:**
- Publish as single executable
- Create installer (optional)
- Docker container (optional)

**Node.js:**
- Publish to npm (optional)
- Create Docker container
- Build standalone executable with pkg (optional)

### Estimated Effort: 2-3 days

---

## Total Timeline

### Recommended Schedule (Full-Time)
- **Week 1**: Phases 1-2 (Foundation + File I/O)
- **Week 2**: Phase 3 (Statistical Analysis)
- **Week 3**: Phase 4 (Forecasting)
- **Week 4**: Phase 5 (Additional Features)
- **Week 5**: Phase 6 (CLI)
- **Week 6**: Phase 7 (Testing & Validation)
- **Week 7**: Phase 8 (Documentation & Deployment)

**Total: 6-7 weeks full-time** (or 12-14 weeks part-time)

### Minimum Viable Product (MVP)
Focus on core functionality first:
- **Week 1-2**: Phases 1-2 (Foundation + File I/O)
- **Week 3**: Phase 3 (Analysis - basic version)
- **Week 4**: Phase 4 (Forecasting - weather-correlated only)
- **Week 5**: Phase 7 (Basic testing)

**MVP Timeline: 4-5 weeks**

---

## Risk Management

### High-Risk Areas
1. **Linear Interpolation Accuracy**
   - **Risk**: Formula interpretation differences
   - **Mitigation**: Extensive validation with known data
   - **Contingency**: Direct comparison with C++ line by line

2. **Statistical Calculations**
   - **Risk**: Rounding and precision differences
   - **Mitigation**: Use double precision throughout
   - **Contingency**: Document acceptable variance ranges

3. **CSV Parsing Edge Cases**
   - **Risk**: Various CSV formats in the wild
   - **Mitigation**: Robust parsing with error handling
   - **Contingency**: Manual data cleaning tools

4. **Performance at Scale**
   - **Risk**: Slow processing with large datasets
   - **Mitigation**: Profile early, optimize hot paths
   - **Contingency**: Parallel processing, batching

### Medium-Risk Areas
1. **Time Period Logic**
   - **Risk**: Complex calendar rules
   - **Mitigation**: Start simple, enhance iteratively

2. **Temperature Unit Handling**
   - **Risk**: Mixing Celsius and Fahrenheit
   - **Mitigation**: Explicit unit tracking and conversion

3. **Memory Management**
   - **Risk**: Memory leaks with large datasets
   - **Mitigation**: Use garbage-collected languages properly

---

## Success Criteria

### Functional Requirements
✅ Reads all CSV formats correctly
✅ Analyzes historical demand accurately
✅ Generates weather-correlated forecasts
✅ Matches original C++ system outputs (within tolerance)
✅ Handles edge cases gracefully

### Non-Functional Requirements
✅ Processes 365 days of data in < 5 seconds
✅ Memory usage < 100 MB typical
✅ 80%+ unit test coverage
✅ Clear error messages and logging
✅ Comprehensive documentation

### Validation Checkpoints
- [ ] Phase 3 complete → Can analyze and generate demand model
- [ ] Phase 4 complete → Can generate accurate forecasts
- [ ] Phase 7 complete → Outputs match original system
- [ ] Phase 8 complete → Ready for production use

---

## Post-Implementation Enhancements

### Priority 1 (Next 3 months)
1. Web API for integration
2. Database support (PostgreSQL, SQL Server)
3. Real-time data ingestion
4. Enhanced reporting and visualization

### Priority 2 (Next 6 months)
1. Machine learning models
2. Ensemble forecasting
3. Uncertainty quantification
4. Advanced analytics dashboard

### Priority 3 (Next 12 months)
1. Multi-region optimization
2. Price forecasting
3. Market simulation integration
4. Cloud deployment and scaling

---

## Appendix: Development Environment Setup

### C# .NET 6+
```bash
# Install .NET SDK
# Download from: https://dot.net

# Create project
dotnet new sln -n iLoadForecasting
dotnet new classlib -n iLoadForecasting.Core
dotnet new console -n iLoadForecasting.CLI
dotnet new xunit -n iLoadForecasting.Tests
dotnet sln add **/*.csproj

# Add packages
cd iLoadForecasting.Core
dotnet add package CsvHelper
dotnet add package Serilog
dotnet add package Serilog.Sinks.Console
dotnet add package Serilog.Sinks.File

cd ../iLoadForecasting.CLI
dotnet add package System.CommandLine --prerelease
dotnet add package Microsoft.Extensions.Configuration
dotnet add package Microsoft.Extensions.Configuration.Json

# Build and run
dotnet build
dotnet run --project iLoadForecasting.CLI
```

### Node.js/TypeScript
```bash
# Initialize project
npm init -y
npm install typescript ts-node @types/node --save-dev
npx tsc --init

# Install dependencies
npm install csv-parse csv-stringify luxon commander
npm install @types/luxon --save-dev

# Install testing
npm install jest ts-jest @types/jest --save-dev
npx ts-jest config:init

# Install build tools
npm install typescript @vercel/ncc --save-dev

# Build and run
npm run build
node dist/index.js
```

---

**End of Implementation Roadmap**

Follow this roadmap systematically for successful implementation of the iLoad forecasting module in your chosen technology stack.
