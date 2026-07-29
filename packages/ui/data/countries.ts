/**
 * Seeded country list. Alphabetical. Small curated set covering the
 * most common locales for QuikIT tenants. Extend as needed —
 * keep alphabetical order.
 */
export const COUNTRIES: Array<{ value: string; label: string }> = [
  { value: "AE", label: "United Arab Emirates" },
  { value: "AU", label: "Australia" },
  { value: "BR", label: "Brazil" },
  { value: "CA", label: "Canada" },
  { value: "CH", label: "Switzerland" },
  { value: "CN", label: "China" },
  { value: "DE", label: "Germany" },
  { value: "DK", label: "Denmark" },
  { value: "ES", label: "Spain" },
  { value: "FI", label: "Finland" },
  { value: "FR", label: "France" },
  { value: "GB", label: "United Kingdom" },
  { value: "HK", label: "Hong Kong" },
  { value: "IE", label: "Ireland" },
  { value: "IN", label: "India" },
  { value: "IT", label: "Italy" },
  { value: "JP", label: "Japan" },
  { value: "KR", label: "South Korea" },
  { value: "MX", label: "Mexico" },
  { value: "MY", label: "Malaysia" },
  { value: "NL", label: "Netherlands" },
  { value: "NO", label: "Norway" },
  { value: "NZ", label: "New Zealand" },
  { value: "PH", label: "Philippines" },
  { value: "PT", label: "Portugal" },
  { value: "SE", label: "Sweden" },
  { value: "SG", label: "Singapore" },
  { value: "TH", label: "Thailand" },
  { value: "TR", label: "Turkey" },
  { value: "US", label: "United States" },
  { value: "VN", label: "Vietnam" },
  { value: "ZA", label: "South Africa" },
].sort((a, b) => a.label.localeCompare(b.label));
