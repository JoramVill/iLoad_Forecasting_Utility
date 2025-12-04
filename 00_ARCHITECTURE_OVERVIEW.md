# iLoad Demand Forecasting Module - Architecture Overview

## Executive Summary

The iLoad module is a sophisticated demand forecasting system originally developed in C++ for the iPool2019 electricity market simulation platform. It provides comprehensive analysis and forecasting of electrical demand using historical data, weather patterns, and statistical modeling.

## System Purpose

The iLoad module enables:
1. **Demand Analysis**: Statistical analysis of historical demand data segmented by time periods and weather conditions
2. **Demand Forecasting**: Short-term demand prediction using weather-correlated models
3. **Forecast Comparison**: Validation of forecast accuracy against actual demand
4. **Forecast Refinement**: Hour-ahead forecast adjustment based on recent actuals

## Core Components

### 1. DiLoad Dialog Class (Main Interface)
- **File**: `iPool\Interface\Dialogs\diload.cpp` (3,258 lines)
- **Purpose**: Primary user interface and orchestration layer
- **Key Methods**:
  - `Analyze()`: Performs statistical analysis of historical demand
  - `Forecast()`: Generates demand forecasts using weather correlation
  - `Forecast2()`: Simple day-of-week based forecasting without models
  - `Compare()`: Compares forecast vs actual demand
  - `ReForecast()`: Hour-ahead forecast adjustment

### 2. EProf Class (Profile Data Structure)
- **File**: `iPool\App\EProf.h` and `EProf.cpp`
- **Purpose**: Represents demand profiles (daily or by time period)
- **Key Components**:
  - `ETimeMw`: Half-hourly interval data points
  - Weather statistics (max/min temperatures)
  - Statistical aggregates (max, med, min, ave)
  - `ForecastLP()`: Linear interpolation based on temperature

### 3. DList Class (Statistical Analysis)
- **File**: `iPool\App\DList.h` and `DList.cpp`
- **Purpose**: Statistical analysis container
- **Functionality**: Calculates max, median, min, average for demand values

### 4. Supporting Classes
- **ERegion**: Geographic regions with demand profiles
- **EMeter**: Customer meters with demand profiles
- **EDayBlk**: Time period definitions (workday, weekend, holidays)
- **EProfs**: Collections of EProf objects

## Data Flow Architecture

```
Historical Data (CSV)
        |
        v
    [Loading]
        |
        +---> Region Demand (DProfs - by date)
        +---> Customer Demand (DProfs - by date)
        +---> Temperature Data (by region and date)
        |
        v
   [Analysis Phase]
        |
        +---> Statistical Aggregation (by time period and weather)
        +---> Calculate: Max, Med, Min, Ave for each interval
        +---> Weather Classification (Hot/Warm/Norm/Cool/Cold)
        +---> Chronological Weighting (optional)
        |
        v
  [Demand Model File]
   (LProfs - by time period)
        |
        Contains profiles for:
        - Each time period (DEFAULT, WORKDAY, etc.)
        - Each weather condition
        - Statistical values (Max/Med/Min/Ave)
        - Temperature ranges
        |
        v
  [Forecasting Phase]
        |
        +---> Load Forecast Temperature
        +---> Select Matching Profile (time period + weather)
        +---> Interpolate using ForecastLP()
        +---> Apply Growth Factor
        +---> Smooth Transitions
        |
        v
  [Forecast Output CSV]
```

## Key Algorithms

### 1. Statistical Analysis (Analyze Method)
- **Input**: Historical demand + temperature data (typically 365+ days)
- **Process**:
  1. Classify each day by time period (workday/weekend/holiday)
  2. Classify each day by weather (hot/warm/normal/cool/cold)
  3. Aggregate interval demands into statistical lists
  4. Calculate max, median, min, average for each interval
  5. Apply chronological weighting (recent data weighted more)
- **Output**: Demand model CSV with profiles per time period and weather

### 2. Linear Interpolation Forecasting (ForecastLP Method)
- **Input**: Demand model + forecast temperature
- **Process**: For each half-hour interval:
  1. Extract D1 (min demand), D2 (median), D3 (max demand)
  2. Extract T1 (min temp), T2 (median temp), T3 (max temp)
  3. Given Tx (forecast temperature), calculate:
     - If Tx > T3: Extrapolate beyond max (with correlation factor)
     - If T2 < Tx <= T3: Interpolate between median and max
     - If T1 < Tx <= T2: Interpolate between min and median
     - If Tx <= T1: Extrapolate below min (with correlation factor)
  4. Apply smoothing between day boundaries
- **Output**: Forecast demand for each interval

### 3. Simple Forecasting (Forecast2 Method)
- **Input**: Historical demand data
- **Process**:
  1. For each forecast day, find similar historical day
  2. Match by day of year, day of week, and holiday status
  3. Apply growth factor
- **Output**: Forecast demand CSV

### 4. Hour-Ahead Refinement (ReForecast Method)
- **Input**: Actual demand (partial day) + Original forecast
- **Process**:
  1. Calculate forecast error from last 2 intervals
  2. Apply average error correction to remaining hours
  3. Preserve actual values for completed hours
- **Output**: Updated forecast CSV

## Temperature-Demand Correlation

### Weather Classification
The system classifies days into weather categories based on temperature thresholds:

```
Temperature Categories (Celsius):
- HOT:  >= dHOT (configurable, ~32°C)
- WARM: >= dWARM and < dHOT (~28°C)
- NORM: > dCOOL and < dWARM (~22°C)
- COOL: > dCOLD and <= dCOOL (~15°C)
- COLD: <= dCOLD

Note: Hot weather uses daily MAX temperature
      Cold weather uses daily MIN temperature
```

