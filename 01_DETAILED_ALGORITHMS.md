# iLoad Forecasting Algorithms - Detailed Documentation

## Overview

This document provides comprehensive mathematical and algorithmic details for all forecasting methods in the iLoad module.

## Table of Contents

1. [Statistical Analysis Algorithm](#statistical-analysis-algorithm)
2. [Linear Interpolation Forecasting](#linear-interpolation-forecasting)
3. [Simple Day-Match Forecasting](#simple-day-match-forecasting)
4. [Hour-Ahead Refinement](#hour-ahead-refinement)
5. [Chronological Weighting](#chronological-weighting)
6. [Weather Classification](#weather-classification)

---

## Statistical Analysis Algorithm

### Method: `DiLoad::Analyze()`

### Purpose
Analyzes historical demand data to create statistical demand models stratified by time period and weather conditions.

### Input Data Structures

```cpp
// Historical demand profiles (by date)
EProfs* pProfs;  // Daily profiles for each region/meter
  - m_bByDate = TRUE
  - Contains EProf objects for each day

// Temperature profiles (by date)
EProfs* pTemps;  // Daily temperature data
  - Contains weather classification
  - m_WthMax, m_WthMin for each day

// Time period definitions
EDayBlks* pCalendar;  // WORKDAY, WEEKEND, HOLIDAY, etc.

// Output model profiles (by time period)
EProfs* pLProfs;  // Statistical profiles
  - m_bByDate = FALSE
  - Profiles per time period and weather
```

### Algorithm Steps

#### Step 1: Initialization

```cpp
// Create statistical accumulators for each time period
for (iTP = 0; iTP < nTPs; iTP++) {
    LPTMax[iTP][weather]   = DList array for max temperatures
    LPTMin[iTP][weather]   = DList array for min temperatures
    LPData[iTP][interval]  = DList array for all weather demands
    LPHot[iTP][interval]   = DList array for hot day demands
    LPWarm[iTP][interval]  = DList array for warm day demands
    LPNorm[iTP][interval]  = DList array for normal day demands
    LPCool[iTP][interval]  = DList array for cool day demands
    LPCold[iTP][interval]  = DList array for cold day demands
}
```

#### Step 2: Data Aggregation Loop

For each day in the analysis period (typically 365 days):

```cpp
for (iDay = 0; iDay < m_NDays; iDay++) {
    tDate = m_Start + COleDateTimeSpan(iDay, 0, 0, 0);

    // 1. Determine valid time periods for this day
    UserTPs.GetValidDEF(tDate, ValidTPs);
    ValidTPs.Filter(pCalendar);  // Apply calendar rules

    // 2. Get weather classification
    iWth = pTemp->m_iWth;  // HOTDAY, WARMDAY, etc.
    lWthMax = pTemp->m_WthMax;
    lWthMin = pTemp->m_WthMin;

    // 3. Calculate chronological weight
    if (m_bWeight)
        nFortnight = iDay / 14 + 1;  // Recent data weighted more
    else
        nFortnight = 1;  // Equal weighting

    // 4. Add temperature data to lists
    for each ValidTP {
        iTP = pDayBlk->GetIndex();
        for (iFn = 1; iFn <= nFortnight; iFn++) {
            LPTMax[iTP][ALLDAYS].Insert(lWthMax);
            LPTMin[iTP][ALLDAYS].Insert(lWthMin);
            LPTMax[iTP][iWth].Insert(lWthMax);
            LPTMin[iTP][iWth].Insert(lWthMin);
        }
    }

    // 5. Add demand data for each interval
    for (itvl = 1; itvl <= MAX_INTERVAL; itvl++) {
        val = pProf->GetMwCap(t);  // Get demand at interval

        for each ValidTP {
            for (iFn = 1; iFn <= nFortnight; iFn++) {
                LPData[iTP][itvl].Insert(val);

                // Add to weather-specific lists
                if (iWth == HOTDAY)  LPHot[iTP][itvl].Insert(val);
                if (iWth == WARMDAY) LPWarm[iTP][itvl].Insert(val);
                if (iWth == NORMDAY) LPNorm[iTP][itvl].Insert(val);
                if (iWth == COOLDAY) LPCool[iTP][itvl].Insert(val);
                if (iWth == COLDDAY) LPCold[iTP][itvl].Insert(val);
            }
        }
    }
}
```

#### Step 3: Statistical Calculation

For each time period and weather combination:

```cpp
for each (TimePeriod, WeatherCondition) {
    // Calculate temperature statistics
    LPTMax[iTP][iWth].Calc();
    tmaxH = LPTMax[iTP][iWth].GetMax();  // Highest max temp
    tmaxM = LPTMax[iTP][iWth].GetMed();  // Median max temp
    tmaxL = LPTMax[iTP][iWth].GetMin();  // Lowest max temp

    LPTMin[iTP][iWth].Calc();
    tminH = LPTMin[iTP][iWth].GetMax();  // Highest min temp
    tminM = LPTMin[iTP][iWth].GetMed();  // Median min temp
    tminL = LPTMin[iTP][iWth].GetMin();  // Lowest min temp

    // Calculate demand statistics for each interval
    for (itvl = 1; itvl <= MAX_INTERVAL; itvl++) {
        LPData[iTP][itvl].Calc();  // or LPHot, LPWarm, etc.

        vmax = LPData[iTP][itvl].GetMax();  // Maximum demand
        vmed = LPData[iTP][itvl].GetMed();  // Median demand
        vmin = LPData[iTP][itvl].GetMin();  // Minimum demand
        vave = LPData[iTP][itvl].GetAve();  // Average demand

        // Create profile entry
        pTimeMw = new ETimeMw(itvl, vmax, vmed, vmin, vave);
        pProf->AddTimeMw(pTimeMw);
    }

    // Set temperature statistics
    pProf->SetWthStat(tmaxH, tmaxM, tmaxL, tminH, tminM, tminL, iPriority);
}
```

#### Step 4: Profile Statistics

Calculate overall profile metrics:

```cpp
// Maximum demand across all days
dMaxMax = max(dMaxMax, pProf->m_MaxDem);

// Average maximum demand
dAveMax = dTotMax / m_NDays;

// Standard deviation of maximum demand
for each day {
    Variance += pow((pProf->m_MaxDem - dAveMax), 2.0);
}
Variance /= m_NDays;
MDStdDev = sqrt(Variance);
PcStdDev = MDStdDev * 100.0 / max(dAveMax, 1);

// Load factor
dLoadFac = dTotal * 100.0 / (dMaxMax * m_NDays * MAX_INTERVAL);

// Peak vs Off-Peak metrics
dPeakLF  = dPeak * 100.0 / max(dPkMax * iPeak, 1);
dOffPkLF = dOffPk * 100.0 / max(dOffMax * iOffPk, 1);
PO_Ratio = dPeak / dOffPk;
```

### Output Format

Demand Model CSV structure:

```
Line 1: ProfID,TimePeriod,Weather,StatCode,1,2,3,...,48
Line 2: REGION1,DEFAULT,ALLDAYS,Wth,35.0,35.2,...,27.0,0
Line 3: REGION1,DEFAULT,ALLDAYS,Max,5814.5,5789.2,...,6234.8
Line 4: REGION1,DEFAULT,ALLDAYS,Med,5512.8,5487.9,...,5987.4
Line 5: REGION1,DEFAULT,ALLDAYS,Min,5234.7,5198.4,...,5734.2
Line 6: REGION1,DEFAULT,ALLDAYS,Ave,5523.6,5491.8,...,5985.5
... (Repeat for HOTDAY, WARMDAY, NORMDAY, COOLDAY, COLDDAY)
```

---

## Linear Interpolation Forecasting

### Method: `EProf::ForecastLP()`

### Purpose
Calculates forecast demand by interpolating between statistical profiles based on forecast temperature.

### Mathematical Model

Given:
- D1: Minimum historical demand at this interval
- D2: Median historical demand at this interval
- D3: Maximum historical demand at this interval
- T1: Minimum historical temperature
- T2: Median historical temperature
- T3: Maximum historical temperature
- Tx: Forecast temperature
- CoFac: Correlation factor (default 0.2)

Calculate forecast demand Dx:

#### Case 1: Hot Day (Weather > COOLDAY)
Uses daily maximum temperature.

```cpp
// Extrapolation above maximum
if (Tx > T3) {
    Dx = D3 + CoFac * |T3 - Tx| * |D3 - D2| / max(|T3 - T2|, 1.0);
}

// Linear interpolation: median to max
else if (Tx > T2) {
    Dx = D2 + |T2 - Tx| * |D3 - D2| / max(|T3 - T2|, 1.0);
}

// Linear interpolation: min to median
else if (Tx > T1) {
    Dx = D1 + |T1 - Tx| * |D2 - D1| / max(|T2 - T1|, 1.0);
}

// Extrapolation below minimum
else {
    Dx = D1 - CoFac * |T1 - Tx| * |D2 - D1| / max(|T2 - T1|, 1.0);
}
```

#### Case 2: Cold Day (Weather <= COOLDAY)
Uses daily minimum temperature (inverse relationship).

```cpp
// Extrapolation below minimum (higher demand)
if (Tx < T3) {  // Note: T3 is lowest min temp
    Dx = D3 + CoFac * |T3 - Tx| * (D3 - D2) / max(|T3 - T2|, 1.0);
}

// Linear interpolation: median to max
else if (Tx < T2) {
    Dx = D2 + |T2 - Tx| * (D3 - D2) / max(|T3 - T2|, 1.0);
}

// Linear interpolation: min to median
else if (Tx < T1) {
    Dx = D1 + |T1 - Tx| * |D2 - D1| / max(|T1 - T2|, 1.0);
}

// Extrapolation above maximum (lower demand)
else {
    Dx = D1 - CoFac * |Tx - T1| * |D2 - D1| / max(|T1 - T2|, 1.0);
}
```

### Implementation Details

```cpp
void EProf::ForecastLP(int iWeather, long lWthMax, long lWthMin) {
    ETimeMw* pTimeMw;
    double T3, T1, T2, Tx;
    double D3, D1, D2, Dx;

    m_TimeMws.GotoHead();
    do {
        pTimeMw = m_TimeMws.GetCurrent();

        // Extract statistical values
        D3 = pTimeMw->m_Max;
        D1 = pTimeMw->m_Min;
        D2 = pTimeMw->m_Med;

        // Choose temperature relationship
        if (iWeather > COOLDAY || iWeather == 0) {
            // Hot weather: use max temperature
            T3 = m_WthMaxH;
            T2 = m_WthMaxM;
            T1 = m_WthMaxL;
            Tx = lWthMax;

            // Apply interpolation formulas (Case 1)
            ...
        }
        else {
            // Cold weather: use min temperature
            T3 = m_WthMinL;  // Opposite order
            T2 = m_WthMinM;
            T1 = m_WthMinH;
            Tx = lWthMin;

            // Apply interpolation formulas (Case 2)
            ...
        }

        pTimeMw->m_MwCap = roundToLong(Dx);

    } while (m_TimeMws.Next());
}
```

### Forecast Method Integration

```cpp
void DiLoad::Forecast(LPCSTR DModFile, LPCSTR TemFile, double DemFac, LPCSTR FDemFile) {
    // Load demand model
    LoadDMod(DModFile);

    // Load forecast temperature
    LoadWth1(TemFile);

    // For each forecast day
    for (iDay = 0; iDay < m_NDays1; iDay++) {
        tDate = m_Start1 + COleDateTimeSpan(iDay, 0, 0, 0);

        // Get forecast temperature
        EProf* pProfReg = pProfsReg->GetValid(tDate);
        lWthMax = pProfReg->m_WthMax;
        lWthMin = pProfReg->m_WthMin;

        // Classify weather
        if (lWthMax != lWthMin)
            iWth = GetiWeather(lWthMax, lWthMin);

        // Get matching profile
        pDailyDP = pLProfs->GetValid(tDate, 0, 0);

        // Apply interpolation
        if (m_bWeather) {
            pDailyDP->ForecastLP(iWth, lWthMax, lWthMin);
        }

        // Smooth transitions
        COleDateTime t = tDate;
        for (itvl = 1; itvl <= MAX_INTERVAL; itvl++, t += INTERVAL) {
            ValArr[indx][itvl] = pDailyDP->GetTimeMw(t)->m_MwCap;
        }

        // Average first interval with previous day's last
        if (lasthrval > 0)
            ValArr[indx][1] = (lasthrval + ValArr[indx][1]) / 2;

        // Apply growth factor and write output
        for (itvl = 1; itvl <= MAX_INTERVAL; itvl++) {
            Output = ValArr[indx][itvl] * DemFac;
        }
    }
}
```

---

## Simple Day-Match Forecasting

### Method: `DiLoad::Forecast2()`

### Purpose
Provides simple forecasting without temperature correlation by matching similar historical days.

### Algorithm

```cpp
void DiLoad::Forecast2(LPCSTR FDemFile) {
    // For each forecast day
    for (iDay = 0; iDay < m_NDays; iDay++) {
        tDate = m_Start1 + COleDateTimeSpan(iDay, 0, 0, 0);

        // Get calendar characteristics
        iDoW = tDate.GetDayOfWeek();    // Day of week (1-7)
        iDoY = tDate.GetDayOfYear();    // Day of year (1-365)
        bHol = pDayType->OK_HR0(tDate); // Is holiday?

        // Find matching historical day
        pProf = pProfs->GetSimDay(iDoY, iDoW, bHol, iOff);

        // Extract demand values
        t = tDate;
        for (i = 0; i < MAX_INTERVAL; i++) {
            t += INTERVAL;
            itvl = GetInterval(t);
            dval = pProf->GetMwCap(t);

            // Apply growth factor
            ValArr[indx][itvl] = dval * dFac;
        }
    }
}
```

### Matching Logic

```cpp
EProf* EProfs::GetSimDay(int iDoY, int iDoW, BOOL bHol, int iOff) {
    // Priority 1: Exact day of year match
    pProf = FindByDayOfYear(iDoY + iOff);
    if (pProf) return pProf;

    // Priority 2: Same day of week
    pProf = FindByDayOfWeek(iDoW);
    if (pProf) return pProf;

    // Priority 3: Holiday vs non-holiday
    if (bHol)
        pProf = FindHoliday();
    else
        pProf = FindNonHoliday();

    return pProf;
}
```

---

## Hour-Ahead Refinement

### Method: `DiLoad::ReForecast()`

### Purpose
Updates forecast by correcting for recent forecast errors.

### Algorithm

```cpp
void DiLoad::ReForecast(LPCSTR DemFCFile, LPCSTR DemACFile) {
    // 1. Load actual demand (partial day)
    iIntLast = LoadValArr(m_DemACPath, ACArr, rDate);
    dateLast = rDate;

    // 2. Load original forecast
    LoadValArr(m_DemFCPath, FCArr, rDate);

    // 3. Calculate error correction
    for (iCol = 1; iCol < nCols; iCol++) {
        // Recent forecast errors
        e1 = ACArr[iCol][iIntLast]   - FCArr[iCol][iIntLast];
        e2 = ACArr[iCol][iIntLast-1] - FCArr[iCol][iIntLast-1];

        // Average error
        eAve = (e1 + e2) / 2.0;

        // Apply correction to future intervals
        for (iInt = iIntLast + 1; iInt < nInts; iInt++) {
            FCNew[iCol][iInt] = FCArr[iCol][iInt] + eAve;
        }

        // Keep actual values for completed intervals
        for (iInt = 1; iInt <= iIntLast; iInt++) {
            FCNew[iCol][iInt] = ACArr[iCol][iInt];
        }
    }

    // 4. Write updated forecast
    WriteToFile(FCNew);
}
```

### Error Correction Formula

```
For completed intervals (i <= iIntLast):
    Forecast_new(i) = Actual(i)

For future intervals (i > iIntLast):
    Error_avg = (Actual(iIntLast) - Forecast(iIntLast) +
                 Actual(iIntLast-1) - Forecast(iIntLast-1)) / 2

    Forecast_new(i) = Forecast(i) + Error_avg
```

---

## Chronological Weighting

### Purpose
Give more weight to recent historical data when building demand models.

### Algorithm

```cpp
// Calculate fortnight index (bi-weekly periods)
if (m_bWeight)
    nFortnight = iDay / 14 + 1;  // 1, 2, 3, ..., 26 for 365 days
else
    nFortnight = 1;  // No weighting

// Insert data multiple times
for (iFn = 1; iFn <= nFortnight; iFn++) {
    LPData[iTP][itvl].Insert(val);
}
```

### Weight Distribution

For a 365-day historical period:
- Days 0-13: Weight = 1 (inserted 1 time)
- Days 14-27: Weight = 2 (inserted 2 times)
- Days 28-41: Weight = 3 (inserted 3 times)
- ...
- Days 350-363: Weight = 26 (inserted 26 times)

Total weighted samples = 1+2+3+...+26 = 351 times the base samples

This creates exponential emphasis on recent patterns.

---

## Weather Classification

### Method: `GetiWeather()`

### Purpose
Classify days into weather categories based on temperature.

### Algorithm

```cpp
int GetiWeather(long lMax, long lMin) {
    if (lMax >= dHOT)           return HOTDAY;   // 5
    else if (lMax >= dWARM)     return WARMDAY;  // 4
    else if (lMax > dCOOL)      return NORMDAY;  // 3
    else if (lMax > dCOLD)      return COOLDAY;  // 2
    else                        return COLDDAY;  // 1
}
```

### Default Thresholds (Celsius)

```cpp
dHOT  = 32.0;  // Hot day threshold
dWARM = 28.0;  // Warm day threshold
dCOOL = 22.0;  // Cool day threshold
dCOLD = 15.0;  // Cold day threshold
```

### Temperature Conversion

For Fahrenheit data:
```cpp
dHOT  = dHOT  * 9 / 5 + 32;  // 89.6°F
dWARM = dWARM * 9 / 5 + 32;  // 82.4°F
dCOOL = dCOOL * 9 / 5 + 32;  // 71.6°F
dCOLD = dCOLD * 9 / 5 + 32;  // 59.0°F
```

---

## DList Statistical Calculations

### Method: `DList::Calc()`

### Purpose
Calculate max, median, min, and average from demand samples.

### Algorithm

```cpp
void DList::Calc() {
    // Sort the list
    sort();

    // Maximum value
    m_Max = back();

    // Minimum value
    m_Min = front();

    // Median value
    int n = size();
    iterator it = begin();
    advance(it, n / 2);
    m_Med = *it;

    // Average value
    double sum = 0.0;
    for (iterator i = begin(); i != end(); ++i) {
        sum += *i;
    }
    m_Ave = sum / max(n, 1);
}
```

### Edge Cases

- **Empty list**: Returns 0 for all statistics
- **Single value**: Max = Med = Min = Ave = value
- **Even count**: Median is middle-upper value
- **Outlier handling**: No automatic outlier removal (uses all data)

---

## Load Factor Calculations

### Daily Load Factor
```
LF_daily = Total_Energy / (Max_Demand * 48_intervals) * 100
```

### Peak Load Factor
```
LF_peak = Peak_Energy / (Max_Peak_Demand * Peak_Intervals) * 100
```

### Off-Peak Load Factor
```
LF_offpeak = OffPeak_Energy / (Max_OffPeak_Demand * OffPeak_Intervals) * 100
```

### Peak/Off-Peak Ratio
```
PO_Ratio = Peak_Energy / OffPeak_Energy
```

---

## Smoothing and Transition Handling

### Day Boundary Smoothing

```cpp
// Get last interval from previous day
long lasthrval = ValArr[indx][1];

// Generate new day's intervals
for (itvl = 1; itvl <= MAX_INTERVAL; itvl++) {
    ValArr[indx][itvl] = pDailyDP->GetTimeMw(t)->m_MwCap;
}

// Average first interval with previous day's last
if (lasthrval > 0)
    ValArr[indx][1] = (lasthrval + ValArr[indx][1]) / 2;
```

This creates a smooth transition between days, preventing abrupt jumps at midnight.

---

## Error Metrics (Compare Method)

### Forecast Comparison Metrics

```cpp
// For each interval:
fc = Forecast_Value;
ac = Actual_Value;

// Absolute error
ea = abs(ac - fc);

// Percentage error
if (ac > 0)
    re = ea * 100.0 / ac;
else
    re = 0;

// Signed error
es = fc - ac;  // Positive = over-forecast
```

### Aggregated Metrics

```cpp
// Total energy error
Total_Error = sum(abs(Forecast - Actual));

// Mean absolute percentage error (MAPE)
MAPE = sum(abs(Forecast - Actual) / Actual) / N * 100;

// Root mean square error (RMSE)
RMSE = sqrt(sum((Forecast - Actual)^2) / N);
```

---

## Performance Optimizations

1. **Buffered File I/O**: Uses OSBufferFile for efficient CSV writing
2. **List Pre-allocation**: DList pre-sized for expected samples
3. **Incremental Statistics**: Running calculations avoid re-processing
4. **Memory Pooling**: Reuse arrays across forecast days
5. **Progress Tracking**: User feedback without performance impact

---

## Validation and Quality Checks

### Input Validation
- Check for missing dates in historical data
- Validate temperature ranges (not zero or unrealistic)
- Ensure complete interval data (48 per day)

### Model Validation
- Verify non-zero statistical values
- Check temperature range consistency
- Validate profile energy totals

### Forecast Validation
- Check for negative demand values
- Verify reasonable growth factor application
- Validate output file completeness
