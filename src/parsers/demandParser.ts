import { parse } from 'csv-parse/sync';
import { readFileSync } from 'fs';
import { DateTime } from 'luxon';
import { DEMAND_DATE_FORMAT } from '../constants/index.js';

export interface DemandRecord {
  datetime: Date;
  region: string;
  demand: number;
}

export interface ParsedDemandData {
  records: DemandRecord[];
  regions: string[];
  startDate: Date;
  endDate: Date;
}

export function parseDemandCsv(filePath: string): ParsedDemandData {
  const content = readFileSync(filePath, 'utf-8');
  const records = parse(content, {
    columns: true,
    skip_empty_lines: true,
    trim: true
  });

  const demandRecords: DemandRecord[] = [];
  const regions = new Set<string>();
  let minDate: Date | null = null;
  let maxDate: Date | null = null;

  for (const row of records) {
    const dateStr = row['DateTimeEnding'];
    // Parse date in format "M/D/YYYY HH:mm"
    const dt = DateTime.fromFormat(dateStr, 'M/d/yyyy HH:mm');
    if (!dt.isValid) {
      console.warn(`Invalid date: ${dateStr}`);
      continue;
    }

    const datetime = dt.toJSDate();

    if (!minDate || datetime < minDate) minDate = datetime;
    if (!maxDate || datetime > maxDate) maxDate = datetime;

    // Parse each region column
    for (const col of Object.keys(row)) {
      if (col === 'DateTimeEnding') continue;

      regions.add(col);
      const demand = parseFloat(row[col]);

      if (!isNaN(demand)) {
        demandRecords.push({
          datetime,
          region: col,
          demand
        });
      }
    }
  }

  return {
    records: demandRecords,
    regions: Array.from(regions),
    startDate: minDate!,
    endDate: maxDate!
  };
}
