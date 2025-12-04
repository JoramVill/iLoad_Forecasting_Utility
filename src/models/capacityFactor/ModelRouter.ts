import {
  WindHybridModel,
  SolarHybridModel,
  GeothermalModel,
  BiomassModel,
  HydroModel,
  BatteryModel,
} from './index.js';
import {
  StationType,
  CFacTrainingSample,
  CFacWeatherFeatures,
  CFacForecastResult,
  CFacModelMetrics,
} from '../../types/capacityFactor.js';

/**
 * Model Router for Capacity Factor Predictions
 * Routes stations to appropriate models based on station type
 */
export class ModelRouter {
  private models: Map<string, WindHybridModel | SolarHybridModel | GeothermalModel | BiomassModel | HydroModel | BatteryModel> = new Map();
  private modelMetrics: Map<string, CFacModelMetrics> = new Map();

  /**
   * Train all models from training samples
   * Groups samples by station and creates appropriate model for each
   *
   * @param samples - All training samples
   * @param progressCallback - Optional callback for progress updates
   */
  async trainAllModels(
    samples: CFacTrainingSample[],
    progressCallback?: (msg: string) => void
  ): Promise<void> {
    if (samples.length === 0) {
      throw new Error('No training samples provided');
    }

    // Group samples by station
    const stationSamples = new Map<string, CFacTrainingSample[]>();
    for (const sample of samples) {
      if (!stationSamples.has(sample.stationCode)) {
        stationSamples.set(sample.stationCode, []);
      }
      stationSamples.get(sample.stationCode)!.push(sample);
    }

    progressCallback?.(
      `Training ${stationSamples.size} stations from ${samples.length} samples`
    );

    // Train each station
    let trainedCount = 0;
    for (const [stationCode, stationData] of stationSamples) {
      try {
        // Determine station type from first sample
        const stationType = stationData[0].stationType;

        progressCallback?.(
          `[${trainedCount + 1}/${stationSamples.size}] Training ${stationCode} (${stationType})`
        );

        // Create appropriate model based on type
        let model:
          | WindHybridModel
          | SolarHybridModel
          | GeothermalModel
          | BiomassModel
          | HydroModel
          | BatteryModel;

        switch (stationType) {
          case StationType.WIND:
            model = new WindHybridModel(stationCode);
            break;

          case StationType.SOLAR:
            model = new SolarHybridModel(stationCode);
            break;

          case StationType.GEOTHERMAL:
            model = new GeothermalModel(stationCode);
            break;

          case StationType.BIOMASS:
            model = new BiomassModel(stationCode);
            break;

          case StationType.HYDRO_RUN_OF_RIVER:
          case StationType.HYDRO_STORAGE:
            model = new HydroModel(stationCode, stationType);
            break;

          case StationType.BATTERY:
            model = new BatteryModel(stationCode);
            break;

          default:
            progressCallback?.(
              `  Skipping ${stationCode}: Unknown station type ${stationType}`
            );
            continue;
        }

        // Train model
        let metrics: { mape: number; r2Score: number; rmse?: number; mae?: number };

        // Weather-dependent models return mape and r2Score
        if (model instanceof WindHybridModel || model instanceof SolarHybridModel) {
          metrics = await model.train(stationData);
        } else {
          // Profile-based models need buildProfiles
          (model as GeothermalModel | BiomassModel | HydroModel | BatteryModel).buildProfiles(
            stationData
          );

          // Calculate metrics for profile-based models
          metrics = this.calculateProfileMetrics(model, stationData);
        }

        // Store model
        this.models.set(stationCode, model);

        // Store metrics
        const modelMetrics: CFacModelMetrics = {
          stationCode,
          stationType,
          mape: metrics.mape,
          rmse: metrics.rmse ?? 0,
          mae: metrics.mae ?? 0,
          r2Score: metrics.r2Score,
          sampleCount: stationData.length,
        };
        this.modelMetrics.set(stationCode, modelMetrics);

        trainedCount++;
        progressCallback?.(
          `  Trained ${stationCode}: MAPE=${metrics.mape.toFixed(2)}%, R²=${metrics.r2Score.toFixed(3)}`
        );
      } catch (error) {
        progressCallback?.(
          `  Error training ${stationCode}: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }

    progressCallback?.(
      `Training complete: ${trainedCount}/${stationSamples.size} stations trained successfully`
    );
  }

  /**
   * Calculate metrics for profile-based models
   */
  private calculateProfileMetrics(
    model: GeothermalModel | BiomassModel | HydroModel | BatteryModel,
    samples: CFacTrainingSample[]
  ): { mape: number; r2Score: number; rmse: number; mae: number } {
    if (samples.length === 0) {
      return { mape: 0, r2Score: 0, rmse: 0, mae: 0 };
    }

    let totalAbsError = 0;
    let totalPercentError = 0;
    let ssRes = 0;
    let ssTot = 0;
    const meanActual = samples.reduce((sum, s) => sum + s.actualCFac, 0) / samples.length;

    for (const sample of samples) {
      const predicted = model.predict(sample.datetime);
      const actual = sample.actualCFac;

      const error = Math.abs(predicted - actual);
      totalAbsError += error;

      // MAPE calculation (avoid division by zero)
      if (actual > 0.01) {
        totalPercentError += (error / actual) * 100;
      }

      ssRes += Math.pow(predicted - actual, 2);
      ssTot += Math.pow(actual - meanActual, 2);
    }

    const mae = totalAbsError / samples.length;
    const rmse = Math.sqrt(ssRes / samples.length);
    const mape = totalPercentError / samples.length;
    const r2Score = ssTot > 0 ? 1 - ssRes / ssTot : 0;

    return { mape, r2Score, rmse, mae };
  }

  /**
   * Predict capacity factor for a single station
   *
   * @param stationCode - Station code
   * @param weather - Weather features (for weather-dependent models)
   * @param datetime - Datetime for prediction
   * @returns Predicted capacity factor [0, 1], or null if model not found
   */
  predict(
    stationCode: string,
    weather: CFacWeatherFeatures,
    datetime: Date
  ): number | null {
    const model = this.models.get(stationCode);
    if (!model) {
      return null;
    }

    // Weather-dependent models
    if (model instanceof WindHybridModel || model instanceof SolarHybridModel) {
      return model.predict(weather, datetime);
    }

    // Profile-based models (don't need weather)
    return model.predict(datetime);
  }

  /**
   * Predict capacity factors for multiple stations
   *
   * @param stationCodes - Array of station codes
   * @param weather - Map of station code to weather features
   * @param datetime - Datetime for prediction
   * @returns Array of forecast results
   */
  predictAll(
    stationCodes: string[],
    weather: Map<string, CFacWeatherFeatures>,
    datetime: Date
  ): CFacForecastResult[] {
    const results: CFacForecastResult[] = [];

    for (const stationCode of stationCodes) {
      const model = this.models.get(stationCode);
      if (!model) {
        continue;
      }

      let predictedCFac: number;
      let modelType: string;

      // Weather-dependent models
      if (model instanceof WindHybridModel) {
        const stationWeather = weather.get(stationCode);
        if (!stationWeather) {
          // Try to find nearest weather data
          const nearestWeather = weather.values().next().value;
          if (!nearestWeather) {
            continue;
          }
          predictedCFac = model.predict(nearestWeather, datetime);
        } else {
          predictedCFac = model.predict(stationWeather, datetime);
        }
        modelType = 'WindHybridModel';
      } else if (model instanceof SolarHybridModel) {
        const stationWeather = weather.get(stationCode);
        if (!stationWeather) {
          // Try to find nearest weather data
          const nearestWeather = weather.values().next().value;
          if (!nearestWeather) {
            continue;
          }
          predictedCFac = model.predict(nearestWeather, datetime);
        } else {
          predictedCFac = model.predict(stationWeather, datetime);
        }
        modelType = 'SolarHybridModel';
      } else {
        // Profile-based models
        predictedCFac = model.predict(datetime);
        modelType = model.constructor.name;
      }

      results.push({
        datetime,
        stationCode,
        predictedCFac,
        modelType,
      });
    }

    return results;
  }

  /**
   * Get all model metrics
   */
  getMetrics(): Map<string, CFacModelMetrics> {
    return this.modelMetrics;
  }

  /**
   * Get count of trained models
   */
  getModelCount(): number {
    return this.models.size;
  }

  /**
   * Check if model exists for station
   */
  hasModel(stationCode: string): boolean {
    return this.models.has(stationCode);
  }
}

// Singleton instance
export const modelRouter = new ModelRouter();
