const { DateTime } = require("luxon");
const { parseDemandCsv } = require("./dist/parsers/demandParser.js");

const demandData = parseDemandCsv("./Data Samples/Training Historical Demand Data");

// Build historical index like forecast does
const historicalIndex = new Map();
for (const record of demandData.records) {
  const dt = DateTime.fromJSDate(record.datetime);
  const hour = dt.hour;
  const dow = dt.weekday;
  const dayType = dow === 7 ? 2 : dow === 6 ? 1 : 0;

  if (!historicalIndex.has(record.region)) {
    historicalIndex.set(record.region, []);
  }
  historicalIndex.get(record.region).push({
    datetime: record.datetime,
    hour,
    dayType,
    demand: record.demand,
    temp: undefined
  });
}

// Sort by datetime descending
for (const [, records] of historicalIndex) {
  records.sort((a, b) => b.datetime.getTime() - a.datetime.getTime());
}

// Test similar days lookup for Nov 1 07:00 CMIN (Saturday, hour 7)
const targetTs = DateTime.fromISO("2025-11-01T07:00:00+10:00").toJSDate().getTime();
const targetHour = 7;
const targetDayType = 1; // Saturday

console.log("Looking for similar days to Nov 1 2025 07:00 (Saturday)");
console.log("Target timestamp:", targetTs, "->", new Date(targetTs).toISOString());

const records = historicalIndex.get("CMIN");
const matches = [];
const seenDates = new Set();

for (const record of records) {
  if (record.datetime.getTime() >= targetTs) continue;
  if (record.hour !== targetHour || record.dayType !== targetDayType) continue;

  const dateKey = DateTime.fromJSDate(record.datetime).toISODate();
  if (dateKey && !seenDates.has(dateKey)) {
    seenDates.add(dateKey);
    matches.push({ date: dateKey, demand: record.demand });
    if (matches.length >= 10) break;
  }
}

console.log("\nFound", matches.length, "matching days (Saturday hour 7):");
for (const m of matches) {
  console.log("  " + m.date + ": " + m.demand + " MW");
}

if (matches.length > 0) {
  const avg = matches.reduce((sum, m) => sum + m.demand, 0) / matches.length;
  console.log("\nAverage:", avg.toFixed(0), "MW");
}

// Also check what the first forecast output is
console.log("\n--- Checking forecast output ---");
const fs = require("fs");
const forecastContent = fs.readFileSync("./output/DemandHr_FCast_Nov2025_v6.csv", "utf8");
const lines = forecastContent.split("\n").slice(0, 15);
for (const line of lines) {
  console.log(line);
}
