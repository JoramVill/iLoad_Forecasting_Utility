/**
 * Physics-based wind power curve model
 *
 * Models the relationship between wind speed and power output using
 * a standard cubic power curve with cut-in, rated, and cut-out speeds.
 */
export class WindPowerCurve {
  // Default turbine parameters (can be overridden per site)
  private cutInSpeed: number = 3;      // m/s - turbine starts generating
  private ratedSpeed: number = 12;     // m/s - full power reached
  private cutOutSpeed: number = 25;    // m/s - turbine shuts down for safety

  constructor(params?: { cutIn?: number; rated?: number; cutOut?: number }) {
    if (params?.cutIn !== undefined) {
      this.cutInSpeed = params.cutIn;
    }
    if (params?.rated !== undefined) {
      this.ratedSpeed = params.rated;
    }
    if (params?.cutOut !== undefined) {
      this.cutOutSpeed = params.cutOut;
    }
  }

  /**
   * Calculate capacity factor from wind speed
   * Uses cubic relationship in the operating range
   *
   * @param windSpeed - Wind speed in m/s
   * @returns Capacity factor between 0 and 1
   */
  predict(windSpeed: number): number {
    // Below cut-in speed: no power generation
    if (windSpeed < this.cutInSpeed) {
      return 0;
    }

    // Above cut-out speed: turbine shuts down for safety
    if (windSpeed >= this.cutOutSpeed) {
      return 0;
    }

    // At or above rated speed: full power
    if (windSpeed >= this.ratedSpeed) {
      return 1.0;
    }

    // Between cut-in and rated: cubic power curve
    const speedRatio = (windSpeed - this.cutInSpeed) / (this.ratedSpeed - this.cutInSpeed);
    return Math.pow(speedRatio, 3);
  }

  /**
   * Adjust for air density (temperature effect)
   * Power is proportional to air density
   * At sea level, ~1.225 kg/m³ at 15°C
   *
   * @param baseCFac - Base capacity factor from wind speed
   * @param temperature - Temperature in degrees Celsius
   * @returns Adjusted capacity factor
   */
  adjustForTemperature(baseCFac: number, temperature: number): number {
    // Air density ratio relative to standard conditions (15°C)
    const densityRatio = (273.15 + 15) / (273.15 + temperature);

    // Power is proportional to air density, so CFac adjusts by cube root
    const adjustedCFac = baseCFac * Math.pow(densityRatio, 1/3);

    // Ensure result stays within valid range
    return Math.max(0, Math.min(1, adjustedCFac));
  }
}
