# Capacity Factor Forecasting Implementation Plan

## Executive Summary

This document outlines the implementation plan for forecasting capacity factors across **all must-run generation types** in WESM: Wind, Solar, Hydro, Geothermal, Biomass, and Battery. We recommend a **Hybrid approach** combining physics-based models with ML residual learning for weather-dependent resources, and **profile-based models** for stable/dispatchable resources.

---

## 1. Station Type Classification

Based on WESM naming conventions in the capacity factor data:

| Suffix | Type | Count | Weather Dependent | Primary Driver |
|--------|------|-------|-------------------|----------------|
| (none) | Hydro (run-of-river) | ~20 | Partially | River flow, rainfall |
| `_S` | Solar | ~35 | Yes | Solar irradiance |
| `_W` | Wind | ~5 | Yes | Wind speed |
| `_H` | Hydro (storage) | ~10 | Partially | Reservoir level, dispatch |
| `_BI` | Biomass | ~8 | No | Fuel availability, dispatch |
| `_B` | Battery | ~5 | No | Charging schedule, arbitrage |
| `_G`/`_GP` | Geothermal | ~6 | No | Steam availability (stable) |

---

## 2. Forecasting Strategy by Generation Type

### 2.1 Weather-Dependent Resources (Hybrid Approach)

#### Wind (`_W` suffix)
```
┌─────────────────────────────────────────────────────────────────┐
│                    WIND HYBRID MODEL                             │
├─────────────────────────────────────────────────────────────────┤
│  Primary Driver: Wind Speed (m/s)                                │
│  Secondary: Wind gusts, direction, air density (temperature)    │
│                                                                  │
│  Physics Base: Power Curve                                       │
│  ├── Cut-in: 3 m/s                                              │
│  ├── Rated: 12 m/s                                              │
│  ├── Cut-out: 25 m/s                                            │
│  └── Cubic relationship in operating range                      │
│                                                                  │
│  ML Residual: Captures                                           │
│  ├── Site-specific turbine characteristics                      │
│  ├── Wake effects (for wind farms)                              │
│  ├── Terrain/directional effects                                │
│  └── Maintenance outage patterns                                │
│                                                                  │
│  Weather Data: Visual Crossing API                               │
│  └── windspeed, windgust, winddir, temp                         │
└─────────────────────────────────────────────────────────────────┘
```

#### Solar (`_S` suffix)
```
┌─────────────────────────────────────────────────────────────────┐
│                    SOLAR HYBRID MODEL                            │
├─────────────────────────────────────────────────────────────────┤
│  Primary Driver: Solar Irradiance (W/m²)                        │
│  Secondary: Temperature, cloud cover, humidity                   │
│                                                                  │
│  Physics Base: Irradiance Model                                  │
│  ├── CFac = (GHI / 1000) × η_temp × η_system                   │
│  ├── Temperature derating: -0.4%/°C above 25°C                  │
│  ├── System losses: ~15% (inverter, wiring, soiling)           │
│  └── Zero at night (GHI = 0)                                    │
│                                                                  │
│  ML Residual: Captures                                           │
│  ├── Panel tilt/orientation effects                              │
│  ├── Shading patterns                                            │
│  ├── Soiling degradation                                         │
│  └── Inverter clipping at high irradiance                       │
│                                                                  │
│  Weather Data: Visual Crossing API                               │
│  └── solarradiation, cloudcover, temp, humidity                 │
└─────────────────────────────────────────────────────────────────┘
```

---

### 2.2 Partially Weather-Dependent Resources

