import { DateTime } from 'luxon';
import { FeatureVector, TrainingSample } from '../types/index.js';
import { FEATURE_NAMES } from '../constants/index.js';
import MultivariateLinearRegression from 'ml-regression-multivariate-linear';

/**
 * Statistical profile for a specific hour/daytype combination
 */
interface StatisticalBounds {
  min: number;
  median: number;
  max: number;
  count: number;
  recentDays: Array<{ date: string; demand: number; temp: number }>;
}

/**
 * Hybrid Interpolation Model
 *
 * Combines statistical profiles (Min/Median/Max) with ML-predicted position.
 * - Builds dynamic bounds from recent similar days (same daytype/hour)
 * - ML predicts where within the range demand should fall (0-1, can exceed)
 * - Optional growth factor to adjust bounds for trending demand
 */
export class HybridModel {
  private model: MultivariateLinearRegression | null = null;
  private profiles: Map<string, StatisticalBounds> = new Map();
  private growthFactor: number = 0; // Daily growth rate (e.g., 0.0001 = 0.01% per day)
  private recentDaysCount: number = 7;

  constructor(options?: { growthFactor?: number; recentDaysCount?: number }) {
    if (options?.growthFactor !== undefined) {
      this.growthFactor = options.growthFactor;
    }
    if (options?.recentDaysCount !== undefined) {
      this.recentDaysCount = options.recentDaysCount;
    }
  }

  /**
   * Build statistical profiles from training data
   */
  buildProfiles(samples: TrainingSample[]): void {
    // Group samples by region_hour_daytype
    const grouped = new Map<string, Array<{ date: Date; demand: number; temp: number }>>();

    for (const sample of samples) {
      const hour = sample.features.hour;
      const dayType = sample.features.isSunday ? 2 : sample.features.isSaturday ? 1 : 0;
      const region = this.inferRegion(sample);
      const key = `${region}_${hour}_${dayType}`;

      if (!grouped.has(key)) {
        grouped.set(key, []);
      }

      grouped.get(key)!.push({
        date: sample.datetime,
        demand: sample.demand,
        temp: sample.features.temp
      });
    }

    // Build profiles for each group
    for (const [key, records] of grouped) {
      // Sort by date descending (most recent first)
      records.sort((a, b) => b.date.getTime() - a.date.getTime());

      // Get recent days for dynamic bounds
      const recentDays = records.slice(0, this.recentDaysCount).map(r => ({
        date: DateTime.fromJSDate(r.date).toISODate() || '',
        demand: r.demand,
        temp: r.temp
      }));

      // Calculate statistics from ALL data for stable profiles
      // Use 5th and 95th percentiles instead of min/max to be robust to outliers
      const demands = records.map(r => r.demand);
      demands.sort((a, b) => a - b);

      const p5Index = Math.floor(demands.length * 0.05);
      const p95Index = Math.min(demands.length - 1, Math.floor(demands.length * 0.95));
      const medianIndex = Math.floor(demands.length / 2);

      const min = demands[p5Index];
      const max = demands[p95Index];
      const median = demands[medianIndex];

      this.profiles.set(key, {
        min,
        median,
        max,
        count: demands.length,
        recentDays
      });
    }
  }

