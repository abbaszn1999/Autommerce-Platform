import { describe, expect, it } from "vitest";
import { formatIdInput } from "./ga-connect";

describe("formatIdInput", () => {
  it("adds the dashes while typing", () => {
    expect(formatIdInput("204")).toBe("204");
    expect(formatIdInput("2046")).toBe("204-6");
    expect(formatIdInput("2046362164")).toBe("204-636-2164");
  });

  it("keeps only the ID from pasted text, with or without dashes or spaces", () => {
    expect(formatIdInput("Customer ID: 204-636-2164 (Kalema)")).toBe("204-636-2164");
    expect(formatIdInput("204 636 2164")).toBe("204-636-2164");
    expect(formatIdInput("20463621649999")).toBe("204-636-2164");
    expect(formatIdInput("abc")).toBe("");
  });
});