#### Run-of-River Hydro (no suffix, e.g., 01BAKUN, 01LATRINI)
```
┌─────────────────────────────────────────────────────────────────┐
│                RUN-OF-RIVER HYDRO MODEL                          │
├─────────────────────────────────────────────────────────────────┤
│  Primary Driver: River flow (correlated with rainfall)          │
│  Secondary: Season (wet vs dry), recent precipitation           │
│                                                                  │
│  Approach: Profile + Rainfall Adjustment                        │
│                                                                  │
│  Base Profile:                                                   │
│  ├── Build hourly median profiles by month/daytype              │
│  ├── Capture seasonal patterns (high in wet season)             │
│  └── Similar to demand forecasting hybrid model                 │
│                                                                  │
│  Rainfall Adjustment:                                            │
│  ├── Fetch precipitation data from weather API                  │
│  ├── Apply lag (rainfall → river flow delay: 1-3 days)         │
│  └── Adjust profile based on recent rain vs historical          │
│                                                                  │
│  Weather Data: Visual Crossing API                               │
│  └── precip (mm), precipprob, humidity                          │
│                                                                  │
│  Key Insight:                                                    │
│  Run-of-river hydro has strong seasonal patterns:               │
│  - Wet season (Jun-Nov): High capacity factors                  │
│  - Dry season (Dec-May): Lower capacity factors                 │
│  - Diurnal pattern relatively stable                            │
└─────────────────────────────────────────────────────────────────┘
```

#### Storage Hydro (`_H` suffix, e.g., 03CALAUAN_H, 14TACUR_H)
```
┌─────────────────────────────────────────────────────────────────┐
│                  STORAGE HYDRO MODEL                             │
├─────────────────────────────────────────────────────────────────┤
│  Primary Driver: Dispatch schedule (operator decision)          │
│  Secondary: Reservoir level, demand forecast, prices            │
│                                                                  │
│  Approach: Profile-Based with Peak/Off-Peak Patterns            │
│                                                                  │
│  Key Characteristics:                                            │
│  ├── Dispatchable (operator controls output)                    │
│  ├── Typically runs during peak demand hours                    │
│  ├── May be curtailed during off-peak                           │
│  └── Reservoir constraints limit total daily energy             │
│                                                                  │
│  Model:                                                          │
│  ├── Build hourly profiles by daytype (weekday/weekend)         │
│  ├── Capture peak-hour dispatch patterns                        │
│  ├── Seasonal adjustment for reservoir levels                   │
│  └── Use historical median + small adjustments                  │
│                                                                  │
│  Weather Correlation: Weak                                       │
│  └── Rainfall affects long-term reservoir, not hourly output    │
└─────────────────────────────────────────────────────────────────┘
```

---

### 2.3 Non-Weather-Dependent Resources (Profile-Based)

#### Geothermal (`_G`, `_GP` suffix)
```
┌─────────────────────────────────────────────────────────────────┐
│                  GEOTHERMAL MODEL                                │
├─────────────────────────────────────────────────────────────────┤
│  Primary Driver: Steam availability (very stable)               │
│  Secondary: Maintenance schedules, well conditions              │
│                                                                  │
│  Key Characteristics:                                            │
│  ├── Baseload operation (runs 24/7)                             │
│  ├── Very stable capacity factors (often 80-95%)                │
│  ├── Occasional maintenance outages                              │
│  └── No weather dependence                                       │
│                                                                  │
│  Approach: Statistical Profile                                   │
│  ├── Calculate historical median by hour/month                  │
│  ├── Apply small random variation (±5%)                         │
│  ├── Model maintenance as periodic dips                          │
│  └── Very high confidence due to stability                       │
│                                                                  │
│  Example Stations:                                               │
│  - 03TIWI-C: ~80% typical CFac                                  │
│  - 04TONGONA: ~75% typical CFac                                 │
│  - 06PGPP1, 06PGPP2: Palinpinon geothermal                      │
└─────────────────────────────────────────────────────────────────┘
```

#### Biomass (`_BI` suffix)
```
┌─────────────────────────────────────────────────────────────────┐
│                    BIOMASS MODEL                                 │
├─────────────────────────────────────────────────────────────────┤
│  Primary Driver: Fuel availability, dispatch schedule           │
│  Secondary: Maintenance, feedstock supply                        │
│                                                                  │
│  Key Characteristics:                                            │
│  ├── Semi-dispatchable (depends on feedstock)                   │
│  ├── Often co-located with sugar mills (bagasse)                │
│  ├── Seasonal patterns (milling season = more fuel)             │
│  └── Moderate capacity factors (30-60% typical)                 │
│                                                                  │
│  Approach: Seasonal Profile                                      │
│  ├── Strong seasonal pattern (milling season: Oct-May)          │
│  ├── Build monthly profiles from historical data                │
│  ├── Lower CFac during off-season (Jun-Sep)                     │
│  └── Hourly pattern relatively stable                           │
│                                                                  │
│  Example Stations:                                               │
│  - 01CBNTUAN_BI: Cabanatuan biomass                             │
│  - 08DINGLE_BI: Iloilo biomass                                  │
└─────────────────────────────────────────────────────────────────┘
```

