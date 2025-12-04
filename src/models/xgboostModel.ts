import { TrainingSample, ModelResult, FeatureVector } from '../types/index.js';
import { featureVectorToArray, getFeatureNames } from '../features/index.js';

// Note: @fractal-solutions/xgboost-js is a pure JS implementation
// Import may need adjustment based on actual package structure

export class XGBoostModel {
  private model: any = null;
  private featureNames: string[];
  private featureImportances: Map<string, number> = new Map();

  constructor() {
    this.featureNames = getFeatureNames();
  }

  async train(samples: TrainingSample[], options?: {
    maxDepth?: number;
    learningRate?: number;
    nEstimators?: number;
    validationSplit?: number;
  }): Promise<ModelResult> {
    const opts = {
      maxDepth: options?.maxDepth ?? 6,
      learningRate: options?.learningRate ?? 0.1,
      nEstimators: options?.nEstimators ?? 100,
      validationSplit: options?.validationSplit ?? 0.2
    };

    // Split data
    const splitIdx = Math.floor(samples.length * (1 - opts.validationSplit));
    const trainSamples = samples.slice(0, splitIdx);
    const testSamples = samples.slice(splitIdx);

    // Convert to arrays
    const X_train = trainSamples.map(s => featureVectorToArray(s.features));
    const y_train = trainSamples.map(s => s.demand);
    const X_test = testSamples.map(s => featureVectorToArray(s.features));
    const y_test = testSamples.map(s => s.demand);

    try {
      // Try to use XGBoost
      const XGBoost = await this.loadXGBoost();

      if (XGBoost) {
        this.model = new XGBoost({
          max_depth: opts.maxDepth,
          eta: opts.learningRate,
          objective: 'reg:squarederror',
          booster: 'gbtree'
        });

        // Train
        await this.model.fit(X_train, y_train, {
          num_boost_round: opts.nEstimators
        });

        // Calculate feature importance
        this.calculateFeatureImportance(X_train, y_train);
      } else {
        // Fallback: use a simple gradient boosting implementation
        console.warn('XGBoost not available, using fallback gradient boosting');
        this.model = this.createFallbackModel(X_train, y_train, opts);
      }
    } catch (error) {
      console.warn('XGBoost error, using fallback:', error);
      this.model = this.createFallbackModel(X_train, y_train, opts);
    }

    // Evaluate
    const predictions = X_test.map(x => this.predictSingle(x));

    return {
      modelType: 'xgboost',
      ...this.calculateMetrics(y_test, predictions),
      featureImportance: this.featureImportances,
      trainingSamples: trainSamples.length,
      testingSamples: testSamples.length
    };
  }

  private async loadXGBoost(): Promise<any> {
    try {
      const xgb = await import('@fractal-solutions/xgboost-js');
      return xgb.default || xgb.XGBoost || xgb;
    } catch {
      return null;
    }
  }

  private createFallbackModel(X: number[][], y: number[], opts: any): any {
    // Improved gradient boosting with deeper trees
    const basePrediction = y.reduce((a, b) => a + b, 0) / y.length;
    const predictions = new Array(y.length).fill(basePrediction);
    const residuals = y.map((actual, i) => actual - predictions[i]);

    interface TreeNode {
      featureIdx?: number;
      threshold?: number;
      left?: TreeNode;
      right?: TreeNode;
      value?: number;
    }

    const trees: TreeNode[] = [];
    const featureUsage = new Array(X[0].length).fill(0);

    // Build trees
    for (let round = 0; round < Math.min(opts.nEstimators, 100); round++) {
      const tree = this.buildTree(X, residuals, 0, opts.maxDepth, featureUsage);
      trees.push(tree);

      // Update predictions and residuals
      for (let i = 0; i < X.length; i++) {
        const treePred = this.predictTree(tree, X[i]) * opts.learningRate;
        predictions[i] += treePred;
        residuals[i] = y[i] - predictions[i];
      }
    }

    // Calculate feature importance
    const maxUsage = Math.max(...featureUsage, 1);
    this.featureNames.forEach((name, i) => {
      this.featureImportances.set(name, featureUsage[i] / maxUsage);
    });

    const self = this;
    return {
      trees,
      basePrediction,
      learningRate: opts.learningRate,
      predict: function(x: number[]): number {
        let pred = basePrediction;
        for (const tree of trees) {
          pred += self.predictTree(tree, x) * opts.learningRate;
        }
        return pred;
      }
    };
  }