### Correlation Logic
- **Hot Days**: Higher temperature = Higher demand (air conditioning)
- **Cold Days**: Lower temperature = Higher demand (heating)
- **Normal Days**: Minimal temperature impact

## File Formats

### 1. Historical Demand CSV
```
DateTimeEnding, REGION1, REGION2, METER1, METER2, ...
1/1/2023 1:00, 5814.5, 1017.2, 125.3, 89.7, ...
1/1/2023 2:00, 5598.1, 954.8, 118.9, 84.2, ...
```

### 2. Temperature CSV
```
Temperature, Max, Min, Max, Min, ...
Date, REGION1, REGION1, REGION2, REGION2, ...
1/1/2023, 35, 27, 33, 26, ...
```

### 3. Demand Model CSV
```
ProfID, TimePeriod, Weather, StatCode, 1, 2, 3, ..., 48
REGION1, DEFAULT, ALLDAYS, Wth, 35.0, 35.2, 34.8, ..., 28.5, 27.0, 26.8, 0
REGION1, DEFAULT, ALLDAYS, Max, 5814.5, 5789.2, 5654.3, ..., 6234.8
REGION1, DEFAULT, ALLDAYS, Med, 5512.8, 5487.9, 5398.1, ..., 5987.4
REGION1, DEFAULT, ALLDAYS, Min, 5234.7, 5198.4, 5123.9, ..., 5734.2
REGION1, DEFAULT, ALLDAYS, Ave, 5523.6, 5491.8, 5392.4, ..., 5985.5
REGION1, DEFAULT, HOTDAY, Wth, 38.0, 37.5, 36.2, ..., 30.0, 28.5, 27.8, 3
REGION1, DEFAULT, HOTDAY, Max, 6234.8, 6198.7, 6089.4, ..., 6789.3
...
```

### 4. Forecast Demand CSV
```
DateTimeEnding, REGION1, REGION2, METER1, METER2, ...
4/1/2024 1:00, 5987.3, 1045.8, 128.9, 91.2, ...
4/1/2024 2:00, 5823.4, 1012.3, 122.7, 87.5, ...
```

## Configuration Parameters

### Analysis Parameters
- **m_NDays**: Number of historical days to analyze (typically 365)
- **m_Start**: Start date for analysis
- **m_bWeight**: Enable chronological weighting (recent data weighted more)
- **m_bWeather**: Use temperature correlation (vs simple calendar-based)
- **Temperature Thresholds**: dHOT, dWARM, dCOOL, dCOLD

### Forecast Parameters
- **m_NDays1**: Number of days to forecast
- **m_Start1**: Forecast start date
- **m_PcGrowth**: Growth factor percentage (e.g., 5% = 1.05x)
- **CoFac**: Correlation factor for temperature extrapolation (default: 0.2)

## Time Period Handling

The system supports flexible time period definitions:
- **DEFAULT**: All days (base case)
- **WORKDAY**: Monday-Friday
- **WEEKEND**: Saturday-Sunday
- **HOLIDAY**: Special days
- **Custom**: User-defined periods

Each time period can have separate demand profiles for each weather condition.

## Technical Constants

From `ConstDefinitions.h`:
- **MAX_INTERVAL**: 48 (half-hour intervals per day)
- **D_RES**: Dispatch resolution in minutes (30 for AEMO, 60 for WESM)
- **MAX_WTH**: 5 (number of weather categories)
- **INTERVAL**: COleDateTimeSpan representing interval duration

## Performance Considerations

### Memory Management
- Dynamic allocation of 2D arrays for demand values
- Profile collections managed via linked lists
- Buffered file I/O for large CSV operations

### Processing Time
- Analysis phase: Depends on number of days and objects (regions/meters)
- Typically processes 365 days in seconds to minutes
- Progress tracking via status bar updates

## Key Design Patterns

1. **Separation of Concerns**:
   - Data structures (EProf, EProfs)
   - Analysis logic (DiLoad::Analyze)
   - Forecasting logic (DiLoad::Forecast)

2. **Statistical Aggregation**:
   - DList class for efficient statistical calculations
   - Incremental aggregation during data processing

3. **Weather Stratification**:
   - Separate profiles for each weather condition
   - Temperature-based interpolation for forecasting

4. **Temporal Hierarchy**:
   - Daily profiles (by date)
   - Time period profiles (by calendar pattern)
   - Half-hourly interval resolution

## Integration Points

The iLoad module integrates with:
- **iPool Document**: Main simulation data model
- **ERegion/ESite/EMeter**: Demand objects
- **EDayBlks**: Calendar/time period definitions
- **EEvents**: Weather event data (optional)

## Output Reports

1. **Demand Model**: Statistical profiles (CSV)
2. **Forecast Demand**: Predicted values (CSV)
3. **Load Factor Report**: Energy and capacity metrics (CSV/HTML)
4. **Comparison Report**: Forecast accuracy metrics (HTML)
5. **Profile Statistics**: Max demand, energy, load factors (CSV)

## Error Handling

- File validation before processing
- Missing data detection
- Temperature range validation
- Profile completeness checks
- User notifications via message boxes

## Future Enhancement Opportunities

1. Machine learning integration for pattern recognition
2. Real-time data ingestion and streaming forecasts
3. Multi-variate weather factors (humidity, wind, cloud cover)
4. Ensemble forecasting with multiple models
5. Automated model selection and tuning
6. API-based integration with external systems
7. Time series anomaly detection
8. Enhanced visualization and dashboards
