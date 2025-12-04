#!/usr/bin/env node
import { Command } from 'commander';
import { DateTime } from 'luxon';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { parseDemandCsv, parseWeatherCsv } from './parsers/index.js';
import { mergeData } from './utils/index.js';
import { buildTrainingSamples, buildFeatureVector } from './features/index.js';
import { RegressionModel } from './models/regressionModel.js';
import { XGBoostModel } from './models/xgboostModel.js';
import { writeForecastCsv, writeModelReport, writeMetricsSummary } from './writers/index.js';
import { REGION_MAPPINGS } from './constants/index.js';
import { ForecastResult, TrainingSample, RawWeatherData } from './types/index.js';
import { createWeatherService, DEFAULT_LOCATIONS } from './services/index.js';

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

    // Parse demand data
    const demandData = parseDemandCsv(options.demand);
    console.log(`  📊 Demand: ${demandData.records.length} records, regions: ${demandData.regions.join(', ')}`);

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

    // Train Regression model
    if (options.model === 'regression' || options.model === 'both') {
      console.log('\n📈 Training Regression model...');
      const regression = new RegressionModel();
      regressionResult = regression.train(samples);
      console.log(`  R² = ${regressionResult.r2Score.toFixed(4)}, MAPE = ${regressionResult.mape.toFixed(2)}%`);

      writeModelReport(regressionResult, `${options.output}/regression_report.md`);
      console.log(`  📄 Report: ${options.output}/regression_report.md`);
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
  .option('--model <type>', 'Model type: regression or xgboost', 'regression')
  .option('--scale <percent>', 'Scale forecast by percentage (e.g., 5 for +5%, -3 for -3%)', '0')
  .option('--cache <dir>', 'Weather cache directory', './weather_cache')
  .action(async (options) => {
    try {
      const apiKey = getApiKey();
      const weatherService = createWeatherService(apiKey, options.cache);

      // Parse demand data
      console.log('\n🔄 Loading demand data...');
      const demandData = parseDemandCsv(options.demand);
      console.log(`  📊 Demand: ${demandData.records.length} records`);
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

      // Train model
      console.log(`\n🎯 Training ${options.model} model...`);
      let model: RegressionModel | XGBoostModel;

      if (options.model === 'regression') {
        model = new RegressionModel();
        const result = (model as RegressionModel).train(samples);
        console.log(`  R² = ${result.r2Score.toFixed(4)}, MAPE = ${result.mape.toFixed(2)}%`);
      } else {
        model = new XGBoostModel();
        const result = await (model as XGBoostModel).train(samples);
        console.log(`  R² = ${result.r2Score.toFixed(4)}, MAPE = ${result.mape.toFixed(2)}%`);
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

      for (const record of merged.records) {
        const key = `${record.datetime.getTime()}_${record.region}`;
        demandHistory.set(key, record.demand);

        // Track the last known demand for each region
        const lastKnown = lastKnownDemand.get(record.region);
        if (!lastKnown || record.datetime.getTime() > lastKnown.ts) {
          lastKnownDemand.set(record.region, { value: record.demand, ts: record.datetime.getTime() });
        }
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

          // Get last known values as fallback for missing lags
          const lastDemand = lastKnownDemand.get(region)?.value;
          const lastTemp = lastKnownTemp.get(region)?.value;

          // Calculate lag features - use last known values if specific lag is missing
          const demandLag1h = demandHistory.get(`${ts - 3600000}_${region}`) ?? lastDemand;
          const demandLag24h = demandHistory.get(`${ts - 86400000}_${region}`) ?? lastDemand;
          const demandLag168h = demandHistory.get(`${ts - 604800000}_${region}`) ?? lastDemand;
          const tempLag1h = tempHistory.get(`${ts - 3600000}_${region}`) ?? lastTemp;
          const tempLag24h = tempHistory.get(`${ts - 86400000}_${region}`) ?? lastTemp;

          // Calculate rolling averages
          let demandSum = 0, tempSum = 0, tempMax = -Infinity, count = 0;
          for (let h = 1; h <= 24; h++) {
            const lagTs = ts - h * 3600000;
            const d = demandHistory.get(`${lagTs}_${region}`);
            const t = tempHistory.get(`${lagTs}_${region}`);
            if (d !== undefined && t !== undefined) {
              demandSum += d;
              tempSum += t;
              tempMax = Math.max(tempMax, t);
              count++;
            }
          }

          // Use last known values for rolling averages if no historical data found
          const demandRolling24h = count > 0 ? demandSum / count : lastDemand;
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
          const basePrediction = model.predict(features);
          const prediction = basePrediction * scaleFactor;

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
    console.log(`  File: ${options.demand}`);
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
    const { parse } = require('csv-parse/sync');
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

program.parse();