  private buildTree(
    X: number[][],
    residuals: number[],
    depth: number,
    maxDepth: number,
    featureUsage: number[]
  ): any {
    // Base case: empty or too few samples
    if (X.length === 0 || residuals.length === 0) {
      return { value: 0 };
    }

    // Base case: max depth or too few samples
    if (depth >= maxDepth || X.length < 10) {
      const mean = residuals.reduce((a, b) => a + b, 0) / residuals.length;
      return { value: isNaN(mean) ? 0 : mean };
    }

    let bestGain = 0;
    let bestSplit = { featureIdx: 0, threshold: 0 };
    const currentMean = residuals.reduce((a, b) => a + b, 0) / residuals.length;
    const currentVariance = residuals.reduce((sum, r) => sum + Math.pow(r - currentMean, 2), 0);

    // Sample features for split (like random forest)
    const numFeatures = X[0].length;
    const featuresToTry = Math.min(numFeatures, Math.max(10, Math.floor(Math.sqrt(numFeatures))));
    const featureIndices: number[] = [];

    for (let i = 0; i < featuresToTry; i++) {
      featureIndices.push(Math.floor(Math.random() * numFeatures));
    }

    // Find best split
    for (const f of featureIndices) {
      const sortedIndices = X.map((_, i) => i).sort((a, b) => X[a][f] - X[b][f]);

      // Try a subset of split points
      const step = Math.max(1, Math.floor(sortedIndices.length / 20));
      for (let s = step; s < sortedIndices.length - step; s += step) {
        const leftIndices = sortedIndices.slice(0, s);
        const rightIndices = sortedIndices.slice(s);

        if (leftIndices.length < 5 || rightIndices.length < 5) continue;

        const leftResiduals = leftIndices.map(i => residuals[i]);
        const rightResiduals = rightIndices.map(i => residuals[i]);

        const leftMean = leftResiduals.reduce((a, b) => a + b, 0) / leftResiduals.length;
        const rightMean = rightResiduals.reduce((a, b) => a + b, 0) / rightResiduals.length;

        const leftVar = leftResiduals.reduce((sum, r) => sum + Math.pow(r - leftMean, 2), 0);
        const rightVar = rightResiduals.reduce((sum, r) => sum + Math.pow(r - rightMean, 2), 0);

        const gain = currentVariance - leftVar - rightVar;

        if (gain > bestGain) {
          bestGain = gain;
          const splitIdx = sortedIndices[s];
          const prevIdx = sortedIndices[s - 1];
          bestSplit = {
            featureIdx: f,
            threshold: (X[splitIdx][f] + X[prevIdx][f]) / 2
          };
        }
      }
    }

    // If no good split found, return leaf
    if (bestGain <= 0) {
      return { value: isNaN(currentMean) ? 0 : currentMean };
    }

    featureUsage[bestSplit.featureIdx]++;

    // Split data
    const leftX: number[][] = [];
    const leftResiduals: number[] = [];
    const rightX: number[][] = [];
    const rightResiduals: number[] = [];

    for (let i = 0; i < X.length; i++) {
      if (X[i][bestSplit.featureIdx] <= bestSplit.threshold) {
        leftX.push(X[i]);
        leftResiduals.push(residuals[i]);
      } else {
        rightX.push(X[i]);
        rightResiduals.push(residuals[i]);
      }
    }

    return {
      featureIdx: bestSplit.featureIdx,
      threshold: bestSplit.threshold,
      left: this.buildTree(leftX, leftResiduals, depth + 1, maxDepth, featureUsage),
      right: this.buildTree(rightX, rightResiduals, depth + 1, maxDepth, featureUsage)
    };
  }

