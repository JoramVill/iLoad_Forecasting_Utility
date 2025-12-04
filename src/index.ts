#!/usr/bin/env node
import { Command } from 'commander';
import { DateTime } from 'luxon';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { parse } from 'csv-parse/sync';
import { parseDemandCsv, parseWeatherCsv } from './parsers/index.js';
import { mergeData } from './utils/index.js';
import { buildTrainingSamples, buildFeatureVector } from './features/index.js';
import { RegressionModel } from './models/regressionModel.js';
import { XGBoostModel } from './models/xgboostModel.js';
import { HybridModel } from './models/hybridModel.js';
import { writeForecastCsv, writeModelReport, writeMetricsSummary } from './writers/index.js';
import { REGION_MAPPINGS } from './constants/index.js';
import { ForecastResult, TrainingSample, RawWeatherData } from './types/index.js';
import { createWeatherService, DEFAULT_LOCATIONS } from './services/index.js';
import { getDatabase, closeDatabase, DatabaseStats, StoredModel } from './database/index.js';

// Default API key (can be overridden by env or config)
const DEFAULT_API_KEY = 'BJYBHG8K3YS8EFK46233M8L75';

function getApiKey(): string {
  // Check environment variable first
  if (process.env.VISUAL_CROSSING_API_KEY) {
    return process.env.VISUAL_CROSSING_API_KEY;
  }
  // Check config file
  const configPath = join(process.cwd(), 'config.json');
  if (existsSync(configPath)) {
    try {
      const config = JSON.parse(readFileSync(configPath, 'utf8'));
      if (config.visualCrossingApiKey) {
        return config.visualCrossingApiKey;
      }
    } catch {}
  }
  return DEFAULT_API_KEY;
}

const program = new Command();

program
  .name('iload')
  .description('Load Forecasting Utility with XGBoost and Multi-Variable Weather Data')
  .version('1.0.0');

// TRAIN command - Train models on historical data
program
  .command('train')
  .description('Train forecasting models on historical demand and weather data')
  .requiredOption('-d, --demand <file>', 'Historical demand CSV file')
  .requiredOption('-w, --weather <files...>', 'Weather CSV files (one per region)')
  .option('-o, --output <dir>', 'Output directory for reports', './output')
  .option('--model <type>', 'Model type: regression, xgboost, or both', 'both')
  .action(async (options) => {
    console.log('\n🔄 Loading data...');

    // Parse demand data (supports single file or folder)
    const demandData = parseDemandCsv(options.demand);
    if (demandData.filesProcessed && demandData.filesProcessed > 1) {
      console.log(`  📊 Demand: ${demandData.records.length} records from ${demandData.filesProcessed} files`);
    } else {
      console.log(`  📊 Demand: ${demandData.records.length} records`);
    }
    console.log(`     Regions: ${demandData.regions.join(', ')}`);

    // Parse weather data
    const weatherDatasets = options.weather.map((file: string) => {
      const data = parseWeatherCsv(file);
      console.log(`  🌤️  Weather: ${data.city} - ${data.records.length} records`);
      return data;
    });

    // Merge data
    console.log('\n🔗 Merging datasets...');
    const merged = mergeData(demandData, weatherDatasets);
    console.log(`  ✅ Matched: ${merged.matchedCount} records`);
    console.log(`  ⚠️  Unmatched demand: ${merged.unmatchedDemand}, weather: ${merged.unmatchedWeather}`);

    // Build training samples
    console.log('\n🔧 Engineering features...');
    const samples = buildTrainingSamples(merged.records, false);
    console.log(`  📐 Training samples: ${samples.length} (after lag filtering)`);

    if (samples.length === 0) {
      console.error('❌ No training samples available. Need more historical data for lag features.');
      process.exit(1);
    }

    // Ensure output directory exists
    const fs = await import('fs');
    if (!fs.existsSync(options.output)) {
      fs.mkdirSync(options.output, { recursive: true });
    }

    let regressionResult = null;
    let xgboostResult = null;

    // Get date range for model metadata
    const trainingStart = DateTime.fromJSDate(demandData.startDate).toISODate()!;
    const trainingEnd = DateTime.fromJSDate(demandData.endDate).toISODate()!;

    // Train Regression model
    if (options.model === 'regression' || options.model === 'both') {
      console.log('\n📈 Training Regression model...');
      const regression = new RegressionModel();
      regressionResult = regression.train(samples);
      console.log(`  R² = ${regressionResult.r2Score.toFixed(4)}, MAPE = ${regressionResult.mape.toFixed(2)}%`);

      writeModelReport(regressionResult, `${options.output}/regression_report.md`);
      console.log(`  📄 Report: ${options.output}/regression_report.md`);

      // Save model to database
      try {
        const db = getDatabase();
        const featureNames = regression.getCoefficients().map(c => c.feature);
        const coefficients = regression.getCoefficientsArray();
        const modelId = db.saveModel(
          `Regression ${DateTime.now().toFormat('yyyy-MM-dd HH:mm')}`,
          'regression',
          trainingStart,
          trainingEnd,
          samples.length,
          regressionResult.r2Score,
          regressionResult.mape,
          regressionResult.rmse,
          regressionResult.mae,
          coefficients,
          featureNames
        );
        console.log(`  💾 Saved to database (ID: ${modelId})`);
        closeDatabase();
      } catch (error: any) {
        console.warn(`  ⚠️  Could not save to database: ${error.message}`);
      }
    }

    // Train XGBoost model
    if (options.model === 'xgboost' || options.model === 'both') {
      console.log('\n🌲 Training XGBoost model...');
      const xgboost = new XGBoostModel();
      xgboostResult = await xgboost.train(samples, {
        maxDepth: 6,
        learningRate: 0.1,
        nEstimators: 100,
        validationSplit: 0.2
      });
      console.log(`  R² = ${xgboostResult.r2Score.toFixed(4)}, MAPE = ${xgboostResult.mape.toFixed(2)}%`);

      writeModelReport(xgboostResult, `${options.output}/xgboost_report.md`);
      console.log(`  📄 Report: ${options.output}/xgboost_report.md`);

      // Note: XGBoost model persistence would require serializing trees
      // For now, we save metrics only
      try {
        const db = getDatabase();
        const modelId = db.saveModel(
          `XGBoost ${DateTime.now().toFormat('yyyy-MM-dd HH:mm')}`,
          'xgboost',
          trainingStart,
          trainingEnd,
          samples.length,
          xgboostResult.r2Score,
          xgboostResult.mape,
          xgboostResult.rmse,
          xgboostResult.mae,
          [], // XGBoost trees are complex, stored separately if needed
          []
        );
        console.log(`  💾 Saved to database (ID: ${modelId})`);
        closeDatabase();
      } catch (error: any) {
        console.warn(`  ⚠️  Could not save to database: ${error.message}`);
      }
    }

    // Write comparison summary
    if (options.model === 'both') {
      writeMetricsSummary(regressionResult, xgboostResult, `${options.output}/comparison.md`);
      console.log(`\n📊 Comparison: ${options.output}/comparison.md`);
    }

    console.log('\n✅ Training complete!');
  });

