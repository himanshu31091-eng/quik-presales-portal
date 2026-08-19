/**
 * Sample RFP template — a static Word document sales can hand a prospect who
 * asks "what should our RFP look like?" It is not tied to any engagement;
 * every org gets the same skeleton. Reuses the same paragraph styling as
 * proposal export (docx dynamically imported for the same cold-start reason).
 */

interface TemplateSection {
  title: string;
  intro?: string;
  bullets?: string[];
}

const SECTIONS: TemplateSection[] = [
  {
    title: "1. Company & Project Background",
    intro:
      "Briefly describe your organisation and the business context driving this initiative.",
    bullets: [
      "Company name, industry, and size",
      "Business problem or opportunity prompting this RFP",
      "Strategic goals this project supports",
    ],
  },
  {
    title: "2. Scope of Work",
    intro: "Describe what you need delivered, as specifically as you can.",
    bullets: [
      "In-scope functional areas / modules",
      "Out-of-scope items, if known",
      "Integration points with existing systems",
      "Number of users, locations, or transaction volumes",
    ],
  },
  {
    title: "3. Technical Requirements",
    bullets: [
      "Current technology stack and platforms in use",
      "Required deployment model (cloud / on-prem / hybrid)",
      "Data migration needs, if any",
      "Security, compliance, or regulatory requirements",
    ],
  },
  {
    title: "4. Timeline & Milestones",
    intro: "Share any target dates — even approximate ones help vendors size the effort.",
    bullets: [
      "Desired project start date",
      "Key milestones or go-live date",
      "Any hard deadlines and why",
    ],
  },
  {
    title: "5. Budget Guidance",
    intro:
      "An approximate range, even a wide one, helps vendors propose a right-sized solution instead of guessing.",
  },
  {
    title: "6. Evaluation Criteria",
    intro: "List how you plan to score responses, so vendors know what to emphasise.",
    bullets: [
      "Technical fit / functional coverage",
      "Cost",
      "Delivery timeline",
      "Vendor experience and references",
      "Support and SLA terms",
    ],
  },
  {
    title: "7. Submission Guidelines",
    bullets: [
      "Response format (Word / PDF / online form)",
      "Submission deadline and contact for questions",
      "Whether a demo or presentation is expected",
    ],
  },
  {
    title: "8. Terms & Conditions",
    intro:
      "Note any mandatory contractual terms, NDAs, or vendor-qualification requirements upfront so they don't surface late in the process.",
  },
];

export async function buildRfpSampleTemplateDocx(): Promise<Buffer> {
  const { Document, Packer, Paragraph, HeadingLevel, TextRun } = await import("docx");

  const children: InstanceType<typeof Paragraph>[] = [
    new Paragraph({ text: "Request for Proposal — Sample Template", heading: HeadingLevel.TITLE }),
    new Paragraph({
      children: [
        new TextRun({
          text:
            "Share this outline with a prospect who needs help structuring their RFP. Replace the guidance text under each heading with their own details.",
          italics: true,
          color: "666666",
        }),
      ],
      spacing: { after: 400 },
    }),
  ];

  for (const section of SECTIONS) {
    children.push(
      new Paragraph({ text: section.title, heading: HeadingLevel.HEADING_1, spacing: { before: 320, after: 120 } }),
    );
    if (section.intro) {
      children.push(new Paragraph({ text: section.intro, spacing: { after: 120 } }));
    }
    for (const bullet of section.bullets ?? []) {
      children.push(new Paragraph({ text: bullet, bullet: { level: 0 } }));
    }
  }

  const doc = new Document({ sections: [{ properties: {}, children }] });
  return Packer.toBuffer(doc);
}
