import Database from 'better-sqlite3';
import { existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { DateTime } from 'luxon';
import { CREATE_TABLES_SQL, SCHEMA_VERSION, REGION_MAPPING } from './schema.js';
import { DemandRecord, ParsedDemandData } from '../parsers/demandParser.js';
import { RawWeatherData } from '../types/index.js';

export interface DatabaseStats {
  demandRecords: number;
  weatherRecords: number;
  models: number;
  demandDateRange: { start: string | null; end: string | null };
  weatherDateRange: { start: string | null; end: string | null };
  regions: string[];
}

export interface StoredModel {
  id: number;
  name: string;
  modelType: string;
  createdAt: string;
  trainingStart: string;
  trainingEnd: string;
  trainingSamples: number;
  r2Score: number;
  mape: number;
  rmse: number;
  mae: number;
  coefficients: number[];
  featureNames: string[];
  isActive: boolean;
  notes: string | null;
}

export class DatabaseService {
  private db: Database.Database;
  private dbPath: string;

  constructor(dbPath?: string) {
    this.dbPath = dbPath || join(process.cwd(), 'data', 'iload.db');

    // Ensure directory exists
    const dir = dirname(this.dbPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    this.db = new Database(this.dbPath);
    this.db.pragma('journal_mode = WAL');
    this.initialize();
  }

  private initialize(): void {
    this.db.exec(CREATE_TABLES_SQL);

    // Set schema version if not exists
    const stmt = this.db.prepare('INSERT OR IGNORE INTO schema_info (key, value) VALUES (?, ?)');
    stmt.run('version', String(SCHEMA_VERSION));
  }

  // ============ DEMAND RECORDS ============

  importDemandRecords(records: DemandRecord[], sourceFile?: string): { inserted: number; updated: number } {
    const insertStmt = this.db.prepare(`
      INSERT INTO demand_records (datetime, region, demand, source_file)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(datetime, region) DO UPDATE SET
        demand = excluded.demand,
        source_file = excluded.source_file,
        imported_at = CURRENT_TIMESTAMP
    `);

    let inserted = 0;
    let updated = 0;

    const transaction = this.db.transaction(() => {
      for (const record of records) {
        const dtStr = DateTime.fromJSDate(record.datetime).toISO();
        const result = insertStmt.run(dtStr, record.region, record.demand, sourceFile || null);
        if (result.changes > 0) {
          inserted++;
        }
      }
    });

    transaction();
    return { inserted, updated };
  }

  getDemandRecords(startDate?: string, endDate?: string, region?: string): DemandRecord[] {
    let sql = 'SELECT datetime, region, demand FROM demand_records WHERE 1=1';
    const params: any[] = [];

    if (startDate) {
      sql += ' AND datetime >= ?';
      params.push(startDate);
    }
    if (endDate) {
      sql += ' AND datetime <= ?';
      params.push(endDate);
    }
    if (region) {
      sql += ' AND region = ?';
      params.push(region);
    }

    sql += ' ORDER BY datetime, region';

    const rows = this.db.prepare(sql).all(...params) as any[];
    return rows.map(row => ({
      datetime: new Date(row.datetime),
      region: row.region,
      demand: row.demand
    }));
  }

  getDemandData(startDate?: string, endDate?: string): ParsedDemandData {
    const records = this.getDemandRecords(startDate, endDate);
    const regions = [...new Set(records.map(r => r.region))];

    let minDate: Date | null = null;
    let maxDate: Date | null = null;

    for (const record of records) {
      if (!minDate || record.datetime < minDate) minDate = record.datetime;
      if (!maxDate || record.datetime > maxDate) maxDate = record.datetime;
    }

    return {
      records,
      regions,
      startDate: minDate || new Date(),
      endDate: maxDate || new Date()
    };
  }

  // ============ WEATHER RECORDS ============

  importWeatherRecords(
    records: RawWeatherData[],
    location: string,
    isForecast: boolean = false,
    source?: string
  ): { inserted: number } {
    const region = REGION_MAPPING[location.toLowerCase()] || location;

    const insertStmt = this.db.prepare(`
      INSERT INTO weather_records (datetime, location, region, temp, dew, precip, windgust, windspeed, cloudcover, solarradiation, solarenergy, uvindex, is_forecast, source)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(datetime, region) DO UPDATE SET
        temp = excluded.temp,
        dew = excluded.dew,
        precip = excluded.precip,
        windgust = excluded.windgust,
        windspeed = excluded.windspeed,
        cloudcover = excluded.cloudcover,
        solarradiation = excluded.solarradiation,
        solarenergy = excluded.solarenergy,
        uvindex = excluded.uvindex,
        is_forecast = excluded.is_forecast,
        source = excluded.source,
        imported_at = CURRENT_TIMESTAMP
    `);

    let inserted = 0;

    const transaction = this.db.transaction(() => {
      for (const record of records) {
        insertStmt.run(
          record.datetime,
          location,
          region,
          record.temp,
          record.dew,
          record.precip,
          record.windgust,
          record.windspeed,
          record.cloudcover,
          record.solarradiation,
          record.solarenergy,
          record.uvindex,
          isForecast ? 1 : 0,
          source || null
        );
        inserted++;
      }
    });

    transaction();
    return { inserted };
  }

  getWeatherRecords(startDate?: string, endDate?: string, region?: string): RawWeatherData[] {
    let sql = 'SELECT * FROM weather_records WHERE 1=1';
    const params: any[] = [];

    if (startDate) {
      sql += ' AND datetime >= ?';
      params.push(startDate);
    }
    if (endDate) {
      sql += ' AND datetime <= ?';
      params.push(endDate);
    }
    if (region) {
      sql += ' AND region = ?';
      params.push(region);
    }

    sql += ' ORDER BY datetime, region';

    const rows = this.db.prepare(sql).all(...params) as any[];
    return rows.map(row => ({
      name: row.location,
      latitude: 0,
      longitude: 0,
      datetime: row.datetime,
      temp: row.temp,
      dew: row.dew,
      precip: row.precip,
      windgust: row.windgust,
      windspeed: row.windspeed,
      cloudcover: row.cloudcover,
      solarradiation: row.solarradiation,
      solarenergy: row.solarenergy,
      uvindex: row.uvindex
    }));
  }

  // ============ MODELS ============

  saveModel(
    name: string,
    modelType: 'regression' | 'xgboost',
    trainingStart: string,
    trainingEnd: string,
    trainingSamples: number,
    r2Score: number,
    mape: number,
    rmse: number,
    mae: number,
    coefficients: number[],
    featureNames: string[],
    notes?: string
  ): number {
    // Deactivate previous models of same type
    this.db.prepare('UPDATE models SET is_active = 0 WHERE model_type = ?').run(modelType);

    const stmt = this.db.prepare(`
      INSERT INTO models (name, model_type, training_start, training_end, training_samples, r2_score, mape, rmse, mae, coefficients, feature_names, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      name,
      modelType,
      trainingStart,
      trainingEnd,
      trainingSamples,
      r2Score,
      mape,
      rmse,
      mae,
      JSON.stringify(coefficients),
      JSON.stringify(featureNames),
      notes || null
    );

    return result.lastInsertRowid as number;
  }

  getActiveModel(modelType: 'regression' | 'xgboost'): StoredModel | null {
    const row = this.db.prepare(`
      SELECT * FROM models WHERE model_type = ? AND is_active = 1 ORDER BY created_at DESC LIMIT 1
    `).get(modelType) as any;

    if (!row) return null;

    return {
      id: row.id,
      name: row.name,
      modelType: row.model_type,
      createdAt: row.created_at,
      trainingStart: row.training_start,
      trainingEnd: row.training_end,
      trainingSamples: row.training_samples,
      r2Score: row.r2_score,
      mape: row.mape,
      rmse: row.rmse,
      mae: row.mae,
      coefficients: JSON.parse(row.coefficients),
      featureNames: JSON.parse(row.feature_names),
      isActive: row.is_active === 1,
      notes: row.notes
    };
  }

  getAllModels(): StoredModel[] {
    const rows = this.db.prepare('SELECT * FROM models ORDER BY created_at DESC').all() as any[];
    return rows.map(row => ({
      id: row.id,
      name: row.name,
      modelType: row.model_type,
      createdAt: row.created_at,
      trainingStart: row.training_start,
      trainingEnd: row.training_end,
      trainingSamples: row.training_samples,
      r2Score: row.r2_score,
      mape: row.mape,
      rmse: row.rmse,
      mae: row.mae,
      coefficients: JSON.parse(row.coefficients),
      featureNames: JSON.parse(row.feature_names),
      isActive: row.is_active === 1,
      notes: row.notes
    }));
  }

  activateModel(modelId: number): void {
    const model = this.db.prepare('SELECT model_type FROM models WHERE id = ?').get(modelId) as any;
    if (!model) throw new Error(`Model ${modelId} not found`);

    this.db.prepare('UPDATE models SET is_active = 0 WHERE model_type = ?').run(model.model_type);
    this.db.prepare('UPDATE models SET is_active = 1 WHERE id = ?').run(modelId);
  }

  // ============ STATS ============

  getStats(): DatabaseStats {
    const demandCount = (this.db.prepare('SELECT COUNT(*) as count FROM demand_records').get() as any).count;
    const weatherCount = (this.db.prepare('SELECT COUNT(*) as count FROM weather_records').get() as any).count;
    const modelCount = (this.db.prepare('SELECT COUNT(*) as count FROM models').get() as any).count;

    const demandRange = this.db.prepare('SELECT MIN(datetime) as start, MAX(datetime) as end FROM demand_records').get() as any;
    const weatherRange = this.db.prepare('SELECT MIN(datetime) as start, MAX(datetime) as end FROM weather_records').get() as any;

    const regions = (this.db.prepare('SELECT DISTINCT region FROM demand_records ORDER BY region').all() as any[]).map(r => r.region);

    return {
      demandRecords: demandCount,
      weatherRecords: weatherCount,
      models: modelCount,
      demandDateRange: { start: demandRange.start, end: demandRange.end },
      weatherDateRange: { start: weatherRange.start, end: weatherRange.end },
      regions
    };
  }

  // ============ UTILITIES ============

  close(): void {
    this.db.close();
  }

  getPath(): string {
    return this.dbPath;
  }

  vacuum(): void {
    this.db.exec('VACUUM');
  }

  clearAll(): void {
    this.db.exec('DELETE FROM demand_records');
    this.db.exec('DELETE FROM weather_records');
    this.db.exec('DELETE FROM models');
    this.db.exec('DELETE FROM training_runs');
    this.vacuum();
  }
}

// Singleton instance
let dbInstance: DatabaseService | null = null;

export function getDatabase(dbPath?: string): DatabaseService {
  if (!dbInstance) {
    dbInstance = new DatabaseService(dbPath);
  }
  return dbInstance;
}

export function closeDatabase(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}
