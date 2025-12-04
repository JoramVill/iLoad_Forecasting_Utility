import { SolarIrradianceModel } from './SolarIrradianceModel.js';
import { CFacTrainingSample, CFacWeatherFeatures } from '../../types/capacityFactor.js';
import MultivariateLinearRegression from 'ml-regression-multivariate-linear';

/**
 * Hybrid solar capacity factor model
 * Combines physics-based irradiance model with ML residual learning
 *
 * Architecture:
 * 1. Physics base: SolarIrradianceModel provides baseline from irradiance + temperature
 * 2. ML residual: Linear regression learns corrections from cloud cover, temporal patterns
 * 3. Final prediction: physics_CFac + ML_residual, clamped to [0, 1]
 *
 * This approach captures both:
 * - Physics: Fundamental irradiance -> power relationship with temperature derating
 * - Real-world effects: Cloud cover, soiling, seasonal variations, tracking efficiency
 */
export class SolarHybridModel {
  private irradianceModel: SolarIrradianceModel;
  private residualModel: MultivariateLinearRegression | null = null;
  private stationCode: string;

  constructor(stationCode: string, modelParams?: { tempCoeff?: number; systemLoss?: number }) {
    this.stationCode = stationCode;
    this.irradianceModel = new SolarIrradianceModel(modelParams);
  }

  /**
   * Train the residual model
   * residual = actual_CFac - physics_CFac
   *
   * @param samples - Training samples with actual capacity factors and weather data
   * @returns Training metrics (MAPE and R² score)
   */
  async train(samples: CFacTrainingSample[]): Promise<{ mape: number; r2Score: number }> {
    if (samples.length === 0) {
      throw new Error('No training samples provided');
    }

    // Filter samples for this station
    const stationSamples = samples.filter(s => s.stationCode === this.stationCode);

    if (stationSamples.length < 10) {
      throw new Error(`Insufficient training samples for station ${this.stationCode}: ${stationSamples.length}`);
    }

    // Prepare training data
    const X: number[][] = [];
    const Y: number[][] = [];

    for (const sample of stationSamples) {
      // Calculate physics-based prediction
      const solarRadiation = sample.weather.solarRadiation;
      const temperature = sample.weather.temperature;
      const physicsCFac = this.irradianceModel.predict(solarRadiation, temperature);

      // Calculate residual
      const residual = sample.actualCFac - physicsCFac;

      // Extract features for residual prediction
      const features = this.extractResidualFeatures(sample, physicsCFac);

      X.push(features);
      Y.push([residual]);
    }

    // Train residual model
    this.residualModel = new MultivariateLinearRegression(X, Y);

    // Calculate training metrics
    let totalAbsError = 0;
    let totalPercentError = 0;
    let ssRes = 0;
    let ssTot = 0;
    const meanActual = stationSamples.reduce((sum, s) => sum + s.actualCFac, 0) / stationSamples.length;

    for (let i = 0; i < stationSamples.length; i++) {
      const sample = stationSamples[i];
      const predicted = this.predict(sample.weather, sample.datetime);
      const actual = sample.actualCFac;

      const error = Math.abs(predicted - actual);
      totalAbsError += error;

      // MAPE calculation (avoid division by zero)
      // For solar, only calculate MAPE during daylight hours (actual > 0.01)
      if (actual > 0.01) {
        totalPercentError += (error / actual) * 100;
      }

      ssRes += Math.pow(predicted - actual, 2);
      ssTot += Math.pow(actual - meanActual, 2);
    }

    const mape = totalPercentError / stationSamples.length;
    const r2Score = ssTot > 0 ? 1 - (ssRes / ssTot) : 0;

    return { mape, r2Score };
  }

  /**
   * Extract features for residual prediction
   *
   * Features include:
   * - Solar radiation (normalized)
   * - Cloud cover (normalized)
   * - Temperature (for validation of physics adjustment)
   * - Temporal: hour (cyclical), month
   * - Physics baseline
   * - Clear sky index (if calculable)
   *
   * @param sample - Training sample
   * @param physicsCFac - Physics-based prediction
   * @returns Feature vector for residual model
   */
  private extractResidualFeatures(sample: CFacTrainingSample, physicsCFac: number): number[] {
    const features: number[] = [];
    const weather = sample.weather;

    // Solar radiation (normalized)
    features.push(weather.solarRadiation / 1000);  // Normalize by STC (1000 W/m²)

    // Cloud cover (normalized)
    features.push(weather.cloudCover / 100);  // Convert percentage to [0, 1]

    // Temperature (normalized)
    features.push(weather.temperature / 50);  // Normalize by typical range

    // Temporal features (cyclical encoding for hour)
    const hourRad = (sample.hour * 2 * Math.PI) / 24;
    features.push(Math.sin(hourRad));  // hourSin
    features.push(Math.cos(hourRad));  // hourCos

    // Month (normalized)
    features.push(sample.month / 12);

    // Physics baseline (normalized)
    features.push(physicsCFac);

    // Clear sky index (if calculable)
    // This represents how much of the theoretical clear-sky radiation is available
    const clearSkyIndex = this.calculateClearSkyIndex(
      weather.solarRadiation,
      sample.datetime,
      sample.hour
    );
    features.push(clearSkyIndex);

    return features;
  }

