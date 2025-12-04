/**
 * Capacity Factor Models
 *
 * Physics-based and hybrid models for predicting renewable energy capacity factors
 */

// Physics-based models (weather-dependent)
export { WindPowerCurve } from './WindPowerCurve.js';
export { SolarIrradianceModel } from './SolarIrradianceModel.js';

// Hybrid models (weather + ML)
export { WindHybridModel } from './WindHybridModel.js';
export { SolarHybridModel } from './SolarHybridModel.js';

// Profile-based models (stable generation types)
export { ProfileBasedModel } from './ProfileBasedModel.js';
export { GeothermalModel } from './GeothermalModel.js';
export { BiomassModel } from './BiomassModel.js';
export { HydroModel } from './HydroModel.js';
export { BatteryModel } from './BatteryModel.js';

// Model router
export { ModelRouter, modelRouter } from './ModelRouter.js';
