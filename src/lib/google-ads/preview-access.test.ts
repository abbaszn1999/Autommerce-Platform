import { afterEach, describe, expect, it, vi } from "vitest";
import { hasPreviewAccess, isPreviewPassword, previewToken } from "./preview-access";

afterEach(() => vi.unstubAllEnvs());

describe("Google Ads preview access", () => {
  it("accepts only the password", () => {
    vi.stubEnv("GOOGLE_ADS_PREVIEW_PASSWORD", "correct horse");
    expect(isPreviewPassword("correct horse")).toBe(true);
    expect(isPreviewPassword("correct hors")).toBe(false);
    expect(isPreviewPassword("")).toBe(false);
    vi.stubEnv("GOOGLE_ADS_PREVIEW_PASSWORD", "another one");
    expect(isPreviewPassword("correct horse")).toBe(false);
    expect(isPreviewPassword("another one")).toBe(true);
  });

  it("has no default password", () => {
    vi.stubEnv("GOOGLE_ADS_PREVIEW_PASSWORD", "");
    expect(isPreviewPassword("12345678")).toBe(false);
    expect(isPreviewPassword("")).toBe(false);
    vi.stubEnv("INTEGRATION_ENCRYPTION_KEY", "k".repeat(32));
    expect(previewToken()).toBeNull();
  });

  it("opens only for the signed cookie, which a new password or secret invalidates", () => {
    vi.stubEnv("INTEGRATION_ENCRYPTION_KEY", "k".repeat(32));
    vi.stubEnv("GOOGLE_ADS_PREVIEW_PASSWORD", "first password");
    const token = previewToken()!;
    expect(hasPreviewAccess(token)).toBe(true);
    expect(hasPreviewAccess(undefined)).toBe(false);
    expect(hasPreviewAccess("1")).toBe(false);
    expect(hasPreviewAccess("ef797c8118f02dfb649607dd5d3f8c7623048c9c063d532cc95c5ed7a898a64f")).toBe(false);
    vi.stubEnv("GOOGLE_ADS_PREVIEW_PASSWORD", "changed");
    expect(hasPreviewAccess(token)).toBe(false);
  });

  it("stays closed when the server has no secret to sign with", () => {
    vi.stubEnv("INTEGRATION_ENCRYPTION_KEY", "");
    vi.stubEnv("GOOGLE_ADS_PREVIEW_PASSWORD", "a password");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-key-that-must-not-be-used");
    expect(previewToken()).toBeNull();
    expect(hasPreviewAccess("anything")).toBe(false);
  });
});
