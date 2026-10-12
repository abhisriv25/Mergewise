import { describe, expect, it } from "vitest";
import { hashContent } from "./content-hash.js";
import { chunkMarkdown, extractTitle } from "./markdown-chunker.js";

describe("chunkMarkdown", () => {
  it("returns no chunks for empty content", () => {
    expect(chunkMarkdown("  \n")).toEqual([]);
  });

  it("splits per heading and keeps pre-heading text under a null heading", () => {
    const chunks = chunkMarkdown("intro\n\n# A\nalpha\n\n## B\nbeta");
    expect(chunks.map((c) => c.heading)).toEqual([null, "A", "B"]);
  });

  it("does not treat # inside a code fence as a heading", () => {
    const chunks = chunkMarkdown("# A\n```sh\n# comment\n```\ntext");
    expect(chunks).toHaveLength(1);
    expect(chunks[0].content).toContain("# comment");
  });

  it("splits oversized sections at paragraphs without losing any", () => {
    const paras = Array.from({ length: 10 }, (_, i) => `para ${i} ${"x".repeat(50)}`);
    const chunks = chunkMarkdown(`# T\n\n${paras.join("\n\n")}`, 200);
    expect(chunks.length).toBeGreaterThan(1);
    for (const p of paras) expect(chunks.some((c) => c.content.includes(p))).toBe(true);
  });

  it("never splits a code fence across chunks", () => {
    const fence = "```\n" + Array.from({ length: 30 }, (_, i) => `line ${i}`).join("\n\n") + "\n```";
    const chunks = chunkMarkdown(`# T\n\n${fence}`, 50);
    expect(chunks.filter((c) => c.content.includes("```"))).toHaveLength(1);
  });
});

describe("extractTitle / hashContent", () => {
  it("finds the first H1 outside fences", () => {
    expect(extractTitle("```\n# no\n```\n# Yes\n")).toBe("Yes");
    expect(extractTitle("no heading")).toBeNull();
  });

  it("hashes deterministically", () => {
    expect(hashContent("a")).toBe(hashContent("a"));
    expect(hashContent("a")).not.toBe(hashContent("a "));
  });
});