  /**
   * Train the ML model to predict position within the statistical range
   */
  async train(samples: TrainingSample[]): Promise<{ r2Score: number; mape: number }> {
    // First build statistical profiles
    this.buildProfiles(samples);

    // Prepare training data for position prediction
    const X: number[][] = [];
    const Y: number[][] = [];

    for (const sample of samples) {
      const hour = sample.features.hour;
      const dayType = sample.features.isSunday ? 2 : sample.features.isSaturday ? 1 : 0;
      const region = this.inferRegion(sample);
      const key = `${region}_${hour}_${dayType}`;

      const profile = this.profiles.get(key);
      if (!profile || profile.max === profile.min) continue;

      // Calculate actual position (0 = min, 1 = max)
      const position = (sample.demand - profile.min) / (profile.max - profile.min);

      // Build feature vector (excluding demand-related lags to avoid circular dependency)
      const featureValues = this.extractPositionFeatures(sample.features, profile);
      X.push(featureValues);
      Y.push([position]);
    }

    if (X.length === 0) {
      throw new Error('No valid training samples after filtering');
    }

    // Train regression model to predict position
    this.model = new MultivariateLinearRegression(X, Y);

    // Calculate metrics
    let totalError = 0;
    let totalPercentError = 0;
    let ssRes = 0;
    let ssTot = 0;
    let validSamples = 0;
    const meanDemand = samples.reduce((sum, s) => sum + s.demand, 0) / samples.length;

    for (const sample of samples) {
      const region = sample.region;
      const predicted = this.predictForRegion(sample.features, region);
      if (predicted === undefined) continue;

      validSamples++;
      const error = Math.abs(predicted - sample.demand);
      totalError += error;
      totalPercentError += error / Math.max(sample.demand, 1) * 100;
      ssRes += Math.pow(predicted - sample.demand, 2);
      ssTot += Math.pow(sample.demand - meanDemand, 2);
    }

    const r2Score = 1 - (ssRes / ssTot);
    const mape = validSamples > 0 ? totalPercentError / validSamples : 0;

    return { r2Score, mape };
  }

  /**
   * Extract features for position prediction
   * Uses relative/normalized features rather than absolute demand values
   */
  private extractPositionFeatures(features: FeatureVector, profile: StatisticalBounds): number[] {
    const featureValues: number[] = [];

    // Temporal features (normalized)
    featureValues.push(features.hourSin);
    featureValues.push(features.hourCos);
    featureValues.push(features.isWeekend);
    featureValues.push(features.isHoliday);
    featureValues.push(features.isWorkday);
    featureValues.push(features.isSaturday);
    featureValues.push(features.isSunday);
    featureValues.push(features.dayOfMonth / 31); // Normalize
    featureValues.push(features.month / 12); // Normalize

    // Temperature features (relative to profile)
    const avgRecentTemp = profile.recentDays.length > 0
      ? profile.recentDays.reduce((sum, d) => sum + d.temp, 0) / profile.recentDays.length
      : features.temp;

    featureValues.push(features.temp); // Absolute temp
    featureValues.push(features.temp - avgRecentTemp); // Temp deviation from recent
    featureValues.push(features.tempSquared / 1000); // Normalized temp squared

    // Lag features as RATIOS to profile median (not absolute values)
    // This prevents the death spiral by normalizing
    if (profile.median > 0) {
      featureValues.push((features.demandLag1h ?? profile.median) / profile.median);
      featureValues.push((features.demandLag24h ?? profile.median) / profile.median);
      featureValues.push((features.demandLag168h ?? profile.median) / profile.median);
      featureValues.push((features.demandRolling24h ?? profile.median) / profile.median);
    } else {
      featureValues.push(1, 1, 1, 1);
    }

    // Temperature lag ratios
    const avgTemp = avgRecentTemp || 25;
    featureValues.push((features.tempLag1h ?? avgTemp) / avgTemp);
    featureValues.push((features.tempLag24h ?? avgTemp) / avgTemp);
    featureValues.push((features.tempRolling24h ?? avgTemp) / avgTemp);

    return featureValues;
  }

  /**
   * Predict demand using hybrid interpolation
   */
  predict(features: FeatureVector, region?: string): number | undefined {
    if (!this.model) return undefined;

    const hour = features.hour;
    const dayType = features.isSunday ? 2 : features.isSaturday ? 1 : 0;
    const inferredRegion = region || 'UNKNOWN';
    const key = `${inferredRegion}_${hour}_${dayType}`;

    const profile = this.profiles.get(key);
    if (!profile) {
      // Fallback: try to find any profile for this hour/dayType
      for (const [k, p] of this.profiles) {
        if (k.endsWith(`_${hour}_${dayType}`)) {
          return this.interpolate(features, p);
        }
      }
      return undefined;
    }

    return this.interpolate(features, profile);
  }

