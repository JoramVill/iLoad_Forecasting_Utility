import { ProfileBasedModel } from './ProfileBasedModel.js';
import { CFacTrainingSample } from '../../types/capacityFactor.js';

/**
 * Geothermal capacity factor model
 * Very stable output (80-95% typical), minimal variation
 */
export class GeothermalModel extends ProfileBasedModel {
  // Geothermal is so stable, we might just use overall median
  private overallMedian: number = 0.85;

  /**
   * Build profiles for geothermal
   * Since geothermal is very stable, we calculate an overall median
   * and still build hourly profiles for minor variations
   */
  buildProfiles(samples: CFacTrainingSample[]): void {
    // Call parent to build hourly profiles
    super.buildProfiles(samples);

    // Calculate overall median for fallback
    if (samples.length > 0) {
      const allValues = samples.map(s => s.actualCFac).sort((a, b) => a - b);
      const medianIndex = Math.floor(allValues.length / 2);
      this.overallMedian = allValues[medianIndex];
    }
  }

  /**
   * Predict using overall median or hourly profile
   * Geothermal is extremely stable, so profile variation is minimal
   */
  predict(datetime: Date): number {
    // Try to get hourly profile prediction
    const profilePrediction = super.predict(datetime);

    // If profile found, use it; otherwise use overall median
    if (profilePrediction > 0) {
      return profilePrediction;
    }

    return this.overallMedian;
  }
}
