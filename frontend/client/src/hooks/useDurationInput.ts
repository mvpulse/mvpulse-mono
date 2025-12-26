/**
 * useDurationInput - Hook for managing duration input state
 *
 * Supports two modes:
 * - "fixed": Predefined duration options (1h, 24h, 3d, 1w)
 * - "custom": Custom start and end datetime inputs
 */

import { useState, useMemo } from "react";

// Duration options in seconds
export const DURATION_OPTIONS = {
  "1h": 3600,
  "24h": 86400,
  "3d": 259200,
  "1w": 604800,
} as const;

export type DurationKey = keyof typeof DURATION_OPTIONS;
export type DurationMode = "fixed" | "custom";

// Helper to round time to nearest 15 minutes (rounding up)
function roundTo15Minutes(date: Date): Date {
  const result = new Date(date);
  const minutes = result.getMinutes();
  const roundedMinutes = Math.ceil(minutes / 15) * 15;
  result.setMinutes(roundedMinutes, 0, 0);
  return result;
}

// Format date for datetime-local input (YYYY-MM-DDTHH:mm)
function formatDateTimeLocal(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

export interface UseDurationInputReturn {
  mode: DurationMode;
  setMode: (mode: DurationMode) => void;
  fixedDuration: DurationKey;
  setFixedDuration: (duration: DurationKey) => void;
  startDate: string;
  setStartDate: (date: string) => void;
  endDate: string;
  setEndDate: (date: string) => void;
  /** Duration in seconds (computed based on mode) */
  durationSecs: number;
  /** Start timestamp in seconds (for custom mode) */
  startTimestamp: number;
  /** End timestamp in seconds (for custom mode) */
  endTimestamp: number;
}

export function useDurationInput(
  initialMode: DurationMode = "fixed"
): UseDurationInputReturn {
  const [mode, setMode] = useState<DurationMode>(initialMode);
  const [fixedDuration, setFixedDuration] = useState<DurationKey>("24h");

  const [startDate, setStartDate] = useState(() => {
    const now = roundTo15Minutes(new Date());
    return formatDateTimeLocal(now);
  });

  const [endDate, setEndDate] = useState(() => {
    const tomorrow = roundTo15Minutes(new Date());
    tomorrow.setDate(tomorrow.getDate() + 1);
    return formatDateTimeLocal(tomorrow);
  });

  // Compute timestamps
  const startTimestamp = useMemo(() => {
    return Math.floor(new Date(startDate).getTime() / 1000);
  }, [startDate]);

  const endTimestamp = useMemo(() => {
    return Math.floor(new Date(endDate).getTime() / 1000);
  }, [endDate]);

  // Compute duration in seconds based on mode
  const durationSecs = useMemo(() => {
    if (mode === "fixed") {
      return DURATION_OPTIONS[fixedDuration];
    }
    return Math.max(0, endTimestamp - startTimestamp);
  }, [mode, fixedDuration, startTimestamp, endTimestamp]);

  return {
    mode,
    setMode,
    fixedDuration,
    setFixedDuration,
    startDate,
    setStartDate,
    endDate,
    setEndDate,
    durationSecs,
    startTimestamp,
    endTimestamp,
  };
}

export default useDurationInput;
