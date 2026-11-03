import {
  readerError, isActive, type ClientRequest, type ErrorCode, type PlaybackState,
  type Rate, type Snapshot,
} from "../shared/messages";
import { segmentSpeech, type SpeechSegment } from "../shared/speech-segments";
import { send, sourceIsCurrent, type SourceBinding } from "./source-lifecycle";

interface LocalVoice {
  voiceName: string; lang: string; remote: false; extensionId?: string;
}
interface PendingStart {
  source: SourceBinding; epoch: number; requestId: string; text: string; lang: string;
}
interface Session {
  source: SourceBinding; epoch: number; id: string; generation: number; revision: number;
  state: PlaybackState; segments: SpeechSegment[]; segmentIndex: number;
  voice: LocalVoice; rate: Rate; utteranceRate: Rate;
  utteranceToken: string | null; submitting: boolean;
  lifetimeTimer: ReturnType<typeof setInterval>;
  startTimer?: ReturnType<typeof setTimeout>;
  progressTimer?: ReturnType<typeof setTimeout>;
  progressRemaining: number; progressDeadline: number;
}
class PlaybackFailure extends Error {
  constructor(readonly code: ErrorCode) { super(code); }
}
function normalizedLanguage(lang: string) {
  try { return new Intl.Locale(lang || "en").toString().toLowerCase(); }
  catch { throw new PlaybackFailure("NO_LOCAL_VOICE"); }
}
function eligible(voice: chrome.tts.TtsVoice, voices: chrome.tts.TtsVoice[]): voice is chrome.tts.TtsVoice & LocalVoice {
  return voice.remote === false && Boolean(voice.voiceName?.trim()) && Boolean(voice.lang)
    && Boolean(voice.eventTypes?.includes("start") && voice.eventTypes.includes("end"))
    && !voices.some(other => other.voiceName === voice.voiceName
      && (!voice.extensionId || other.extensionId === voice.extensionId) && other.remote !== false);
}
function selectVoice(voices: chrome.tts.TtsVoice[], language: string): LocalVoice {
  const lang = normalizedLanguage(language);
  const base = lang.split("-")[0];
  const choices = voices.filter(voice => eligible(voice, voices))
    .filter(voice => voice.lang.toLowerCase().split("-")[0] === base)
    .sort((a, b) => Number(b.lang.toLowerCase() === lang) - Number(a.lang.toLowerCase() === lang)
      || a.voiceName.localeCompare(b.voiceName) || (a.extensionId ?? "").localeCompare(b.extensionId ?? ""));
  const voice = choices[0];
  if (!voice) throw new PlaybackFailure("NO_LOCAL_VOICE");
  return { voiceName: voice.voiceName, lang: voice.lang, extensionId: voice.extensionId, remote: false };
}
function sameVoice(a: LocalVoice, b: chrome.tts.TtsVoice) {
  return a.voiceName === b.voiceName && a.extensionId === b.extensionId && a.lang === b.lang;
}

export class PlaybackController {
  private pending: PendingStart | null = null;
  private current: Session | null = null;
  constructor(readonly workerId: string) {}

