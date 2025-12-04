// Region mappings (weather city -> demand column)
export const REGION_MAPPINGS: Record<string, { demandColumn: string; city: string }> = {
  'manila': { demandColumn: 'CLUZ', city: 'Manila' },
  'cebu': { demandColumn: 'CVIS', city: 'Cebu City' },
  'davao': { demandColumn: 'CMIN', city: 'Davao City' }
};

// Tropical climate base temperature for CDH
export const BASE_TEMP_CELSIUS = 24;

// Feature names for model (order matters for XGBoost)
export const FEATURE_NAMES = [
  // Basic temporal
  'hour', 'dayOfWeek', 'isWeekend', 'isHoliday', 'dayOfMonth', 'month',

  // Cyclical hour encoding (captures hour patterns without linearity assumption)
  'hourSin', 'hourCos',

  // Day type one-hot encoding
  'isWorkday', 'isSaturday', 'isSunday',

  // Hour one-hot encoding (24 features) - lets model learn each hour's demand profile
  'hour_0', 'hour_1', 'hour_2', 'hour_3', 'hour_4', 'hour_5',
  'hour_6', 'hour_7', 'hour_8', 'hour_9', 'hour_10', 'hour_11',
  'hour_12', 'hour_13', 'hour_14', 'hour_15', 'hour_16', 'hour_17',
  'hour_18', 'hour_19', 'hour_20', 'hour_21', 'hour_22', 'hour_23',

  // Hour-DayType interactions (allows different hourly patterns per day type)
  'hourWorkday', 'hourSaturday', 'hourSunday',

  // Weather features
  'temp', 'tempSquared', 'dew', 'precip', 'windgust', 'windspeed', 'cloudcover', 'solarradiation', 'uvindex',

  // Derived weather
  'relativeHumidity', 'heatIndex', 'CDH', 'effectiveSolar', 'apparentTemp', 'isRaining', 'tempDewSpread', 'isDaytime',

  // Lag features
  'demandLag1h', 'demandLag24h', 'demandLag168h', 'tempLag1h', 'tempLag24h',

  // Rolling averages
  'demandRolling24h', 'tempRolling24h', 'tempMax24h'
] as const;

// Default Philippines holidays 2025
export const PH_HOLIDAYS_2025 = [
  '2025-01-01', // New Year
  '2025-01-29', // Chinese New Year
  '2025-02-25', // EDSA Revolution
  '2025-04-09', // Araw ng Kagitingan
  '2025-04-17', // Maundy Thursday
  '2025-04-18', // Good Friday
  '2025-04-19', // Black Saturday
  '2025-05-01', // Labor Day
  '2025-06-12', // Independence Day
  '2025-08-25', // National Heroes Day
  '2025-11-01', // All Saints Day
  '2025-11-30', // Bonifacio Day
  '2025-12-25', // Christmas
  '2025-12-30', // Rizal Day
  '2025-12-31', // New Year's Eve
];

// Train/test split ratio
export const DEFAULT_TRAIN_SPLIT = 0.8;

// Date format for parsing demand CSV
export const DEMAND_DATE_FORMAT = 'M/d/yyyy HH:mm';

// Date format for parsing weather CSV
export const WEATHER_DATE_FORMAT = "yyyy-MM-dd'T'HH:mm:ss";