// FORECAST command - Generate forecasts (auto-fetches weather from Visual Crossing)
program
  .command('forecast')
  .description('Generate demand forecast (auto-fetches weather data from Visual Crossing API)')
  .requiredOption('-d, --demand <file>', 'Historical demand CSV file')
  .requiredOption('-s, --start <date>', 'Forecast start date (YYYY-MM-DD)')
  .requiredOption('-e, --end <date>', 'Forecast end date (YYYY-MM-DD)')
  .requiredOption('-o, --output <file>', 'Output forecast CSV file')
  .option('--model <type>', 'Model type: regression, xgboost, or hybrid', 'regression')
  .option('--use-saved', 'Use saved model from database instead of training new one')
  .option('--scale <percent>', 'Scale forecast by percentage (e.g., 5 for +5%, -3 for -3%)', '0')
  .option('--growth <percent>', 'Daily demand growth rate for hybrid model (e.g., 0.01 for 0.01%/day)', '0')
  .option('--cache <dir>', 'Weather cache directory', './weather_cache')
  .action(async (options) => {
    try {
      const apiKey = getApiKey();
      const weatherService = createWeatherService(apiKey, options.cache);

      // Parse demand data (supports single file or folder)
      console.log('\n🔄 Loading demand data...');
      const demandData = parseDemandCsv(options.demand);
      if (demandData.filesProcessed && demandData.filesProcessed > 1) {
        console.log(`  📊 Demand: ${demandData.records.length} records from ${demandData.filesProcessed} files`);
      } else {
        console.log(`  📊 Demand: ${demandData.records.length} records`);
      }
      console.log(`  📅 Range: ${DateTime.fromJSDate(demandData.startDate).toISODate()} to ${DateTime.fromJSDate(demandData.endDate).toISODate()}`);

      // Determine training date range (use all historical demand data)
      const trainStart = DateTime.fromJSDate(demandData.startDate).toISODate()!;
      const trainEnd = DateTime.fromJSDate(demandData.endDate).toISODate()!;

      // Fetch weather data for training period
      console.log('\n🌤️  Fetching weather data for training...');
      const trainWeatherFiles = await weatherService.saveWeatherFiles(
        trainStart,
        trainEnd,
        join(options.cache, 'combined'),
        (msg) => console.log(`  ${msg}`)
      );

      if (trainWeatherFiles.length === 0) {
        console.error('❌ Failed to fetch weather data for training');
        process.exit(1);
      }

      // Parse weather data
      const weatherDatasets = trainWeatherFiles.map(file => parseWeatherCsv(file));

      // Merge and build training samples
      console.log('\n🔧 Engineering features...');
      const merged = mergeData(demandData, weatherDatasets);
      const samples = buildTrainingSamples(merged.records, false);
      console.log(`  📐 Training samples: ${samples.length}`);

      if (samples.length === 0) {
        console.error('❌ No training samples available');
        process.exit(1);
      }

      // Train or load model
      let model: RegressionModel | XGBoostModel | HybridModel = new RegressionModel(); // Initialize to avoid TS error
      let usedSavedModel = false;

      if (options.useSaved && options.model === 'regression') {
        // Try to load saved model from database
        console.log('\n💾 Loading saved model from database...');
        try {
          const db = getDatabase();
          const savedModel = db.getActiveModel('regression');
          closeDatabase();

          if (savedModel && savedModel.coefficients.length > 0) {
            model = new RegressionModel();
            (model as RegressionModel).loadFromSerialized({
              coefficients: savedModel.coefficients,
              featureNames: savedModel.featureNames,
              intercept: 0
            });
            usedSavedModel = true;
            console.log(`  ✅ Loaded model ID ${savedModel.id}`);
            console.log(`  📊 Training R² = ${savedModel.r2Score.toFixed(4)}, MAPE = ${savedModel.mape.toFixed(2)}%`);
            console.log(`  📅 Trained on: ${savedModel.trainingStart} to ${savedModel.trainingEnd}`);
          } else {
            console.log('  ⚠️  No saved regression model found, training new one...');
          }
        } catch (error: any) {
          console.warn(`  ⚠️  Could not load saved model: ${error.message}`);
        }
      }

      if (!usedSavedModel) {
        console.log(`\n🎯 Training ${options.model} model...`);
        if (options.model === 'regression') {
          model = new RegressionModel();
          const result = (model as RegressionModel).train(samples);
          console.log(`  R² = ${result.r2Score.toFixed(4)}, MAPE = ${result.mape.toFixed(2)}%`);
        } else if (options.model === 'hybrid') {
          const growthRate = parseFloat(options.growth) / 100; // Convert percent to decimal
          model = new HybridModel({ growthFactor: growthRate, recentDaysCount: 7 });
          const result = await (model as HybridModel).train(samples);
          console.log(`  R² = ${result.r2Score.toFixed(4)}, MAPE = ${result.mape.toFixed(2)}%`);
          if (growthRate > 0) {
            console.log(`  📈 Growth factor: ${(growthRate * 100).toFixed(4)}% per day`);
          }
        } else {
          model = new XGBoostModel();
          const result = await (model as XGBoostModel).train(samples);
          console.log(`  R² = ${result.r2Score.toFixed(4)}, MAPE = ${result.mape.toFixed(2)}%`);
        }
      }

      // Fetch weather data for forecast period
      console.log('\n🌤️  Fetching weather data for forecast period...');
      const forecastWeatherFiles = await weatherService.saveWeatherFiles(
        options.start,
        options.end,
        join(options.cache, 'combined'),
        (msg) => console.log(`  ${msg}`)
      );

      // Parse forecast weather
      const forecastWeatherData = forecastWeatherFiles.map(file => parseWeatherCsv(file));

      // Build demand history map for lag features - use ALL merged records, not just samples
      // This ensures we have the most recent demand values for lag calculations
      const demandHistory = new Map<string, number>();
      const lastKnownDemand = new Map<string, { value: number; ts: number }>();

      // Build hourly averages from RAW demand data (not merged) for better fallback
      // This ensures we have averages even when weather data is missing
      // Key: "region_hour_daytype" where daytype is 0=workday, 1=saturday, 2=sunday
      const hourlyAverages = new Map<string, { sum: number; count: number }>();

      // First, build hourly averages from ALL raw demand data
      for (const record of demandData.records) {
        const dt = DateTime.fromJSDate(record.datetime);
        const hour = dt.hour;
        const dow = dt.weekday; // 1=Mon, 7=Sun
        const dayType = dow === 7 ? 2 : dow === 6 ? 1 : 0; // 0=workday, 1=sat, 2=sun
        const avgKey = `${record.region}_${hour}_${dayType}`;

        if (!hourlyAverages.has(avgKey)) {
          hourlyAverages.set(avgKey, { sum: 0, count: 0 });
        }
        const avg = hourlyAverages.get(avgKey)!;
        avg.sum += record.demand;
        avg.count++;

        // Also track last known from raw demand data
        const lastKnown = lastKnownDemand.get(record.region);
        if (!lastKnown || record.datetime.getTime() > lastKnown.ts) {
          lastKnownDemand.set(record.region, { value: record.demand, ts: record.datetime.getTime() });
        }
      }

      // Build demand history from RAW demand data first (for better lag coverage)
      // This ensures we have actual demand values even when weather data is missing
      for (const record of demandData.records) {
        const key = `${record.datetime.getTime()}_${record.region}`;
        demandHistory.set(key, record.demand);
      }

      // Merged records will overwrite with same values (no harm, just redundant)
      for (const record of merged.records) {
        const key = `${record.datetime.getTime()}_${record.region}`;
        demandHistory.set(key, record.demand);
      }

      // Temperature history for lag features
      const tempHistory = new Map<string, number>();
      const lastKnownTemp = new Map<string, { value: number; ts: number }>();

      for (const record of merged.records) {
        const key = `${record.datetime.getTime()}_${record.region}`;
        tempHistory.set(key, record.weather.temp);

        const lastKnown = lastKnownTemp.get(record.region);
        if (!lastKnown || record.datetime.getTime() > lastKnown.ts) {
          lastKnownTemp.set(record.region, { value: record.weather.temp, ts: record.datetime.getTime() });
        }
      }

      // Helper function to get typical demand for a given hour and day type
      const getTypicalDemand = (region: string, datetime: Date): number | undefined => {
        const dt = DateTime.fromJSDate(datetime);
        const hour = dt.hour;
        const dow = dt.weekday;
        const dayType = dow === 7 ? 2 : dow === 6 ? 1 : 0;
        const avgKey = `${region}_${hour}_${dayType}`;
        const avg = hourlyAverages.get(avgKey);
        if (avg && avg.count > 0) {
          return avg.sum / avg.count;
        }
        return lastKnownDemand.get(region)?.value;
      };

      // Helper to get typical demand for a specific timestamp (used for lags)
      const getTypicalDemandForTime = (region: string, timestamp: number): number | undefined => {
        const dt = DateTime.fromMillis(timestamp);
        const hour = dt.hour;
        const dow = dt.weekday;
        const dayType = dow === 7 ? 2 : dow === 6 ? 1 : 0;
        const avgKey = `${region}_${hour}_${dayType}`;
        const avg = hourlyAverages.get(avgKey);
        if (avg && avg.count > 0) {
          return avg.sum / avg.count;
        }
        return lastKnownDemand.get(region)?.value;
      };

      // Build an index of historical records by region for efficient lookup
      // Structure: region -> array of { datetime, hour, dayType, demand, temp }
      const historicalIndex = new Map<string, Array<{
        datetime: Date;
        hour: number;
        dayType: number;
        demand: number;
        temp: number | undefined;
      }>>();

      for (const record of demandData.records) {
        const dt = DateTime.fromJSDate(record.datetime);
        const hour = dt.hour;
        const dow = dt.weekday;
        const dayType = dow === 7 ? 2 : dow === 6 ? 1 : 0;
        const temp = tempHistory.get(`${record.datetime.getTime()}_${record.region}`);

        if (!historicalIndex.has(record.region)) {
          historicalIndex.set(record.region, []);
        }
        historicalIndex.get(record.region)!.push({
          datetime: record.datetime,
          hour,
          dayType,
          demand: record.demand,
          temp
        });
      }

      // Sort each region's records by datetime descending (most recent first)
      for (const [, records] of historicalIndex) {
        records.sort((a, b) => b.datetime.getTime() - a.datetime.getTime());
      }

      // Find similar days: same dayType, same hour, similar temperature
      // Returns average demand from up to 7 most recent matching days
      const findSimilarDaysDemand = (
        region: string,
        targetHour: number,
        targetDayType: number,
        targetTemp: number,
        beforeTimestamp: number,
        tempTolerance: number = 5 // degrees C
      ): number | undefined => {
        const records = historicalIndex.get(region);
        if (!records) return undefined;

        const matches: number[] = [];
        const seenDates = new Set<string>(); // Track unique dates to get different days

        for (const record of records) {
          // Only consider records before the target timestamp
          if (record.datetime.getTime() >= beforeTimestamp) continue;

          // Match hour and dayType
          if (record.hour !== targetHour || record.dayType !== targetDayType) continue;

          // Check temperature similarity (if temp is available)
          if (record.temp !== undefined && Math.abs(record.temp - targetTemp) > tempTolerance) continue;

          // Track unique days
          const dateKey = DateTime.fromJSDate(record.datetime).toISODate();
          if (dateKey && !seenDates.has(dateKey)) {
            seenDates.add(dateKey);
            matches.push(record.demand);

            // Stop after finding 7 different days
            if (matches.length >= 7) break;
          }
        }

        if (matches.length === 0) return undefined;

        // Return average of matching days
        return matches.reduce((sum, d) => sum + d, 0) / matches.length;
      };

      console.log(`  📊 Historical data loaded: ${demandHistory.size} demand records, ${tempHistory.size} temp records`);

      // Show last known values for each region
      for (const [region, data] of lastKnownDemand) {
        console.log(`  📌 Last known ${region}: ${data.value.toFixed(0)} MW at ${DateTime.fromMillis(data.ts).toISO()}`);
      }

      // Generate forecasts
      const scaleFactor = 1 + (parseFloat(options.scale) / 100);
      console.log('\n🔮 Generating forecasts...');
      if (parseFloat(options.scale) !== 0) {
        console.log(`  📈 Scaling factor: ${scaleFactor.toFixed(4)} (${parseFloat(options.scale) > 0 ? '+' : ''}${options.scale}%)`);
      }
      const forecasts: ForecastResult[] = [];

      for (const weatherData of forecastWeatherData) {
        // Match location by checking if city name contains our location name
        const location = DEFAULT_LOCATIONS.find(
          loc => weatherData.city.toLowerCase().includes(loc.name.toLowerCase())
        );
        if (!location) {
          console.warn(`  Warning: No location match for "${weatherData.city}"`);
          continue;
        }

        const region = location.demandColumn;

        for (const weather of weatherData.records) {
          const datetime = DateTime.fromISO(weather.datetime).plus({ hours: 1 }).toJSDate();
          const ts = datetime.getTime();
          const dt = DateTime.fromJSDate(datetime);
          const hour = dt.hour;
          const dow = dt.weekday;
          const dayType = dow === 7 ? 2 : dow === 6 ? 1 : 0;

          const lastTemp = lastKnownTemp.get(region)?.value;
          const currentTemp = weather.temp;

          // Get "similar days" demand - average from last 7 days matching dayType, hour, and similar temp
          // This is our best estimate for what demand should be at this time
          const similarDaysDemand = findSimilarDaysDemand(region, hour, dayType, currentTemp, ts);

          // Calculate lag features - use similar days demand as fallback for missing lags
          const lag1hTs = ts - 3600000;
          const lag24hTs = ts - 86400000;
          const lag168hTs = ts - 604800000;

          // For lag values, try actual data first, then similar days for that time, then typical
          const getLagDemand = (lagTs: number): number | undefined => {
            // First try actual historical data
            const actual = demandHistory.get(`${lagTs}_${region}`);
            if (actual !== undefined) return actual;

            // Then try similar days for the lag time
            const lagDt = DateTime.fromMillis(lagTs);
            const lagHour = lagDt.hour;
            const lagDow = lagDt.weekday;
            const lagDayType = lagDow === 7 ? 2 : lagDow === 6 ? 1 : 0;
            const lagTemp = tempHistory.get(`${lagTs}_${region}`) ?? currentTemp;
            const similar = findSimilarDaysDemand(region, lagHour, lagDayType, lagTemp, lagTs);
            if (similar !== undefined) return similar;

            // Finally fall back to typical demand
            return getTypicalDemandForTime(region, lagTs);
          };

          const demandLag1h = getLagDemand(lag1hTs);
          const demandLag24h = getLagDemand(lag24hTs);
          const demandLag168h = getLagDemand(lag168hTs);
          const tempLag1h = tempHistory.get(`${lag1hTs}_${region}`) ?? lastTemp;
          const tempLag24h = tempHistory.get(`${lag24hTs}_${region}`) ?? lastTemp;

          // Calculate rolling averages using similar approach
          let demandSum = 0, tempSum = 0, tempMax = -Infinity, count = 0;
          for (let h = 1; h <= 24; h++) {
            const lagTs = ts - h * 3600000;
            const d = getLagDemand(lagTs);
            const t = tempHistory.get(`${lagTs}_${region}`) ?? lastTemp;
            if (d !== undefined && t !== undefined) {
              demandSum += d;
              tempSum += t;
              tempMax = Math.max(tempMax, t);
              count++;
            }
          }

          // Use calculated values
          const demandRolling24h = count > 0 ? demandSum / count : similarDaysDemand ?? lastKnownDemand.get(region)?.value;
          const tempRolling24h = count > 0 ? tempSum / count : lastTemp;
          const tempMax24h = count > 0 ? tempMax : lastTemp;

          const lagData = {
            demandLag1h,
            demandLag24h,
            demandLag168h,
            tempLag1h,
            tempLag24h,
            demandRolling24h,
            tempRolling24h,
            tempMax24h
          };

          const mockRecord = { datetime, region, demand: 0, weather };
          const features = buildFeatureVector(mockRecord, lagData);

          let prediction: number;

          if (options.model === 'hybrid') {
            // Hybrid model handles bounds internally - no blending needed
            // Calculate days ahead from forecast start for growth adjustment
            const forecastStart = DateTime.fromISO(options.start);
            const currentDate = DateTime.fromJSDate(datetime);
            const daysAhead = Math.max(0, currentDate.diff(forecastStart, 'days').days);

            const hybridPrediction = (model as HybridModel).predictForRegion(features, region, daysAhead);
            prediction = (hybridPrediction ?? similarDaysDemand ?? lastKnownDemand.get(region)?.value ?? 0) * scaleFactor;
          } else {
            // Regression/XGBoost model
            const basePrediction = (model as RegressionModel | XGBoostModel).predict(features);

            // Check if we have actual lag1h data or if it came from similar days
            const hasActualLag1h = demandHistory.has(`${lag1hTs}_${region}`);

            if (hasActualLag1h) {
              // Use model prediction directly when we have real lag data
              prediction = basePrediction * scaleFactor;
            } else {
              // When lag1h is estimated (from similar days), blend model prediction with similar days
              // This prevents the cold start death spiral by anchoring to historical patterns
              const blendRatio = 0.5; // 50% model, 50% similar days
              if (similarDaysDemand !== undefined) {
                prediction = (basePrediction * blendRatio + similarDaysDemand * (1 - blendRatio)) * scaleFactor;
              } else {
                prediction = basePrediction * scaleFactor;
              }
            }
          }

          forecasts.push({
            datetime,
            region,
            predictedDemand: prediction
          });

          // Update history for progressive forecasting
          demandHistory.set(`${ts}_${region}`, prediction);
          tempHistory.set(`${ts}_${region}`, weather.temp);
        }
      }

      // Ensure output directory exists
      const outputDir = dirname(options.output);
      if (outputDir && !existsSync(outputDir)) {
        mkdirSync(outputDir, { recursive: true });
      }

      // Write forecasts
      writeForecastCsv(forecasts, options.output);
      console.log(`\n✅ Forecast written to: ${options.output}`);
      console.log(`   📊 ${forecasts.length} predictions across ${[...new Set(forecasts.map(f => f.region))].length} regions`);
      console.log(`   📅 Period: ${options.start} to ${options.end}`);

    } catch (error: any) {
      console.error(`\n❌ Error: ${error.message}`);
      process.exit(1);
    }
  });