#### Battery (`_B` suffix)
```
┌─────────────────────────────────────────────────────────────────┐
│                    BATTERY MODEL                                 │
├─────────────────────────────────────────────────────────────────┤
│  Primary Driver: Charging/discharging schedule                  │
│  Secondary: Price arbitrage, grid support needs                  │
│                                                                  │
│  Key Characteristics:                                            │
│  ├── Fully dispatchable (operator controlled)                   │
│  ├── Net-zero energy (charges = discharges over cycle)          │
│  ├── Typically discharges during peak prices                    │
│  ├── Charges during off-peak/high solar periods                 │
│  └── CFac can be negative (charging) or positive (discharging)  │
│                                                                  │
│  Approach: Peak/Off-Peak Profile                                │
│  ├── Build discharge profile (peak hours: 17:00-21:00)          │
│  ├── Build charge profile (off-peak: 00:00-06:00, midday solar) │
│  ├── Net over 24h should be ~0 (storage cycling)               │
│  └── Adjust based on price forecast                             │
│                                                                  │
│  Challenge:                                                      │
│  Battery dispatch is market-driven, hard to predict             │
│  May need to use historical patterns as best estimate           │
│                                                                  │
│  Example Stations:                                               │
│  - 01SNTGO_B: Santiago battery                                  │
│  - 14KIDAP_B: Kidapawan battery                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. Unified Model Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│              CAPACITY FACTOR FORECASTING SYSTEM                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                    INPUT LAYER                             │  │
│  ├───────────────────────────────────────────────────────────┤  │
│  │  1. Station Metadata (stations.json)                       │  │
│  │     - Coordinates, type, capacity, grid                   │  │
│  │                                                            │  │
│  │  2. Historical Capacity Factors (MRHCFac CSVs)            │  │
│  │     - Training data for all models                         │  │
│  │                                                            │  │
│  │  3. Weather Data (Visual Crossing API)                     │  │
│  │     - Wind: windspeed, windgust, winddir, temp            │  │
│  │     - Solar: solarradiation, cloudcover, temp             │  │
│  │     - Hydro: precip, humidity                              │  │
│  │                                                            │  │
│  │  4. Temporal Context                                       │  │
│  │     - Hour, day of week, month, holidays                   │  │
│  └───────────────────────────────────────────────────────────┘  │
│                              │                                   │
│                              ▼                                   │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                  MODEL ROUTER                              │  │
│  ├───────────────────────────────────────────────────────────┤  │
│  │  Based on station type suffix:                             │  │
│  │                                                            │  │
│  │  _W (Wind)     → WindHybridModel                          │  │
│  │  _S (Solar)    → SolarHybridModel                         │  │
│  │  (none) Hydro  → RunOfRiverModel                          │  │
│  │  _H (Hydro)    → StorageHydroModel                        │  │
│  │  _G/_GP (Geo)  → GeothermalProfileModel                   │  │
│  │  _BI (Biomass) → BiomassProfileModel                      │  │
│  │  _B (Battery)  → BatteryProfileModel                      │  │
│  └───────────────────────────────────────────────────────────┘  │
│                              │                                   │
│                              ▼                                   │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                 SPECIALIZED MODELS                         │  │
│  ├───────────────────────────────────────────────────────────┤  │
│  │                                                            │  │
│  │  ┌─────────────────┐  ┌─────────────────┐                 │  │
│  │  │ WindHybridModel │  │ SolarHybridModel│                 │  │
│  │  ├─────────────────┤  ├─────────────────┤                 │  │
│  │  │ Physics: Power  │  │ Physics: GHI    │                 │  │
│  │  │ Curve           │  │ + Temp Derating │                 │  │
│  │  │ + ML Residual   │  │ + ML Residual   │                 │  │
│  │  └─────────────────┘  └─────────────────┘                 │  │
│  │                                                            │  │
│  │  ┌─────────────────┐  ┌─────────────────┐                 │  │
│  │  │ RunOfRiverModel │  │ StorageHydroMdl │                 │  │
│  │  ├─────────────────┤  ├─────────────────┤                 │  │
│  │  │ Seasonal Profile│  │ Peak/Off-Peak   │                 │  │
│  │  │ + Rainfall Adj  │  │ Dispatch Profile│                 │  │
│  │  └─────────────────┘  └─────────────────┘                 │  │
│  │                                                            │  │
│  │  ┌─────────────────┐  ┌─────────────────┐                 │  │
│  │  │ GeothermalModel │  │ BiomassModel    │                 │  │
│  │  ├─────────────────┤  ├─────────────────┤                 │  │
│  │  │ Stable Baseline │  │ Seasonal Profile│                 │  │
│  │  │ (80-95% CFac)   │  │ (Milling Season)│                 │  │
│  │  └─────────────────┘  └─────────────────┘                 │  │
│  │                                                            │  │
│  │  ┌─────────────────┐                                      │  │
│  │  │ BatteryModel    │                                      │  │
│  │  ├─────────────────┤                                      │  │
│  │  │ Charge/Discharge│                                      │  │
│  │  │ Schedule Profile│                                      │  │
│  │  └─────────────────┘                                      │  │
│  └───────────────────────────────────────────────────────────┘  │
│                              │                                   │
│                              ▼                                   │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                   OUTPUT LAYER                             │  │
│  ├───────────────────────────────────────────────────────────┤  │
│  │  CSV Format (WESM Compatible):                             │  │
│  │  DateTimeEnding,01BAKUN,01BURGOS,01CLARK,...              │  │
│  │  12/1/2025 01:00,0.72,0.03,0.00,...                       │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 4. Model Complexity vs Accuracy Trade-off

| Resource Type | Model Complexity | Expected Accuracy | Weather Dependency |
|---------------|------------------|-------------------|-------------------|
| **Solar** | High (Hybrid) | MAPE < 10% | Strong |
| **Wind** | High (Hybrid) | MAPE < 15% | Strong |
| **Run-of-River Hydro** | Medium | MAPE < 20% | Moderate (rainfall) |
| **Storage Hydro** | Low (Profile) | MAPE < 25% | Weak |
| **Geothermal** | Low (Profile) | MAPE < 5% | None |
| **Biomass** | Low (Profile) | MAPE < 20% | None (seasonal) |
| **Battery** | Medium | MAPE < 30% | None (market-driven) |

---

## 5. Implementation Priority

### Phase 1: High-Impact Weather-Dependent (Weeks 1-2)
```
Priority 1: Solar (_S) - 35 stations
├── Highest count, strong weather correlation
├── Clear physics model (irradiance → output)
└── Most predictable with weather data

