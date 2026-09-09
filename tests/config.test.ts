import { describe, expect, it } from "vitest";
import { parseFlowConfig } from "../src/config.js";

describe("parseFlowConfig", () => {
  it("parses a well-formed flow list", () => {
    const flows = parseFlowConfig(
      JSON.stringify([
        {
          name: "checkout",
          steps: [{ path: "/cart" }, { method: "POST", path: "/api/order" }],
        },
      ]),
    );
    expect(flows).toHaveLength(1);
    expect(flows[0].name).toBe("checkout");
    expect(flows[0].steps).toHaveLength(2);
  });

  it("rejects invalid JSON", () => {
    expect(() => parseFlowConfig("not json")).toThrow(/not valid JSON/);
  });

  it("rejects a non-array document", () => {
    expect(() => parseFlowConfig(JSON.stringify({ name: "checkout" }))).toThrow(
      /expected a JSON array/,
    );
  });

  it("rejects a flow missing steps", () => {
    expect(() =>
      parseFlowConfig(JSON.stringify([{ name: "checkout" }])),
    ).toThrow(/checkout/);
  });

  it("rejects a step missing path", () => {
    expect(() =>
      parseFlowConfig(
        JSON.stringify([{ name: "checkout", steps: [{ method: "POST" }] }]),
      ),
    ).toThrow(/checkout/);
  });

  it("accepts a step with only a path (method optional)", () => {
    const flows = parseFlowConfig(
      JSON.stringify([{ name: "browse", steps: [{ path: "/product/*" }] }]),
    );
    expect(flows[0].steps[0].method).toBeUndefined();
  });
});