  /**
   * Predict with explicit region
   */
  predictForRegion(features: FeatureVector, region: string, daysAhead: number = 0): number | undefined {
    if (!this.model) return undefined;

    const hour = features.hour;
    const dayType = features.isSunday ? 2 : features.isSaturday ? 1 : 0;
    const key = `${region}_${hour}_${dayType}`;

    let profile = this.profiles.get(key);
    if (!profile) return undefined;

    // Apply growth factor if set
    if (this.growthFactor > 0 && daysAhead > 0) {
      const growthMultiplier = 1 + (this.growthFactor * daysAhead);
      profile = {
        ...profile,
        min: profile.min * growthMultiplier,
        median: profile.median * growthMultiplier,
        max: profile.max * growthMultiplier
      };
    }

    return this.interpolate(features, profile);
  }

  /**
   * Interpolate using ML-predicted position
   */
  private interpolate(features: FeatureVector, profile: StatisticalBounds): number {
    const featureValues = this.extractPositionFeatures(features, profile);
    const positionPrediction = this.model!.predict([featureValues]);
    // positionPrediction is a 2D array: [[position]] - extract the scalar value
    let position = positionPrediction[0][0];

    // Clamp position to [0, 1] range - no extrapolation beyond historical bounds
    position = Math.max(0, Math.min(1, position));

    // Linear interpolation: demand = min + position * (max - min)
    const prediction = profile.min + position * (profile.max - profile.min);

    // Ensure non-negative predictions
    return Math.max(0, prediction);
  }

  /**
   * Get dynamic bounds for a specific hour/daytype from recent similar days
   */
  getDynamicBounds(
    region: string,
    hour: number,
    dayType: number,
    currentTemp: number,
    tempTolerance: number = 5
  ): { min: number; median: number; max: number } | undefined {
    const key = `${region}_${hour}_${dayType}`;
    const profile = this.profiles.get(key);
    if (!profile) return undefined;

    // Filter recent days by temperature similarity
    const tempFilteredDays = profile.recentDays.filter(
      d => Math.abs(d.temp - currentTemp) <= tempTolerance
    );

    if (tempFilteredDays.length >= 3) {
      // Use temperature-filtered bounds
      const demands = tempFilteredDays.map(d => d.demand).sort((a, b) => a - b);
      return {
        min: demands[0],
        median: demands[Math.floor(demands.length / 2)],
        max: demands[demands.length - 1]
      };
    }

    // Fall back to all recent days
    if (profile.recentDays.length >= 3) {
      const demands = profile.recentDays.map(d => d.demand).sort((a, b) => a - b);
      return {
        min: demands[0],
        median: demands[Math.floor(demands.length / 2)],
        max: demands[demands.length - 1]
      };
    }

    // Fall back to full profile
    return {
      min: profile.min,
      median: profile.median,
      max: profile.max
    };
  }

  /**
   * Infer region from features (placeholder - actual implementation needs region in features)
   */
  private inferRegion(sample: TrainingSample): string {
    // For now, we'll need to pass region explicitly or add it to features
    // This is a limitation we'll address in integration
    return (sample as any).region || 'UNKNOWN';
  }

  /**
   * Get profile statistics for debugging
   */
  getProfileStats(): Map<string, { min: number; median: number; max: number; count: number }> {
    const stats = new Map<string, { min: number; median: number; max: number; count: number }>();
    for (const [key, profile] of this.profiles) {
      stats.set(key, {
        min: profile.min,
        median: profile.median,
        max: profile.max,
        count: profile.count
      });
    }
    return stats;
  }

  isReady(): boolean {
    return this.model !== null && this.profiles.size > 0;
  }

  setGrowthFactor(factor: number): void {
    this.growthFactor = factor;
  }
}