// INFO command - Show data summary
program
  .command('info')
  .description('Display information about data files')
  .requiredOption('-d, --demand <file>', 'Demand CSV file')
  .option('-w, --weather <files...>', 'Weather CSV files')
  .action((options) => {
    console.log('\n📊 Data Summary\n');

    const demandData = parseDemandCsv(options.demand);
    console.log('Demand Data:');
    console.log(`  Path: ${options.demand}`);
    if (demandData.filesProcessed && demandData.filesProcessed > 1) {
      console.log(`  Files: ${demandData.filesProcessed} CSV files`);
    }
    console.log(`  Records: ${demandData.records.length}`);
    console.log(`  Regions: ${demandData.regions.join(', ')}`);
    console.log(`  Date Range: ${demandData.startDate.toISOString()} to ${demandData.endDate.toISOString()}`);

    if (options.weather) {
      console.log('\nWeather Data:');
      for (const file of options.weather) {
        const weatherData = parseWeatherCsv(file);
        console.log(`  ${weatherData.city}:`);
        console.log(`    File: ${file}`);
        console.log(`    Records: ${weatherData.records.length}`);
        console.log(`    Date Range: ${weatherData.startDate.toISOString()} to ${weatherData.endDate.toISOString()}`);
      }
    }
  });

// EVALUATE command - Compare forecast vs actual demand for model feedback
program
  .command('evaluate')
  .description('Evaluate forecast accuracy by comparing against actual demand data')
  .requiredOption('-f, --forecast <file>', 'Forecast CSV file to evaluate')
  .requiredOption('-a, --actual <file>', 'Actual demand CSV file')
  .option('-o, --output <file>', 'Output evaluation report file')
  .action((options) => {
    console.log('\n📊 Evaluating Forecast Accuracy...\n');

    // Parse forecast file
    const forecastContent = readFileSync(options.forecast, 'utf-8');
    const forecastRows = parse(forecastContent, { columns: true, skip_empty_lines: true, trim: true });

    // Parse actual demand
    const actualData = parseDemandCsv(options.actual);

    // Build map of actual demand by datetime and region
    const actualMap = new Map<string, number>();
    for (const record of actualData.records) {
      const key = `${record.datetime.getTime()}_${record.region}`;
      actualMap.set(key, record.demand);
    }

    // Compare forecast vs actual
    interface RegionStats {
      count: number;
      sumError: number;
      sumAbsError: number;
      sumAbsPercentError: number;
      sumSquaredError: number;
      sumActual: number;
      sumForecast: number;
      errors: { datetime: Date; forecast: number; actual: number; error: number; percentError: number }[];
    }

    const regionStats = new Map<string, RegionStats>();
    let totalMatched = 0;
    let totalUnmatched = 0;

    for (const row of forecastRows) {
      // Parse forecast datetime - format: "M/D/YYYY HH:mm"
      const dt = DateTime.fromFormat(row['DateTimeEnding'], 'M/d/yyyy HH:mm');
      if (!dt.isValid) {
        console.warn(`Invalid forecast date: ${row['DateTimeEnding']}`);
        continue;
      }
      const datetime = dt.toJSDate();

      // Check each region column
      for (const col of Object.keys(row)) {
        if (col === 'DateTimeEnding') continue;

        const forecastValue = parseFloat(row[col]);
        if (isNaN(forecastValue)) continue;

        const key = `${datetime.getTime()}_${col}`;
        const actualValue = actualMap.get(key);

        if (actualValue === undefined) {
          totalUnmatched++;
          continue;
        }

        totalMatched++;
        const error = forecastValue - actualValue;
        const absError = Math.abs(error);
        const percentError = (absError / actualValue) * 100;

        if (!regionStats.has(col)) {
          regionStats.set(col, {
            count: 0,
            sumError: 0,
            sumAbsError: 0,
            sumAbsPercentError: 0,
            sumSquaredError: 0,
            sumActual: 0,
            sumForecast: 0,
            errors: []
          });
        }

        const stats = regionStats.get(col)!;
        stats.count++;
        stats.sumError += error;
        stats.sumAbsError += absError;
        stats.sumAbsPercentError += percentError;
        stats.sumSquaredError += error * error;
        stats.sumActual += actualValue;
        stats.sumForecast += forecastValue;
        stats.errors.push({ datetime, forecast: forecastValue, actual: actualValue, error, percentError });
      }
    }

    if (totalMatched === 0) {
      console.error('❌ No matching records found between forecast and actual data');
      console.log(`   Forecast file: ${options.forecast}`);
      console.log(`   Actual file: ${options.actual}`);
      process.exit(1);
    }

    // Calculate and display metrics
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('                    FORECAST EVALUATION REPORT                  ');
    console.log('═══════════════════════════════════════════════════════════════\n');

    console.log(`Matched Records: ${totalMatched}`);
    console.log(`Unmatched Forecast Records: ${totalUnmatched}\n`);

    let reportContent = '# Forecast Evaluation Report\n\n';
    reportContent += `Generated: ${DateTime.now().toISO()}\n\n`;
    reportContent += `## Summary\n\n`;
    reportContent += `- Forecast File: ${options.forecast}\n`;
    reportContent += `- Actual File: ${options.actual}\n`;
    reportContent += `- Matched Records: ${totalMatched}\n`;
    reportContent += `- Unmatched Forecast Records: ${totalUnmatched}\n\n`;

    console.log('┌─────────┬──────────┬──────────┬──────────┬──────────┬──────────┐');
    console.log('│ Region  │   MAE    │   MAPE   │   RMSE   │   Bias   │  Count   │');
    console.log('├─────────┼──────────┼──────────┼──────────┼──────────┼──────────┤');

    reportContent += '## Metrics by Region\n\n';
    reportContent += '| Region | MAE (MW) | MAPE (%) | RMSE (MW) | Bias (MW) | Count |\n';
    reportContent += '|--------|----------|----------|-----------|-----------|-------|\n';

    let overallMae = 0, overallMape = 0, overallRmse = 0, overallBias = 0, overallCount = 0;

    for (const [region, stats] of regionStats) {
      const mae = stats.sumAbsError / stats.count;
      const mape = stats.sumAbsPercentError / stats.count;
      const rmse = Math.sqrt(stats.sumSquaredError / stats.count);
      const bias = stats.sumError / stats.count;

      console.log(`│ ${region.padEnd(7)} │ ${mae.toFixed(1).padStart(8)} │ ${mape.toFixed(2).padStart(7)}% │ ${rmse.toFixed(1).padStart(8)} │ ${(bias >= 0 ? '+' : '') + bias.toFixed(1).padStart(7)} │ ${stats.count.toString().padStart(8)} │`);

      reportContent += `| ${region} | ${mae.toFixed(1)} | ${mape.toFixed(2)} | ${rmse.toFixed(1)} | ${bias >= 0 ? '+' : ''}${bias.toFixed(1)} | ${stats.count} |\n`;

      overallMae += stats.sumAbsError;
      overallMape += stats.sumAbsPercentError;
      overallRmse += stats.sumSquaredError;
      overallBias += stats.sumError;
      overallCount += stats.count;
    }

    console.log('├─────────┼──────────┼──────────┼──────────┼──────────┼──────────┤');

    const totalMae = overallMae / overallCount;
    const totalMape = overallMape / overallCount;
    const totalRmse = Math.sqrt(overallRmse / overallCount);
    const totalBias = overallBias / overallCount;

    console.log(`│ OVERALL │ ${totalMae.toFixed(1).padStart(8)} │ ${totalMape.toFixed(2).padStart(7)}% │ ${totalRmse.toFixed(1).padStart(8)} │ ${(totalBias >= 0 ? '+' : '') + totalBias.toFixed(1).padStart(7)} │ ${overallCount.toString().padStart(8)} │`);
    console.log('└─────────┴──────────┴──────────┴──────────┴──────────┴──────────┘');

    reportContent += `| **OVERALL** | **${totalMae.toFixed(1)}** | **${totalMape.toFixed(2)}** | **${totalRmse.toFixed(1)}** | **${totalBias >= 0 ? '+' : ''}${totalBias.toFixed(1)}** | **${overallCount}** |\n\n`;

    // Interpretation
    console.log('\n📈 Interpretation:');
    console.log(`  • MAE (Mean Absolute Error): Average deviation of ${totalMae.toFixed(1)} MW`);
    console.log(`  • MAPE (Mean Absolute Percentage Error): ${totalMape.toFixed(2)}% average error`);
    console.log(`  • RMSE (Root Mean Square Error): ${totalRmse.toFixed(1)} MW (penalizes large errors)`);
    console.log(`  • Bias: ${totalBias >= 0 ? 'Over-forecasting' : 'Under-forecasting'} by ${Math.abs(totalBias).toFixed(1)} MW on average`);

    reportContent += '## Interpretation\n\n';
    reportContent += `- **MAE** (Mean Absolute Error): Average deviation of ${totalMae.toFixed(1)} MW\n`;
    reportContent += `- **MAPE** (Mean Absolute Percentage Error): ${totalMape.toFixed(2)}% average error\n`;
    reportContent += `- **RMSE** (Root Mean Square Error): ${totalRmse.toFixed(1)} MW (penalizes large errors)\n`;
    reportContent += `- **Bias**: ${totalBias >= 0 ? 'Over-forecasting' : 'Under-forecasting'} by ${Math.abs(totalBias).toFixed(1)} MW on average\n\n`;

    // Recommendations based on bias
    console.log('\n💡 Recommendations:');
    reportContent += '## Recommendations\n\n';

    if (Math.abs(totalBias) > totalMae * 0.3) {
      const scaleAdjust = (-totalBias / (overallMae / overallCount + Math.abs(totalBias))) * 100;
      console.log(`  • Significant ${totalBias >= 0 ? 'over' : 'under'}-forecasting detected`);
      console.log(`  • Consider using --scale ${scaleAdjust.toFixed(1)} to compensate`);
      reportContent += `- Significant ${totalBias >= 0 ? 'over' : 'under'}-forecasting detected\n`;
      reportContent += `- Consider using \`--scale ${scaleAdjust.toFixed(1)}\` to compensate\n`;
    } else {
      console.log('  • Forecast bias is within acceptable range');
      reportContent += '- Forecast bias is within acceptable range\n';
    }

    if (totalMape > 10) {
      console.log('  • MAPE > 10% suggests room for model improvement');
      console.log('  • Consider adding more training data or feature engineering');
      reportContent += '- MAPE > 10% suggests room for model improvement\n';
      reportContent += '- Consider adding more training data or feature engineering\n';
    } else if (totalMape > 5) {
      console.log('  • MAPE between 5-10% is acceptable for load forecasting');
      reportContent += '- MAPE between 5-10% is acceptable for load forecasting\n';
    } else {
      console.log('  • MAPE < 5% indicates excellent forecast accuracy');
      reportContent += '- MAPE < 5% indicates excellent forecast accuracy\n';
    }

    // Find worst hours for each region
    console.log('\n⚠️  Largest Errors by Region:');
    reportContent += '\n## Largest Errors by Region\n\n';

    for (const [region, stats] of regionStats) {
      const sortedErrors = stats.errors.sort((a, b) => b.percentError - a.percentError);
      const worst = sortedErrors.slice(0, 3);

      console.log(`\n  ${region}:`);
      reportContent += `### ${region}\n\n`;
      reportContent += '| DateTime | Forecast | Actual | Error | % Error |\n';
      reportContent += '|----------|----------|--------|-------|---------|\n';

      for (const e of worst) {
        const dtStr = DateTime.fromJSDate(e.datetime).toFormat('MM/dd HH:mm');
        console.log(`    ${dtStr}: Forecast ${e.forecast.toFixed(0)} vs Actual ${e.actual.toFixed(0)} (${e.percentError.toFixed(1)}% error)`);
        reportContent += `| ${dtStr} | ${e.forecast.toFixed(0)} | ${e.actual.toFixed(0)} | ${e.error >= 0 ? '+' : ''}${e.error.toFixed(0)} | ${e.percentError.toFixed(1)}% |\n`;
      }
      reportContent += '\n';
    }

    // Peak and Trough Analysis
    console.log('\n📊 Peak & Trough Analysis by Region:');
    reportContent += '\n## Peak & Trough Analysis\n\n';

    console.log('┌─────────┬────────────────────────────────────────────────────────────────────────────┐');
    console.log('│ Region  │  Type   │ Actual (MW) │ Forecast (MW) │  Error  │ % Error │   DateTime   │');
    console.log('├─────────┼─────────┼─────────────┼───────────────┼─────────┼─────────┼──────────────┤');

    reportContent += '| Region | Type | Actual (MW) | Forecast (MW) | Error (MW) | % Error | DateTime |\n';
    reportContent += '|--------|------|-------------|---------------|------------|---------|----------|\n';

    // Track overall peak/trough stats
    let peakErrors: number[] = [];
    let troughErrors: number[] = [];

    for (const [region, stats] of regionStats) {
      // Group errors by date to find daily peaks and troughs
      const byDate = new Map<string, typeof stats.errors>();
      for (const e of stats.errors) {
        const dateKey = DateTime.fromJSDate(e.datetime).toISODate() || '';
        if (!byDate.has(dateKey)) {
          byDate.set(dateKey, []);
        }
        byDate.get(dateKey)!.push(e);
      }

      // Find peaks and troughs for each day
      const dailyPeaks: typeof stats.errors = [];
      const dailyTroughs: typeof stats.errors = [];

      for (const [, dayErrors] of byDate) {
        if (dayErrors.length < 12) continue; // Skip incomplete days

        // Find peak (max actual demand)
        const peak = dayErrors.reduce((max, e) => e.actual > max.actual ? e : max, dayErrors[0]);
        dailyPeaks.push(peak);

        // Find trough (min actual demand)
        const trough = dayErrors.reduce((min, e) => e.actual < min.actual ? e : min, dayErrors[0]);
        dailyTroughs.push(trough);
      }

      if (dailyPeaks.length === 0) continue;

      // Calculate peak statistics
      const avgActualPeak = dailyPeaks.reduce((sum, e) => sum + e.actual, 0) / dailyPeaks.length;
      const avgForecastPeak = dailyPeaks.reduce((sum, e) => sum + e.forecast, 0) / dailyPeaks.length;
      const peakError = avgForecastPeak - avgActualPeak;
      const peakMape = dailyPeaks.reduce((sum, e) => sum + Math.abs(e.forecast - e.actual) / e.actual * 100, 0) / dailyPeaks.length;

      // Calculate trough statistics
      const avgActualTrough = dailyTroughs.reduce((sum, e) => sum + e.actual, 0) / dailyTroughs.length;
      const avgForecastTrough = dailyTroughs.reduce((sum, e) => sum + e.forecast, 0) / dailyTroughs.length;
      const troughError = avgForecastTrough - avgActualTrough;
      const troughMape = dailyTroughs.reduce((sum, e) => sum + Math.abs(e.forecast - e.actual) / e.actual * 100, 0) / dailyTroughs.length;

      // Track for overall stats
      peakErrors.push(peakMape);
      troughErrors.push(troughMape);

      // Find worst peak and trough for display
      const worstPeak = dailyPeaks.reduce((worst, e) =>
        Math.abs(e.forecast - e.actual) > Math.abs(worst.forecast - worst.actual) ? e : worst, dailyPeaks[0]);
      const worstTrough = dailyTroughs.reduce((worst, e) =>
        Math.abs(e.forecast - e.actual) > Math.abs(worst.forecast - worst.actual) ? e : worst, dailyTroughs[0]);

      // Display peak row
      const peakDtStr = DateTime.fromJSDate(worstPeak.datetime).toFormat('MM/dd HH:mm');
      console.log(`│ ${region.padEnd(7)} │  Peak   │ ${avgActualPeak.toFixed(0).padStart(11)} │ ${avgForecastPeak.toFixed(0).padStart(13)} │ ${(peakError >= 0 ? '+' : '') + peakError.toFixed(0).padStart(6)} │ ${peakMape.toFixed(1).padStart(6)}% │ ${peakDtStr.padStart(12)} │`);
      reportContent += `| ${region} | Peak | ${avgActualPeak.toFixed(0)} | ${avgForecastPeak.toFixed(0)} | ${peakError >= 0 ? '+' : ''}${peakError.toFixed(0)} | ${peakMape.toFixed(1)}% | ${peakDtStr} |\n`;

      // Display trough row
      const troughDtStr = DateTime.fromJSDate(worstTrough.datetime).toFormat('MM/dd HH:mm');
      console.log(`│         │ Trough  │ ${avgActualTrough.toFixed(0).padStart(11)} │ ${avgForecastTrough.toFixed(0).padStart(13)} │ ${(troughError >= 0 ? '+' : '') + troughError.toFixed(0).padStart(6)} │ ${troughMape.toFixed(1).padStart(6)}% │ ${troughDtStr.padStart(12)} │`);
      reportContent += `| | Trough | ${avgActualTrough.toFixed(0)} | ${avgForecastTrough.toFixed(0)} | ${troughError >= 0 ? '+' : ''}${troughError.toFixed(0)} | ${troughMape.toFixed(1)}% | ${troughDtStr} |\n`;

      console.log('├─────────┼─────────┼─────────────┼───────────────┼─────────┼─────────┼──────────────┤');
    }

    console.log('└─────────┴─────────┴─────────────┴───────────────┴─────────┴─────────┴──────────────┘');

    // Overall peak/trough summary
    if (peakErrors.length > 0) {
      const avgPeakMape = peakErrors.reduce((sum, e) => sum + e, 0) / peakErrors.length;
      const avgTroughMape = troughErrors.reduce((sum, e) => sum + e, 0) / troughErrors.length;

      console.log('\n📈 Peak/Trough Summary:');
      console.log(`  • Average Peak MAPE: ${avgPeakMape.toFixed(2)}%`);
      console.log(`  • Average Trough MAPE: ${avgTroughMape.toFixed(2)}%`);

      reportContent += '\n### Peak/Trough Summary\n\n';
      reportContent += `- Average Peak MAPE: ${avgPeakMape.toFixed(2)}%\n`;
      reportContent += `- Average Trough MAPE: ${avgTroughMape.toFixed(2)}%\n`;

      if (avgPeakMape > avgTroughMape * 1.5) {
        console.log('  • ⚠️  Peaks are harder to forecast than troughs');
        reportContent += '- Peaks are harder to forecast than troughs\n';
      } else if (avgTroughMape > avgPeakMape * 1.5) {
        console.log('  • ⚠️  Troughs are harder to forecast than peaks');
        reportContent += '- Troughs are harder to forecast than peaks\n';
      } else {
        console.log('  • Peak and trough accuracy are similar');
        reportContent += '- Peak and trough accuracy are similar\n';
      }
    }

    // Write report if output specified
    if (options.output) {
      const outputDir = dirname(options.output);
      if (outputDir && !existsSync(outputDir)) {
        mkdirSync(outputDir, { recursive: true });
      }
      writeFileSync(options.output, reportContent);
      console.log(`\n📄 Report written to: ${options.output}`);
    }

    console.log('\n✅ Evaluation complete!');
  });

