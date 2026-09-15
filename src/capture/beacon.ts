import type { ClientSignal } from "../events.js";

// The client-side probe. The server sees headers and timing; only code running
// in the page can tell whether JS executed at all and whether a human-shaped
// stream of pointer/scroll/key events occurred. Crucially, the strongest signal
// is silence: if this script is served but the server never receives a
// ClientSignal for the session, the client did not run JS — a fetch/read agent.

// Returns an inline <script> body. Serve it on pages you want to instrument,
// substituting the session id you set server-side (see node/adapters.ts).
// It counts interaction events and POSTs a ClientSignal via sendBeacon when the
//  page is hidden or unloaded — the last moment we can still fire reliably.
export function beaconScript(endpoint: string, sessionId: string): string {
  const cfg = JSON.stringify({ endpoint, sessionId });
  return `(function(){
  var C=${cfg},t0=performance.now(),first=null;
  var pm=0,sc=0,kd=0,hidden=document.visibilityState!=="visible";
  function mark(){ if(first===null) first=Math.round(performance.now()-t0); }
  addEventListener("pointermove",function(){pm++;mark();},{passive:true});
  addEventListener("scroll",function(){sc++;mark();},{passive:true});
  addEventListener("keydown",function(){kd++;mark();},{passive:true});
  document.addEventListener("visibilitychange",function(){ if(document.visibilityState!=="visible") hidden=true; });
  function send(){
    var body=JSON.stringify({
      sessionId:C.sessionId, ts:Date.now(),
      webdriver:!!navigator.webdriver,
      pointerMoves:pm, scrolls:sc, keyDowns:kd,
      firstInteractionMs:first,
      visibilityHidden:hidden,
      viewport:{w:innerWidth,h:innerHeight},
      dpr:devicePixelRatio||1,
      languages:(navigator.languages||[]).length,
      hardwareConcurrency:navigator.hardwareConcurrency||0
    });
    try{ navigator.sendBeacon(C.endpoint, body); }catch(e){}
  }
  addEventListener("visibilitychange",function(){ if(document.visibilityState==="hidden") send(); });
  addEventListener("pagehide",send);
})();`;
}

// Server-side receiver. Validates the untrusted POST body into a ClientSignal.
// Returns null on anything malformed rather than throwing

function num(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

export function parseBeacon(bodyText: string): ClientSignal | null {
  let raw: unknown;
  try {
    raw = JSON.parse(bodyText);
  } catch {
    return null;
  }
  if (typeof raw !== "object" || raw === null) return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.sessionId !== "string" || o.sessionId.length === 0) return null;

  const vp = (o.viewport ?? {}) as Record<string, unknown>;
  const fi = o.firstInteractionMs;

  return {
    sessionId: o.sessionId,
    ts: num(o.ts, Date.now()),
    webdriver: o.webdriver === true,
    pointerMoves: num(o.pointerMoves, 0),
    scrolls: num(o.scrolls, 0),
    keyDowns: num(o.keyDowns, 0),
    firstInteractionMs:
      typeof fi === "number" && Number.isFinite(fi) ? fi : null,
    visibilityHidden: o.visibilityHidden === true,
    viewport: { w: num(vp.w, 0), h: num(vp.h, 0) },
    dpr: num(o.dpr, 1),
    languages: num(o.languages, 0),
    hardwareConcurrency: num(o.hardwareConcurrency, 0),
  };
}
