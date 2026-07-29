import type { ProposalSection } from "@/lib/proposals/sections";

/**
 * Word export.
 *
 * `docx` is imported dynamically — it is a large dependency only needed on the
 * export path, and pulling it into the shared server bundle would slow every
 * other route's cold start.
 *
 * The section HTML is a known safe subset (see `sanitizeSectionHtml`), so this
 * walks it with a small hand-rolled parser rather than pulling in a full DOM.
 * Unsupported constructs degrade to plain paragraphs — never throw mid-export.
 */

export interface DocxInput {
  title: string;
  engagementTitle: string;
  sections: ProposalSection[];
}

interface Line {
  text: string;
  style: "body" | "bullet" | "numbered" | "subheading";
}

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

function stripTags(s: string): string {
  return decodeEntities(s.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
}

/**
 * Flatten the safe-subset HTML into a list of styled lines. Tables are
 * rendered as tab-separated rows: a faithful Word table would need a real
 * parser, and a readable approximation beats dropping the content.
 */
function htmlToLines(html: string): Line[] {
  const lines: Line[] = [];

  // Split on the block-level tags we support, keeping the delimiters.
  const blocks = html.split(/(<\/?(?:p|li|h4|tr|ul|ol|table|thead|tbody|blockquote)\b[^>]*>)/i);

  let listMode: "bullet" | "numbered" | null = null;
  let buffer = "";
  let bufferStyle: Line["style"] = "body";

  const flush = () => {
    const text = stripTags(buffer);
    if (text) lines.push({ text, style: bufferStyle });
    buffer = "";
    bufferStyle = "body";
  };

  for (const part of blocks) {
    const openUl = /^<ul\b/i.test(part);
    const openOl = /^<ol\b/i.test(part);
    const closeList = /^<\/(ul|ol)>/i.test(part);
    const openLi = /^<li\b/i.test(part);
    const openH4 = /^<h4\b/i.test(part);
    const isClose = /^<\//.test(part);
    const isBlockOpen = /^<(p|tr|blockquote)\b/i.test(part);

    if (openUl) { flush(); listMode = "bullet"; continue; }
    if (openOl) { flush(); listMode = "numbered"; continue; }
    if (closeList) { flush(); listMode = null; continue; }
    if (openLi) { flush(); bufferStyle = listMode ?? "bullet"; continue; }
    if (openH4) { flush(); bufferStyle = "subheading"; continue; }
    if (isBlockOpen) { flush(); continue; }
    if (isClose) { flush(); continue; }
    if (/^</.test(part)) continue; // any other tag delimiter

    buffer += part;
  }
  flush();

  return lines;
}

export async function buildProposalDocx(input: DocxInput): Promise<Buffer> {
  const { Document, Packer, Paragraph, HeadingLevel, TextRun } = await import("docx");

  const children: InstanceType<typeof Paragraph>[] = [
    new Paragraph({ text: input.title, heading: HeadingLevel.TITLE }),
    new Paragraph({
      children: [new TextRun({ text: input.engagementTitle, italics: true, color: "666666" })],
      spacing: { after: 400 },
    }),
  ];

  for (const section of input.sections) {
    children.push(
      new Paragraph({
        text: section.title,
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 360, after: 160 },
      }),
    );

    const lines = htmlToLines(section.html);
    if (lines.length === 0) {
      children.push(
        new Paragraph({
          children: [new TextRun({ text: "[Not yet drafted]", italics: true, color: "999999" })],
        }),
      );
      continue;
    }

    for (const line of lines) {
      switch (line.style) {
        case "subheading":
          children.push(
            new Paragraph({
              text: line.text,
              heading: HeadingLevel.HEADING_2,
              spacing: { before: 200, after: 100 },
            }),
          );
          break;
        case "bullet":
          children.push(new Paragraph({ text: line.text, bullet: { level: 0 } }));
          break;
        case "numbered":
          children.push(
            new Paragraph({ text: line.text, numbering: { reference: "ps-numbered", level: 0 } }),
          );
          break;
        default:
          children.push(new Paragraph({ text: line.text, spacing: { after: 120 } }));
      }
    }
  }

  const doc = new Document({
    numbering: {
      config: [
        {
          reference: "ps-numbered",
          levels: [{ level: 0, format: "decimal", text: "%1.", alignment: "left" }],
        },
      ],
    },
    sections: [{ properties: {}, children }],
  });

  return Packer.toBuffer(doc);
}
