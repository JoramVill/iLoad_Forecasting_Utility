// Station type classification
export enum StationType {
  WIND = 'wind',
  SOLAR = 'solar',
  HYDRO_RUN_OF_RIVER = 'hydro_ror',
  HYDRO_STORAGE = 'hydro_storage',
  GEOTHERMAL = 'geothermal',
  BIOMASS = 'biomass',
  BATTERY = 'battery',
  UNKNOWN = 'unknown'
}

// Station metadata from stations.json
export interface StationMetadata {
  name: string;
  type: StationType;
  operator?: string;
  capacity_mw?: number;
  location: {
    municipality: string;
    province: string;
    region: string;
    latitude: number;
    longitude: number;
  };
  grid: string; // CLUZ, CVIS, CMIN
  commissioned?: number;
}

// Raw capacity factor data from CSV
export interface RawCapacityFactorData {
  datetime: Date;
  stationCode: string;
  capacityFactor: number; // 0.0 to 1.0
}

// Weather features for capacity factor prediction
export interface CFacWeatherFeatures {
  // Wind features (10m standard height)
  windSpeed: number;
  windGust: number;
  windDirection?: number;

  // Wind features at hub height (100m) for wind farm forecasting
  windSpeed100?: number;    // Wind speed at 100m height
  windDirection100?: number; // Wind direction at 100m height

  // Solar features
  solarRadiation: number;
  cloudCover: number;

  // Common
  temperature: number;
  humidity?: number;
  precipitation?: number;

  // Derived
  airDensity?: number; // for wind power adjustment
}

// Training sample for capacity factor models
export interface CFacTrainingSample {
  datetime: Date;
  stationCode: string;
  stationType: StationType;
  actualCFac: number;
  weather: CFacWeatherFeatures;

  // Temporal features
  hour: number;
  dayOfWeek: number;
  month: number;
  isWeekend: boolean;

  // Lag features
  cfacLag1h?: number;
  cfacLag24h?: number;
}

// Profile statistics for non-weather-dependent stations
export interface CFacProfileStats {
  min: number;      // P5
  median: number;   // P50
  max: number;      // P95
  mean: number;
  stdDev: number;
  count: number;
}

// Capacity factor forecast result
export interface CFacForecastResult {
  datetime: Date;
  stationCode: string;
  predictedCFac: number;
  confidence?: {
    lower: number;
    upper: number;
  };
  modelType: string;
}

// Model metrics
export interface CFacModelMetrics {
  stationCode: string;
  stationType: StationType;
  mape: number;
  rmse: number;
  mae: number;
  r2Score: number;
  sampleCount: number;
}

// Known hydro run-of-river station names (partial matching)
const KNOWN_HYDRO_ROR_STATIONS = [
  'BAKUN',
  'LATRINI',
  'PANTABA',
  'AGUS',
  'PULANGI',
  'MAGAT',
  'ANGAT',
  'AMBUKLAO',
  'BINGA',
  'SAN_ROQUE',
  'CALIRAYA',
  'BOTOCAN',
  'MASIWAY',
  'NAGSIGIT'
];

/**
 * Explicit station type mapping from MNM Genlist
 * Maps station codes that don't follow standard naming conventions
 * Source: WESM MNM_Genlist (Market Network Model Generator List)
 */
