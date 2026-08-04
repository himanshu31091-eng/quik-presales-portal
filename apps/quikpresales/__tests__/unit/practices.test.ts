import { describe, it, expect } from "vitest";
import { PRACTICES, practiceOf, spansMultiplePractices } from "@/lib/practices";

describe("practiceOf", () => {
  it("maps the Microsoft stack", () => {
    expect(practiceOf(["Dynamics365"])).toBe("Microsoft");
    expect(practiceOf(["PowerPlatform"])).toBe("Microsoft");
    expect(practiceOf(["SharePoint"])).toBe("Microsoft");
  });

  it("maps data and AI technologies to one practice", () => {
    expect(practiceOf(["AzureAI"])).toBe("AI & Data");
    expect(practiceOf(["DataEngineering"])).toBe("AI & Data");
    expect(practiceOf(["AIAgents"])).toBe("AI & Data");
  });

  it("maps Salesforce and DevOps", () => {
    expect(practiceOf(["Salesforce"])).toBe("Salesforce");
    expect(practiceOf(["DevOps"])).toBe("DevOps");
  });

  it("is case- and whitespace-insensitive", () => {
    // Technology is a free-text vocabulary, so hand-typed values must still land.
    expect(practiceOf(["  dynamics365 "])).toBe("Microsoft");
    expect(practiceOf(["SALESFORCE"])).toBe("Salesforce");
  });

  it("returns Unassigned for empty or unrecognised technology", () => {
    expect(practiceOf([])).toBe("Unassigned");
    expect(practiceOf(null)).toBe("Unassigned");
    expect(practiceOf(undefined)).toBe("Unassigned");
    expect(practiceOf(["Fortran"])).toBe("Unassigned");
  });

  it("attributes a multi-practice deal deterministically, never twice", () => {
    // Pipeline totals must not move between refreshes, so resolution follows
    // PRACTICES order rather than picking a "best" match.
    const stack = ["DevOps", "Dynamics365"];
    expect(practiceOf(stack)).toBe("Microsoft");
    expect(practiceOf([...stack].reverse())).toBe("Microsoft");
  });

  it("always returns a member of the published list", () => {
    for (const stack of [["Salesforce"], ["AzureAI"], ["nonsense"], []]) {
      expect(PRACTICES).toContain(practiceOf(stack));
    }
  });
});

describe("spansMultiplePractices", () => {
  it("detects a deal crossing practices", () => {
    expect(spansMultiplePractices(["Dynamics365", "DevOps"])).toBe(true);
  });

  it("is false within one practice", () => {
    // Both map to Microsoft, so this is a single-practice deal.
    expect(spansMultiplePractices(["Dynamics365", "SharePoint"])).toBe(false);
    expect(spansMultiplePractices(["AzureAI", "DataEngineering"])).toBe(false);
  });

  it("is false for empty or unrecognised technology", () => {
    expect(spansMultiplePractices([])).toBe(false);
    expect(spansMultiplePractices(null)).toBe(false);
    expect(spansMultiplePractices(["Fortran", "COBOL"])).toBe(false);
  });
});
