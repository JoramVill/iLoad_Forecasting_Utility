import { DateTime } from 'luxon';
import { DemandRecord, ParsedDemandData } from '../parsers/demandParser.js';
import { ParsedWeatherData } from '../parsers/weatherParser.js';
import { RawWeatherData } from '../types/index.js';
import { REGION_MAPPINGS } from '../constants/index.js';

export interface MergedRecord {
  datetime: Date;
  region: string;
  demand: number;
  weather: RawWeatherData;
}

export interface MergedDataset {
  records: MergedRecord[];
  regions: string[];
  startDate: Date;
  endDate: Date;
  matchedCount: number;
  unmatchedDemand: number;
  unmatchedWeather: number;
}

// Get the region code from a city name
function getRegionFromCity(city: string): string | null {
  for (const [key, mapping] of Object.entries(REGION_MAPPINGS)) {
    if (city.toLowerCase().includes(key) || mapping.city.toLowerCase() === city.toLowerCase()) {
      return mapping.demandColumn;
    }
  }
  return null;
}

// Weather datetime (hour starting) to demand datetime (hour ending)
// Weather 00:00 -> Demand 01:00
function weatherToDemandTime(weatherDatetime: string): Date {
  const dt = DateTime.fromISO(weatherDatetime);
  return dt.plus({ hours: 1 }).toJSDate();
}

export function mergeData(
  demandData: ParsedDemandData,
  weatherDatasets: ParsedWeatherData[]
): MergedDataset {
  const mergedRecords: MergedRecord[] = [];

  // Build a map of demand records by region and datetime
  const demandMap = new Map<string, DemandRecord>();
  for (const record of demandData.records) {
    const key = `${record.region}_${record.datetime.toISOString()}`;
    demandMap.set(key, record);
  }

  // Build a map of weather records by region and datetime (converted to demand time)
  const weatherMap = new Map<string, RawWeatherData>();
  for (const weatherData of weatherDatasets) {
    const region = getRegionFromCity(weatherData.city);
    if (!region) {
      console.warn(`Unknown city: ${weatherData.city}`);
      continue;
    }

    for (const record of weatherData.records) {
      const demandTime = weatherToDemandTime(record.datetime);
      const key = `${region}_${demandTime.toISOString()}`;
      weatherMap.set(key, record);
    }
  }

  // Merge by finding matching demand and weather
  let matchedCount = 0;
  const matchedDemandKeys = new Set<string>();
  const matchedWeatherKeys = new Set<string>();

  for (const [demandKey, demandRecord] of demandMap) {
    const weatherRecord = weatherMap.get(demandKey);
    if (weatherRecord) {
      mergedRecords.push({
        datetime: demandRecord.datetime,
        region: demandRecord.region,
        demand: demandRecord.demand,
        weather: weatherRecord
      });
      matchedCount++;
      matchedDemandKeys.add(demandKey);
      matchedWeatherKeys.add(demandKey);
    }
  }

  // Sort by datetime and region
  mergedRecords.sort((a, b) => {
    const dateCompare = a.datetime.getTime() - b.datetime.getTime();
    if (dateCompare !== 0) return dateCompare;
    return a.region.localeCompare(b.region);
  });

  const regions = [...new Set(mergedRecords.map(r => r.region))];

  return {
    records: mergedRecords,
    regions,
    startDate: mergedRecords.length > 0 ? mergedRecords[0].datetime : new Date(),
    endDate: mergedRecords.length > 0 ? mergedRecords[mergedRecords.length - 1].datetime : new Date(),
    matchedCount,
    unmatchedDemand: demandMap.size - matchedDemandKeys.size,
    unmatchedWeather: weatherMap.size - matchedWeatherKeys.size
  };
}
