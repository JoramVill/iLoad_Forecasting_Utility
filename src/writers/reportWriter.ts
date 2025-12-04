import { writeFileSync } from 'fs';
import { ModelResult } from '../types/index.js';

export function writeModelReport(
  result: ModelResult,
  filePath: string
): void {
  const lines: string[] = [];

  lines.push('# Model Performance Report');
  lines.push('');
  lines.push(`## Model Type: ${result.modelType.toUpperCase()}`);
  lines.push('');
  lines.push('### Metrics');
  lines.push('');
  lines.push(`| Metric | Value |`);
  lines.push(`|--------|-------|`);
  lines.push(`| R² Score | ${result.r2Score.toFixed(4)} |`);
  lines.push(`| MAPE | ${result.mape.toFixed(2)}% |`);
  lines.push(`| RMSE | ${result.rmse.toFixed(2)} |`);
  lines.push(`| MAE | ${result.mae.toFixed(2)} |`);
  lines.push('');
  lines.push('### Dataset');
  lines.push('');
  lines.push(`- Training Samples: ${result.trainingSamples}`);
  lines.push(`- Testing Samples: ${result.testingSamples}`);
  lines.push('');

  if (result.featureImportance && result.featureImportance.size > 0) {
    lines.push('### Feature Importance');
    lines.push('');
    lines.push('| Feature | Importance |');
    lines.push('|---------|------------|');

    // Sort by importance descending
    const sorted = [...result.featureImportance.entries()]
      .sort((a, b) => b[1] - a[1]);

    for (const [feature, importance] of sorted) {
      const bar = '█'.repeat(Math.round(importance * 20));
      lines.push(`| ${feature} | ${importance.toFixed(3)} ${bar} |`);
    }
    lines.push('');
  }

  writeFileSync(filePath, lines.join('\n'));
}

export function writeMetricsSummary(
  regressionResult: ModelResult | null,
  xgboostResult: ModelResult | null,
  filePath: string
): void {
  const lines: string[] = [];

  lines.push('# Model Comparison Summary');
  lines.push('');
  lines.push('| Model | R² | MAPE | RMSE | MAE |');
  lines.push('|-------|-----|------|------|-----|');

  if (regressionResult) {
    lines.push(`| Regression | ${regressionResult.r2Score.toFixed(4)} | ${regressionResult.mape.toFixed(2)}% | ${regressionResult.rmse.toFixed(2)} | ${regressionResult.mae.toFixed(2)} |`);
  }

  if (xgboostResult) {
    lines.push(`| XGBoost | ${xgboostResult.r2Score.toFixed(4)} | ${xgboostResult.mape.toFixed(2)}% | ${xgboostResult.rmse.toFixed(2)} | ${xgboostResult.mae.toFixed(2)} |`);
  }

  lines.push('');

  // Recommendation
  if (regressionResult && xgboostResult) {
    const winner = xgboostResult.r2Score > regressionResult.r2Score ? 'XGBoost' : 'Regression';
    const improvement = Math.abs(xgboostResult.r2Score - regressionResult.r2Score) * 100;
    lines.push(`**Recommendation**: ${winner} performs better (${improvement.toFixed(2)}% R² difference)`);
  }

  writeFileSync(filePath, lines.join('\n'));
}
