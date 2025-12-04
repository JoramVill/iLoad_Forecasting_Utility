import MultivariateLinearRegression from 'ml-regression-multivariate-linear';
import { TrainingSample, ModelResult, FeatureVector } from '../types/index.js';
import { featureVectorToArray, getFeatureNames } from '../features/index.js';

export class RegressionModel {
  private model: MultivariateLinearRegression | null = null;
  private featureNames: string[];

  constructor() {
    this.featureNames = getFeatureNames();
  }

  train(samples: TrainingSample[]): ModelResult {
    // Convert samples to X (features) and y (target)
    const X: number[][] = samples.map(s => featureVectorToArray(s.features));
    const y: number[][] = samples.map(s => [s.demand]);

    // Train model
    this.model = new MultivariateLinearRegression(X, y);

    // Calculate metrics on training data
    const predictions = X.map(x => this.model!.predict(x)[0]);
    const actuals = samples.map(s => s.demand);

    return {
      modelType: 'regression',
      ...this.calculateMetrics(actuals, predictions),
      featureImportance: this.getFeatureImportance(),
      trainingSamples: samples.length,
      testingSamples: 0
    };
  }

  predict(features: FeatureVector): number {
    if (!this.model) throw new Error('Model not trained');
    const x = featureVectorToArray(features);
    return Math.max(0, this.model.predict(x)[0]); // Demand can't be negative
  }

  predictBatch(featuresList: FeatureVector[]): number[] {
    return featuresList.map(f => this.predict(f));
  }

  private calculateMetrics(actuals: number[], predictions: number[]): {
    r2Score: number;
    mape: number;
    rmse: number;
    mae: number;
  } {
    const n = actuals.length;

    // MAE
    const mae = actuals.reduce((sum, a, i) => sum + Math.abs(a - predictions[i]), 0) / n;

    // RMSE
    const mse = actuals.reduce((sum, a, i) => sum + Math.pow(a - predictions[i], 2), 0) / n;
    const rmse = Math.sqrt(mse);

    // MAPE (avoid division by zero)
    const mape = actuals.reduce((sum, a, i) => {
      if (a === 0) return sum;
      return sum + Math.abs((a - predictions[i]) / a) * 100;
    }, 0) / n;

    // R² score
    const mean = actuals.reduce((a, b) => a + b, 0) / n;
    const ssTotal = actuals.reduce((sum, a) => sum + Math.pow(a - mean, 2), 0);
    const ssResidual = actuals.reduce((sum, a, i) => sum + Math.pow(a - predictions[i], 2), 0);
    const r2Score = 1 - (ssResidual / ssTotal);

    return { r2Score, mape, rmse, mae };
  }

  private getFeatureImportance(): Map<string, number> {
    if (!this.model) return new Map();

    // For linear regression, use absolute coefficient values as importance
    const coefficients = this.model.weights;
    const importance = new Map<string, number>();

    // Normalize coefficients for comparison
    const maxCoef = Math.max(...coefficients.map(c => Math.abs(c[0])));

    this.featureNames.forEach((name, i) => {
      if (i < coefficients.length) {
        importance.set(name, Math.abs(coefficients[i][0]) / maxCoef);
      }
    });

    return importance;
  }

  getCoefficients(): { feature: string; coefficient: number }[] {
    if (!this.model) return [];
    const coefficients = this.model.weights;

    return this.featureNames.map((name, i) => ({
      feature: name,
      coefficient: i < coefficients.length ? coefficients[i][0] : 0
    }));
  }
}
