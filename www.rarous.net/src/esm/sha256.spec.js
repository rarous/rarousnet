import { describe, it, expect } from "vitest";
import { getSha256 } from "./sha256.js";

describe("getSha256", () => {
  it("returns correct SHA-256 hash for an empty string", () => {
    expect(getSha256("")).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
    );
  });

  it("returns correct SHA-256 hash for a known string", () => {
    expect(getSha256("hello world")).toBe(
      "b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9"
    );
  });
});
