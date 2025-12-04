import { DateTime } from 'luxon';
import { MergedRecord } from '../utils/dataMerger.js';
import { FeatureVector, TrainingSample } from '../types/index.js';
import { BASE_TEMP_CELSIUS, PH_HOLIDAYS_2025, FEATURE_NAMES } from '../constants/index.js';

// Calculate relative humidity from temperature and dew point
// Using Magnus formula approximation
export function calculateRelativeHumidity(temp: number, dew: number): number {
  const a = 17.625;
  const b = 243.04;
  const rh = 100 * Math.exp((a * dew) / (b + dew)) / Math.exp((a * temp) / (b + temp));
  return Math.min(100, Math.max(0, rh));
}

// Calculate heat index (feels-like temperature) for tropical climate
// Simplified Rothfusz regression
export function calculateHeatIndex(temp: number, rh: number): number {
  // Only apply if temp >= 27°C (80°F)
  if (temp < 27) return temp;

  const T = temp;
  const R = rh;

  // Rothfusz regression
  let HI = -8.78469475556 +
    1.61139411 * T +
    2.33854883889 * R +
    -0.14611605 * T * R +
    -0.012308094 * T * T +
    -0.0164248277778 * R * R +
    0.002211732 * T * T * R +
    0.00072546 * T * R * R +
    -0.000003582 * T * T * R * R;

  return Math.round(HI * 10) / 10;
}

// Check if a date is a holiday
function isHoliday(date: Date): boolean {
  const dt = DateTime.fromJSDate(date);
  const dateStr = dt.toFormat('yyyy-MM-dd');
  return PH_HOLIDAYS_2025.includes(dateStr);
}

// Check if hour is daytime (6:00 - 18:00)
function isDaytime(hour: number): boolean {
  return hour >= 6 && hour < 18;
}

// Extract temporal features from datetime
function extractTemporalFeatures(datetime: Date): {
  hour: number;
  dayOfWeek: number;
  isWeekend: number;
  isHolidayFlag: number;
  dayOfMonth: number;
  month: number;
} {
  const dt = DateTime.fromJSDate(datetime);
  const dayOfWeek = dt.weekday % 7; // 0=Sunday, 1=Monday, etc.

  return {
    hour: dt.hour,
    dayOfWeek,
    isWeekend: (dayOfWeek === 0 || dayOfWeek === 6) ? 1 : 0,
    isHolidayFlag: isHoliday(datetime) ? 1 : 0,
    dayOfMonth: dt.day,
    month: dt.month
  };
}

// Calculate derived weather features
function calculateDerivedWeather(
  temp: number,
  dew: number,
  cloudcover: number,
  solarradiation: number,
  precip: number,
  windspeed: number,
  hour: number
): {
  relativeHumidity: number;
  heatIndex: number;
  CDH: number;
  effectiveSolar: number;
  apparentTemp: number;
  isRaining: number;
  tempDewSpread: number;
  isDaytimeFlag: number;
} {
  const relativeHumidity = calculateRelativeHumidity(temp, dew);
  const heatIndex = calculateHeatIndex(temp, relativeHumidity);
  const CDH = Math.max(0, temp - BASE_TEMP_CELSIUS);
  const effectiveSolar = solarradiation * (1 - cloudcover / 100);
  const apparentTemp = temp - (windspeed * 0.05); // Simplified wind chill

  return {
    relativeHumidity,
    heatIndex,
    CDH,
    effectiveSolar,
    apparentTemp,
    isRaining: precip > 0.1 ? 1 : 0,
    tempDewSpread: temp - dew,
    isDaytimeFlag: isDaytime(hour) ? 1 : 0
  };
}

