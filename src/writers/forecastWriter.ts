import { stringify } from 'csv-stringify/sync';
import { writeFileSync } from 'fs';
import { DateTime } from 'luxon';
import { ForecastResult } from '../types/index.js';

export interface ForecastWriterOptions {
  dateFormat?: string;  // Default: 'M/d/yyyy HH:mm'
  decimalPlaces?: number;  // Default: 1
}

// Standard region order for output
const REGION_ORDER = ['CLUZ', 'CVIS', 'CMIN'];

// Group forecast results by datetime for multi-region output
export function writeForecastCsv(
  results: ForecastResult[],
  filePath: string,
  options?: ForecastWriterOptions
): void {
  const opts = {
    dateFormat: options?.dateFormat ?? 'M/d/yyyy HH:mm',
    decimalPlaces: options?.decimalPlaces ?? 1
  };

  // Get unique regions and datetimes
  const uniqueRegions = [...new Set(results.map(r => r.region))];
  // Sort regions by predefined order, then alphabetically for any unknown regions
  const regions = uniqueRegions.sort((a, b) => {
    const aIdx = REGION_ORDER.indexOf(a);
    const bIdx = REGION_ORDER.indexOf(b);
    if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
    if (aIdx !== -1) return -1;
    if (bIdx !== -1) return 1;
    return a.localeCompare(b);
  });
  const datetimes = [...new Set(results.map(r => r.datetime.toISOString()))].sort();

  // Build lookup map
  const resultMap = new Map<string, ForecastResult>();
  for (const result of results) {
    const key = `${result.datetime.toISOString()}_${result.region}`;
    resultMap.set(key, result);
  }

  // Build rows
  const rows: Record<string, string | number>[] = [];

  for (const dtStr of datetimes) {
    const dt = DateTime.fromISO(dtStr);
    const row: Record<string, string | number> = {
      DateTimeEnding: dt.toFormat(opts.dateFormat)
    };

    for (const region of regions) {
      const key = `${dtStr}_${region}`;
      const result = resultMap.get(key);
      row[region] = result
        ? Number(result.predictedDemand.toFixed(opts.decimalPlaces))
        : 0;
    }

    rows.push(row);
  }

  // Generate CSV
  const columns = ['DateTimeEnding', ...regions];
  const csv = stringify(rows, { header: true, columns });

  writeFileSync(filePath, csv);
}

// Write comparison report (forecast vs actual)
export function writeComparisonCsv(
  forecasts: ForecastResult[],
  actuals: Map<string, number>,  // key: "datetime_region"
  filePath: string
): void {
  const rows: Record<string, string | number>[] = [];

  for (const forecast of forecasts) {
    const key = `${forecast.datetime.toISOString()}_${forecast.region}`;
    const actual = actuals.get(key);

    if (actual !== undefined) {
      const error = forecast.predictedDemand - actual;
      const absError = Math.abs(error);
      const pctError = actual !== 0 ? (absError / actual) * 100 : 0;

      rows.push({
        DateTimeEnding: DateTime.fromJSDate(forecast.datetime).toFormat('M/d/yyyy HH:mm'),
        Region: forecast.region,
        Forecast: Number(forecast.predictedDemand.toFixed(0)),
        Actual: Number(actual.toFixed(0)),
        Error: Number(error.toFixed(0)),
        AbsError: Number(absError.toFixed(0)),
        PctError: Number(pctError.toFixed(2))
      });
    }
  }

  const csv = stringify(rows, { header: true });
  writeFileSync(filePath, csv);
}
