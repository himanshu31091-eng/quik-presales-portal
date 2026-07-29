import React from "react";
import type { ProposalSection } from "@/lib/proposals/sections";

/**
 * PDF export via @react-pdf/renderer.
 *
 * Dynamically imported for the same reason as the docx exporter — it is heavy
 * and only used on the export path.
 *
 * react-pdf has no HTML renderer, so the section HTML is flattened to styled
 * lines first (same approach as the Word exporter). Anything outside the safe
 * subset degrades to a plain paragraph rather than failing the export.
 */

export interface PdfInput {
  title: string;
  engagementTitle: string;
  sections: ProposalSection[];
}

interface Line {
  text: string;
  style: "body" | "bullet" | "subheading";
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

function htmlToLines(html: string): Line[] {
  const lines: Line[] = [];
  const blocks = html.split(/(<\/?(?:p|li|h4|tr|ul|ol|table|thead|tbody|blockquote)\b[^>]*>)/i);

  let buffer = "";
  let style: Line["style"] = "body";

  const flush = () => {
    const text = stripTags(buffer);
    if (text) lines.push({ text, style });
    buffer = "";
    style = "body";
  };

  for (const part of blocks) {
    if (/^<li\b/i.test(part)) { flush(); style = "bullet"; continue; }
    if (/^<h4\b/i.test(part)) { flush(); style = "subheading"; continue; }
    if (/^<\/?[a-z]/i.test(part)) { flush(); continue; }
    buffer += part;
  }
  flush();

  return lines;
}

export async function buildProposalPdf(input: PdfInput): Promise<Buffer> {
  const { Document, Page, Text, View, StyleSheet, renderToBuffer } = await import(
    "@react-pdf/renderer"
  );

  const styles = StyleSheet.create({
    page: { paddingTop: 56, paddingBottom: 64, paddingHorizontal: 56, fontSize: 10.5, lineHeight: 1.5, color: "#1f2937" },
    title: { fontSize: 22, fontWeight: 700, marginBottom: 6, color: "#111827" },
    subtitle: { fontSize: 11, color: "#6b7280", marginBottom: 28 },
    sectionTitle: { fontSize: 14, fontWeight: 700, marginTop: 20, marginBottom: 8, color: "#111827" },
    subheading: { fontSize: 11.5, fontWeight: 700, marginTop: 10, marginBottom: 4 },
    body: { marginBottom: 7, textAlign: "justify" },
    bulletRow: { flexDirection: "row", marginBottom: 4, paddingLeft: 8 },
    bulletDot: { width: 12 },
    bulletText: { flex: 1 },
    empty: { fontStyle: "italic", color: "#9ca3af", marginBottom: 7 },
    footer: { position: "absolute", bottom: 28, left: 56, right: 56, fontSize: 8.5, color: "#9ca3af", textAlign: "center" },
  });

  const doc = (
    <Document title={input.title}>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>{input.title}</Text>
        <Text style={styles.subtitle}>{input.engagementTitle}</Text>

        {input.sections.map((section) => {
          const lines = htmlToLines(section.html);
          return (
            <View key={section.slug} wrap>
              <Text style={styles.sectionTitle}>{section.title}</Text>
              {lines.length === 0 ? (
                <Text style={styles.empty}>[Not yet drafted]</Text>
              ) : (
                lines.map((line, i) => {
                  if (line.style === "subheading") {
                    return (
                      <Text key={i} style={styles.subheading}>
                        {line.text}
                      </Text>
                    );
                  }
                  if (line.style === "bullet") {
                    return (
                      <View key={i} style={styles.bulletRow}>
                        <Text style={styles.bulletDot}>•</Text>
                        <Text style={styles.bulletText}>{line.text}</Text>
                      </View>
                    );
                  }
                  return (
                    <Text key={i} style={styles.body}>
                      {line.text}
                    </Text>
                  );
                })
              )}
            </View>
          );
        })}

        <Text
          style={styles.footer}
          render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`}
          fixed
        />
      </Page>
    </Document>
  );

  return renderToBuffer(doc);
}
