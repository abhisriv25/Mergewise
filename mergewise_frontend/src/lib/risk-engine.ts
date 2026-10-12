/** The backend's deterministic risk engine, run in the browser. Same rules,
 * same points, same version: imported, not copied (see vite.config.ts). */
export { calculateRiskScore, calculateRiskSignals } from "@risk-engine/risk-engine";
export type { RiskInput, RiskSignal as EngineSignal } from "@risk-engine/risk-engine";
export { RISK_ENGINE_VERSION } from "@risk-engine/risk-rules.config";
