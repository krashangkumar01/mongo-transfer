// src/lib/features.js

/**
 * Helper to determine boolean state from environment variables
 */
function parseBoolEnv(val, defaultVal = true) {
  if (val === undefined || val === null || val === "") return defaultVal;
  const lower = String(val).toLowerCase().trim();
  return lower === "true" || lower === "1" || lower === "yes" || lower === "enabled";
}

/**
 * Get current status of all feature flags
 * Supports both standard server ENV (ENABLE_...) and client-accessible ENV (NEXT_PUBLIC_ENABLE_...)
 */
export function getFeatureStatus() {
  return {
    transfer: parseBoolEnv(
      process.env.ENABLE_TRANSFER ?? process.env.NEXT_PUBLIC_ENABLE_TRANSFER,
      true
    ),
    backup: parseBoolEnv(
      process.env.ENABLE_BACKUP ?? process.env.NEXT_PUBLIC_ENABLE_BACKUP,
      true
    ),
    delete: parseBoolEnv(
      process.env.ENABLE_DELETE ?? process.env.NEXT_PUBLIC_ENABLE_DELETE,
      true
    ),
  };
}