Priority 2: Wind (_W) - 5 stations
├── Fewer stations but significant capacity
├── Strong weather correlation
└── Well-understood power curve physics
```

### Phase 2: Profile-Based Stable Resources (Week 3)
```
Priority 3: Geothermal (_G/_GP) - 6 stations
├── Very stable, easy to forecast
├── Simple median profile sufficient
└── Low effort, high accuracy

Priority 4: Biomass (_BI) - 8 stations
├── Seasonal patterns
├── Monthly profile by milling season
└── Moderate complexity
```

### Phase 3: Hydro and Storage (Week 4)
```
Priority 5: Run-of-River Hydro - ~20 stations
├── Seasonal + rainfall adjustment
├── Need precipitation data
└── More complex due to flow dynamics

Priority 6: Storage Hydro (_H) - ~10 stations
├── Dispatch-driven (hard to predict)
├── Peak/off-peak patterns
└── Historical profile approach

Priority 7: Battery (_B) - 5 stations
├── Market-driven dispatch
├── Hardest to predict
└── Historical patterns only
```

---

## 6. Profile-Based Model Details

For non-weather-dependent resources, we use a **statistical profile approach** similar to our demand forecasting:

```typescript
interface ProfileBasedModel {
  // Build profiles from historical data
  buildProfiles(historicalCFac: TrainingSample[]): void;

  // Get profile for specific hour/daytype/month
  getProfile(hour: number, dayType: DayType, month: number): ProfileStats;

  // Predict capacity factor
  predict(datetime: Date): number;
}

