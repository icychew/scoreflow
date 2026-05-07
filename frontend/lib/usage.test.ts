// Mock db module before any imports so the env-var guards in db.ts don't throw
jest.mock("@/lib/db", () => ({ db: {} }));

import { getTierLimits, canTranscribeSync } from "./usage";

describe("getTierLimits", () => {
  it("free tier allows 3 transcriptions per month, 3-min max", () => {
    const limits = getTierLimits("free");
    expect(limits.monthlyLimit).toBe(3);
    expect(limits.maxAudioMinutes).toBe(3);
    expect(limits.formats).toEqual(["pdf"]);
  });

  it("pro tier allows 50 transcriptions per month", () => {
    const limits = getTierLimits("pro");
    expect(limits.monthlyLimit).toBe(50);
    expect(limits.maxAudioMinutes).toBe(30);
    expect(limits.formats).toEqual(["pdf", "midi", "musicxml"]);
  });

  it("business tier is unlimited", () => {
    const limits = getTierLimits("business");
    expect(limits.monthlyLimit).toBe(Infinity);
    expect(limits.maxAudioMinutes).toBe(120);
  });
});

describe("canTranscribeSync", () => {
  it("allows transcription when under limit", () => {
    expect(canTranscribeSync("free", 2)).toBe(true);
  });

  it("blocks transcription when at limit", () => {
    expect(canTranscribeSync("free", 3)).toBe(false);
  });

  it("always allows business tier", () => {
    expect(canTranscribeSync("business", 10000)).toBe(true);
  });
});