// DATABASE commands
const dbCommand = program
  .command('db')
  .description('Database management commands');

// DB STATUS - Show database statistics
dbCommand
  .command('status')
  .description('Show database statistics')
  .action(() => {
    console.log('\n📊 Database Status\n');

    try {
      const db = getDatabase();
      const stats = db.getStats();

      console.log('═══════════════════════════════════════════════════════════════');
      console.log('                    DATABASE STATISTICS                         ');
      console.log('═══════════════════════════════════════════════════════════════\n');

      console.log(`Database Path: ${db.getPath()}\n`);

      console.log('📈 Record Counts:');
      console.log(`  • Demand Records: ${stats.demandRecords.toLocaleString()}`);
      console.log(`  • Weather Records: ${stats.weatherRecords.toLocaleString()}`);
      console.log(`  • Saved Models: ${stats.models}`);

      if (stats.demandDateRange.start && stats.demandDateRange.end) {
        console.log('\n📅 Demand Date Range:');
        console.log(`  • Start: ${stats.demandDateRange.start}`);
        console.log(`  • End: ${stats.demandDateRange.end}`);
      }

      if (stats.weatherDateRange.start && stats.weatherDateRange.end) {
        console.log('\n🌤️  Weather Date Range:');
        console.log(`  • Start: ${stats.weatherDateRange.start}`);
        console.log(`  • End: ${stats.weatherDateRange.end}`);
      }

      if (stats.regions.length > 0) {
        console.log('\n🗺️  Regions:');
        console.log(`  ${stats.regions.join(', ')}`);
      }

      closeDatabase();
      console.log('\n✅ Database status complete!');
    } catch (error: any) {
      console.error(`\n❌ Error: ${error.message}`);
      process.exit(1);
    }
  });

