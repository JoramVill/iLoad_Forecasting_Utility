// Feature engineering module - transforms merged data into ML-ready features
export {
  calculateRelativeHumidity,
  calculateHeatIndex,
  buildFeatureVector,
  buildTrainingSamples,
  featureVectorToArray,
  getFeatureNames
} from './featureEngineering.js';
