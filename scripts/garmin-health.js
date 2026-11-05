// Support the Personal API shapes observed in production and the older DTO wrapper.
// Return only valid, present values so partial responses never erase stored metrics.
export function healthMetrics(raw) {
  const sleep = raw.sleep?.dailySleepDTO ?? raw.sleep;
  const hrv = raw.hrv?.hrvSummary;
  const daily = Array.isArray(raw.daily?.data) ? raw.daily.data[0] : null;
  const seconds = sleep?.sleepTimeSeconds;
  const hrvValue = hrv?.lastNightAvg;
  const resting = daily?.heartRate?.restingValue ?? daily?.restingHeartRate;
  const valid = (value, min, max) =>
    typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
  return {
    ...(valid(seconds, 0, 86400) ? { sleep_hours: seconds / 3600 } : {}),
    ...(valid(hrvValue, 1, 1000) ? { hrv: hrvValue } : {}),
    ...(valid(resting, 20, 250) ? { resting_hr: resting } : {}),
  };
}