interface ProfileStats {
  min: number;      // P5 (5th percentile)
  median: number;   // P50 (median)
  max: number;      // P95 (95th percentile)
  count: number;    // Sample count
}

// Prediction uses median with optional adjustment
function predict(datetime: Date, adjustment: number = 0): number {
  const profile = getProfile(hour, dayType, month);
  return Math.max(0, Math.min(1, profile.median + adjustment));
}
```

### Geothermal Profile Example
```
Hour    | Mon-Fri | Sat | Sun
--------|---------|-----|-----
00:00   | 0.85    | 0.85| 0.85
06:00   | 0.85    | 0.85| 0.85
12:00   | 0.82    | 0.82| 0.82  (slight midday dip - maintenance)
18:00   | 0.85    | 0.85| 0.85
```

### Biomass Seasonal Profile Example
```
Month   | Typical CFac | Notes
--------|--------------|------------------
Jan     | 0.55         | Milling season (high)
Feb     | 0.55         | Milling season
Mar     | 0.50         | Milling season
Apr     | 0.45         | End of milling
May     | 0.40         | Transition
Jun     | 0.25         | Off-season (low)
Jul     | 0.20         | Off-season
Aug     | 0.25         | Off-season
Sep     | 0.30         | Pre-milling
Oct     | 0.45         | Milling starts
Nov     | 0.50         | Milling season
Dec     | 0.55         | Milling season
```

---

## 7. File Structure Update

```
src/
├── models/
│   ├── capacityFactor/
│   │   ├── index.ts                    # Exports all models
│   │   ├── ModelRouter.ts              # Routes to correct model by type
│   │   │
│   │   ├── # Weather-Dependent (Hybrid)
│   │   ├── WindPowerCurve.ts           # Physics: cubic power curve
│   │   ├── SolarIrradianceModel.ts     # Physics: GHI + temp derating
│   │   ├── WindHybridModel.ts          # Physics + ML residual
│   │   ├── SolarHybridModel.ts         # Physics + ML residual
│   │   │
│   │   ├── # Profile-Based
│   │   ├── ProfileBasedModel.ts        # Base class for profile models
│   │   ├── GeothermalModel.ts          # Stable baseline profile
│   │   ├── BiomassModel.ts             # Seasonal profile
│   │   ├── BatteryModel.ts             # Peak/off-peak profile
│   │   │
│   │   ├── # Hydro (Mixed)
│   │   ├── RunOfRiverModel.ts          # Profile + rainfall adjustment
│   │   └── StorageHydroModel.ts        # Peak dispatch profile
│   │
│   └── hybridModel.ts                  # Existing demand model
│
├── services/
│   ├── weatherService.ts               # Extended for all weather params
│   └── capacityFactorService.ts        # CFac data loading/saving
│
├── data/
│   └── stations.json                   # Station metadata (created)
│
└── commands/
    └── cfac.ts                         # CLI: cfac forecast, cfac evaluate
```

---

## 8. Summary: Approach by Type

| Type | Approach | Weather Data | Complexity |
|------|----------|--------------|------------|
| **Wind** | Hybrid (Power Curve + ML) | windspeed, gust, dir, temp | High |
| **Solar** | Hybrid (Irradiance + ML) | solarradiation, cloud, temp | High |
| **Run-of-River Hydro** | Profile + Rainfall Adj | precip, humidity | Medium |
| **Storage Hydro** | Peak/Off-Peak Profile | None | Low |
| **Geothermal** | Stable Median Profile | None | Very Low |
| **Biomass** | Seasonal Profile | None | Low |
| **Battery** | Charge/Discharge Profile | None | Medium |

---

## 9. Benefits of This Multi-Model Approach

1. **Right tool for the job**: Weather-dependent resources get sophisticated models, stable resources get simple profiles

2. **Efficient use of weather data**: Only fetch weather for resources that need it

3. **Explainable predictions**: Each model type has clear logic
   - Wind: "Power curve says X, adjusted by Y for site effects"
   - Geothermal: "Historical median is 85%"

4. **Graceful degradation**: If weather API fails, profile models still work

5. **Easy maintenance**: Update individual models without affecting others

6. **Scalable**: Add new stations by classifying type and adding to appropriate model

---

*Document updated: 2025-12-04*
*For: iLoad Forecasting Utility - Capacity Factor Module*
