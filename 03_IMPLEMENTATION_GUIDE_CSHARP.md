# iLoad Forecasting - C# Implementation Guide

## Overview

This document provides a complete implementation guide for recreating the iLoad demand forecasting module in C# (.NET 6.0 or later recommended).

## Table of Contents

1. [Project Structure](#project-structure)
2. [Core Classes Implementation](#core-classes-implementation)
3. [Algorithm Implementation](#algorithm-implementation)
4. [File I/O and CSV Handling](#file-io-and-csv-handling)
5. [Configuration and Settings](#configuration-and-settings)
6. [Testing Strategy](#testing-strategy)
7. [Performance Optimization](#performance-optimization)
8. [Example Usage](#example-usage)

---

## Project Structure

### Recommended Solution Structure

```
iLoadForecasting.sln
├── iLoadForecasting.Core/
│   ├── Models/
│   │   ├── DemandProfile.cs
│   │   ├── DemandProfileCollection.cs
│   │   ├── IntervalData.cs
│   │   ├── StatisticalList.cs
│   │   ├── TimePeriod.cs
│   │   └── WeatherData.cs
│   ├── Services/
│   │   ├── DemandAnalyzer.cs
│   │   ├── DemandForecaster.cs
│   │   ├── ForecastComparer.cs
│   │   └── ForecastRefiner.cs
│   ├── Utilities/
│   │   ├── CsvReader.cs
│   │   ├── CsvWriter.cs
│   │   ├── DateTimeExtensions.cs
│   │   └── StatisticalCalculator.cs
│   └── Configuration/
│       ├── ForecastConfig.cs
│       └── Constants.cs
├── iLoadForecasting.CLI/
│   └── Program.cs
├── iLoadForecasting.Tests/
│   ├── AnalyzerTests.cs
│   ├── ForecasterTests.cs
│   └── StatisticalTests.cs
└── README.md
```

### NuGet Packages Required

```xml
<PackageReference Include="CsvHelper" Version="30.0.1" />
<PackageReference Include="System.CommandLine" Version="2.0.0-beta4" />
<PackageReference Include="Microsoft.Extensions.Configuration" Version="7.0.0" />
<PackageReference Include="Microsoft.Extensions.Configuration.Json" Version="7.0.0" />
<PackageReference Include="Serilog" Version="3.0.1" />
<PackageReference Include="Serilog.Sinks.Console" Version="4.1.0" />
<PackageReference Include="Serilog.Sinks.File" Version="5.0.0" />
```

---

## Core Classes Implementation

### 1. Constants.cs

```csharp
namespace iLoadForecasting.Core.Configuration
{
    public static class Constants
    {
        // Time resolution
        public const int MaxInterval = 48;        // Half-hour intervals per day
        public const int IntervalMinutes = 30;    // Minutes per interval

        // Weather classifications
        public const int AllDays = 0;
        public const int ColdDay = 1;
        public const int CoolDay = 2;
        public const int NormalDay = 3;
        public const int WarmDay = 4;
        public const int HotDay = 5;
        public const int MaxWeather = 5;

        // Default temperature thresholds (Celsius)
        public const double DefaultHotThreshold = 32.0;
        public const double DefaultWarmThreshold = 28.0;
        public const double DefaultCoolThreshold = 22.0;
        public const double DefaultColdThreshold = 15.0;

        // Correlation factor for temperature extrapolation
        public const double CorrelationFactor = 0.2;

        // Date/time format
        public const string DateTimeFormat = "M/d/yyyy H:mm";
        public const string DateFormat = "M/d/yyyy";
    }
}
```

### 2. IntervalData.cs

```csharp
using System;

namespace iLoadForecasting.Core.Models
{
    /// <summary>
    /// Represents demand data for a single time interval (typically 30 minutes).
    /// </summary>
    public class IntervalData
    {
        public int Interval { get; set; }           // 1-48 for half-hourly
        public DateTime Time { get; set; }
        public double Demand { get; set; }          // Current/actual demand (MW)

        // Statistical values (from historical analysis)
        public double Maximum { get; set; }
        public double Median { get; set; }
        public double Minimum { get; set; }
        public double Average { get; set; }

        // Price information (optional)
        public double Price { get; set; }
        public int PriceCategory { get; set; }      // 0=off-peak, 1=peak, 2=shoulder

        public IntervalData()
        {
        }

        public IntervalData(int interval, double demand)
        {
            Interval = interval;
            Demand = demand;
        }

        public IntervalData(int interval, double max, double med, double min, double ave)
        {
            Interval = interval;
            Maximum = max;
            Median = med;
            Minimum = min;
            Average = ave;
            Demand = ave;  // Default to average
        }

        /// <summary>
        /// Creates a copy of this interval data.
        /// </summary>
        public IntervalData Clone()
        {
            return new IntervalData
            {
                Interval = Interval,
                Time = Time,
                Demand = Demand,
                Maximum = Maximum,
                Median = Median,
                Minimum = Minimum,
                Average = Average,
                Price = Price,
                PriceCategory = PriceCategory
            };
        }

        /// <summary>
        /// Scales the demand by a factor.
        /// </summary>
        public void Scale(double factor)
        {
            Demand *= factor;
            Maximum *= factor;
            Median *= factor;
            Minimum *= factor;
            Average *= factor;
        }
    }
}
```

### 3. WeatherData.cs

```csharp
using System;

namespace iLoadForecasting.Core.Models
{
    /// <summary>
    /// Represents weather data and classification for a specific date.
    /// </summary>
    public class WeatherData
    {
        public DateTime Date { get; set; }
        public string RegionId { get; set; }

        // Temperature values
        public double DailyMaxTemp { get; set; }
        public double DailyMinTemp { get; set; }

        // Weather classification
        public int WeatherCategory { get; set; }    // 0-5 (AllDays, Cold, Cool, Normal, Warm, Hot)

        // Statistical temperature ranges (from historical analysis)
        public double MaxTempHigh { get; set; }     // Highest max temp observed
        public double MaxTempMedian { get; set; }   // Median max temp
        public double MaxTempLow { get; set; }      // Lowest max temp observed
        public double MinTempHigh { get; set; }     // Highest min temp observed
        public double MinTempMedian { get; set; }   // Median min temp
        public double MinTempLow { get; set; }      // Lowest min temp observed

        // Priority for profile selection
        public int Priority { get; set; }

        /// <summary>
        /// Classifies the weather category based on temperature thresholds.
        /// </summary>
        public static int ClassifyWeather(double maxTemp, double minTemp,
            double hotThreshold, double warmThreshold,
            double coolThreshold, double coldThreshold)
        {
            if (maxTemp >= hotThreshold) return Constants.HotDay;
            if (maxTemp >= warmThreshold) return Constants.WarmDay;
            if (maxTemp > coolThreshold) return Constants.NormalDay;
            if (maxTemp > coldThreshold) return Constants.CoolDay;
            return Constants.ColdDay;
        }

        /// <summary>
        /// Converts Fahrenheit to Celsius.
        /// </summary>
        public static double FahrenheitToCelsius(double fahrenheit)
        {
            return (fahrenheit - 32.0) * 5.0 / 9.0;
        }

        /// <summary>
        /// Converts Celsius to Fahrenheit.
        /// </summary>
        public static double CelsiusToFahrenheit(double celsius)
        {
            return celsius * 9.0 / 5.0 + 32.0;
        }
    }
}
```

### 4. DemandProfile.cs

```csharp
using System;
using System.Collections.Generic;
using System.Linq;

namespace iLoadForecasting.Core.Models
{
    /// <summary>
    /// Represents a demand profile for a day or time period.
    /// </summary>
    public class DemandProfile
    {
        public string Id { get; set; }
        public string ParentId { get; set; }        // Region or Meter ID
        public string TimePeriodId { get; set; }    // e.g., "DEFAULT", "WORKDAY"

        public bool IsByDate { get; set; }          // true = daily, false = time period
        public DateTime Date { get; set; }          // For daily profiles

        // Weather information
        public int WeatherCategory { get; set; }
        public WeatherData Weather { get; set; }

        // Interval data (typically 48 half-hour intervals)
        public List<IntervalData> Intervals { get; set; }

        // Aggregated statistics
        public double MaximumDemand { get; set; }
        public double MinimumDemand { get; set; }
        public double TotalEnergy { get; set; }
        public double LoadFactor { get; set; }

        public DemandProfile()
        {
            Intervals = new List<IntervalData>();
        }

        public DemandProfile(string id, string timePeriodId, string parentId)
        {
            Id = id;
            TimePeriodId = timePeriodId;
            ParentId = parentId;
            Intervals = new List<IntervalData>();
        }

        public DemandProfile(DateTime date, string parentId)
        {
            Id = $"{parentId}_{date:yyyyMMdd}";
            ParentId = parentId;
            Date = date;
            IsByDate = true;
            Intervals = new List<IntervalData>();
        }

        /// <summary>
        /// Adds interval data to the profile.
        /// </summary>
        public void AddInterval(IntervalData interval)
        {
            Intervals.Add(interval);
            MaximumDemand = Math.Max(MaximumDemand, interval.Demand);
            if (MinimumDemand == 0 || interval.Demand < MinimumDemand)
                MinimumDemand = interval.Demand;
        }

        /// <summary>
        /// Calculates energy and load factor.
        /// </summary>
        public void CalculateStatistics()
        {
            if (!Intervals.Any()) return;

            MaximumDemand = Intervals.Max(i => i.Demand);
            MinimumDemand = Intervals.Min(i => i.Demand);
            TotalEnergy = Intervals.Sum(i => i.Demand) * Constants.IntervalMinutes / 60.0;

            if (MaximumDemand > 0)
            {
                double hours = Intervals.Count * Constants.IntervalMinutes / 60.0;
                LoadFactor = (TotalEnergy / (MaximumDemand * hours)) * 100.0;
            }
        }

        /// <summary>
        /// Gets demand at a specific interval.
        /// </summary>
        public double GetDemand(int interval)
        {
            var data = Intervals.FirstOrDefault(i => i.Interval == interval);
            return data?.Demand ?? 0.0;
        }

        /// <summary>
        /// Gets interval data at specific interval number.
        /// </summary>
        public IntervalData GetInterval(int interval)
        {
            return Intervals.FirstOrDefault(i => i.Interval == interval);
        }

        /// <summary>
        /// Scales all demands by a factor (for growth scenarios).
        /// </summary>
        public void ScaleDemand(double factor)
        {
            foreach (var interval in Intervals)
            {
                interval.Scale(factor);
            }
            CalculateStatistics();
        }

        /// <summary>
        /// Creates a deep copy of this profile.
        /// </summary>
        public DemandProfile Clone()
        {
            var clone = new DemandProfile
            {
                Id = Id,
                ParentId = ParentId,
                TimePeriodId = TimePeriodId,
                IsByDate = IsByDate,
                Date = Date,
                WeatherCategory = WeatherCategory,
                Weather = Weather,
                MaximumDemand = MaximumDemand,
                MinimumDemand = MinimumDemand,
                TotalEnergy = TotalEnergy,
                LoadFactor = LoadFactor,
                Intervals = Intervals.Select(i => i.Clone()).ToList()
            };
            return clone;
        }
    }
}
```

### 5. StatisticalList.cs

```csharp
using System;
using System.Collections.Generic;
using System.Linq;

namespace iLoadForecasting.Core.Models
{
    /// <summary>
    /// Provides statistical analysis for a list of values (demand or temperature).
    /// </summary>
    public class StatisticalList
    {
        private List<double> _values;

        public int TargetSize { get; set; }
        public double Maximum { get; private set; }
        public double Minimum { get; private set; }
        public double Median { get; private set; }
        public double Average { get; private set; }
        public double StandardDeviation { get; private set; }

        public int Count => _values.Count;

        public StatisticalList()
        {
            _values = new List<double>();
        }

        public StatisticalList(int targetSize)
        {
            _values = new List<double>();
            TargetSize = targetSize;
        }

        /// <summary>
        /// Inserts a value into the list.
        /// </summary>
        public void Insert(double value)
        {
            _values.Add(value);
        }

        /// <summary>
        /// Inserts a value multiple times (for weighting).
        /// </summary>
        public void Insert(double value, int count)
        {
            for (int i = 0; i < count; i++)
            {
                _values.Add(value);
            }
        }

        /// <summary>
        /// Clears all values.
        /// </summary>
        public void Clear()
        {
            _values.Clear();
            Maximum = Minimum = Median = Average = StandardDeviation = 0;
        }

        /// <summary>
        /// Calculates all statistics.
        /// </summary>
        public void Calculate()
        {
            if (!_values.Any())
            {
                Maximum = Minimum = Median = Average = StandardDeviation = 0;
                return;
            }

            // Sort for median calculation
            var sorted = _values.OrderBy(v => v).ToList();

            Maximum = sorted.Last();
            Minimum = sorted.First();

            // Median (middle value)
            int n = sorted.Count;
            if (n % 2 == 0)
                Median = (sorted[n / 2 - 1] + sorted[n / 2]) / 2.0;
            else
                Median = sorted[n / 2];

            // Average
            Average = _values.Average();

            // Standard deviation
            if (n > 1)
            {
                double sumSquaredDiff = _values.Sum(v => Math.Pow(v - Average, 2));
                StandardDeviation = Math.Sqrt(sumSquaredDiff / n);
            }
        }

        /// <summary>
        /// Gets all values (for debugging or export).
        /// </summary>
        public List<double> GetValues()
        {
            return new List<double>(_values);
        }
    }
}
```

### 6. DemandProfileCollection.cs

```csharp
using System;
using System.Collections.Generic;
using System.Linq;

namespace iLoadForecasting.Core.Models
{
    /// <summary>
    /// Collection of demand profiles with lookup and filtering capabilities.
    /// </summary>
    public class DemandProfileCollection
    {
        private List<DemandProfile> _profiles;

        public string ObjectId { get; set; }        // Region or Meter ID
        public string ObjectType { get; set; }      // "Region" or "Meter"
        public bool IsByDate { get; set; }

        // Aggregate statistics
        public double TotalEnergy { get; set; }
        public double MaximumDemand { get; set; }
        public double MinimumDemand { get; set; }
        public double PeakEnergy { get; set; }
        public double OffPeakEnergy { get; set; }
        public double AverageLoadFactor { get; set; }
        public double DemandFactor { get; set; }    // Growth/scaling factor

        public int Count => _profiles.Count;

        public DemandProfileCollection()
        {
            _profiles = new List<DemandProfile>();
            DemandFactor = 1.0;
        }

        public DemandProfileCollection(string objectId, bool isByDate)
        {
            ObjectId = objectId;
            IsByDate = isByDate;
            _profiles = new List<DemandProfile>();
            DemandFactor = 1.0;
        }

        /// <summary>
        /// Adds a profile to the collection.
        /// </summary>
        public void AddProfile(DemandProfile profile)
        {
            // Remove existing profile with same ID/criteria
            if (IsByDate)
            {
                _profiles.RemoveAll(p => p.Date.Date == profile.Date.Date);
            }
            else
            {
                _profiles.RemoveAll(p =>
                    p.TimePeriodId == profile.TimePeriodId &&
                    p.WeatherCategory == profile.WeatherCategory);
            }

            _profiles.Add(profile);
        }

        /// <summary>
        /// Gets a profile for a specific date (for by-date collections).
        /// </summary>
        public DemandProfile GetByDate(DateTime date)
        {
            return _profiles.FirstOrDefault(p => p.Date.Date == date.Date);
        }

        /// <summary>
        /// Gets a profile for a time period and weather (for by-period collections).
        /// </summary>
        public DemandProfile GetByPeriodAndWeather(string timePeriodId, int weatherCategory)
        {
            // Try exact match first
            var profile = _profiles.FirstOrDefault(p =>
                p.TimePeriodId == timePeriodId &&
                p.WeatherCategory == weatherCategory);

            // Fall back to ALLDAYS if not found
            if (profile == null && weatherCategory != Constants.AllDays)
            {
                profile = _profiles.FirstOrDefault(p =>
                    p.TimePeriodId == timePeriodId &&
                    p.WeatherCategory == Constants.AllDays);
            }

            return profile;
        }

        /// <summary>
        /// Gets a profile for a specific date, considering weather if available.
        /// </summary>
        public DemandProfile GetForForecast(DateTime date, int weatherCategory)
        {
            if (IsByDate)
            {
                return GetByDate(date);
            }
            else
            {
                // Determine time period (simplified - should use calendar rules)
                string timePeriod = GetTimePeriod(date);
                return GetByPeriodAndWeather(timePeriod, weatherCategory);
            }
        }

        /// <summary>
        /// Finds a similar day for simple forecasting.
        /// </summary>
        public DemandProfile GetSimilarDay(int dayOfYear, DayOfWeek dayOfWeek, bool isHoliday)
        {
            // Priority 1: Same day of year
            var profile = _profiles.FirstOrDefault(p => p.Date.DayOfYear == dayOfYear);
            if (profile != null) return profile;

            // Priority 2: Same day of week
            profile = _profiles.FirstOrDefault(p => p.Date.DayOfWeek == dayOfWeek);
            if (profile != null) return profile;

            // Priority 3: Any profile
            return _profiles.FirstOrDefault();
        }

        /// <summary>
        /// Gets all profiles.
        /// </summary>
        public List<DemandProfile> GetAllProfiles()
        {
            return new List<DemandProfile>(_profiles);
        }

        /// <summary>
        /// Clears all profiles.
        /// </summary>
        public void Clear()
        {
            _profiles.Clear();
        }

        /// <summary>
        /// Calculates aggregate statistics across all profiles.
        /// </summary>
        public void CalculateAggregateStatistics()
        {
            if (!_profiles.Any()) return;

            MaximumDemand = _profiles.Max(p => p.MaximumDemand);
            MinimumDemand = _profiles.Min(p => p.MinimumDemand);
            TotalEnergy = _profiles.Sum(p => p.TotalEnergy);
            AverageLoadFactor = _profiles.Average(p => p.LoadFactor);
        }

        /// <summary>
        /// Determines time period for a date (simplified implementation).
        /// </summary>
        private string GetTimePeriod(DateTime date)
        {
            // Simplified: Monday-Friday = WORKDAY, else WEEKEND
            // Production version should use calendar rules
            if (date.DayOfWeek == DayOfWeek.Saturday || date.DayOfWeek == DayOfWeek.Sunday)
                return "WEEKEND";
            else
                return "WORKDAY";
        }
    }
}
```

---

## Algorithm Implementation

### 7. DemandAnalyzer.cs

```csharp
using System;
using System.Collections.Generic;
using System.Linq;
using Microsoft.Extensions.Logging;
using iLoadForecasting.Core.Models;
using iLoadForecasting.Core.Configuration;

namespace iLoadForecasting.Core.Services
{
    /// <summary>
    /// Analyzes historical demand data to create statistical demand models.
    /// </summary>
    public class DemandAnalyzer
    {
        private readonly ForecastConfig _config;
        private readonly ILogger<DemandAnalyzer> _logger;

        public DemandAnalyzer(ForecastConfig config, ILogger<DemandAnalyzer> logger)
        {
            _config = config;
            _logger = logger;
        }

        /// <summary>
        /// Analyzes historical demand and weather data to create a demand model.
        /// </summary>
        public Dictionary<string, DemandProfileCollection> Analyze(
            Dictionary<string, DemandProfileCollection> historicalDemand,
            Dictionary<string, List<WeatherData>> historicalWeather)
        {
            _logger.LogInformation("Starting demand analysis...");

            var demandModels = new Dictionary<string, DemandProfileCollection>();

            foreach (var kvp in historicalDemand)
            {
                string objectId = kvp.Key;
                var dailyProfiles = kvp.Value;

                _logger.LogInformation($"Analyzing {objectId}...");

                // Get weather data for this object
                string regionId = GetRegionId(objectId);
                var weatherData = historicalWeather.ContainsKey(regionId)
                    ? historicalWeather[regionId]
                    : new List<WeatherData>();

                // Create statistical model
                var model = CreateDemandModel(objectId, dailyProfiles, weatherData);
                demandModels[objectId] = model;
            }

            _logger.LogInformation("Analysis complete.");
            return demandModels;
        }

        private DemandProfileCollection CreateDemandModel(
            string objectId,
            DemandProfileCollection dailyProfiles,
            List<WeatherData> weatherData)
        {
            var model = new DemandProfileCollection(objectId, false);

            // Define time periods to analyze
            var timePeriods = new[] { "DEFAULT", "WORKDAY", "WEEKEND" };

            // Define weather categories to analyze
            var weatherCategories = Enumerable.Range(0, Constants.MaxWeather + 1).ToList();

            // Create statistical accumulators for each combination
            var stats = new Dictionary<(string, int, int), StatisticalList>();
            var tempStats = new Dictionary<(string, int, int), (StatisticalList max, StatisticalList min)>();

            // Initialize accumulators
            foreach (var period in timePeriods)
            {
                foreach (var weather in weatherCategories)
                {
                    for (int interval = 1; interval <= Constants.MaxInterval; interval++)
                    {
                        stats[(period, weather, interval)] = new StatisticalList();
                    }
                    tempStats[(period, weather, 0)] = (new StatisticalList(), new StatisticalList());
                }
            }

            // Aggregate historical data
            var profiles = dailyProfiles.GetAllProfiles().OrderBy(p => p.Date).ToList();

            for (int dayIndex = 0; dayIndex < profiles.Count; dayIndex++)
            {
                var profile = profiles[dayIndex];

                // Get weather for this day
                var weather = weatherData.FirstOrDefault(w => w.Date.Date == profile.Date.Date);
                int weatherCat = weather?.WeatherCategory ?? Constants.AllDays;
                double maxTemp = weather?.DailyMaxTemp ?? 0;
                double minTemp = weather?.DailyMinTemp ?? 0;

                // Determine time period
                string period = GetTimePeriod(profile.Date);

                // Calculate chronological weight
                int weight = 1;
                if (_config.UseChronologicalWeighting)
                {
                    int fortnight = dayIndex / 14 + 1;  // Bi-weekly periods
                    weight = fortnight;
                }

                // Add to statistical accumulators
                foreach (var interval in profile.Intervals)
                {
                    // Add to ALLDAYS
                    stats[(period, Constants.AllDays, interval.Interval)].Insert(interval.Demand, weight);

                    // Add to specific weather category
                    if (weatherCat != Constants.AllDays)
                    {
                        stats[(period, weatherCat, interval.Interval)].Insert(interval.Demand, weight);
                    }
                }

                // Add temperature data
                tempStats[(period, Constants.AllDays, 0)].max.Insert(maxTemp, weight);
                tempStats[(period, Constants.AllDays, 0)].min.Insert(minTemp, weight);

                if (weatherCat != Constants.AllDays)
                {
                    tempStats[(period, weatherCat, 0)].max.Insert(maxTemp, weight);
                    tempStats[(period, weatherCat, 0)].min.Insert(minTemp, weight);
                }
            }

            // Calculate statistics and create profiles
            foreach (var period in timePeriods)
            {
                foreach (var weatherCat in weatherCategories)
                {
                    // Calculate temperature statistics
                    tempStats[(period, weatherCat, 0)].max.Calculate();
                    tempStats[(period, weatherCat, 0)].min.Calculate();

                    var tempStatsMax = tempStats[(period, weatherCat, 0)].max;
                    var tempStatsMin = tempStats[(period, weatherCat, 0)].min;

                    // Skip if no data
                    if (tempStatsMax.Maximum == 0) continue;

                    // Create profile
                    var profileId = $"{objectId}_{period}_{GetWeatherName(weatherCat)}";
                    var demandProfile = new DemandProfile(profileId, period, objectId)
                    {
                        WeatherCategory = weatherCat,
                        Weather = new WeatherData
                        {
                            MaxTempHigh = tempStatsMax.Maximum,
                            MaxTempMedian = tempStatsMax.Median,
                            MaxTempLow = tempStatsMax.Minimum,
                            MinTempHigh = tempStatsMin.Maximum,
                            MinTempMedian = tempStatsMin.Median,
                            MinTempLow = tempStatsMin.Minimum,
                            Priority = GetWeatherPriority(weatherCat)
                        }
                    };

                    // Add interval statistics
                    for (int interval = 1; interval <= Constants.MaxInterval; interval++)
                    {
                        var stat = stats[(period, weatherCat, interval)];
                        stat.Calculate();

                        // Skip invalid intervals
                        if (stat.Maximum == 0) break;

                        var intervalData = new IntervalData(
                            interval,
                            stat.Maximum,
                            stat.Median,
                            stat.Minimum,
                            stat.Average
                        );

                        demandProfile.AddInterval(intervalData);
                    }

                    // Only add profiles with valid data
                    if (demandProfile.Intervals.Count >= Constants.MaxInterval * 0.9)  // At least 90% complete
                    {
                        demandProfile.CalculateStatistics();
                        model.AddProfile(demandProfile);
                    }
                }
            }

            model.CalculateAggregateStatistics();
            return model;
        }

        private string GetTimePeriod(DateTime date)
        {
            // Simplified implementation
            if (date.DayOfWeek == DayOfWeek.Saturday || date.DayOfWeek == DayOfWeek.Sunday)
                return "WEEKEND";
            else
                return "WORKDAY";
        }

        private string GetRegionId(string objectId)
        {
            // In production, lookup meter's region
            // For now, assume objectId is region or first part before underscore
            return objectId.Split('_')[0];
        }

        private string GetWeatherName(int weatherCategory)
        {
            return weatherCategory switch
            {
                Constants.AllDays => "ALLDAYS",
                Constants.ColdDay => "COLDDAY",
                Constants.CoolDay => "COOLDAY",
                Constants.NormalDay => "NORMDAY",
                Constants.WarmDay => "WARMDAY",
                Constants.HotDay => "HOTDAY",
                _ => "UNKNOWN"
            };
        }

        private int GetWeatherPriority(int weatherCategory)
        {
            return weatherCategory switch
            {
                Constants.NormalDay => 7,
                Constants.WarmDay => 5,
                Constants.HotDay => 3,
                Constants.CoolDay => 5,
                Constants.ColdDay => 3,
                _ => 0
            };
        }
    }
}
```

### 8. DemandForecaster.cs - Linear Interpolation

```csharp
using System;
using System.Collections.Generic;
using System.Linq;
using Microsoft.Extensions.Logging;
using iLoadForecasting.Core.Models;
using iLoadForecasting.Core.Configuration;

namespace iLoadForecasting.Core.Services
{
    /// <summary>
    /// Generates demand forecasts using weather-correlated models.
    /// </summary>
    public class DemandForecaster
    {
        private readonly ForecastConfig _config;
        private readonly ILogger<DemandForecaster> _logger;

        public DemandForecaster(ForecastConfig config, ILogger<DemandForecaster> logger)
        {
            _config = config;
            _logger = logger;
        }

        /// <summary>
        /// Generates forecast demand using demand models and forecast weather.
        /// </summary>
        public Dictionary<string, DemandProfileCollection> Forecast(
            Dictionary<string, DemandProfileCollection> demandModels,
            Dictionary<string, List<WeatherData>> forecastWeather,
            DateTime startDate,
            int numberOfDays,
            double growthFactor = 1.0)
        {
            _logger.LogInformation($"Starting forecast from {startDate:yyyy-MM-dd} for {numberOfDays} days...");

            var forecasts = new Dictionary<string, DemandProfileCollection>();

            foreach (var kvp in demandModels)
            {
                string objectId = kvp.Key;
                var model = kvp.Value;

                _logger.LogInformation($"Forecasting {objectId}...");

                // Get weather data
                string regionId = GetRegionId(objectId);
                var weather = forecastWeather.ContainsKey(regionId)
                    ? forecastWeather[regionId]
                    : new List<WeatherData>();

                // Generate forecast
                var forecast = GenerateForecast(objectId, model, weather, startDate, numberOfDays, growthFactor);
                forecasts[objectId] = forecast;
            }

            _logger.LogInformation("Forecast complete.");
            return forecasts;
        }

        private DemandProfileCollection GenerateForecast(
            string objectId,
            DemandProfileCollection model,
            List<WeatherData> weather,
            DateTime startDate,
            int numberOfDays,
            double growthFactor)
        {
            var forecast = new DemandProfileCollection(objectId, true);

            double lastHourValue = 0;  // For smoothing day transitions

            for (int day = 0; day < numberOfDays; day++)
            {
                DateTime forecastDate = startDate.AddDays(day);

                // Get weather for this day
                var dayWeather = weather.FirstOrDefault(w => w.Date.Date == forecastDate.Date);
                int weatherCat = dayWeather?.WeatherCategory ?? Constants.AllDays;

                // Get appropriate model profile
                string period = GetTimePeriod(forecastDate);
                var modelProfile = model.GetByPeriodAndWeather(period, weatherCat);

                if (modelProfile == null)
                {
                    _logger.LogWarning($"No model profile found for {period}/{weatherCat} on {forecastDate:yyyy-MM-dd}");
                    continue;
                }

                // Create forecast profile for this day
                var dayProfile = new DemandProfile(forecastDate, objectId)
                {
                    WeatherCategory = weatherCat,
                    Weather = dayWeather
                };

                // Apply linear interpolation if weather data available
                if (_config.UseWeatherCorrelation && dayWeather != null)
                {
                    ApplyLinearInterpolation(modelProfile, dayWeather);
                }

                // Copy intervals and apply growth factor
                foreach (var modelInterval in modelProfile.Intervals)
                {
                    var forecastInterval = modelInterval.Clone();
                    forecastInterval.Time = forecastDate.AddMinutes((forecastInterval.Interval - 1) * Constants.IntervalMinutes);
                    forecastInterval.Demand = forecastInterval.Demand * growthFactor;

                    // Smooth first interval of day with last interval of previous day
                    if (forecastInterval.Interval == 1 && lastHourValue > 0)
                    {
                        forecastInterval.Demand = (lastHourValue + forecastInterval.Demand) / 2.0;
                    }

                    dayProfile.AddInterval(forecastInterval);
                }

                // Remember last interval for next day's smoothing
                lastHourValue = dayProfile.Intervals.LastOrDefault()?.Demand ?? 0;

                dayProfile.CalculateStatistics();
                forecast.AddProfile(dayProfile);
            }

            forecast.CalculateAggregateStatistics();
            return forecast;
        }

        /// <summary>
        /// Applies linear interpolation based on temperature (ForecastLP algorithm).
        /// </summary>
        private void ApplyLinearInterpolation(DemandProfile profile, WeatherData weather)
        {
            double forecastMaxTemp = weather.DailyMaxTemp;
            double forecastMinTemp = weather.DailyMinTemp;
            int weatherCat = weather.WeatherCategory;

            // Temperature range from model
            double T3, T2, T1, Tx;

            foreach (var interval in profile.Intervals)
            {
                double D3 = interval.Maximum;
                double D2 = interval.Median;
                double D1 = interval.Minimum;
                double Dx;

                // Determine whether to use max or min temperature
                if (weatherCat > Constants.CoolDay || weatherCat == Constants.AllDays)
                {
                    // Hot weather: use max temperature
                    T3 = profile.Weather.MaxTempHigh;
                    T2 = profile.Weather.MaxTempMedian;
                    T1 = profile.Weather.MaxTempLow;
                    Tx = forecastMaxTemp;

                    Dx = InterpolateHotWeather(D3, D2, D1, T3, T2, T1, Tx);
                }
                else
                {
                    // Cold weather: use min temperature (inverse relationship)
                    T3 = profile.Weather.MinTempLow;   // Opposite order
                    T2 = profile.Weather.MinTempMedian;
                    T1 = profile.Weather.MinTempHigh;
                    Tx = forecastMinTemp;

                    Dx = InterpolateColdWeather(D3, D2, D1, T3, T2, T1, Tx);
                }

                // Update demand
                interval.Demand = Math.Round(Dx, 1);
            }
        }

        private double InterpolateHotWeather(double D3, double D2, double D1,
            double T3, double T2, double T1, double Tx)
        {
            double Dx;

            if (Tx > T3)
            {
                // Extrapolate above maximum
                Dx = D3 + Constants.CorrelationFactor * Math.Abs(T3 - Tx) * Math.Abs(D3 - D2) / Math.Max(Math.Abs(T3 - T2), 1.0);
            }
            else if (Tx > T2)
            {
                // Interpolate between median and max
                Dx = D2 + Math.Abs(T2 - Tx) * Math.Abs(D3 - D2) / Math.Max(Math.Abs(T3 - T2), 1.0);
            }
            else if (Tx > T1)
            {
                // Interpolate between min and median
                Dx = D1 + Math.Abs(T1 - Tx) * Math.Abs(D2 - D1) / Math.Max(Math.Abs(T2 - T1), 1.0);
            }
            else
            {
                // Extrapolate below minimum
                Dx = D1 - Constants.CorrelationFactor * Math.Abs(T1 - Tx) * Math.Abs(D2 - D1) / Math.Max(Math.Abs(T2 - T1), 1.0);
            }

            return Dx;
        }

        private double InterpolateColdWeather(double D3, double D2, double D1,
            double T3, double T2, double T1, double Tx)
        {
            double Dx;

            if (Tx < T3)
            {
                // Lowest temp = highest demand
                Dx = D3 + Constants.CorrelationFactor * Math.Abs(T3 - Tx) * (D3 - D2) / Math.Max(Math.Abs(T3 - T2), 1.0);
            }
            else if (Tx < T2)
            {
                // Interpolate
                Dx = D2 + Math.Abs(T2 - Tx) * (D3 - D2) / Math.Max(Math.Abs(T3 - T2), 1.0);
            }
            else if (Tx < T1)
            {
                // Interpolate
                Dx = D1 + Math.Abs(T1 - Tx) * Math.Abs(D2 - D1) / Math.Max(Math.Abs(T1 - T2), 1.0);
            }
            else
            {
                // Highest temp = lowest demand
                Dx = D1 - Constants.CorrelationFactor * Math.Abs(Tx - T1) * Math.Abs(D2 - D1) / Math.Max(Math.Abs(T1 - T2), 1.0);
            }

            return Dx;
        }

        private string GetTimePeriod(DateTime date)
        {
            // Simplified implementation
            if (date.DayOfWeek == DayOfWeek.Saturday || date.DayOfWeek == DayOfWeek.Sunday)
                return "WEEKEND";
            else
                return "WORKDAY";
        }

        private string GetRegionId(string objectId)
        {
            return objectId.Split('_')[0];
        }
    }
}
```

Due to length limitations, I'll continue with file I/O and remaining implementation in the next parts. Let me save this and continue with the remaining documentation files.
