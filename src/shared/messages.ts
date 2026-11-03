export const PORT_NAME = "page-speaker:v1";
export const RATES = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2] as const;
export type Rate = typeof RATES[number];
export const STATES = ["Starting", "Playing", "Paused", "Stopped", "Finished", "Error"] as const;
export type PlaybackState = typeof STATES[number];

export const ERROR_MESSAGES = {
  INVALID_MESSAGE: "This control request is invalid. Try again.",
  STALE_SOURCE: "The page changed. Select a starting point in the current article.",
  STALE_SESSION: "This reading session has ended. Select a new starting point.",
  INVALID_STATE: "That control is not available in the current playback state.",
  EMPTY_TEXT: "No readable article text remains at this starting point.",
  REQUEST_SUPERSEDED: "A newer reading request replaced this one.",
  NO_LOCAL_VOICE: "No suitable local voice is available. Install or enable a local voice for this language, then try again.",
  VOICE_UNAVAILABLE: "The local voice is no longer available. Enable it and select a starting point again.",
  SPEECH_ERROR: "Speech was interrupted or failed. Check your local voice and try a new selection.",
  SPEECH_TIMEOUT: "The speech engine did not respond. Check your local voice and try a new selection.",
  SESSION_INTERRUPTED: "The reading session was interrupted. Select a starting point to read again.",
} as const;
export type ErrorCode = keyof typeof ERROR_MESSAGES;
export interface ReaderError { code: ErrorCode; message: string }
export function readerError(code: ErrorCode): ReaderError { return { code, message: ERROR_MESSAGES[code] }; }
export interface Snapshot {
  sessionId: string;
  revision: number;
  state: PlaybackState;
  rate: Rate;
  reason?: string;
  error?: ReaderError;
}
export function isActive(state: PlaybackState) {
  return state === "Starting" || state === "Playing" || state === "Paused";
}
export type RequestInput =
  | { kind: "START"; text: string; lang: string }
  | { kind: "PAUSE" | "RESUME" | "STOP"; sessionId: string }
  | { kind: "SET_RATE"; sessionId: string; rate: Rate }
  | { kind: "CANCEL_START"; targetRequestId: string }
  | { kind: "INVALIDATE_SOURCE"; reason: "pagehide" | "article-replaced" };
export type ClientRequest = RequestInput & { v: 1; requestId: string; workerId: string; sourceEpoch: number };
export interface RecoveryRequest {
  v: 1; kind: "RECOVER_CONNECTION"; requestId: string;
  previousWorkerId: string; previousSessionId?: string;
}
export type ServerMessage = { v: 1; workerId: string } & (
  | { kind: "WELCOME"; sourceEpoch: number; state: "Idle" }
  | ({ kind: "START_ACCEPTED"; requestId: string; sourceEpoch: number } & Snapshot)
  | { kind: "ACK"; requestId: string; sourceEpoch: number; snapshot?: Snapshot }
  | { kind: "REJECTED"; requestId: string; code: ErrorCode; message: string }
  | ({ kind: "STATE"; sourceEpoch: number } & Snapshot)
  | { kind: "SOURCE_RESET"; sourceEpoch: number; reason: string }
  | { kind: "RECOVERED"; requestId: string }
);
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function id(value: unknown): value is string { return typeof value === "string" && value.length > 0 && value.length <= 128; }
function integer(value: unknown): value is number { return typeof value === "number" && Number.isSafeInteger(value) && value >= 0; }
export function isRate(value: unknown): value is Rate { return RATES.some(rate => rate === value); }
export function isErrorCode(value: unknown): value is ErrorCode {
  return typeof value === "string" && Object.hasOwn(ERROR_MESSAGES, value);
}
function isSnapshot(value: Record<string, unknown>): boolean {
  return id(value.sessionId) && integer(value.revision) && STATES.some(state => state === value.state)
    && isRate(value.rate) && (value.reason === undefined || typeof value.reason === "string")
    && (value.error === undefined || (isRecord(value.error) && isErrorCode(value.error.code)
      && value.error.message === ERROR_MESSAGES[value.error.code]));
}
export function isClientRequest(value: unknown): value is ClientRequest {
  if (!isRecord(value) || value.v !== 1 || !id(value.requestId) || !id(value.workerId) || !integer(value.sourceEpoch)) return false;
  switch (value.kind) {
    case "START": return typeof value.text === "string" && typeof value.lang === "string" && value.lang.length <= 80;
    case "PAUSE": case "RESUME": case "STOP": return id(value.sessionId);
    case "SET_RATE": return id(value.sessionId) && isRate(value.rate);
    case "CANCEL_START": return id(value.targetRequestId);
    case "INVALIDATE_SOURCE": return value.reason === "pagehide" || value.reason === "article-replaced";
    default: return false;
  }
}
export function isRecoveryRequest(value: unknown): value is RecoveryRequest {
  return isRecord(value) && value.v === 1 && value.kind === "RECOVER_CONNECTION"
    && id(value.requestId) && id(value.previousWorkerId)
    && (value.previousSessionId === undefined || id(value.previousSessionId));
}
export function isServerMessage(value: unknown): value is ServerMessage {
  if (!isRecord(value) || value.v !== 1 || !id(value.workerId)) return false;
  switch (value.kind) {
    case "WELCOME": return integer(value.sourceEpoch) && value.state === "Idle";
    case "START_ACCEPTED": return id(value.requestId) && integer(value.sourceEpoch) && isSnapshot(value) && value.state === "Starting" && value.rate === 1;
    case "STATE": return integer(value.sourceEpoch) && isSnapshot(value);
    case "SOURCE_RESET": return integer(value.sourceEpoch) && typeof value.reason === "string";
    case "ACK": return id(value.requestId) && integer(value.sourceEpoch)
      && (value.snapshot === undefined || (isRecord(value.snapshot) && isSnapshot(value.snapshot)));
    case "REJECTED": return id(value.requestId) && isErrorCode(value.code) && value.message === ERROR_MESSAGES[value.code];
    case "RECOVERED": return id(value.requestId);
    default: return false;
  }
}
