import { ProfileBasedModel } from './ProfileBasedModel.js';
import { CFacTrainingSample } from '../../types/capacityFactor.js';

/**
 * Biomass capacity factor model
 * Strong seasonal pattern: milling season (Oct-May) = high, off-season (Jun-Sep) = low
 */
export class BiomassModel extends ProfileBasedModel {
  /**
   * Build profiles with monthly granularity to capture seasonal patterns
   */
  buildProfiles(samples: CFacTrainingSample[]): void {
    // Group samples by profile key (includes month)
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
   * Override to include month in profile key for seasonal patterns
   * Milling season: October (10) to May (5)
   * Off-season: June (6) to September (9)
   */
  protected getProfileKey(hour: number, dayType: number, month?: number): string {
    if (month === undefined) {
      return `${hour}_${dayType}`;
    }
    return `${hour}_${dayType}_${month}`;
  }

  /**
   * Predict using monthly profiles to capture milling season vs off-season
   */
  predict(datetime: Date): number {
    const hour = datetime.getHours();
    const dayOfWeek = datetime.getDay();
    const month = datetime.getMonth() + 1; // 1-based

    const dayType = dayOfWeek === 0 ? 2 : dayOfWeek === 6 ? 1 : 0;

    // First try with month
    const keyWithMonth = this.getProfileKey(hour, dayType, month);
    const profileWithMonth = this.profiles.get(keyWithMonth);

    if (profileWithMonth) {
      return profileWithMonth.median;
    }

    // Fallback to profile without month
    const keyNoMonth = this.getProfileKey(hour, dayType);
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
