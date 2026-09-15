import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import {
  type CapturedRequest,
  captureRequest,
  normalizeHeaders,
} from "../capture/capture.js";
import type { Sink } from "../sink.js";

// Thin adapter for connect/express and the raw node:http server. It normalizes
// the request, ensures a stable first-party session id, and captures on
// "finish" (when status and size are known). It never blocks the response and
// swallows sink errors - instrumentation must not affect the app it measures.

const SID_COOKIE = "foyer_sid";

function firstForwarded(req: IncomingMessage): string {
  const xff = req.headers["x-forwarded-for"];
  const value = Array.isArray(xff) ? xff[0] : xff;
  if (value) return value.split(",")[0].trim();
  return req.socket.remoteAddress ?? "unknown";
}

function readCookie(req: IncomingMessage, name: string): string | null {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === name) return rest.join("=");
  }
  return null;
}

// Read foyer_sid, or mint one and set it as a first-party cookie.
export function ensureSessionId(
  req: IncomingMessage,
  res: ServerResponse,
): string {
  const existing = readCookie(req, SID_COOKIE);
  if (existing) return existing;
  const sid = randomUUID();
  const cookie = `${SID_COOKIE}=${sid}; Path=/; SameSite=Lax; HttpOnly`;
  const prior = res.getHeader("Set-Cookie");
  const next = Array.isArray(prior)
    ? [...prior, cookie]
    : prior
      ? [String(prior), cookie]
      : cookie;
  res.setHeader("Set-Cookie", next);
  return sid;
}

export interface MiddlewareOptions {
  sessionId?: (req: IncomingMessage, res: ServerResponse) => string;
}

type Next = (err?: unknown) => void;

export function foyerMiddleware(sink: Sink, opts: MiddlewareOptions = {}) {
  const getSessionId = opts.sessionId ?? ensureSessionId;

  return (req: IncomingMessage, res: ServerResponse, next: Next): void => {
    const timestampMs = Date.now();
    const sessionId = getSessionId(req, res);

    res.on("finish", () => {
      const lengthHeader = res.getHeader("content-length");
      const bytes =
        typeof lengthHeader === "string"
          ? Number.parseInt(lengthHeader, 10) || 0
          : typeof lengthHeader === "number"
            ? lengthHeader
            : 0;

      const captured: CapturedRequest = {
        method: req.method ?? "GET",
        path: req.url ?? "/",
        headers: normalizeHeaders(req.headers),
        ip: firstForwarded(req),
        timestampMs,
        status: res.statusCode,
        bytes,
        sessionId,
        httpVersion: req.httpVersion ?? null,
      };

      Promise.resolve(sink.write(captureRequest(captured))).catch(() => {
        /* never surface analytics failures into the request path */
      });
    });

    next();
  };
}
