import { ProfileBasedModel } from './ProfileBasedModel.js';
import { CFacTrainingSample, StationType } from '../../types/capacityFactor.js';

/**
 * Hydro capacity factor model
 * Run-of-river: seasonal (wet/dry) with rainfall influence
 * Storage: peak-dispatch patterns
 */
export class HydroModel extends ProfileBasedModel {
  private hydroType: StationType;

  constructor(stationCode: string, hydroType: StationType) {
    super(stationCode);
    this.hydroType = hydroType;
  }

  /**
   * Build profiles considering hydro type
   * Run-of-river: Include monthly seasonality
   * Storage: Focus on hourly dispatch patterns
   */
  buildProfiles(samples: CFacTrainingSample[]): void {
    // Group samples by profile key
    const grouped = new Map<string, number[]>();

    for (const sample of samples) {
      const dayType = sample.isWeekend
        ? sample.dayOfWeek === 0
          ? 2 // Sunday
          : 1 // Saturday
        : 0; // Weekday

      const key = this.getProfileKey(sample.hour, dayType, sample.month);

      if (!grouped.has(key)) {
        grouped.set(key, []);
      }

      grouped.get(key)!.push(sample.actualCFac);
    }

    // Calculate statistics for each profile
    for (const [key, values] of grouped) {
      if (values.length === 0) continue;

      const stats = this.calculateStats(values);
      this.profiles.set(key, stats);
    }
  }

  /**
   * Override profile key generation based on hydro type
   * Run-of-river: Include month for seasonal wet/dry patterns
   * Storage: Hourly patterns for peak dispatch
   */
  protected getProfileKey(hour: number, dayType: number, month?: number): string {
    if (this.hydroType === StationType.HYDRO_RUN_OF_RIVER && month !== undefined) {
      // Run-of-river: seasonal patterns important
      return `${hour}_${dayType}_${month}`;
    }
    // Storage: hourly dispatch patterns
    return `${hour}_${dayType}`;
  }

  /**
   * Predict with optional rainfall adjustment
   * @param datetime - Target datetime
   * @param recentPrecipitation - Optional recent precipitation in mm (last 7 days)
   */
  predictWithRainfall(datetime: Date, recentPrecipitation?: number): number {
    const basePrediction = this.predict(datetime);

    // If no rainfall data or not run-of-river, return base prediction
    if (
      recentPrecipitation === undefined ||
      this.hydroType !== StationType.HYDRO_RUN_OF_RIVER
    ) {
      return basePrediction;
    }

    // Adjust based on recent precipitation
    // Typical rainfall: 100-200mm per week in wet season
    // Low rainfall: < 50mm per week
    // High rainfall: > 300mm per week

    let rainfallMultiplier = 1.0;

    if (recentPrecipitation < 50) {
      // Dry period: reduce by up to 20%
      rainfallMultiplier = 0.8 + (recentPrecipitation / 50) * 0.2;
    } else if (recentPrecipitation > 300) {
      // Very wet period: increase by up to 15%
      const excessRain = Math.min(recentPrecipitation - 300, 200);
      rainfallMultiplier = 1.0 + (excessRain / 200) * 0.15;
    }

    const adjusted = basePrediction * rainfallMultiplier;

    // Clamp to realistic range [0, 1]
    return Math.max(0, Math.min(1, adjusted));
  }

  /**
   * Standard predict method
   */
  predict(datetime: Date): number {
    const hour = datetime.getHours();
    const dayOfWeek = datetime.getDay();
    const month = datetime.getMonth() + 1; // 1-based

    const dayType = dayOfWeek === 0 ? 2 : dayOfWeek === 6 ? 1 : 0;

    // Try with month first (for run-of-river)
    const keyWithMonth = this.getProfileKey(hour, dayType, month);
    const profileWithMonth = this.profiles.get(keyWithMonth);

    if (profileWithMonth) {
      return profileWithMonth.median;
    }

    // Fallback to profile without month
    const keyNoMonth = `${hour}_${dayType}`;
    const profileNoMonth = this.profiles.get(keyNoMonth);

    if (profileNoMonth) {
      return profileNoMonth.median;
    }

    // Final fallback: try to find any profile for this hour
    for (const [k, p] of this.profiles) {
      if (k.startsWith(`${hour}_`)) {
        return p.median;
      }
    }

    return 0;
  }
}