  reject(source: SourceBinding, requestId: string, code: ErrorCode) {
    send(source, { v: 1, kind: "REJECTED", workerId: this.workerId, requestId, ...readerError(code) });
  }
  private snapshot(session: Session): Snapshot {
    return { sessionId: session.id, revision: session.revision, state: session.state, rate: session.rate };
  }
  private publish(session: Session) {
    session.revision++;
    send(session.source, { v: 1, kind: "STATE", workerId: this.workerId,
      sourceEpoch: session.epoch, ...this.snapshot(session) });
  }
  private ack(source: SourceBinding, requestId: string, snapshot?: Snapshot) {
    send(source, { v: 1, kind: "ACK", workerId: this.workerId,
      sourceEpoch: source.sourceEpoch, requestId, snapshot });
  }
  private cancelPending(code: ErrorCode) {
    const pending = this.pending;
    if (!pending) return;
    this.pending = null;
    pending.text = "";
    this.reject(pending.source, pending.requestId, code);
  }
  start(source: SourceBinding, request: Extract<ClientRequest, { kind: "START" }>) {
    if (this.pending?.source === source && this.pending.requestId === request.requestId) return;
    if (!request.text.trim()) { this.reject(source, request.requestId, "EMPTY_TEXT"); return; }
    this.cancelPending("REQUEST_SUPERSEDED");
    const pending: PendingStart = { source, epoch: source.sourceEpoch, requestId: request.requestId,
      text: request.text, lang: request.lang };
    this.pending = pending;
    void this.prepare(pending);
  }
  private async prepare(pending: PendingStart) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const voices = await Promise.race([
        chrome.tts.getVoices(),
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => reject(new PlaybackFailure("SPEECH_TIMEOUT")), 5000);
        }),
      ]);
      if (timer) clearTimeout(timer);
      if (this.pending !== pending) return;
      const voice = selectVoice(voices, pending.lang);
      if (!await sourceIsCurrent(pending.source, pending.epoch)) throw new PlaybackFailure("STALE_SOURCE");
      if (this.pending !== pending || !pending.source.connected || pending.source.sourceEpoch !== pending.epoch) return;
      const segments = segmentSpeech(pending.text, voice.lang);
      pending.text = "";
      if (!segments.length) throw new PlaybackFailure("EMPTY_TEXT");
      this.pending = null;
      if (this.current) this.finish(this.current, "Stopped", undefined, "replaced");
      pending.source.terminal = undefined;
      const session: Session = {
        source: pending.source, epoch: pending.epoch, id: crypto.randomUUID(), generation: 0, revision: 0,
        state: "Starting", segments, segmentIndex: 0, voice, rate: 1, utteranceRate: 1,
        utteranceToken: null, submitting: false, progressRemaining: 120000, progressDeadline: 0,
        lifetimeTimer: setInterval(() => {
          if (this.current === session) void chrome.runtime.getPlatformInfo().catch(() => this.finish(session, "Error", "SESSION_INTERRUPTED"));
        }, 20000),
      };
      this.current = session;
      send(session.source, { v: 1, kind: "START_ACCEPTED", workerId: this.workerId,
        requestId: pending.requestId, sourceEpoch: session.epoch, ...this.snapshot(session) });
      void this.submit(session);
    } catch (error: unknown) {
      if (this.pending === pending) {
        this.pending = null;
        this.reject(pending.source, pending.requestId, error instanceof PlaybackFailure ? error.code : "SPEECH_ERROR");
      }
    } finally { if (timer) clearTimeout(timer); pending.text = ""; }
  }
  private currentToken(session: Session, generation: number, token: string) {
    return this.current === session && session.generation === generation && session.utteranceToken === token;
  }
  private clearWatchdogs(session: Session) {
    if (session.startTimer) clearTimeout(session.startTimer);
    if (session.progressTimer) clearTimeout(session.progressTimer);
    session.startTimer = undefined;
    session.progressTimer = undefined;
  }
  private armProgress(session: Session) {
    if (session.progressTimer) clearTimeout(session.progressTimer);
    session.progressDeadline = Date.now() + session.progressRemaining;
    session.progressTimer = setTimeout(() => this.finish(session, "Error", "SPEECH_TIMEOUT"), session.progressRemaining);
  }
  private async submit(session: Session) {
    if (this.current !== session || ["Paused"].includes(session.state) || session.submitting || session.utteranceToken) return;
    if (session.segmentIndex >= session.segments.length) { this.finish(session, "Finished"); return; }
    session.submitting = true;
    const generation = session.generation;
    session.startTimer = setTimeout(() => this.finish(session, "Error", "SPEECH_TIMEOUT"), 5000);
    try {
      const voices = await chrome.tts.getVoices();
      const local = voices.find(voice => sameVoice(session.voice, voice) && eligible(voice, voices));
      if (this.current !== session || session.generation !== generation) return;
      if (!local) throw new PlaybackFailure("VOICE_UNAVAILABLE");
      if (!await sourceIsCurrent(session.source, session.epoch)) {
        this.finish(session, "Stopped", undefined, "navigation"); return;
      }
      if (this.current !== session || session.generation !== generation) return;
      if (session.state === "Paused") { this.clearWatchdogs(session); return; }
      const segment = session.segments[session.segmentIndex];
      if (!segment) { this.finish(session, "Finished"); return; }
      const token = crypto.randomUUID();
      session.utteranceToken = token;
      session.utteranceRate = session.rate;
      session.progressRemaining = 120000;
      void chrome.tts.speak(segment.text, {
        voiceName: session.voice.voiceName, extensionId: session.voice.extensionId, lang: session.voice.lang,
        rate: session.utteranceRate, enqueue: false, requiredEventTypes: ["start", "end"],
        onEvent: event => {
          if (!this.currentToken(session, generation, token)) return;
          switch (event.type) {
            case "start":
              if (session.startTimer) clearTimeout(session.startTimer);
              session.startTimer = undefined;
              if (session.state === "Paused") { chrome.tts.pause(); }
              else { session.state = "Playing"; this.armProgress(session); this.publish(session); }
              break;
            case "end":
              this.clearWatchdogs(session);
              session.utteranceToken = null;
              session.segmentIndex++;
              if (session.state !== "Paused") queueMicrotask(() => { void this.submit(session); });
              break;
            case "error": case "interrupted": case "cancelled":
              this.finish(session, "Error", "SPEECH_ERROR"); break;
          }
        },
      }).catch(() => {
        if (this.currentToken(session, generation, token)) this.finish(session, "Error", "SPEECH_ERROR");
      });
    } catch (error: unknown) {
      if (this.current === session && session.generation === generation) {
        this.finish(session, "Error", error instanceof PlaybackFailure ? error.code : "SPEECH_ERROR");
      }
    } finally { session.submitting = false; }
  }
  private finish(session: Session, state: "Stopped" | "Finished" | "Error", code?: ErrorCode, reason?: string) {
    if (this.current !== session) return;
    this.current = null;
    session.generation++;
    session.utteranceToken = null;
    this.clearWatchdogs(session);
    clearInterval(session.lifetimeTimer);
    try { chrome.tts.stop(); }
    catch { state = "Error"; code = "SPEECH_ERROR"; }
    session.segments.length = 0;
    session.segmentIndex = 0;
    session.state = state;
    session.revision++;
    const snapshot: Snapshot = { ...this.snapshot(session), reason, error: code ? readerError(code) : undefined };
    session.source.terminal = snapshot;
    send(session.source, { v: 1, kind: "STATE", workerId: this.workerId, sourceEpoch: session.epoch, ...snapshot });
  }
  invalidate(source: SourceBinding, reason: string) {
    if (this.pending?.source === source) this.cancelPending("STALE_SOURCE");
    if (this.current?.source === source) this.finish(this.current, "Stopped", undefined, reason);
  }
  recover(tabId: number, documentId: string, previousWorkerId: string, sessionId?: string) {
    const session = this.current;
    if (previousWorkerId === this.workerId && session && session.id === sessionId
      && session.source.tabId === tabId && session.source.documentId === documentId) {
      this.finish(session, "Error", "SESSION_INTERRUPTED");
    }
  }
  handle(source: SourceBinding, request: Exclude<ClientRequest, { kind: "START" | "INVALIDATE_SOURCE" }>) {
    if (request.kind === "CANCEL_START") {
      if (this.pending?.source === source && this.pending.requestId === request.targetRequestId) this.cancelPending("REQUEST_SUPERSEDED");
      this.ack(source, request.requestId); return;
    }
    const session = this.current;
    if (!session || session.source !== source || session.epoch !== source.sourceEpoch || session.id !== request.sessionId) {
      if (request.kind === "STOP" && source.terminal?.sessionId === request.sessionId) this.ack(source, request.requestId, source.terminal);
      else this.reject(source, request.requestId, "STALE_SESSION");
      return;
    }
    switch (request.kind) {
      case "STOP":
        if (this.pending?.source === source) this.cancelPending("REQUEST_SUPERSEDED");
        this.finish(session, "Stopped");
        this.ack(source, request.requestId, source.terminal); return;
      case "PAUSE":
        if (session.state !== "Playing") break;
        session.state = "Paused";
        try { if (session.utteranceToken) chrome.tts.pause(); }
        catch { this.finish(session, "Error", "SPEECH_ERROR"); return; }
        if (session.progressTimer) {
          session.progressRemaining = Math.max(1, session.progressDeadline - Date.now());
          clearTimeout(session.progressTimer);
          session.progressTimer = undefined;
        }
        if (session.startTimer) { clearTimeout(session.startTimer); session.startTimer = undefined; }
        this.publish(session);
        this.ack(source, request.requestId, this.snapshot(session)); return;
      case "RESUME":
        if (session.state !== "Paused") break;
        session.state = "Playing";
        if (session.utteranceToken) {
          try { chrome.tts.resume(); this.armProgress(session); }
          catch { this.finish(session, "Error", "SPEECH_ERROR"); return; }
        }
        else void this.submit(session);
        this.publish(session);
        this.ack(source, request.requestId, this.snapshot(session)); return;
      case "SET_RATE":
        if (session.state !== "Playing" && session.state !== "Paused") break;
        session.rate = request.rate;
        this.publish(session);
        this.ack(source, request.requestId, this.snapshot(session)); return;
    }
    this.reject(source, request.requestId, "INVALID_STATE");
  }
  get active() { return this.current ? isActive(this.current.state) : false; }
}