// DB IMPORT - Import data into database
dbCommand
  .command('import')
  .description('Import demand or weather data into the database')
  .requiredOption('-t, --type <type>', 'Data type: demand or weather')
  .requiredOption('-f, --file <path>', 'File or folder path to import')
  .option('-l, --location <name>', 'Location name for weather data (e.g., Manila, Cebu, Davao)')
  .option('--forecast', 'Mark weather data as forecast (not historical)')
  .action((options) => {
    console.log('\n🔄 Importing data...\n');

    try {
      const db = getDatabase();

      if (options.type === 'demand') {
        const demandData = parseDemandCsv(options.file);
        const result = db.importDemandRecords(demandData.records, options.file);

        console.log(`✅ Imported ${result.inserted} demand records`);
        if (demandData.filesProcessed && demandData.filesProcessed > 1) {
          console.log(`   From ${demandData.filesProcessed} files`);
        }
        console.log(`   Regions: ${demandData.regions.join(', ')}`);
        console.log(`   Date Range: ${DateTime.fromJSDate(demandData.startDate).toISODate()} to ${DateTime.fromJSDate(demandData.endDate).toISODate()}`);

      } else if (options.type === 'weather') {
        if (!options.location) {
          console.error('❌ Location (-l, --location) is required for weather data import');
          process.exit(1);
        }

        const weatherData = parseWeatherCsv(options.file);
        const result = db.importWeatherRecords(
          weatherData.records,
          options.location,
          options.forecast || false,
          options.file
        );

        console.log(`✅ Imported ${result.inserted} weather records`);
        console.log(`   Location: ${options.location} (${weatherData.city})`);
        console.log(`   Type: ${options.forecast ? 'Forecast' : 'Historical'}`);
        console.log(`   Date Range: ${DateTime.fromJSDate(weatherData.startDate).toISODate()} to ${DateTime.fromJSDate(weatherData.endDate).toISODate()}`);

      } else {
        console.error('❌ Invalid type. Use "demand" or "weather"');
        process.exit(1);
      }

      closeDatabase();
      console.log('\n✅ Import complete!');
    } catch (error: any) {
      console.error(`\n❌ Error: ${error.message}`);
      process.exit(1);
    }
  });

