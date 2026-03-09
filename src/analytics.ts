// Telemetry is fully disabled by product requirement.
// This module intentionally keeps the same public API as before,
// but all functions are strict no-ops.

export type SetupAction = "verify_key" | "save_config" | "complete";
export type SettingsAction =
  | "verify_key"
  | "save_provider"
  | "save_channel"
  | "save_kimi"
  | "save_kimi_search"
  | "save_advanced";

type AnalyticsErrorType = "validation" | "auth" | "timeout" | "network" | "io" | "unknown";

interface TrackActionResultOptions {
  success: boolean;
  latencyMs: number;
  errorType?: AnalyticsErrorType;
  props?: Record<string, unknown>;
}

export function init(): void {
  // no-op
}

export function track(_event: string, _eventProps: object = {}): void {
  // no-op
}

export function classifyErrorType(_input: unknown): AnalyticsErrorType {
  return "unknown";
}

export function trackSetupActionStarted(
  _action: SetupAction,
  _props: Record<string, unknown> = {},
): void {
  // no-op
}

export function trackSetupActionResult(
  _action: SetupAction,
  _options: TrackActionResultOptions,
): void {
  // no-op
}

export function trackSetupAbandoned(_props: Record<string, unknown> = {}): void {
  // no-op
}

export function trackSettingsActionStarted(
  _action: SettingsAction,
  _props: Record<string, unknown> = {},
): void {
  // no-op
}

export function trackSettingsActionResult(
  _action: SettingsAction,
  _options: TrackActionResultOptions,
): void {
  // no-op
}

export async function shutdown(): Promise<void> {
  // no-op
}
