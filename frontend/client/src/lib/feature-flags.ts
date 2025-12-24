/**
 * Feature flags for MVPulse
 * Uses localStorage for persistence across sessions
 */

export const FEATURE_FLAGS = {
  /** Use indexer optimization for faster data retrieval */
  USE_INDEXER_OPTIMIZATION: 'mvpulse-use-indexer-optimization',
} as const;

/**
 * Get a feature flag value from localStorage
 * @param flag - The feature flag key
 * @param defaultValue - Default value if not set (defaults to false)
 */
export function getFeatureFlag(flag: string, defaultValue: boolean = false): boolean {
  if (typeof window === 'undefined') return defaultValue;
  const stored = localStorage.getItem(flag);
  return stored !== null ? stored === 'true' : defaultValue;
}

/**
 * Set a feature flag value in localStorage
 * @param flag - The feature flag key
 * @param value - The value to set
 */
export function setFeatureFlag(flag: string, value: boolean): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(flag, value.toString());
}

/**
 * Check if indexer optimization is enabled
 * This enables:
 * - Parallel RPC calls for poll fetching
 * - React Query caching (60s stale time)
 * - GraphQL indexer for vote/claim status checks
 */
export function isIndexerOptimizationEnabled(): boolean {
  return getFeatureFlag(FEATURE_FLAGS.USE_INDEXER_OPTIMIZATION, false);
}

/**
 * Set indexer optimization enabled/disabled
 */
export function setIndexerOptimizationEnabled(enabled: boolean): void {
  setFeatureFlag(FEATURE_FLAGS.USE_INDEXER_OPTIMIZATION, enabled);
}
