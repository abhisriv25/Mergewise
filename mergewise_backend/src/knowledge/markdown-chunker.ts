export interface MarkdownChunk {
  content: string;
  heading: string | null;
  tokenCount: number;
}

export const TARGET_CHUNK_CHARS = 1500;

const HEADING = /^(#{1,6})\s+(.+?)\s*#*\s*$/;
const FENCE = /^\s*(```|~~~)/;

// Rough estimate; not a real tokenizer count.
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

interface Section {
  heading: string | null;
  lines: string[];
}

function splitSections(markdown: string): Section[] {
  const sections: Section[] = [{ heading: null, lines: [] }];
  let inFence = false;

  for (const line of markdown.split(/\r?\n/)) {
    if (FENCE.test(line)) inFence = !inFence;
    const match = !inFence && !FENCE.test(line) ? HEADING.exec(line) : null;
    if (match) {
      sections.push({ heading: match[2], lines: [line] });
    } else {
      sections[sections.length - 1].lines.push(line);
    }
  }
  return sections;
}

/** Splits into paragraph blocks on blank lines, never inside a code fence. */
function splitBlocks(lines: string[]): string[] {
  const blocks: string[] = [];
  let current: string[] = [];
  let inFence = false;

  const flush = () => {
    if (current.length > 0) blocks.push(current.join("\n"));
    current = [];
  };

  for (const line of lines) {
    if (FENCE.test(line)) inFence = !inFence;
    if (!inFence && line.trim() === "" && !FENCE.test(line)) {
      flush();
    } else {
      current.push(line);
    }
  }
  flush();
  return blocks;
}

export function chunkMarkdown(markdown: string, targetChars = TARGET_CHUNK_CHARS): MarkdownChunk[] {
  const chunks: MarkdownChunk[] = [];

  for (const section of splitSections(markdown)) {
    const text = section.lines.join("\n").trim();
    if (!text) continue;

    if (text.length <= targetChars) {
      chunks.push({ content: text, heading: section.heading, tokenCount: estimateTokens(text) });
      continue;
    }

    let current = "";
    for (const block of splitBlocks(section.lines)) {
      if (current && current.length + block.length + 2 > targetChars) {
        chunks.push({ content: current, heading: section.heading, tokenCount: estimateTokens(current) });
        current = block;
      } else {
        current = current ? `${current}\n\n${block}` : block;
      }
    }
    if (current.trim()) {
      chunks.push({ content: current, heading: section.heading, tokenCount: estimateTokens(current) });
    }
  }

  return chunks;
}

export function extractTitle(markdown: string): string | null {
  let inFence = false;
  for (const line of markdown.split(/\r?\n/)) {
    if (FENCE.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const match = /^#\s+(.+?)\s*#*\s*$/.exec(line);
    if (match) return match[1];
  }
  return null;
}
