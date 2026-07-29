/**
 * Per-app "surprise gift" popup banner images, keyed by app slug.
 *
 * Every expired app shows the same popup format (title + "Enjoy 1 month of
 * <App> — absolutely free…", dynamic app name). The ONLY per-app difference is
 * the banner image: an app listed here uses its own image; an app with no entry
 * falls back to a generic gradient + 🎁 banner.
 *
 * To bind another app's image later: drop it in /public/surprise/<slug>.png and
 * add an entry below.
 */
const BANNERS: Record<string, string> = {
  quiktrack: "/surprise/quiktrack.png",
  quikcrm: "/surprise/quikcrm.png",
  quikscale: "/surprise/quikscale.png",
  quikinfra: "/surprise/quikinfra.png",
  quiksocial: "/surprise/quiksocial.png",
};

/** Public path of the app's gift banner image, or null to use the generic one. */
export function getSurpriseBanner(slug: string): string | null {
  return BANNERS[slug] ?? null;
}
