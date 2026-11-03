import { RATES, isActive, isRate, type Rate, type Snapshot } from "../shared/messages";
import { Button } from "./components/button";
import { NativeSelect } from "./components/native-select";

export interface ReaderView {
  selection: { left: number; top: number } | null;
  snapshot: Snapshot | null;
  error: string | null;
  ready: boolean;
  pending: boolean;
}
export interface ReaderActions {
  start(): void;
  control(kind: "PAUSE" | "RESUME" | "STOP"): void;
  rate(rate: Rate): void;
}
export function ReaderControls({ view, actions }: { view: ReaderView; actions: ReaderActions }) {
  const snapshot = view.snapshot;
  const state = snapshot?.state;
  return <>
    <span className="ps-sr-only" role="status" aria-live="polite">
      {view.selection ? "Read from here is available. Tab to the Page Speaker button." : ""}
    </span>
    {view.selection && <Button className="ps-action" style={view.selection}
      disabled={!view.ready || view.pending} onClick={actions.start}>
      {view.pending ? "Preparing…" : "Read from here"}
    </Button>}
    {(snapshot || view.error || view.pending) && <section className="ps-panel" aria-label="Page Speaker reading controls">
      <h2 className="ps-heading">Page Speaker</h2>
      <p className="ps-status" role="status" aria-live="polite" aria-atomic="true">
        {state ?? (view.pending ? "Preparing reading…" : "Ready")}
        {snapshot?.reason === "replaced" ? " · Replaced by another session" : ""}
      </p>
      {!snapshot && !view.pending && <p className="ps-note">Select a starting point in the article to read.</p>}
      {snapshot && <>
        <div className="ps-buttons">
          <Button variant="outline" disabled={state !== "Playing"} onClick={() => actions.control("PAUSE")}>Pause</Button>
          <Button variant="outline" disabled={state !== "Paused"} onClick={() => actions.control("RESUME")}>Resume</Button>
          <Button variant="destructive" disabled={!isActive(snapshot.state)} onClick={() => actions.control("STOP")}>Stop</Button>
        </div>
        <div className="ps-speed">
          <label htmlFor="ps-rate">Reading speed</label>
          <NativeSelect id="ps-rate" value={snapshot.rate}
            disabled={state !== "Playing" && state !== "Paused"}
            onChange={event => { const rate = Number(event.target.value); if (isRate(rate)) actions.rate(rate); }}>
            {RATES.map(rate => <option key={rate} value={rate}>{rate}×</option>)}
          </NativeSelect>
        </div>
      </>}
      {view.error && <p className="ps-error" role="alert">{view.error}</p>}
    </section>}
  </>;
}
