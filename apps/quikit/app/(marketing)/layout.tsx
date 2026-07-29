import { WatercolorIntro } from "./_components/watercolor-intro";

/**
 * Marketing zone layout. The app root layout owns <html>/<body>/Providers;
 * this nested layout only adds the marketing font stack + the watercolor
 * intro. Marketing pages bring their own design via injected <style>
 * (StaticPage), so they override the launcher's body defaults within
 * their own markup.
 *
 * The previous in-page LoginModal was retired — "Log in" CTAs now redirect
 * to the central auth app (auth.quikit.ai/login) carrying `callbackUrl`
 * so the same flow is used by every sub-app (quikit, quikscale, …).
 *
 * <link> tags in a nested App-Router layout are hoisted into <head>.
 */
export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link
        rel="preconnect"
        href="https://fonts.gstatic.com"
        crossOrigin="anonymous"
      />
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=DM+Serif+Display:ital@0;1&display=swap"
      />
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@24,400,1,0&display=swap"
      />
      <WatercolorIntro />
      {children}
    </>
  );
}
