import { ProfileBasedModel } from './ProfileBasedModel.js';
import { CFacTrainingSample } from '../../types/capacityFactor.js';

/**
 * Battery capacity factor model
 * Charge during off-peak/solar hours, discharge during peak prices
 * Note: CFac can represent net output (positive = discharge, could be negative for charge)
 */
export class BatteryModel extends ProfileBasedModel {
  /**
   * Build profiles for battery charge/discharge patterns
   * Typical patterns:
   * - Discharge: 17:00-21:00 (evening peak)
   * - Charge: 00:00-06:00 (night off-peak) and 10:00-14:00 (solar hours)
   */
  buildProfiles(samples: CFacTrainingSample[]): void {
    // Use parent implementation for standard profile building
    super.buildProfiles(samples);
  }

  /**
   * Predict battery capacity factor
   * Returns the median pattern for the hour/dayType
   * Can be positive (discharge) or negative (charge)
   */
  predict(datetime: Date): number {
    const hour = datetime.getHours();
    const dayOfWeek = datetime.getDay();

    const dayType = dayOfWeek === 0 ? 2 : dayOfWeek === 6 ? 1 : 0;

    const key = this.getProfileKey(hour, dayType);
    const profile = this.profiles.get(key);

    if (!profile) {
      // Fallback: try to find profile for this hour with any dayType
      for (const [k, p] of this.profiles) {
        if (k.startsWith(`${hour}_`)) {
          return p.median;
        }
      }

      // If no profile found, return typical pattern based on hour
      return this.getTypicalPattern(hour);
    }

    return profile.median;
  }

  /**
   * Get typical battery pattern when no historical data available
   * Based on common arbitrage strategies in the Philippines market
   */
  private getTypicalPattern(hour: number): number {
    // Evening peak discharge (17:00-21:00): high output
    if (hour >= 17 && hour <= 21) {
      return 0.8; // 80% discharge rate
    }

    // Morning discharge (06:00-09:00): moderate output
    if (hour >= 6 && hour <= 9) {
      return 0.4; // 40% discharge rate
    }

    // Solar hours charging (10:00-14:00): absorbing solar generation
    if (hour >= 10 && hour <= 14) {
      return 0.0; // Charging, could be represented as 0 or negative
    }

    // Night charging (00:00-05:00): off-peak charging
    if (hour >= 0 && hour <= 5) {
      return 0.0; // Charging
    }

    // Other hours: minimal activity
    return 0.1;
  }
}
