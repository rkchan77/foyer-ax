import { describe, expect, it } from "vitest";
import * as pkg from "../src/index.js";
import * as node from "../src/node.js";

describe("public API surface", () => {
  it("is exported", () => {
    for (const name of [
      "captureRequest",
      "classifySignals",
      "beaconScript",
      "parseBeacon",
      "mergeSessionSignals",
      "MemorySink",
    ]) {
      expect(pkg).toHaveProperty(name);
    }
    expect(node).toHaveProperty("foyerMiddleware");
  });
});