// DB MODELS - List and manage saved models
dbCommand
  .command('models')
  .description('List and manage saved models')
  .option('-a, --activate <id>', 'Activate a specific model by ID')
  .action((options) => {
    try {
      const db = getDatabase();

      if (options.activate) {
        const modelId = parseInt(options.activate);
        db.activateModel(modelId);
        console.log(`\n✅ Model ${modelId} activated`);
        closeDatabase();
        return;
      }

      const models = db.getAllModels();

      if (models.length === 0) {
        console.log('\n📊 No saved models found');
        console.log('   Train a model and it will be automatically saved to the database.');
        closeDatabase();
        return;
      }

      console.log('\n📊 Saved Models\n');
      console.log('═══════════════════════════════════════════════════════════════════════════════');
      console.log('  ID │ Active │   Type     │    R²    │   MAPE   │  Samples  │    Created');
      console.log('═══════════════════════════════════════════════════════════════════════════════');

      for (const model of models) {
        const active = model.isActive ? '  ✓  ' : '     ';
        const type = model.modelType.padEnd(10);
        const r2 = model.r2Score.toFixed(4).padStart(8);
        const mape = (model.mape.toFixed(2) + '%').padStart(8);
        const samples = model.trainingSamples.toString().padStart(9);
        // SQLite CURRENT_TIMESTAMP returns "YYYY-MM-DD HH:mm:ss" format
        const dt = DateTime.fromSQL(model.createdAt);
        const created = dt.isValid ? dt.toFormat('yyyy-MM-dd HH:mm') : model.createdAt?.substring(0, 16) || 'N/A';

        console.log(` ${model.id.toString().padStart(3)} │ ${active} │ ${type} │ ${r2} │ ${mape} │ ${samples} │ ${created}`);
      }

      console.log('───────────────────────────────────────────────────────────────────────────────');
      console.log('\n💡 Use --activate <id> to set a model as active for forecasting');

      closeDatabase();
    } catch (error: any) {
      console.error(`\n❌ Error: ${error.message}`);
      process.exit(1);
    }
  });

// DB CLEAR - Clear database data
dbCommand
  .command('clear')
  .description('Clear all data from the database')
  .option('--confirm', 'Confirm clearing all data')
  .action((options) => {
    if (!options.confirm) {
      console.log('\n⚠️  This will delete ALL data from the database.');
      console.log('   Use --confirm to proceed.');
      return;
    }

    try {
      const db = getDatabase();
      db.clearAll();
      closeDatabase();
      console.log('\n✅ Database cleared successfully');
    } catch (error: any) {
      console.error(`\n❌ Error: ${error.message}`);
      process.exit(1);
    }
  });

program.parse();
