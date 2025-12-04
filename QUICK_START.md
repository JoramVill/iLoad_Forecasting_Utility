# iLoad Forecasting Utility - Quick Start

## Build & Run

```bash
# 1. Build the project
npm run build

# 2. Run CLI commands
node dist/index.js <command> [options]
```

## Common Usage Examples

### Check data files
```bash
node dist/index.js info -d data/demand.csv -w data/manila.csv data/cebu.csv data/davao.csv
```

### Train models (recommended: train both for comparison)
```bash
node dist/index.js train \
  -d data/demand.csv \
  -w data/manila.csv data/cebu.csv data/davao.csv \
  -o output
```

This will generate:
- `output/regression_report.md`
- `output/xgboost_report.md`
- `output/comparison.md`

### Generate forecasts
```bash
node dist/index.js forecast \
  -d data/historical_demand.csv \
  -w data/hist_manila.csv data/hist_cebu.csv data/hist_davao.csv \
  -f data/forecast_manila.csv data/forecast_cebu.csv data/forecast_davao.csv \
  -o output/forecast.csv
```

## Getting Help

```bash
# General help
node dist/index.js --help

# Command-specific help
node dist/index.js train --help
node dist/index.js forecast --help
node dist/index.js info --help
```

## Key Features

- **Three Commands**: `info`, `train`, `forecast`
- **Two Models**: Linear Regression and XGBoost
- **Auto Feature Engineering**: 30+ features including temporal, weather, and lag features
- **Progress Output**: Clear visual feedback with emojis
- **Detailed Reports**: Markdown reports with metrics and visualizations

## Next Steps

See [CLI_USAGE.md](./CLI_USAGE.md) for detailed documentation.
