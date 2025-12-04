# iLoad Data Structures - Comprehensive Reference

## Overview

This document details all data structures, classes, and data models used in the iLoad forecasting module.

## Table of Contents

1. [Core Classes](#core-classes)
2. [Profile Data Structures](#profile-data-structures)
3. [Statistical Data Structures](#statistical-data-structures)
4. [Time and Calendar Structures](#time-and-calendar-structures)
5. [Configuration Structures](#configuration-structures)
6. [File Format Specifications](#file-format-specifications)

---

## Core Classes

### 1. DiLoad Class

**Purpose**: Main dialog and orchestration class for demand forecasting.

**File**: `iPool\Interface\Dialogs\diload.h` and `diload.cpp`

#### Member Variables

```cpp
class DiLoad : public CDialog {
private:
    // Time and date management
    int iDay, itvl, iTP, iWth, iCol, iReg, indx;
    int nInts, nTPs, nWths, nCols, nRegs, nObjs, nIndx;
    int iIntLast;
    COleDateTime dateLast;
    COleDateTime m_Start;      // Analysis start date
    COleDateTime m_End;        // Analysis end date
    COleDateTime tStart;       // Timing start
    COleDateTimeSpan tElapse;  // Elapsed time

    // Configuration flags
    BOOL bEnable, bEditTem;
    BOOL m_bWeather;           // Use temperature correlation
    BOOL m_bFahren;            // Temperature in Fahrenheit
    BOOL m_bWeight;            // Chronological weighting

    // Temperature thresholds
    double m_dHot;             // Hot day threshold
    double m_dWarm;            // Warm day threshold
    double m_dCool;            // Cool day threshold
    double m_dCold;            // Cold day threshold

    // Analysis parameters
    long m_NDays;              // Historical days to analyze
    long m_NDays1;             // Forecast days
    long m_NSamples;           // Statistical samples
    double m_PcGrowth;         // Growth percentage
    long m_iPcThresh;          // Irregularity threshold

    // File paths
    CString m_DemFile;         // Historical region demand file
    CString m_UDemFile;        // Historical customer demand file
    CString m_FDemFile;        // Forecast output file
    CString m_DModFile;        // Demand model file (from analysis)
    CString m_FModFile;        // Forecast model file (input)
    CString m_WthFile;         // Historical temperature file
    CString m_WthFile1;        // Forecast temperature file
    CString m_DirLRep;         // Load report directory
    CString m_DirDMod;         // Demand model directory
    CString m_DirTem;          // Temperature directory
    CString m_DirDem;          // Demand data directory
    CString m_DemACFile;       // Actual demand file (for comparison)
    CString m_DemFCFile;       // Forecast demand file (for comparison)
    CString m_DemFCFile2;      // Updated forecast file

    // Profile collections
    EProfsList m_ProfsList;    // Daily profiles (by date)
    EProfsList m_LProfsList;   // Load model profiles (by time period)

    // Data arrays for comparison/refinement
    double** ACArr;            // Actual demand array
    double** FCArr;            // Forecast demand array
    int* Index;                // Index array

    // Time period management
    EDayBlks UserTPs;          // User-defined time periods
    EDayBlks ValidTPs;         // Valid time periods for current day
    CStringArray IDArr;        // ID array
    CStringArray TPIDs;        // Time period IDs

public:
    // Main operations
    void Analyze(LPCSTR DemFile = NULL, LPCSTR TemFile = NULL,
                 LPCSTR UDemFile = NULL, BOOL bWeight = TRUE,
                 LPCSTR FModFile = NULL);

    void Forecast(LPCSTR DModFile = NULL, LPCSTR TemFile = NULL,
                  double DemFac = 1.0, LPCSTR FDemFile = NULL);

    void Forecast2(LPCSTR FDemFile = NULL);

    void Compare(LPCSTR DemFCFile = NULL, LPCSTR DemACFile = NULL);

    void ReForecast(LPCSTR DemFCFile = NULL, LPCSTR DemACFile = NULL);

    // Helper methods
    void LoadWth(LPCSTR TemFile);
    void LoadWth1(LPCSTR TemFile);
    BOOL LoadDMod(LPCSTR DModFile);
    void LoadIDArr(LPCSTR CsvPath, CStringArray& IDArr);
    int LoadValArr(LPCSTR CsvPath, double**& ValArr, COleDateTime& rDate);
    void WriteLFRep(CStringArray& ArrID, long*& ArrMD, double*& ArrTE,
                    double*& ArrPE, double*& ArrOE, double*& ArrLF);
    void WriteLCRep(CStringArray& ArrID, double*& ac, double*& fc,
                    double*& re, double*& ea, double*& es);
};
```

#### Key Constants

```cpp
const int MAX_INTERVAL = 48;      // Half-hour intervals per day
const int MAX_WTH = 5;            // Number of weather categories
const int MAX_RES = 5;            // Number of reserve categories

// Weather classifications
const int ALLDAYS = 0;
const int COLDDAY = 1;
const int COOLDAY = 2;
const int NORMDAY = 3;
const int WARMDAY = 4;
const int HOTDAY = 5;
```

---

## Profile Data Structures

### 2. EProf Class

**Purpose**: Represents a demand profile (either by date or by time period).

**File**: `iPool\App\EProf.h` and `EProf.cpp`

#### Class Definition

```cpp
class EProf : public EObject {
private:
    ETimeMw* pTimeMw;          // Current interval pointer

public:
    // Profile identification
    CString m_ID;              // Profile ID (e.g., "REGION1_DEFAULT")
    CString m_DayBlkID;        // Time period ID (e.g., "WORKDAY")
    CString m_PID1;            // Parent ID (Region or Meter ID)
    EDayBlk* m_pDayBlk;        // Time period definition pointer

    // Profile type
    BOOL m_ByDate;             // TRUE = daily profile, FALSE = time period profile
    COleDateTime m_Date;       // Date (if by date)
    int m_Index;               // Index for sorting/ordering

    // Weather data
    int m_iWth;                // Weather classification (0-5)
    double m_WthMax;           // Daily max temperature
    double m_WthMin;           // Daily min temperature

    // Weather statistics (from historical analysis)
    double m_WthMaxH;          // Highest max temperature
    double m_WthMaxM;          // Median max temperature
    double m_WthMaxL;          // Lowest max temperature
    double m_WthMinH;          // Highest min temperature
    double m_WthMinM;          // Median min temperature
    double m_WthMinL;          // Lowest min temperature

    // Reserve margin data
    int m_iRes;                // Reserve classification
    double m_ResMarg;          // Reserve margin value
    double m_ResH;             // High reserve
    double m_ResM;             // Medium reserve
    double m_ResL;             // Low reserve

    // Demand statistics
    double m_MaxDem;           // Maximum demand (MW)
    double m_MinDem;           // Minimum demand (MW)
    double m_Energy;           // Total energy (MWh)
    double m_EngVar;           // Reactive energy (MVArh)
    double m_PcLFac;           // Percentage load factor
    double m_PcPFac;           // Percentage power factor

    // DST flag
    BOOL m_bDST;               // Daylight saving time flag

    // Peak lopping arrays
    long* m_IntStart;          // Start intervals for peak lopping
    long* m_IntEnd;            // End intervals for peak lopping

    // Interval data collection
    ETimeMws m_TimeMws;        // List of interval data (48 per day)

public:
    // Constructors
    EProf();
    EProf(EProf* pProf);
    EProf(COleDateTime date, CString PID1 = "QLD1");
    EProf(CString ID, CString DayBlkID = "DEFAULT", CString PID1 = "DUID");

    // Weather and statistics
    void SetWthStat(long lMaxH, long lMaxM, long lMaxL,
                    long lMinH, long lMinM, long lMinL,
                    int iPriority = 0);
    void SetWeather(int iWth, long lWthMax, long lWthMin = 0);
    void SetResStat(long ResH, long ResM, long ResL, int iPriority = 0);

    // Forecasting
    void ForecastLP(int iWth, long lWthMax, long lWthMin = 0);
    void ForecastLX(int iWth, long lWthMax, long lWthMin = 0);

    // Interval management
    void AddTimeMw(ETimeMw* pOb);
    void DelTimeMw(ETimeMw* pOb);
    ETimeMw* GetTimeMw(const COleDateTime& time);
    ETimeMw* GetTimeMw(const long intvl);

    // Utility methods
    double GetMwCap(const COleDateTime& time);
    void SetPrice(const COleDateTime& time, double Price);
    void SetEnergy();
    void Copy(EProf* pProf);

    // Operators
    EProf& operator =(EProf& Prof);
    EProf& operator *=(double d);
    EProf& operator +=(EProf* pProf);
    EProf& operator -=(EProf* pProf);
};
```

### 3. EProfs Collection Class

**Purpose**: Collection of EProf objects with statistical aggregation.

```cpp
class EProfs : public EObList<EProf> {
public:
    // Statistical aggregates
    double m_MaxDem;           // Maximum demand across all profiles
    double m_MinDem;           // Minimum demand across all profiles
    double m_Energy;           // Total energy (sum of all daily energy)
    double m_EngVar;           // Total reactive energy
    double m_EngVA;            // Total volt-ampere
    double m_MaxEng;           // Maximum daily energy
    double m_MinEng;           // Minimum daily energy
    double m_AveEng;           // Average daily energy (all days)
    double m_AveEWD;           // Average daily energy (workdays)
    double m_AveENW;           // Average daily energy (weekends)
    double m_PkEng;            // Peak period energy
    double m_OfEng;            // Off-peak period energy
    double m_ShEng;            // Shoulder period energy
    double m_PcLFac;           // Percentage load factor
    double m_PcPFac;           // Percentage power factor
    double m_PcMDSD;           // Percentage maximum demand std deviation
    double m_PFactor;          // Average power factor
    double m_DemFac;           // Demand scaling factor (growth rate)

    // Counts
    long m_nDays;              // Number of days
    long m_nDaysWD;            // Number of workdays
    long m_nDaysNW;            // Number of weekends
    long m_nBands;             // Number of data bands (2 = kVar included)

    // Profile type
    BOOL m_bByDate;            // TRUE = daily profiles, FALSE = time period profiles

    // Load duration curve (LDC) data
    long* m_LDC;               // Number of intervals at given index
    double* m_LDCP;            // Price at given index
    EBid** m_LDCB;             // Array of bid pointers
    long* m_iOff;              // Index at given offline hours
    double* m_POff;            // Cost array
    long* m_nMinHrsOff;        // Min intervals before demand is met

    int m_iMax, iMaxLvl;       // LDC index for max
    int m_iMin, iMinLvl;       // LDC index for min
    long m_LDCInc;             // LDC increment (default 50)
    long m_LDCDays;            // LDC days
    long m_LDCMax;             // LDC maximum
    long m_LDCMin;             // LDC minimum
    double m_LDCEng;           // LDC energy
    double m_LDCLFac;          // Average daily load factor
    double m_IntSize;          // Interval size (0.5 for half-hour)
    double m_Margin;           // Price margin
    EBid* m_pBidLast;          // Last bid pointer
    int iMaxBid;               // Maximum bid index

    EProf* m_pDailyLP;         // Daily load profile pointer

    // Region/Meter identification
    CString m_PID1;            // Primary ID (Region or Meter)
    CString m_PID2;            // Secondary ID (often Region for meters)

public:
    // Profile management
    void AddProf(EProf* pDProf);
    void Aggregate(EProfs* pProfs, BOOL bAdd = TRUE);
    void DelValid(CString DayBlkID);
    EProf* GetValid(CString DayBlkID);
    EProf* GetValid(const COleDateTime& date);
    EProf* GetValid(const COleDateTime& date, double P, int iWeather);
    EProf* GetSimDay(int iDoY, int iDoW, BOOL bHol, int iOff = 0);

    // LDC operations
    void BuildLDC(CString DayID, long nDays = 0, bool bSpin = true);
    void BuildLDCP(EBids* pBids);
    void Commitment(EBids* pBids);
    void DeCommitment(EBids* pBids, EBid* pBidLast);

    // Scaling
    void Scale(double dFac);
    void AddMw(long lval);

    // Utility
    void Copy(EProfs* pProfs);
};
```

### 4. ETimeMw Class

**Purpose**: Represents demand data for a single interval (30 minutes).

**File**: `iPool\App\ETimeMw.h`

```cpp
class ETimeMw : public EObject {
public:
    // Interval identification
    int m_Intvl;               // Interval number (1-48)
    COleDateTime m_Time;       // Time stamp

    // Demand values
    double m_MwCap;            // Demand capacity (MW)
    double m_Max;              // Maximum demand (from statistics)
    double m_Med;              // Median demand (from statistics)
    double m_Min;              // Minimum demand (from statistics)
    double m_Ave;              // Average demand (from statistics)

    // Price information
    double m_Price;            // Price ($/MWh or PhP/MWh)
    int m_iPrc;                // Price category (0=offpeak, 1=peak, 2=shoulder)

    // Additional metrics
    double m_MwGen;            // Generation (MW)
    double m_MwVar;            // Reactive power (MVAr)
    double m_Level;            // Storage level or capacity factor

public:
    // Constructors
    ETimeMw();
    ETimeMw(int itvl, double MwCap);
    ETimeMw(int itvl, double Max, double Med, double Min, double Ave);
    ETimeMw(int itvl, double Price, int iPrc);

    // Accessors
    double GetLevel() { return m_Level; }
    int GetiPrc() { return m_iPrc; }
    void SetPrice(double Price) { m_Price = Price; }

    // Operators
    ETimeMw& operator *=(double d);
    ETimeMw& operator +=(ETimeMw* pTimeMw);
};
```

---

## Statistical Data Structures

### 5. DList Class

**Purpose**: Statistical analysis container for demand/temperature values.

**File**: `iPool\App\DList.h` and `DList.cpp`

```cpp
class DList : public list<double> {
public:
    // Iterator
    iterator i;

    // Calculated statistics
    long m_Size;               // Expected/target size
    double m_Max;              // Maximum value
    double m_Min;              // Minimum value
    double m_Med;              // Median value
    double m_Ave;              // Average value

    // Validation bounds
    double dMin;               // Minimum valid value
    double dMax;               // Maximum valid value

public:
    // Constructors
    DList();
    DList(long size);

    // Operations
    void SetSize(long n);
    void Insert(double d);
    void Pop_front();
    void Pop_back();

    // Statistical calculations
    void Calc();               // Calculate all statistics
    void CalcSz();             // Calculate with size constraint

    // Validation
    void SetValidRule(double dmin, double dmax);

    // Accessors
    double GetMax() { return m_Max; }
    double GetMed() { return m_Med; }
    double GetMin() { return m_Min; }
    double GetAve() { return m_Ave; }
};
```

#### Statistical Calculation Logic

```cpp
void DList::Calc() {
    if (empty()) {
        m_Max = m_Min = m_Med = m_Ave = 0.0;
        return;
    }

    // Sort the list
    sort();

    // Maximum and minimum
    m_Max = back();
    m_Min = front();

    // Median (middle value)
    int n = size();
    iterator it = begin();
    advance(it, n / 2);
    m_Med = *it;

    // Average (arithmetic mean)
    double sum = 0.0;
    for (iterator i = begin(); i != end(); ++i) {
        sum += *i;
    }
    m_Ave = sum / n;
}
```

---

## Time and Calendar Structures

### 6. EDayBlk Class

**Purpose**: Defines time periods (workday, weekend, holidays, etc.).

**File**: `iPool\App\EDayBlk.h`

```cpp
class EDayBlk : public EObject {
public:
    // Identification
    CString m_ID;              // Time period ID (e.g., "WORKDAY")
    CString m_Name;            // Display name
    int m_Sort;                // Sort order (< 1000 = user-defined)
    int m_Index;               // Array index

    // Day type associations
    EDayTypes* m_pDayTypes;    // Collection of day types (Mon, Tue, etc.)
    BOOL m_bDefault;           // Is this the default time period?

    // Calendar rules
    int m_DayOfWeek;           // Specific day of week (1-7, 0=all)
    BOOL m_bHoliday;           // Applies to holidays
    BOOL m_bWorkday;           // Applies to workdays

public:
    // Validation
    bool OK_HR0(const COleDateTime& date);
    bool OK_DEF(const COleDateTime& date);

    // Index management
    void SetIndex(int idx) { m_Index = idx; }
    int GetIndex() { return m_Index; }
};
```

### 7. EDayBlks Collection

**Purpose**: Collection of time period definitions.

```cpp
class EDayBlks : public EObList<EDayBlk> {
public:
    // Query methods
    EDayBlk* Get(CString ID);
    int CountUserTP();         // Count user-defined time periods (Sort < 1000)

    // Validation
    void GetValidDEF(const COleDateTime& date, EDayBlks& ValidTPs);
    void Filter(EDayBlks* pCalendar);

    // Default
    EDayBlk* GetDefault();
};
```

### 8. EDayType Class

**Purpose**: Defines special day types (holidays, maintenance days, etc.).

```cpp
class EDayType : public EObject {
public:
    CString m_ID;              // Day type ID (e.g., "SUNH")
    CString m_Name;            // Display name (e.g., "Sunday/Holiday")
    COLORREF m_Color;          // Display color

    // Date associations
    CObArray m_Dates;          // Array of COleDateTime objects

public:
    // Validation
    BOOL OK_HR0(const COleDateTime& date);
    void AddDate(const COleDateTime& date);
    void RemoveDate(const COleDateTime& date);
};
```

---

## Configuration Structures

### 9. ESim Class (Simulation Configuration)

**Purpose**: Global simulation settings and parameters.

**File**: Referenced in `iPool\App\ESim.h`

```cpp
class ESim {
public:
    // Simulation identification
    CString m_ID;              // Simulation ID

    // Time range
    COleDateTime m_Start;      // Simulation start
    COleDateTime m_End;        // Simulation end
    long m_NDays;              // Number of days

    // iLoad-specific parameters
    long m_NSamples;           // Statistical samples
    BOOL m_bWeather;           // Use weather correlation
    BOOL m_bWeight;            // Chronological weighting
    long m_iPcThresh;          // Irregularity threshold (%)

    // Temperature thresholds
    double m_dHot;             // Hot day threshold (°C)
    double m_dWarm;            // Warm day threshold (°C)
    double m_dCool;            // Cool day threshold (°C)
    double m_dCold;            // Cold day threshold (°C)

    // File references
    CString m_DemFile;         // Historical demand file
    CString m_UDemFile;        // Unit/customer demand file
    CString m_DModFile;        // Demand model file
    CString m_FDemFile;        // Forecast demand file
    CString m_ADemFile;        // Actual demand file
    CString m_WthFile;         // Historical weather file
    CString m_WthFile1;        // Forecast weather file
};
```

### 10. Global Constants

**File**: `iPool\ConstDefinitions.h`

```cpp
// Market types
const int AEMO = 0;            // Australian market
const int WESM = 1;            // Philippine market

// Time resolution
extern int D_RES;              // Dispatch resolution (minutes)
extern int B_RES;              // Bid resolution (minutes)
extern int MAX_INTERVAL;       // Intervals per day (48 for 30-min)
extern int MAX_BIDINTVL;       // Bid intervals per day

// Time spans
extern COleDateTimeSpan INTERVAL;   // Half-hour span
extern COleDateTimeSpan BIDINTVL;   // Bid interval span

// Special times
extern COleDateTime NULLTIME;  // Null/invalid time
extern COleDateTime ENDTIME;   // End of time marker

// Market parameters
extern int YR0, MT0, DY0, HR0, MN0;  // Base time (typically 4:00 AM)

// Temperature correlation
extern double CoFac;           // Correlation factor (default 0.2)
extern double dHOT;            // Hot threshold
extern double dWARM;           // Warm threshold
extern double dCOOL;           // Cool threshold
extern double dCOLD;           // Cold threshold

// Economic parameters
extern double VOLL;            // Value of lost load ($/MWh)
extern double VOCE;            // Value of customer equipment
extern double MINVOLL;         // Minimum VOLL
extern double VOLG;            // Value of lost generation
```

---

## File Format Specifications

### 11. Demand CSV Format

**Purpose**: Historical or forecast demand data.

#### Structure
```
Row 1: Header
  Column 1: "DateTimeEnding"
  Columns 2+: Region/Meter IDs

Row 2+: Data
  Column 1: DateTime in format "MM/DD/YYYY HH:MM"
  Columns 2+: Demand values (MW or kW)
```

#### Example
```csv
DateTimeEnding,CLUZ,CVIS,CMIN,METER001,METER002
1/1/2023 1:00,5814.5,1017.2,543.8,125.3,89.7
1/1/2023 2:00,5598.1,954.8,512.4,118.9,84.2
1/1/2023 3:00,5476.3,928.6,498.7,115.6,81.5
...
```

#### Validation Rules
- Date must be valid and sequential
- Interval must match system resolution (30 or 60 minutes)
- Demand values must be non-negative
- Missing values not allowed (use 0 for no demand)

### 12. Temperature CSV Format

**Purpose**: Historical or forecast temperature data.

#### Structure - Format 1 (Simple)
```
Row 1: "Temperature", "Max", "Min", "Max", "Min", ...
Row 2: "Date", Region1, Region1, Region2, Region2, ...
Row 3+: Date, TMax1, TMin1, TMax2, TMin2, ...
```

#### Example - Format 1
```csv
Temperature,Max,Min,Max,Min,Max,Min
Date,CLUZ,CLUZ,CVIS,CVIS,CMIN,CMIN
1/1/2023,35,27,33,26,31,25
1/2/2023,33,26,32,25,30,24
1/3/2023,32,27,31,26,29,25
...
```

#### Structure - Format 2 (Meralco/Detailed)
```
Row 1: "CODE","O/F","GMT DATE","TMP","DPT","HUM",...
Row 2+: Station, O/F, DateTime, Temp, Dewpoint, Humidity, ...
```

#### Example - Format 2
```csv
CODE,O/F,GMT DATE,TMP,DPT,HUM,HID,WCL,WDR,WSP,WET,CC,SSM,Forecast Date,Units
RPLL,O,12/26/2011 00,81,70,70,85,81,0,2,73,30,39,12/27/2011 8:07,F
RPLL,O,12/26/2011 01,84,72,66,90,84,0,2,75,30,39,12/27/2011 8:07,F
...
```

#### Temperature Units
- Celsius or Fahrenheit (specified in data or header)
- System converts Fahrenheit thresholds: T_F = T_C * 9/5 + 32
- Must be consistent within file

### 13. Demand Model CSV Format

**Purpose**: Statistical demand model output from analysis.

#### Structure
```
Row 1: Header
  "ProfID","TimePeriod","Weather","StatCode",1,2,3,...,48

For each profile (Region/Meter + TimePeriod + Weather):
  Row A: Weather statistics line
  Row B: Max demand values
  Row C: Median demand values
  Row D: Min demand values
  Row E: Average demand values
```

#### Example
```csv
ProfID,TimePeriod,Weather,StatCode,1,2,3,4,5,...,48
CLUZ,DEFAULT,ALLDAYS,Wth,35.0,35.2,34.8,34.5,34.0,...,27.8,27.0,26.8,0
CLUZ,DEFAULT,ALLDAYS,Max,5814.5,5789.2,5654.3,5598.7,5543.2,...,6089.4,6198.7,6234.8
CLUZ,DEFAULT,ALLDAYS,Med,5512.8,5487.9,5398.1,5345.6,5298.4,...,5823.7,5912.4,5987.4
CLUZ,DEFAULT,ALLDAYS,Min,5234.7,5198.4,5123.9,5087.2,5034.8,...,5612.3,5698.9,5734.2
CLUZ,DEFAULT,ALLDAYS,Ave,5523.6,5491.8,5392.4,5343.8,5287.5,...,5841.8,5936.7,5985.5
CLUZ,DEFAULT,HOTDAY,Wth,38.0,37.5,36.2,35.8,35.3,...,30.5,29.0,28.5,27.8,3
CLUZ,DEFAULT,HOTDAY,Max,6234.8,6198.7,6089.4,6034.5,5987.3,...,6523.4,6634.7,6689.3
CLUZ,DEFAULT,HOTDAY,Med,5987.3,5945.2,5856.7,5812.4,5767.8,...,6234.5,6323.8,6387.4
CLUZ,DEFAULT,HOTDAY,Min,5734.2,5687.9,5612.5,5567.3,5523.8,...,6012.7,6098.4,6145.8
CLUZ,DEFAULT,HOTDAY,Ave,5985.4,5943.9,5852.8,5804.7,5761.3,...,6256.8,6352.3,6407.5
...
```

#### Weather Line (StatCode = "Wth")
```
Columns 1-3: ProfID, TimePeriod, Weather
Column 4: "Wth"
Columns 5-10: tmaxH, tmaxM, tmaxL, tminH, tminM, tminL
Column 11: iPriority (0-10, higher = preferred)
```

#### Statistics Lines (StatCode = Max/Med/Min/Ave)
```
Columns 1-3: ProfID, TimePeriod, Weather
Column 4: "Max", "Med", "Min", or "Ave"
Columns 5-52: Demand values for intervals 1-48
```

### 14. Load Factor Report CSV Format

**Purpose**: Energy and capacity metrics from analysis or forecast.

#### Structure
```
Row 1: Header
  "ProfID","MaxDem","Energy","%MaxDem StdDev","%Load Factor",
  "Peak/OffPeak Energy Factor","AveragePeakEnergy",
  "AverageOffPeakEnergy","PeakLoadFactor","OffPeakLoadFactor"

Row 2+: Data for each profile
```

#### Example
```csv
ProfID,MaxDem,Energy,%MaxDem StdDev,%Load Factor,Peak/OffPeak Energy Factor,AveragePeakEnergy,AverageOffPeakEnergy,PeakLoadFactor,OffPeakLoadFactor
CLUZ,6234.8,132456.7,8.5,75.3,1.25,145.8,116.7,82.3,68.9
CVIS,1087.3,23456.8,7.2,72.1,1.18,28.4,24.1,79.4,65.7
CMIN,587.9,12789.4,6.8,73.5,1.22,15.6,12.8,80.1,67.3
...
```

#### Metric Definitions
- **MaxDem**: Peak demand (MW)
- **Energy**: Total energy (MWh)
- **%MaxDem StdDev**: Standard deviation of max demand as percentage
- **%Load Factor**: (Energy / (MaxDem * Hours)) * 100
- **Peak/OffPeak Ratio**: Peak energy / Off-peak energy
- **AveragePeakEnergy**: Average demand during peak hours (MW)
- **AverageOffPeakEnergy**: Average demand during off-peak hours (MW)
- **PeakLoadFactor**: Load factor for peak hours only
- **OffPeakLoadFactor**: Load factor for off-peak hours only

---

## Memory Management

### Array Allocation Patterns

#### 2D Arrays for Demand Data
```cpp
// Allocation
double** ValArr;
ValArr = new double*[nCols];
for (int iCol = 0; iCol < nCols; iCol++) {
    ValArr[iCol] = new double[nInts + 1];
    for (int iInt = 0; iInt <= nInts; iInt++) {
        ValArr[iCol][iInt] = 0.0;
    }
}

// Access
double demand = ValArr[columnIndex][intervalIndex];

// Deallocation
for (int iCol = 0; iCol < nCols; iCol++) {
    delete[] ValArr[iCol];
}
delete[] ValArr;
```

#### Statistical Arrays
```cpp
// Allocation for each time period
DList** LPData;
LPData = new DList*[nTPs];
for (int iTP = 0; iTP < nTPs; iTP++) {
    LPData[iTP] = new DList[MAX_INTERVAL + 1];
}

// Access
LPData[timePeriodIndex][intervalIndex].Insert(value);

// Deallocation
for (int iTP = 0; iTP < nTPs; iTP++) {
    delete[] LPData[iTP];
}
delete[] LPData;
```

---

## Data Flow Summary

```
Input Files:
  - Historical Demand CSV
  - Historical Temperature CSV
  - Customer/Meter Demand CSV

     ↓ Load & Parse

In-Memory Structures:
  - EProfs (by date) with EProf objects
  - ETemperature data linked to dates

     ↓ Statistical Analysis

Intermediate Structures:
  - DList arrays for aggregation
  - Statistical calculations

     ↓ Model Generation

Output File:
  - Demand Model CSV

     ↓ (Later, for forecasting)

Input Files:
  - Demand Model CSV
  - Forecast Temperature CSV

     ↓ Load & Interpolate

In-Memory Structures:
  - EProfs (by time period) with statistics
  - Forecast temperature data

     ↓ Interpolation & Smoothing

Output File:
  - Forecast Demand CSV
```

---

## Performance Characteristics

### Memory Usage
- **Per Region/Meter**: ~50-100 KB for 365 days of data
- **10 Regions + 100 Meters**: ~5-10 MB typical
- **Peak usage during analysis**: 2-3x base due to statistical arrays

### Processing Time (Typical PC)
- **Load 365 days demand**: 1-2 seconds
- **Load temperature**: < 1 second
- **Analyze (1 region)**: 5-10 seconds
- **Analyze (10 regions)**: 30-60 seconds
- **Forecast (7 days, 10 regions)**: 1-2 seconds
- **Compare/ReForecast**: < 1 second

### File Sizes
- **Historical Demand (365 days, 10 objects)**: ~1.5 MB
- **Temperature (365 days, 10 regions)**: ~50 KB
- **Demand Model**: ~500 KB (all time periods and weather)
- **Forecast (7 days)**: ~25 KB

---

## Data Integrity and Validation

### Input Validation
1. **Date Continuity**: Ensure no missing days in historical data
2. **Temperature Bounds**: Realistic temperature values (-50°C to 60°C)
3. **Demand Non-Negative**: All demand values >= 0
4. **Interval Completeness**: Exactly 48 intervals per day (for 30-min resolution)

### Model Validation
1. **Non-Zero Statistics**: Max, Med, Min, Ave all > 0 for valid profiles
2. **Temperature Ranges**: T1 <= T2 <= T3
3. **Demand Ordering**: Min <= Med <= Max (typically)
4. **Energy Conservation**: Sum of intervals matches expected energy

### Output Validation
1. **Forecast Continuity**: No abrupt jumps between days
2. **Reasonable Values**: Forecast within 50% of historical range
3. **Growth Factor Application**: Verify scaling applied correctly
4. **File Completeness**: All expected dates and columns present
