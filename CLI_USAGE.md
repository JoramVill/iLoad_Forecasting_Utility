# iLoad CLI Usage Guide

## Installation

After building the project:

```bash
npm run build
```

You can run the CLI using:

```bash
node dist/index.js <command> [options]
```

Or install globally (optional):

```bash
npm link
iload <command> [options]
```

## Commands

### 1. Info Command

Display summary information about your data files.

```bash
node dist/index.js info -d data/demand.csv -w data/manila.csv data/cebu.csv data/davao.csv
```

**Example Output:**
```
📊 Data Summary

Demand Data:
  File: data/demand.csv
  Records: 8760
  Regions: CLUZ, CVIS, CMIN
  Date Range: 2025-01-01T00:00:00.000Z to 2025-12-31T23:00:00.000Z

Weather Data:
  Manila:
    File: data/manila.csv
    Records: 8760
    Date Range: 2025-01-01T00:00:00.000Z to 2025-12-31T23:00:00.000Z
  ...
```

### 2. Train Command

Train forecasting models on historical data.

**Basic Usage (both models):**
```bash
node dist/index.js train \
  -d data/demand.csv \
  -w data/manila.csv data/cebu.csv data/davao.csv \
  -o output
```

**Train only regression model:**
```bash
node dist/index.js train \
  -d data/demand.csv \
  -w data/manila.csv data/cebu.csv data/davao.csv \
  -o output \
  --model regression
```

**Train only XGBoost model:**
```bash
node dist/index.js train \
  -d data/demand.csv \
  -w data/manila.csv data/cebu.csv data/davao.csv \
  -o output \
  --model xgboost
```

**Example Output:**
```
🔄 Loading data...
  📊 Demand: 26280 records, regions: CLUZ, CVIS, CMIN
  🌤️  Weather: Manila - 8760 records
  🌤️  Weather: Cebu City - 8760 records
  🌤️  Weather: Davao City - 8760 records

🔗 Merging datasets...
  ✅ Matched: 26280 records
  ⚠️  Unmatched demand: 0, weather: 0

🔧 Engineering features...
  📐 Training samples: 21896 (after lag filtering)

📈 Training Regression model...
  R² = 0.8542, MAPE = 5.23%
  📄 Report: output/regression_report.md

🌲 Training XGBoost model...
  R² = 0.9124, MAPE = 3.87%
  📄 Report: output/xgboost_report.md

📊 Comparison: output/comparison.md

✅ Training complete!
```

**Output Files:**
- `output/regression_report.md` - Detailed regression model report
- `output/xgboost_report.md` - Detailed XGBoost model report
- `output/comparison.md` - Side-by-side comparison of models

### 3. Forecast Command

Generate load forecasts using weather forecast data.

```bash
node dist/index.js forecast \
  -d data/historical_demand.csv \
  -w data/historical_manila.csv data/historical_cebu.csv data/historical_davao.csv \
  -f data/forecast_manila.csv data/forecast_cebu.csv data/forecast_davao.csv \
  -o output/forecast.csv \
  --model xgboost
```

**Example Output:**
```
🔄 Loading historical data for training...
  📐 Training samples: 21896

🎯 Training xgboost model...

🌤️  Loading forecast weather...

🔮 Generating forecasts...

✅ Forecast written to: output/forecast.csv
   📊 72 predictions across 3 regions
```

**Output Format (forecast.csv):**
```csv
datetime,region,predictedDemand
2025-12-04T01:00:00.000Z,CLUZ,5234.56
2025-12-04T01:00:00.000Z,CVIS,2145.32
2025-12-04T01:00:00.000Z,CMIN,1876.45
...
```

## Options Reference

### Train Command

| Option | Description | Required | Default |
|--------|-------------|----------|---------|
| `-d, --demand <file>` | Historical demand CSV file | Yes | - |
| `-w, --weather <files...>` | Weather CSV files (space-separated) | Yes | - |
| `-o, --output <dir>` | Output directory for reports | No | `./output` |
| `--model <type>` | Model type: `regression`, `xgboost`, or `both` | No | `both` |

### Forecast Command

| Option | Description | Required | Default |
|--------|-------------|----------|---------|
| `-d, --demand <file>` | Historical demand CSV for training | Yes | - |
| `-w, --weather-hist <files...>` | Historical weather CSV files | Yes | - |
| `-f, --weather-forecast <files...>` | Forecast weather CSV files | Yes | - |
| `-o, --output <file>` | Output forecast CSV file path | Yes | - |
| `--model <type>` | Model type: `regression` or `xgboost` | No | `xgboost` |

### Info Command

| Option | Description | Required | Default |
|--------|-------------|----------|---------|
| `-d, --demand <file>` | Demand CSV file | Yes | - |
| `-w, --weather <files...>` | Weather CSV files (optional) | No | - |

## Data File Formats

### Demand CSV Format

```csv
DateTimeEnding,CLUZ,CVIS,CMIN
1/1/2025 1:00,5234.56,2145.32,1876.45
1/1/2025 2:00,4987.23,2034.12,1765.89
...
```

- `DateTimeEnding`: Hour-ending timestamp (M/D/YYYY H:mm format)
- Region columns: Demand values in MW for each region

### Weather CSV Format

```csv
name,latitude,longitude,datetime,temp,dew,precip,windgust,windspeed,cloudcover,solarradiation,solarenergy,uvindex
Manila,14.6,121.0,2025-01-01T00:00:00,26.5,24.2,0.0,25.3,12.5,45.2,0.0,0.0,0
Manila,14.6,121.0,2025-01-01T01:00:00,26.2,24.0,0.0,23.1,11.8,48.5,0.0,0.0,0
...
```

- `datetime`: Hour-starting timestamp (ISO 8601 format)
- Weather parameters: Temperature, dew point, precipitation, wind, cloud cover, solar radiation, UV index

## Tips

1. **Data Alignment**: Weather data uses hour-starting timestamps, demand data uses hour-ending. The tool automatically handles this conversion.

2. **Lag Features**: The tool requires sufficient historical data for lag features (1 hour, 24 hours, 168 hours). First ~168 hours of data will be filtered out during training.

3. **Model Selection**:
   - Use `--model both` for training to compare both models
   - XGBoost typically provides better accuracy but takes longer to train
   - Regression is faster and provides interpretable coefficients

4. **File Paths**: Can use relative or absolute paths for all file arguments.

5. **Multiple Weather Files**: Provide weather files in any order - the tool matches them to regions automatically based on city name.

## Error Handling

The CLI provides clear error messages:

- Missing required files
- Invalid data formats
- Insufficient data for lag features
- Model training failures

Example error:
```
❌ No training samples available. Need more historical data for lag features.
```
