import axios from 'axios';
import { existsSync, mkdirSync, writeFileSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { DateTime } from 'luxon';

export interface WeatherLocation {
  id: string;
  name: string;
  region: string;
  demandColumn: string;
}

export interface WeatherServiceConfig {
  apiKey: string;
  cacheDir: string;
  locations: WeatherLocation[];
}

// Default locations for Philippine grid regions
export const DEFAULT_LOCATIONS: WeatherLocation[] = [
  { id: 'manila', name: 'Manila', region: 'luzon', demandColumn: 'CLUZ' },
  { id: 'cebu', name: 'Cebu City', region: 'visayas', demandColumn: 'CVIS' },
  { id: 'davao', name: 'Davao City', region: 'mindanao', demandColumn: 'CMIN' }
];

// Weather elements to fetch (matching existing format)
const HOURLY_ELEMENTS = [
  'datetime',
  'name',
  'latitude',
  'longitude',
  'temp',
  'dew',
  'precip',
  'windgust',
  'windspeed',
  'cloudcover',
  'solarradiation',
  'solarenergy',
  'uvindex'
];

export class WeatherService {
  private apiKey: string;
  private cacheDir: string;
  private locations: WeatherLocation[];
  private baseUrl = 'https://weather.visualcrossing.com/VisualCrossingWebServices/rest/services/timeline/';

  constructor(config: WeatherServiceConfig) {
    this.apiKey = config.apiKey;
    this.cacheDir = config.cacheDir;
    this.locations = config.locations;

    // Ensure cache directory exists
    if (!existsSync(this.cacheDir)) {
      mkdirSync(this.cacheDir, { recursive: true });
    }
  }

  /**
   * Get the cache file path for a specific location and date
   */
  private getCacheFilePath(locationId: string, date: string): string {
    // Organize by location/year/month for easier management
    const dt = DateTime.fromISO(date);
    const yearMonth = dt.toFormat('yyyy-MM');
    const cacheSubDir = join(this.cacheDir, locationId, yearMonth);

    if (!existsSync(cacheSubDir)) {
      mkdirSync(cacheSubDir, { recursive: true });
    }

    return join(cacheSubDir, `${date}.csv`);
  }

  /**
   * Check if we have cached data for a specific date
   */
  private hasCachedData(locationId: string, date: string): boolean {
    const filePath = this.getCacheFilePath(locationId, date);
    return existsSync(filePath);
  }

  /**
   * Read cached data for a specific date
   */
  private readCachedData(locationId: string, date: string): string | null {
    const filePath = this.getCacheFilePath(locationId, date);
    if (existsSync(filePath)) {
      return readFileSync(filePath, 'utf8');
    }
    return null;
  }

  /**
   * Save data to cache for a specific date
   */
  private saveCacheData(locationId: string, date: string, data: string): void {
    const filePath = this.getCacheFilePath(locationId, date);
    writeFileSync(filePath, data, 'utf8');
  }

  /**
   * Download weather data for a single day from Visual Crossing API
   */
  private async downloadDayData(location: WeatherLocation, date: string): Promise<string> {
    const url = `${this.baseUrl}${encodeURIComponent(location.name)}/${date}/${date}` +
                `?unitGroup=metric&contentType=csv&include=hours` +
                `&elements=${HOURLY_ELEMENTS.join(',')}` +
                `&key=${this.apiKey}`;

    const response = await axios({
      method: 'GET',
      url: url,
      timeout: 60000
    });

    return response.data;
  }

  /**
   * Parse CSV header to get column indices
   */
  private parseHeader(headerLine: string): Map<string, number> {
    const columns = headerLine.split(',').map(c => c.trim().toLowerCase());
    const indices = new Map<string, number>();
    columns.forEach((col, idx) => indices.set(col, idx));
    return indices;
  }

  /**
   * Get all dates between start and end (inclusive)
   */
  private getDateRange(startDate: string, endDate: string): string[] {
    const dates: string[] = [];
    let current = DateTime.fromISO(startDate);
    const end = DateTime.fromISO(endDate);

    while (current <= end) {
      dates.push(current.toISODate()!);
      current = current.plus({ days: 1 });
    }

    return dates;
  }

  /**
   * Fetch weather data for a date range, using cache where available
   * Returns combined CSV data for all days
   */
  async fetchWeatherData(
    location: WeatherLocation,
    startDate: string,
    endDate: string,
    onProgress?: (message: string) => void
  ): Promise<{ success: boolean; data?: string; error?: string; cached: number; downloaded: number }> {
    const dates = this.getDateRange(startDate, endDate);
    const allRows: string[] = [];
    let header: string | null = null;
    let cachedCount = 0;
    let downloadedCount = 0;

    onProgress?.(`Fetching weather data for ${location.name}: ${dates.length} days`);

    for (const date of dates) {
      try {
        let csvData: string | null = null;

        // Check cache first
        if (this.hasCachedData(location.id, date)) {
          csvData = this.readCachedData(location.id, date);
          cachedCount++;
        } else {
          // Download from API
          onProgress?.(`  Downloading ${location.name} ${date}...`);
          csvData = await this.downloadDayData(location, date);
          this.saveCacheData(location.id, date, csvData);
          downloadedCount++;

          // Small delay to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 200));
        }

        if (csvData) {
          const lines = csvData.split('\n').filter(l => l.trim());

          // Keep header from first file
          if (!header && lines.length > 0) {
            header = lines[0];
          }

          // Add data rows (skip header)
          for (let i = 1; i < lines.length; i++) {
            allRows.push(lines[i]);
          }
        }
      } catch (error: any) {
        onProgress?.(`  Error fetching ${date}: ${error.message}`);
        // Continue with other dates
      }
    }

    if (!header || allRows.length === 0) {
      return { success: false, error: 'No weather data retrieved', cached: cachedCount, downloaded: downloadedCount };
    }

    // Combine header and all rows
    const combinedData = [header, ...allRows].join('\n');

    onProgress?.(`  ${location.name}: ${cachedCount} cached, ${downloadedCount} downloaded`);

    return { success: true, data: combinedData, cached: cachedCount, downloaded: downloadedCount };
  }

  /**
   * Fetch weather data for all configured locations
   */
  async fetchAllLocations(
    startDate: string,
    endDate: string,
    onProgress?: (message: string) => void
  ): Promise<Map<string, string>> {
    const results = new Map<string, string>();

    for (const location of this.locations) {
      const result = await this.fetchWeatherData(location, startDate, endDate, onProgress);
      if (result.success && result.data) {
        results.set(location.demandColumn, result.data);
      }
    }

    return results;
  }

  /**
   * Save combined weather data to files (for compatibility with existing parsers)
   */
  async saveWeatherFiles(
    startDate: string,
    endDate: string,
    outputDir: string,
    onProgress?: (message: string) => void
  ): Promise<string[]> {
    const savedFiles: string[] = [];

    if (!existsSync(outputDir)) {
      mkdirSync(outputDir, { recursive: true });
    }

    for (const location of this.locations) {
      const result = await this.fetchWeatherData(location, startDate, endDate, onProgress);

      if (result.success && result.data) {
        const filename = `Weather_hourly_${location.id}_${startDate}_${endDate}.csv`;
        const filePath = join(outputDir, filename);
        writeFileSync(filePath, result.data, 'utf8');
        savedFiles.push(filePath);
        onProgress?.(`Saved: ${filename}`);
      }
    }

    return savedFiles;
  }

  /**
   * Check what data is available in cache for a date range
   */
  getCacheStatus(startDate: string, endDate: string): Map<string, { cached: number; missing: number; dates: string[] }> {
    const dates = this.getDateRange(startDate, endDate);
    const status = new Map<string, { cached: number; missing: number; dates: string[] }>();

    for (const location of this.locations) {
      let cached = 0;
      let missing = 0;
      const missingDates: string[] = [];

      for (const date of dates) {
        if (this.hasCachedData(location.id, date)) {
          cached++;
        } else {
          missing++;
          missingDates.push(date);
        }
      }

      status.set(location.id, { cached, missing, dates: missingDates });
    }

    return status;
  }

  /**
   * Clear cache for a specific location or all locations
   */
  clearCache(locationId?: string): void {
    const { rmSync } = require('fs');

    if (locationId) {
      const locationDir = join(this.cacheDir, locationId);
      if (existsSync(locationDir)) {
        rmSync(locationDir, { recursive: true });
      }
    } else {
      // Clear all cache
      for (const location of this.locations) {
        const locationDir = join(this.cacheDir, location.id);
        if (existsSync(locationDir)) {
          rmSync(locationDir, { recursive: true });
        }
      }
    }
  }

  /**
   * Get the date of the most recent cached data
   */
  getLatestCachedDate(locationId: string): string | null {
    const locationDir = join(this.cacheDir, locationId);
    if (!existsSync(locationDir)) return null;

    let latestDate: string | null = null;

    const yearMonths = readdirSync(locationDir);
    for (const ym of yearMonths.sort().reverse()) {
      const ymDir = join(locationDir, ym);
      const files = readdirSync(ymDir).filter(f => f.endsWith('.csv'));

      for (const file of files.sort().reverse()) {
        const date = file.replace('.csv', '');
        if (!latestDate || date > latestDate) {
          latestDate = date;
          break;
        }
      }

      if (latestDate) break;
    }

    return latestDate;
  }
}

/**
 * Create a weather service with default configuration
 */
export function createWeatherService(apiKey: string, cacheDir?: string): WeatherService {
  return new WeatherService({
    apiKey,
    cacheDir: cacheDir || join(process.cwd(), 'weather_cache'),
    locations: DEFAULT_LOCATIONS
  });
}
