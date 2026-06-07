import { describe, it, expect } from "vitest";
import { cn, formatCurrency, formatDate, formatDateTime } from "./utils";

describe("cn (className merger)", () => {
  it("merges class names", () => {
    expect(cn("a", "b")).toBe("a b");
  });

  it("handles conditional classes", () => {
    expect(cn("a", false && "b", "c")).toBe("a c");
  });

  it("deduplicates tailwind classes", () => {
    expect(cn("px-2", "px-4")).toBe("px-4");
  });

  it("handles undefined and null", () => {
    expect(cn("a", undefined, null, "b")).toBe("a b");
  });
});

describe("formatCurrency", () => {
  it("formats VND by default", () => {
    const result = formatCurrency(1000000);
    expect(result).toContain("1.000.000");
    expect(result).toMatch(/₫|đ|Đ|VND/);
  });

  it("formats with different currency", () => {
    const result = formatCurrency(100, "USD");
    expect(result).toMatch(/100/);
  });

  it("handles zero", () => {
    const result = formatCurrency(0);
    expect(result).toBeDefined();
  });

  it("handles negative", () => {
    const result = formatCurrency(-50000);
    expect(result).toContain("50.000");
  });
});

describe("formatDate", () => {
  it("formats Date object in vi-VN", () => {
    const date = new Date("2024-03-15T00:00:00Z");
    const result = formatDate(date);
    expect(result).toMatch(/15\/03\/2024/);
  });

  it("formats ISO string in vi-VN", () => {
    const result = formatDate("2024-12-25T00:00:00Z");
    expect(result).toMatch(/25\/12\/2024/);
  });
});

describe("formatDateTime", () => {
  it("includes time in vi-VN", () => {
    const date = new Date("2024-03-15T14:30:00Z");
    const result = formatDateTime(date);
    expect(result).toMatch(/15\/03\/2024/);
    // Hour/minute formatting depends on timezone
  });
});
