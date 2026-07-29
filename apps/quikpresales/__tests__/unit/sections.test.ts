import { describe, it, expect } from "vitest";
import {
  normaliseSections,
  parseSections,
  sanitizeSectionHtml,
  sectionToPlainText,
} from "@/lib/proposals/sections";

describe("proposal section sanitisation", () => {
  it("keeps the supported tag vocabulary", () => {
    const html = "<p>Hello <strong>world</strong></p><ul><li>one</li></ul>";
    expect(sanitizeSectionHtml(html)).toBe(html);
  });

  it("removes script tags along with their contents", () => {
    const out = sanitizeSectionHtml('<p>ok</p><script>alert("x")</script>');
    expect(out).toBe("<p>ok</p>");
    expect(out).not.toContain("alert");
  });

  it("removes style blocks along with their contents", () => {
    expect(sanitizeSectionHtml("<style>.a{color:red}</style><p>ok</p>")).toBe("<p>ok</p>");
  });

  it("strips inline event handlers", () => {
    const out = sanitizeSectionHtml(`<p onclick="steal()">text</p>`);
    expect(out).not.toContain("onclick");
    expect(out).toContain("text");
  });

  it("strips javascript: URLs", () => {
    const out = sanitizeSectionHtml(`<a href="javascript:alert(1)">click</a>`);
    expect(out).not.toContain("javascript:");
  });

  it("drops unsupported tags but keeps their text", () => {
    const out = sanitizeSectionHtml("<div><p>kept</p></div><h1>heading</h1>");
    expect(out).not.toContain("<div>");
    expect(out).not.toContain("<h1>");
    expect(out).toContain("kept");
    expect(out).toContain("heading");
  });

  it("sanitises every section on normalise", () => {
    const out = normaliseSections([
      { slug: "a", title: "A", html: "<p>fine</p><script>bad()</script>" },
    ]);
    expect(out[0].html).toBe("<p>fine</p>");
  });
});

describe("parseSections", () => {
  it("returns an empty array for non-array input", () => {
    expect(parseSections(null)).toEqual([]);
    expect(parseSections({})).toEqual([]);
    expect(parseSections("nope")).toEqual([]);
  });

  it("drops entries missing a slug or title", () => {
    const out = parseSections([
      { slug: "ok", title: "Ok", html: "<p>x</p>" },
      { slug: "no-title" },
      { title: "no-slug" },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].slug).toBe("ok");
  });

  it("defaults a missing html body to empty string", () => {
    expect(parseSections([{ slug: "a", title: "A" }])[0].html).toBe("");
  });
});

describe("sectionToPlainText", () => {
  it("flattens block tags into newlines and decodes entities", () => {
    const text = sectionToPlainText({
      slug: "s",
      title: "S",
      html: "<p>First</p><ul><li>A &amp; B</li><li>C</li></ul>",
    });
    expect(text).toContain("First");
    expect(text).toContain("A & B");
    expect(text).not.toContain("<");
  });
});
