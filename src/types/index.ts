// Weather data from CSV (raw hourly)
export interface RawWeatherData {
  name: string;
  latitude: number;
  longitude: number;
  datetime: string;
  temp: number;
  dew: number;
  precip: number;
  windgust: number;
  windspeed: number;
  cloudcover: number;
  solarradiation: number;
  solarenergy: number;
  uvindex: number;
}

// Demand data from CSV (hourly)
export interface RawDemandData {
  dateTimeEnding: string;
  demands: Map<string, number>;  // region -> demand value
}

// Processed weather with derived features
export interface ProcessedWeather {
  datetime: Date;
  region: string;
  // Raw
  temp: number;
  dew: number;
  precip: number;
  windgust: number;
  windspeed: number;
  cloudcover: number;
  solarradiation: number;
  solarenergy: number;
  uvindex: number;
  // Derived
  relativeHumidity: number;
  heatIndex: number;
  CDH: number;  // Cooling Degree Hours
  effectiveSolar: number;
  apparentTemp: number;
  isRaining: boolean;
  tempDewSpread: number;
  isDaytime: boolean;
}

// Combined sample for training/prediction
export interface TrainingSample {
  datetime: Date;
  region: string;
  demand: number;
  features: FeatureVector;
}

// Feature vector for ML models
export interface FeatureVector {
  // Temporal
  hour: number;
  dayOfWeek: number;
  isWeekend: number;  // 0 or 1
  isHoliday: number;  // 0 or 1
  dayOfMonth: number;
  month: number;

  // Raw weather
  temp: number;
  dew: number;
  precip: number;
  windgust: number;
  windspeed: number;
  cloudcover: number;
  solarradiation: number;
  uvindex: number;

  // Derived weather
  relativeHumidity: number;
  heatIndex: number;
  CDH: number;
  effectiveSolar: number;
  apparentTemp: number;
  isRaining: number;
  tempDewSpread: number;
  isDaytime: number;

  // Lag features (optional, may be undefined for first samples)
  demandLag1h?: number;
  demandLag24h?: number;
  demandLag168h?: number;
  tempLag1h?: number;
  tempLag24h?: number;

  // Rolling averages
  demandRolling24h?: number;
  tempRolling24h?: number;
  tempMax24h?: number;
}

// Region mapping
export interface RegionMapping {
  weatherFile: string;
  demandColumn: string;
  city: string;
}

// Model training result
export interface ModelResult {
  modelType: 'regression' | 'xgboost';
  r2Score: number;
  mape: number;
  rmse: number;
  mae: number;
  featureImportance?: Map<string, number>;
  trainingSamples: number;
  testingSamples: number;
}

// Forecast output
export interface ForecastResult {
  datetime: Date;
  region: string;
  predictedDemand: number;
  confidenceLow?: number;
  confidenceHigh?: number;
}

// Configuration
export interface ForecastConfig {
  regions: RegionMapping[];
  baseTemp: number;  // For CDH calculation (default 24 for tropics)
  trainTestSplit: number;  // e.g., 0.8 for 80% train
  holidays: string[];  // ISO date strings
}