const STATION_TYPE_MAPPING: Record<string, StationType> = {
  // Wind stations (without _W suffix)
  '01BURGOS': StationType.WIND,
  '01LAOAG': StationType.WIND,
  '01PAGUDPUD': StationType.WIND,

  // Solar stations (without _S suffix)
  '01BOTOLAN': StationType.SOLAR,
  '01CAYANGA': StationType.SOLAR,
  '01CLARK': StationType.SOLAR,
  '01CURIMAO': StationType.SOLAR,
  '01HERMOSA': StationType.SOLAR,
  '01LIMAY': StationType.SOLAR,
  '01PASUQUIN': StationType.SOLAR,
  '01SNMARCELINO': StationType.SOLAR,
  '01SNRAFAEL': StationType.SOLAR,
  '01SNTGO': StationType.SOLAR,
  '02DOLORES': StationType.SOLAR,
  '03CALAMBA': StationType.SOLAR,
  '03CLACA': StationType.SOLAR,
  '03DASMAEHV': StationType.SOLAR,
  '05CALUNG': StationType.SOLAR,
  '06HELIOS': StationType.SOLAR,
  '11KIBAW': StationType.SOLAR,

  // Hydro stations (without _H suffix) - run-of-river
  '01BYOMBNG': StationType.HYDRO_RUN_OF_RIVER,
  '03CALAUAN': StationType.HYDRO_RUN_OF_RIVER,
  '03LABO': StationType.HYDRO_RUN_OF_RIVER,
  '03NAGA': StationType.HYDRO_RUN_OF_RIVER,
  '04PARANAS': StationType.HYDRO_RUN_OF_RIVER,
  '06AMLAN': StationType.HYDRO_RUN_OF_RIVER,
  '11JASAA': StationType.HYDRO_RUN_OF_RIVER,
  '11MANOL': StationType.HYDRO_RUN_OF_RIVER,
  '12BUTUA': StationType.HYDRO_RUN_OF_RIVER,
  '13DAVAO': StationType.HYDRO_RUN_OF_RIVER,
  '13NABUN': StationType.HYDRO_RUN_OF_RIVER,
  '14SULTA': StationType.HYDRO_RUN_OF_RIVER,

  // Geothermal stations
  '03BACMANGP': StationType.GEOTHERMAL,
  '03TIWI-C': StationType.GEOTHERMAL,
  '04TONGONA': StationType.GEOTHERMAL,
  '06PGPP1': StationType.GEOTHERMAL,
  '06PGPP2': StationType.GEOTHERMAL,

  // Biomass stations (without _BI suffix)
  '01DUHAT': StationType.BIOMASS,
  '01GAMU': StationType.BIOMASS,
  '06CADIZ': StationType.BIOMASS,
  '06KABANKALAN': StationType.BIOMASS,
  '06MABINAY': StationType.BIOMASS,

  // Battery stations (without _B suffix)
  '03LUMBAN': StationType.BATTERY,
  '03PALAYAN': StationType.BATTERY,

  // Additional solar stations with non-standard naming
  '01MEXICO_S_A': StationType.SOLAR,  // Mexico Solar - section A
  '01MEXICO_S_R': StationType.SOLAR,  // Mexico Solar - section R
  '01SJSOLAR': StationType.SOLAR,     // San Jose Solar
  '02QUEZON_S_E': StationType.SOLAR,  // Quezon Solar - E
  '02QUEZON_S_V': StationType.SOLAR,  // Quezon Solar - V
  '06CALASOL': StationType.SOLAR,     // Calatrava Solar

  // Additional biomass stations
  '01GAMU_BG': StationType.BIOMASS,   // Gamu Biogas
  '01GAMU_BL': StationType.BIOMASS,   // Gamu Biomass

  // Additional hydro stations
  '14SIGHYDRO': StationType.HYDRO_RUN_OF_RIVER,  // Siguil Hydro

  // SBMA Solar
  '01SBMA': StationType.SOLAR,        // Subic Bay Solar

  // Metro Manila Solar
  '02DONAIMELDA': StationType.SOLAR,  // Doña Imelda Solar (likely rooftop)

  // Laguna Battery stations
  '03LUMBAN_BL': StationType.BATTERY, // Lumban Battery Large
  '03STAROSA': StationType.SOLAR,     // Santa Rosa Solar

  // Visayas stations
  '04CENTRAL': StationType.HYDRO_RUN_OF_RIVER, // Central Visayas Hydro
  '07CORELLA': StationType.HYDRO_RUN_OF_RIVER, // Corella Hydro (Bohol)

  // Coal stations (excluded from must-run forecasting - these shouldn't be in CFac data)
  '03CALACA': StationType.UNKNOWN,    // Calaca Coal (dispatchable, not must-run)
  '10GNPK': StationType.UNKNOWN,      // GNPower Kauswagan Coal (dispatchable)
};

/**
 * Determines station type from station code based on naming conventions
 * @param stationCode - The station code to analyze
 * @returns The determined StationType
 */
export function getStationTypeFromCode(stationCode: string): StationType {
  const code = stationCode.toUpperCase();

  // Check explicit mapping first (highest priority)
  if (STATION_TYPE_MAPPING[code]) {
    return STATION_TYPE_MAPPING[code];
  }

  // Check suffixes (most specific patterns)
  if (code.endsWith('_W')) {
    return StationType.WIND;
  }

  if (code.endsWith('_S')) {
    return StationType.SOLAR;
  }

  if (code.endsWith('_H')) {
    return StationType.HYDRO_STORAGE;
  }

  if (code.endsWith('_BI')) {
    return StationType.BIOMASS;
  }

  if (code.endsWith('_B')) {
    return StationType.BATTERY;
  }

  if (code.endsWith('_G') || code.endsWith('_GP')) {
    return StationType.GEOTHERMAL;
  }

  // Check for known hydro run-of-river stations
  for (const hydroName of KNOWN_HYDRO_ROR_STATIONS) {
    if (code.includes(hydroName)) {
      return StationType.HYDRO_RUN_OF_RIVER;
    }
  }

  // Default to unknown
  return StationType.UNKNOWN;
}