  private predictTree(tree: any, x: number[]): number {
    if (tree === undefined || tree === null) {
      return 0;
    }

    if (tree.value !== undefined) {
      return isNaN(tree.value) ? 0 : tree.value;
    }

    // Safety checks for malformed tree nodes
    if (tree.featureIdx === undefined || tree.threshold === undefined) {
      return 0;
    }
    if (!tree.left || !tree.right) {
      return 0;
    }

    const featureValue = x[tree.featureIdx];
    if (isNaN(featureValue)) {
      return 0;
    }

    if (featureValue <= tree.threshold) {
      return this.predictTree(tree.left, x);
    } else {
      return this.predictTree(tree.right, x);
    }
  }

  private predictSingle(x: number[]): number {
    if (!this.model) throw new Error('Model not trained');

    if (typeof this.model.predict === 'function') {
      // Fallback model expects single array, real XGBoost expects batch
      const result = this.model.predict(x);
      return Math.max(0, Array.isArray(result) ? result[0] : result);
    }

    throw new Error('Model does not have predict method');
  }

  predict(features: FeatureVector): number {
    const x = featureVectorToArray(features);
    return this.predictSingle(x);
  }

  predictBatch(featuresList: FeatureVector[]): number[] {
    return featuresList.map(f => this.predict(f));
  }

  private calculateFeatureImportance(X: number[][], y: number[]): void {
    // Calculate permutation importance
    const baseError = this.calculateError(X, y);

    for (let f = 0; f < this.featureNames.length; f++) {
      // Shuffle feature f
      const shuffledX = X.map(row => [...row]);
      const shuffledValues = X.map(row => row[f]);
      for (let i = shuffledValues.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffledValues[i], shuffledValues[j]] = [shuffledValues[j], shuffledValues[i]];
      }
      shuffledX.forEach((row, i) => row[f] = shuffledValues[i]);

      const shuffledError = this.calculateError(shuffledX, y);
      const importance = (shuffledError - baseError) / baseError;
      this.featureImportances.set(this.featureNames[f], Math.max(0, importance));
    }

    // Normalize
    const maxImp = Math.max(...this.featureImportances.values());
    if (maxImp > 0) {
      this.featureImportances.forEach((v, k) => {
        this.featureImportances.set(k, v / maxImp);
      });
    }
  }

  private calculateError(X: number[][], y: number[]): number {
    const predictions = X.map(x => this.predictSingle(x));
    return predictions.reduce((sum, p, i) => sum + Math.pow(p - y[i], 2), 0) / y.length;
  }

  private calculateMetrics(actuals: number[], predictions: number[]): {
    r2Score: number;
    mape: number;
    rmse: number;
    mae: number;
  } {
    const n = actuals.length;

    const mae = actuals.reduce((sum, a, i) => sum + Math.abs(a - predictions[i]), 0) / n;
    const mse = actuals.reduce((sum, a, i) => sum + Math.pow(a - predictions[i], 2), 0) / n;
    const rmse = Math.sqrt(mse);

    const mape = actuals.reduce((sum, a, i) => {
      if (a === 0) return sum;
      return sum + Math.abs((a - predictions[i]) / a) * 100;
    }, 0) / n;

    const mean = actuals.reduce((a, b) => a + b, 0) / n;
    const ssTotal = actuals.reduce((sum, a) => sum + Math.pow(a - mean, 2), 0);
    const ssResidual = actuals.reduce((sum, a, i) => sum + Math.pow(a - predictions[i], 2), 0);
    const r2Score = 1 - (ssResidual / ssTotal);

    return { r2Score, mape, rmse, mae };
  }

  getFeatureImportance(): Map<string, number> {
    return new Map(this.featureImportances);
  }
}
