const { FEATURE_NAMES } = require("./dist/constants/index.js");
const { RegressionModel } = require("./dist/models/regressionModel.js");
const { parseDemandCsv } = require("./dist/parsers/demandParser.js");
const { parseWeatherCsv } = require("./dist/parsers/weatherParser.js");
const { mergeData, buildFeatureVector } = require("./dist/features/index.js");
const fs = require("fs");
const path = require("path");

async function main() {
  // Load and merge data
  const demandData = parseDemandCsv("./Data Samples/Training Historical Demand Data");

  // Load weather files
  const weatherFolder = "./Weather Cache/combined";
  const weatherFiles = fs.readdirSync(weatherFolder).filter(f => f.endsWith('.csv'));
  const weatherData = weatherFiles.map(f => parseWeatherCsv(path.join(weatherFolder, f)));

  // Merge
  const merged = mergeData(demandData.records, weatherData);

  // Build samples
  const { buildTrainingSamples } = require("./dist/features/index.js");
  const samples = buildTrainingSamples(merged.records);

  console.log("Training samples:", samples.length);

  // Train model
  const model = new RegressionModel();
  await model.train(samples);

  // Get coefficients
  const coefs = model.getCoefficients();

  console.log("\nTop 20 coefficients by absolute value:");
  console.log("=======================================");

  const sorted = [...coefs].sort((a, b) => Math.abs(b.coefficient) - Math.abs(a.coefficient));

  for (let i = 0; i < Math.min(20, sorted.length); i++) {
    const c = sorted[i];
    console.log(`${c.feature.padEnd(20)} : ${c.coefficient.toFixed(4)}`);
  }

  console.log("\nLag-related coefficients:");
  console.log("==========================");
  const lagCoefs = coefs.filter(c => c.feature.includes("Lag") || c.feature.includes("Rolling"));
  for (const c of lagCoefs) {
    console.log(`${c.feature.padEnd(20)} : ${c.coefficient.toFixed(4)}`);
  }
}

main().catch(console.error);