// Build feature vector from merged record
export function buildFeatureVector(
  record: MergedRecord,
  lagData?: {
    demandLag1h?: number;
    demandLag24h?: number;
    demandLag168h?: number;
    tempLag1h?: number;
    tempLag24h?: number;
    demandRolling24h?: number;
    tempRolling24h?: number;
    tempMax24h?: number;
  }
): FeatureVector {
  const temporal = extractTemporalFeatures(record.datetime);
  const derived = calculateDerivedWeather(
    record.weather.temp,
    record.weather.dew,
    record.weather.cloudcover,
    record.weather.solarradiation,
    record.weather.precip,
    record.weather.windspeed,
    temporal.hour
  );

  return {
    // Temporal
    hour: temporal.hour,
    dayOfWeek: temporal.dayOfWeek,
    isWeekend: temporal.isWeekend,
    isHoliday: temporal.isHolidayFlag,
    dayOfMonth: temporal.dayOfMonth,
    month: temporal.month,

    // Raw weather
    temp: record.weather.temp,
    dew: record.weather.dew,
    precip: record.weather.precip,
    windgust: record.weather.windgust,
    windspeed: record.weather.windspeed,
    cloudcover: record.weather.cloudcover,
    solarradiation: record.weather.solarradiation,
    uvindex: record.weather.uvindex,

    // Derived weather
    relativeHumidity: derived.relativeHumidity,
    heatIndex: derived.heatIndex,
    CDH: derived.CDH,
    effectiveSolar: derived.effectiveSolar,
    apparentTemp: derived.apparentTemp,
    isRaining: derived.isRaining,
    tempDewSpread: derived.tempDewSpread,
    isDaytime: derived.isDaytimeFlag,

    // Lag features
    demandLag1h: lagData?.demandLag1h,
    demandLag24h: lagData?.demandLag24h,
    demandLag168h: lagData?.demandLag168h,
    tempLag1h: lagData?.tempLag1h,
    tempLag24h: lagData?.tempLag24h,

    // Rolling averages
    demandRolling24h: lagData?.demandRolling24h,
    tempRolling24h: lagData?.tempRolling24h,
    tempMax24h: lagData?.tempMax24h
  };
}

// Process all merged records into training samples with lag features
export function buildTrainingSamples(
  records: MergedRecord[],
  includePartialLags: boolean = false
): TrainingSample[] {
  const samples: TrainingSample[] = [];

  // Group records by region
  const byRegion = new Map<string, MergedRecord[]>();
  for (const record of records) {
    if (!byRegion.has(record.region)) {
      byRegion.set(record.region, []);
    }
    byRegion.get(record.region)!.push(record);
  }

  // Process each region separately for lag calculations
  for (const [region, regionRecords] of byRegion) {
    // Sort by datetime
    regionRecords.sort((a, b) => a.datetime.getTime() - b.datetime.getTime());

    // Build index for quick lookup
    const demandByTime = new Map<number, number>();
    const tempByTime = new Map<number, number>();

    for (const record of regionRecords) {
      const ts = record.datetime.getTime();
      demandByTime.set(ts, record.demand);
      tempByTime.set(ts, record.weather.temp);
    }

    // Process each record
    for (let i = 0; i < regionRecords.length; i++) {
      const record = regionRecords[i];
      const ts = record.datetime.getTime();

      // Calculate lag values
      const lag1h = ts - 1 * 60 * 60 * 1000;
      const lag24h = ts - 24 * 60 * 60 * 1000;
      const lag168h = ts - 168 * 60 * 60 * 1000; // 7 days

      const demandLag1h = demandByTime.get(lag1h);
      const demandLag24h = demandByTime.get(lag24h);
      const demandLag168h = demandByTime.get(lag168h);
      const tempLag1h = tempByTime.get(lag1h);
      const tempLag24h = tempByTime.get(lag24h);

      // Calculate rolling averages (last 24 hours)
      let demandSum = 0, tempSum = 0, tempMax = -Infinity, count = 0;
      for (let h = 1; h <= 24; h++) {
        const lagTs = ts - h * 60 * 60 * 1000;
        const d = demandByTime.get(lagTs);
        const t = tempByTime.get(lagTs);
        if (d !== undefined && t !== undefined) {
          demandSum += d;
          tempSum += t;
          tempMax = Math.max(tempMax, t);
          count++;
        }
      }

      const demandRolling24h = count > 0 ? demandSum / count : undefined;
      const tempRolling24h = count > 0 ? tempSum / count : undefined;
      const tempMax24h = count > 0 ? tempMax : undefined;

      // Skip if missing required lag data (unless includePartialLags)
      if (!includePartialLags && (demandLag24h === undefined || demandLag168h === undefined)) {
        continue;
      }

      const features = buildFeatureVector(record, {
        demandLag1h,
        demandLag24h,
        demandLag168h,
        tempLag1h,
        tempLag24h,
        demandRolling24h,
        tempRolling24h,
        tempMax24h
      });

      samples.push({
        datetime: record.datetime,
        region,
        demand: record.demand,
        features
      });
    }
  }

  // Sort all samples by datetime
  samples.sort((a, b) => a.datetime.getTime() - b.datetime.getTime());

  return samples;
}

// Convert feature vector to array (for ML models)
export function featureVectorToArray(fv: FeatureVector): number[] {
  return FEATURE_NAMES.map(name => {
    const value = fv[name as keyof FeatureVector];
    return typeof value === 'number' ? value : 0; // Replace undefined with 0
  });
}

// Get feature names (for model interpretation)
export function getFeatureNames(): string[] {
  return [...FEATURE_NAMES];
}
