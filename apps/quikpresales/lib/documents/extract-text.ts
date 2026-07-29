/**
 * Pull plain text out of an uploaded RFP so it can be sent to Claude.
 *
 * PDFs are deliberately NOT text-extracted here — they go to the model as a
 * base64 `document` block instead, which is what makes page-level citations
 * possible. Extracting first would throw away exactly the provenance the
 * compliance matrix needs.
 */

export type RfpSourceKind = "pdf" | "text";

export interface ExtractedDocument {
  kind: RfpSourceKind;
  /** Present when `kind` is "text". */
  text?: string;
  /** Present when `kind` is "pdf" — base64, no data: prefix, no newlines. */
  pdfBase64?: string;
}

const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/** Cap what we hand the model; 600k chars is well past any real RFP. */
const MAX_TEXT_CHARS = 600_000;

/**
 * Fetch a stored document and turn it into something `extract-requirements`
 * can consume.
 *
 * Throws for types we can't read — the caller records that on the RFP row so
 * the user sees "we can't read .xlsx yet" rather than an empty matrix that
 * looks like the document had no requirements in it.
 */
export async function extractDocument(
  blobUrl: string,
  mimeType: string,
): Promise<ExtractedDocument> {
  const res = await fetch(blobUrl);
  if (!res.ok) {
    throw new Error(`Could not fetch document (${res.status})`);
  }
  const buffer = Buffer.from(await res.arrayBuffer());

  if (mimeType === "application/pdf") {
    return { kind: "pdf", pdfBase64: buffer.toString("base64") };
  }

  if (mimeType === DOCX_MIME) {
    // Dynamic import: mammoth pulls in a sizeable dependency tree and is only
    // needed on the extraction path.
    const mammoth = await import("mammoth");
    const { value } = await mammoth.extractRawText({ buffer });
    return { kind: "text", text: value.slice(0, MAX_TEXT_CHARS) };
  }

  if (mimeType.startsWith("text/")) {
    return { kind: "text", text: buffer.toString("utf8").slice(0, MAX_TEXT_CHARS) };
  }

  throw new Error(
    `Cannot extract text from "${mimeType}". Upload the RFP as PDF, DOCX or plain text.`,
  );
}