  /**
   * Calculate clear sky index
   *
   * Estimates the ratio of actual irradiance to theoretical clear-sky irradiance
   * Simplified calculation based on hour of day and season
   *
   * @param actualRadiation - Actual solar radiation in W/m²
   * @param datetime - Date for seasonal calculation
   * @param hour - Hour of day
   * @returns Clear sky index [0, 1]
   */
  private calculateClearSkyIndex(actualRadiation: number, datetime: Date, hour: number): number {
    // Night time - return 0
    if (hour < 6 || hour > 18) {
      return 0;
    }

    // Calculate theoretical clear-sky radiation based on hour and season
    // Simplified model: peak at solar noon (12pm), varies by season
    const dayOfYear = this.getDayOfYear(datetime);

    // Solar declination (simplified)
    const declination = 23.45 * Math.sin((2 * Math.PI * (dayOfYear - 81)) / 365);

    // Hour angle (degrees from solar noon)
    const hourAngle = (hour - 12) * 15;

    // Elevation angle (simplified, assuming latitude ~10-15° for Philippines)
    const latitude = 12;  // Approximate Philippines latitude
    const elevationAngle = Math.asin(
      Math.sin(latitude * Math.PI / 180) * Math.sin(declination * Math.PI / 180) +
      Math.cos(latitude * Math.PI / 180) * Math.cos(declination * Math.PI / 180) *
      Math.cos(hourAngle * Math.PI / 180)
    );

    // Clear-sky irradiance (simplified)
    const clearSkyRadiation = elevationAngle > 0
      ? 1000 * Math.sin(elevationAngle)  // Peak of 1000 W/m² at zenith
      : 0;

    // Clear sky index
    if (clearSkyRadiation > 10) {  // Avoid division by very small numbers
      return Math.min(1, actualRadiation / clearSkyRadiation);
    }

    return 0;
  }

  /**
   * Get day of year (1-366)
   */
  private getDayOfYear(date: Date): number {
    const start = new Date(date.getFullYear(), 0, 0);
    const diff = date.getTime() - start.getTime();
    const oneDay = 1000 * 60 * 60 * 24;
    return Math.floor(diff / oneDay);
  }

  /**
   * Predict capacity factor
   * CFac = physics_base + ML_residual, clamped to [0, 1]
   *
   * @param weather - Weather features
   * @param datetime - Datetime for temporal features
   * @returns Predicted capacity factor [0, 1]
   */
  predict(weather: CFacWeatherFeatures, datetime: Date): number {
    // Handle night time explicitly
    const hour = datetime.getHours();
    if (hour < 6 || hour > 18 || weather.solarRadiation <= 0) {
      return 0;  // No solar generation at night
    }

    // Calculate physics-based prediction
    const physicsCFac = this.predictPhysicsOnly(weather.solarRadiation, weather.temperature);

    // If no residual model trained, return physics-only prediction
    if (!this.residualModel) {
      return physicsCFac;
    }

    // Create a minimal training sample for feature extraction
    const month = datetime.getMonth() + 1;

    const tempSample: CFacTrainingSample = {
      datetime,
      stationCode: this.stationCode,
      stationType: 'solar' as any,
      actualCFac: 0,  // Not used for prediction
      weather,
      hour,
      dayOfWeek: datetime.getDay(),
      month,
      isWeekend: datetime.getDay() === 0 || datetime.getDay() === 6
    };

    // Extract features for residual prediction
    const features = this.extractResidualFeatures(tempSample, physicsCFac);

    // Predict residual
    const residual = this.residualModel.predict(features)[0];

    // Combine physics + residual and clamp to [0, 1]
    const prediction = physicsCFac + residual;
    return Math.max(0, Math.min(1, prediction));
  }

  /**
   * Get physics-only prediction for comparison
   *
   * @param solarRadiation - Solar radiation in W/m²
   * @param temperature - Temperature in degrees Celsius
   * @returns Physics-based capacity factor [0, 1]
   */
  predictPhysicsOnly(solarRadiation: number, temperature: number): number {
    return this.irradianceModel.predict(solarRadiation, temperature);
  }

  /**
   * Check if model is ready for predictions
   *
   * @returns True if residual model is trained
   */
  isReady(): boolean {
    return this.residualModel !== null;
  }

  /**
   * Get station code
   */
  getStationCode(): string {
    return this.stationCode;
  }
}
