import { type RequestRecord, type LogFormat } from "./types.js";
import { Methods } from "./constants.js";

export function parseLine(line: string, format: LogFormat): RequestRecord | null {
  if (!line.trim()) return null;
  return format === "nginx" ? parseNginxLine(line) : parseJsonLine(line);
}

export function parseNginxLine(line: string): RequestRecord | null {
  const lineInfo: string[] = [];
  let openQuote: boolean = false;
  let currentLine: string = "";

  for (const char of line) {
    // Handle char parsing
    switch(char) {
      case " ":
        if (!currentLine || openQuote) {
          currentLine += char;
          break;
        }

        lineInfo.push(currentLine);
        currentLine = "";
        break;
      case "[":
      case "]": 
      case '"':
        openQuote = !openQuote;
        break; 
      default: 
        currentLine += char;
        break;
    } 
  }

  if (currentLine) {
    lineInfo.push(currentLine);
  }

  const [ip, , , rawTime, request, rawStatus, rawBytes, rawReferer, userAgent] = lineInfo;

  if (lineInfo.length !== 9) return null;

  // Check if the date is valid
  const dateTimeString = rawTime.replace(" ", "");
  const index = dateTimeString.indexOf(":");
  const dayString = dateTimeString.slice(0, index);
  const [day, month, year] = dayString.split("/");
  const time = dateTimeString.slice(index + 1);
  const isoString = `${day} ${month} ${year} ${time}`;
  const dateTime = new Date(isoString);
  if (isNaN(dateTime.getTime())) {
    console.log("Invalid date, skipping:", rawTime);
    return null;
  }

  const dateTimeMs = dateTime.getTime();

  // Parse request
  const parts = request.split(" ");

  const method = parts[0];
  const endpoint = parts.slice(1, -1).join(" ");

  if (!Methods.has(method)) {
    console.log("Invalid HTTP method, skipping:", method);
    return null;
  }

  if (!endpoint.startsWith("/")) {
    console.log("Invalid endpoint, skipping:", endpoint);
    return null;
  }

  const status = Number(rawStatus);
  if (isNaN(status) || status < 100 || status > 599) {
    console.log("Invalid HTTP status code, skipping:", rawStatus);
    return null;
  }

  const bytes = rawBytes === "-" ? 0 : Number(rawBytes);
  if (isNaN(bytes) || bytes < 0) {
    console.log("Invalid bytes value, skipping:", rawBytes);
    return null;
  }
  
  const referer = rawReferer === "-" ? null : rawReferer; 

  const requestRecord: RequestRecord = {
    ip,
    timestampMs: dateTimeMs,
    method,
    path: endpoint,
    status,
    bytes,
    referer,
    userAgent
  };

  return requestRecord;
}

export function parseJsonLine(line: string): RequestRecord | null {
  let record;

  try {
    record = JSON.parse(line);
  } catch {
    console.log("Line is not valid JSON, skipping:", line);
    return null;
  }

  if (!record.timestamp || !record.clientIp || !record.method || !record.path || !record.status || !record.bytes || !record.userAgent) {
    console.log("Missing required fields in JSON record, skipping:", line);
    return null;
  } 

  const timestampMs = new Date(record.timestamp).getTime();
  if (isNaN(timestampMs)) {
    console.log("Invalid timestamp in JSON record, skipping:", record.timestamp);
    return null;
  }

  const status = Number(record.status);
  if (isNaN(status) || status < 100 || status > 599) {
    console.log("Invalid HTTP status code, skipping:", record.status);
    return null;
  }

  const bytes = record.bytes === "-" ? 0 : Number(record.bytes);
  if (isNaN(bytes) || bytes < 0) {
    console.log("Invalid bytes value, skipping:", record.bytes);
    return null;
  }
  
  const referer = record.referer === "-" ? null : record.referer; 

  const requestRecord: RequestRecord = {
    ip: record.clientIp,
    timestampMs: timestampMs,
    method: record.method,
    path: record.path,
    status,
    bytes,
    referer: referer,
    userAgent: record.userAgent
  };

  return requestRecord;
}

export function parse(content: string, format: LogFormat): RequestRecord[] {
  const records: RequestRecord[] = [];
  for (const line of content.split("\n")) {
    const record = parseLine(line, format);
    if (record) records.push(record);
  }
  return records;
}
