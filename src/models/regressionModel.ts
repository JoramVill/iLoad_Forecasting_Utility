import MultivariateLinearRegression from 'ml-regression-multivariate-linear';
import { TrainingSample, ModelResult, FeatureVector } from '../types/index.js';
import { featureVectorToArray, getFeatureNames } from '../features/index.js';

export interface SerializedModel {
  coefficients: number[];
  featureNames: string[];
  intercept: number;
}

export class RegressionModel {
  private model: MultivariateLinearRegression | null = null;
  private featureNames: string[];
  private storedCoefficients: number[] | null = null;
  private storedIntercept: number = 0;

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
    // Use stored coefficients if loaded from database
    if (this.storedCoefficients) {
      return this.predictWithStoredCoefficients(features);
    }

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
    if (!this.model && !this.storedCoefficients) return [];

    if (this.storedCoefficients) {
      return this.featureNames.map((name, i) => ({
        feature: name,
        coefficient: i < this.storedCoefficients!.length ? this.storedCoefficients![i] : 0
      }));
    }

    const coefficients = this.model!.weights;
    return this.featureNames.map((name, i) => ({
      feature: name,
      coefficient: i < coefficients.length ? coefficients[i][0] : 0
    }));
  }

  // Serialize model for database storage
  serialize(): SerializedModel {
    if (!this.model && !this.storedCoefficients) {
      throw new Error('No model to serialize');
    }

    if (this.storedCoefficients) {
      return {
        coefficients: this.storedCoefficients,
        featureNames: this.featureNames,
        intercept: this.storedIntercept
      };
    }

    const weights = this.model!.weights;
    return {
      coefficients: weights.map(w => w[0]),
      featureNames: this.featureNames,
      intercept: 0 // ml-regression-multivariate-linear includes intercept in weights
    };
  }

  // Load model from serialized data
  loadFromSerialized(data: SerializedModel): void {
    this.storedCoefficients = data.coefficients;
    this.storedIntercept = data.intercept;
    this.featureNames = data.featureNames;
    this.model = null; // Clear any existing model
  }

  // Predict using stored coefficients (for loaded models)
  predictWithStoredCoefficients(features: FeatureVector): number {
    if (!this.storedCoefficients) {
      throw new Error('No stored coefficients available');
    }

    const x = featureVectorToArray(features);
    let result = this.storedIntercept;

    for (let i = 0; i < Math.min(x.length, this.storedCoefficients.length); i++) {
      result += x[i] * this.storedCoefficients[i];
    }

    return Math.max(0, result);
  }

  // Check if model is loaded (either trained or from storage)
  isLoaded(): boolean {
    return this.model !== null || this.storedCoefficients !== null;
  }

  // Get coefficient array for database storage
  getCoefficientsArray(): number[] {
    if (this.storedCoefficients) {
      return this.storedCoefficients;
    }
    if (this.model) {
      return this.model.weights.map(w => w[0]);
    }
    return [];
  }
}
