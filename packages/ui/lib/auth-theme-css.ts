/**
 * Shared CSS for the QuikIT auth surface (login / register / set-password).
 *
 * Every auth screen renders the same two-panel dark layout — animated
 * background guides, a sand-accent brand panel, tokenised light/dark theming,
 * and the diagonal shine sweep on the primary CTA. This module is the single
 * source of truth for that styling so the screens can't drift apart.
 *
 * Usage: render `<style>` with the return value, scoped to the wrapper class
 * you put `data-theme` on:
 *
 *   <div className="quikit-auth-wrap" data-theme={theme}>
 *     <style dangerouslySetInnerHTML={{ __html: authThemeCss(".quikit-auth-wrap") }} />
 *     …
 *
 * `scope` is prepended to every rule, so pass the wrapper's selector (e.g.
 * ".quikit-auth-wrap" or ".qk-setpw"). Theme is driven by the
 * `[data-theme="light"]` attribute on that wrapper (dark is the default).
 */
export function authThemeCss(scope: string): string {
  const s = scope;
  return `
        /* ── Design tokens (dark by default; light via [data-theme=light]) ── */
        ${s} {
          --bg:#050505; --panel-bg:#0c0c0c; --card-bg:#101010; --card-border:#242424;
          --brand-bg:#161616; --brand-border:#262626;
          --text-primary:#f4f4f4; --text-muted:#9a9a9a;
          --hairline:rgba(255,255,255,0.12); --surface:rgba(255,255,255,0.04);
          --line:rgba(255,255,255,0.06); --beam:rgba(255,255,255,0.55); --beam-glow:rgba(255,255,255,0.18);
          --cta-sheen:rgba(0,0,0,0.30); --error:#e0736b;
        }
        ${s}[data-theme="light"] {
          --bg:#f4f3ef; --panel-bg:#ffffff; --card-bg:#ffffff; --card-border:#e4e2dc;
          --brand-bg:#ffffff; --brand-border:#e4e2dc;
          --text-primary:#0f0f0f; --text-muted:#5c5a55;
          --hairline:rgba(0,0,0,0.12); --surface:rgba(0,0,0,0.03);
          --line:rgba(0,0,0,0.08); --beam:rgba(0,0,0,0.3); --beam-glow:rgba(0,0,0,0.08);
          --cta-sheen:rgba(255,255,255,0.55); --error:#c0392b;
        }
        ${s}, ${s} *, ${s} *::before, ${s} *::after { box-sizing:border-box; }
        /* Center the auth card in the viewport. 'justify-content:safe center'
           centers vertically when the content is SHORTER than the window but
           falls back to top-aligned (never clipping the top) when it is taller —
           the fix for laptops where a full form used to overflow off-screen.
           'vmin' padding scales with the smaller viewport axis so it never eats
           the whole height on short/wide desktops (the old 2% was a % of
           WIDTH, so on wide monitors it stole vertical space). */
        ${s} { font-family:'Gilroy','Helvetica Neue',Arial,system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; background:var(--bg); color:var(--text-primary); -webkit-font-smoothing:antialiased; min-height:100vh; min-height:100dvh; padding:clamp(16px,3.5vmin,44px); display:flex; flex-direction:column; align-items:center; justify-content:safe center; }
        ${s} a { text-decoration:none; color:inherit; }
        ${s} img { display:block; max-width:100%; }
        /* Animated background guides (vertical hairlines + falling beams) */
        ${s} .qk-guides { position:fixed; inset:0; z-index:0; pointer-events:none; overflow:hidden; }
        ${s} .qk-guides::before, ${s} .qk-guides::after { content:""; position:absolute; top:0; bottom:0; width:1px; background:var(--line); }
        ${s} .qk-guides::before { left:12%; }
        ${s} .qk-guides::after { right:12%; }
        ${s} .qk-guides__drop { position:absolute; top:0; width:1px; height:90px; background:linear-gradient(to bottom, transparent 0%, transparent 10%, var(--beam) 100%); opacity:0.65; box-shadow:0 0 6px 0.5px var(--beam-glow); animation:qkGuideFall 6s linear infinite; }
        ${s} .qk-guides__drop--left { left:12%; }
        ${s} .qk-guides__drop--right { right:12%; animation-delay:3s; }
        @keyframes qkGuideFall { 0% { transform:translateY(-120px); opacity:0; } 8% { opacity:0.55; } 92% { opacity:0.55; } 100% { transform:translateY(100vh); opacity:0; } }
        @media (prefers-reduced-motion: reduce) { ${s} .qk-guides__drop { display:none; } }
        @keyframes qkFadeInUp { from { opacity:0; transform:translateY(24px); } to { opacity:1; transform:translateY(0); } }
        ${s} .fade-in-up { animation:qkFadeInUp 0.7s cubic-bezier(.22,1,.36,1) both; }
        ${s} .fade-in-up.d1 { animation-delay:0.10s; }
        ${s} .fade-in-up.d2 { animation-delay:0.22s; }
        ${s} .fade-in-up.d3 { animation-delay:0.34s; }
        ${s} .fade-in-up.d4 { animation-delay:0.46s; }

        /* ── Split layout ──
           Stretched to fill the viewport (minus the wrapper's padding), matching
           the self-serve register / sign-up page so Sign In and Sign Up share the
           same card width, height, and proportions. flex:1 fills the wrapper's
           column height and width:100% (no max-width) fills its width; the
           wrapper's padding is the only gutter. Previously this was capped at
           max-width 1160px + min-height 620px and centered, which made the
           Sign In card narrower/shorter than the Sign Up card. */
        ${s} .auth-layout { position:relative; z-index:1; width:100%; flex:1; display:grid; grid-template-columns:minmax(0,1fr) minmax(0,480px); gap:16px; min-height:0; }

        /* ── Left brand panel ── */
        ${s} .auth-side { position:relative; overflow:hidden; background:var(--brand-bg); border:1px solid var(--brand-border); color:var(--text-primary); padding:44px; display:flex; flex-direction:column; justify-content:space-between; border-radius:24px; }
        ${s} .auth-back { width:40px; height:40px; display:inline-flex; align-items:center; justify-content:center; border-radius:999px; background:var(--surface); border:1px solid var(--hairline); color:var(--text-primary); backdrop-filter:blur(8px); -webkit-backdrop-filter:blur(8px); cursor:pointer; transition:background .16s ease, transform .1s ease; }
        ${s} .auth-back:hover { background:var(--hairline); }
        ${s} .auth-back:active { transform:scale(0.94); }
        ${s} .auth-back svg { width:18px; height:18px; }
        ${s} .auth-side-head { display:flex; flex-direction:column; gap:28px; position:relative; z-index:1; }
        ${s} .auth-eyebrow { font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:12px; letter-spacing:0.16em; text-transform:uppercase; color:var(--text-muted); }
        ${s} .auth-brand-title { margin-top:16px; font-size:clamp(30px,3.4vw,46px); line-height:1.08; font-weight:400; letter-spacing:-0.02em; color:var(--text-primary); }
        ${s} .auth-brand-subtitle { margin-top:22px; font-size:17px; font-weight:500; line-height:1.4; letter-spacing:-0.01em; color:var(--text-primary); }
        ${s} .auth-brand-desc { margin-top:14px; max-width:46ch; font-size:14.5px; line-height:1.6; color:var(--text-muted); }
        ${s} .auth-side-bottom { position:relative; z-index:1; }
        ${s} .auth-brand-why { font-size:14px; font-weight:500; letter-spacing:-0.005em; color:var(--text-primary); }
        ${s} .auth-marquee { margin-top:18px; overflow:hidden; -webkit-mask-image:linear-gradient(90deg, transparent, #000 5%, #000 95%, transparent); mask-image:linear-gradient(90deg, transparent, #000 5%, #000 95%, transparent); }
        ${s} .auth-marquee-track { list-style:none; display:flex; gap:14px; width:max-content; animation:qkMarquee 26s linear infinite; }
        ${s} .auth-side:hover .auth-marquee-track { animation-play-state:paused; }
        ${s} .auth-marquee-track li { flex-shrink:0; display:flex; align-items:center; gap:8px; padding:9px 18px; border:1px solid var(--hairline); border-radius:999px; background:var(--surface); font-size:14px; color:var(--text-primary); white-space:nowrap; }
        ${s} .auth-marquee-track svg { flex-shrink:0; width:16px; height:16px; color:var(--text-primary); }
        @keyframes qkMarquee { from { transform:translateX(0); } to { transform:translateX(-50%); } }
        @media (prefers-reduced-motion: reduce) { ${s} .auth-marquee-track { animation:none; } }

        /* ── Right form panel ── */
        /* overflow:hidden (was auto) — with the height-capped layout the form
           panel now grows to fit its own content and the whole PAGE scrolls on
           short viewports, so the panel never needs an inner scrollbar. The old
           auto + auth-card margin:auto combination clipped the TOP of a tall
           form (the heading) and made it unreachable — the classic
           flex-auto-margin-scroll trap. */
        ${s} .auth-main { display:flex; flex-direction:column; padding:28px 40px; background:var(--card-bg); border:1px solid var(--card-border); overflow:hidden; border-radius:24px; }
        ${s} .auth-main-top { display:flex; align-items:center; justify-content:space-between; gap:16px; margin-bottom:8px; flex-shrink:0; }
        ${s} .auth-logo { font-size:19px; font-weight:700; letter-spacing:-0.01em; color:var(--text-primary); }
        ${s} .auth-theme { width:40px; height:40px; display:inline-flex; align-items:center; justify-content:center; border-radius:999px; background:var(--surface); border:1px solid var(--hairline); color:var(--text-primary); cursor:pointer; -webkit-backdrop-filter:blur(8px); backdrop-filter:blur(8px); transition:background .16s ease, transform .1s ease; }
        ${s} .auth-theme:hover { background:var(--hairline); }
        ${s} .auth-theme:active { transform:scale(0.94); }
        ${s} .auth-theme svg { width:18px; height:18px; }
        ${s} .auth-card { width:100%; max-width:400px; margin:auto; padding:32px 0; }
        ${s} .auth-card h1 { font-size:26px; font-weight:400; letter-spacing:-0.02em; text-align:center; margin-bottom:0; color:var(--text-primary); }
        ${s} .auth-card .auth-sub { font-size:14px; color:var(--text-muted); text-align:center; margin:10px 0 26px; line-height:1.6; }
        ${s} .auth-oauth { display:flex; align-items:center; justify-content:center; gap:10px; width:100%; height:48px; margin-bottom:12px; background:var(--surface); border:1px solid var(--hairline); border-radius:12px; font-family:inherit; font-size:14px; font-weight:500; color:var(--text-primary); cursor:pointer; transition:background .16s ease, border-color .16s ease, transform .1s ease; }
        ${s} .auth-oauth:hover { background:var(--hairline); }
        ${s} .auth-oauth:active { transform:scale(0.99); }
        ${s} .auth-oauth svg { width:18px; height:18px; flex-shrink:0; }
        ${s} .auth-divider { position:relative; text-align:center; margin:20px 0 18px; color:var(--text-muted); font-size:12px; }
        ${s} .auth-divider::before { content:""; position:absolute; left:0; right:0; top:50%; height:1px; background:var(--hairline); }
        ${s} .auth-divider span { position:relative; background:var(--card-bg); padding:0 12px; }
        ${s} .auth-field { margin-bottom:14px; }
        ${s} .auth-field label { display:block; font-size:14px; font-weight:400; color:var(--text-primary); margin-bottom:8px; }
        ${s} .auth-field input { width:100%; height:50px; padding:0 16px; font-family:inherit; font-size:15px; color:var(--text-primary); background:var(--card-bg); border:1px solid var(--hairline); border-radius:12px; transition:border-color .15s, background .15s; outline:none; }
        ${s} .auth-field input::placeholder { color:var(--text-muted); opacity:1; }
        ${s} .auth-field input:focus { border-color:var(--text-primary); background:var(--panel-bg); }
        /* Neutralise browser autofill so filled inputs keep the dark fill + light text
           instead of Chrome's light-blue background and near-black text. */
        ${s} .auth-field input:-webkit-autofill,
        ${s} .auth-field input:-webkit-autofill:hover,
        ${s} .auth-field input:-webkit-autofill:active { -webkit-text-fill-color:var(--text-primary); caret-color:var(--text-primary); -webkit-box-shadow:0 0 0 1000px var(--card-bg) inset; box-shadow:0 0 0 1000px var(--card-bg) inset; transition:background-color 9999s ease-out 0s; }
        ${s} .auth-field input:-webkit-autofill:focus { -webkit-box-shadow:0 0 0 1000px var(--panel-bg) inset; box-shadow:0 0 0 1000px var(--panel-bg) inset; }
        ${s} .auth-password { position:relative; }
        ${s} .auth-password input { padding-right:46px; }
        ${s} .auth-eye { position:absolute; right:8px; top:50%; transform:translateY(-50%); width:34px; height:34px; background:transparent; border:none; cursor:pointer; color:var(--text-muted); display:flex; align-items:center; justify-content:center; border-radius:8px; transition:color .15s, background .15s; }
        ${s} .auth-eye:hover { color:var(--text-primary); background:var(--surface); }
        ${s} .auth-eye svg { width:18px; height:18px; }
        ${s} .auth-submit { position:relative; overflow:hidden; isolation:isolate; width:100%; height:48px; padding:0 18px; margin-top:20px; background:var(--text-primary); border:1px solid transparent; border-radius:12px; font-family:inherit; font-size:15px; font-weight:500; letter-spacing:-0.01em; color:var(--bg); cursor:pointer; transition:transform .15s ease, box-shadow .15s ease; }
        ${s} .auth-submit::before { content:""; position:absolute; top:-60%; bottom:-60%; left:-90%; width:65%; background:linear-gradient(90deg, transparent 0%, var(--cta-sheen) 45%, var(--cta-sheen) 55%, transparent 100%); transform:skewX(-20deg); opacity:0; pointer-events:none; }
        ${s} .auth-submit:hover:not(:disabled)::before { animation:qkShine 0.85s cubic-bezier(0.3,0.5,0.2,1); }
        @keyframes qkShine { 0% { left:-90%; opacity:0; } 10% { opacity:1; } 90% { opacity:1; } 100% { left:150%; opacity:0; } }
        @media (prefers-reduced-motion: reduce) { ${s} .auth-submit::before { display:none; } }
        ${s} .auth-submit:hover:not(:disabled) { transform:translateY(-2px); box-shadow:0 10px 26px -8px rgba(0,0,0,0.55); }
        ${s} .auth-submit:active:not(:disabled) { transform:translateY(0); }
        ${s} .auth-submit:disabled { opacity:.5; cursor:not-allowed; }
        ${s} .auth-secondary { width:100%; height:48px; padding:0 18px; margin-top:10px; background:var(--surface); border:1px solid var(--hairline); border-radius:12px; font-family:inherit; font-size:14px; font-weight:500; color:var(--text-primary); cursor:pointer; transition:background .15s, border-color .15s; }
        ${s} .auth-secondary:hover:not(:disabled) { background:var(--hairline); border-color:var(--text-primary); }
        ${s} .auth-secondary:disabled { opacity:.5; cursor:not-allowed; }
        ${s} .auth-forgot { display:block; margin-left:auto; margin-top:12px; font-size:13px; font-weight:500; color:var(--text-muted); text-decoration:underline; text-underline-offset:3px; background:none; border:none; cursor:pointer; font-family:inherit; }
        ${s} .auth-forgot:hover { color:var(--text-primary); }
        ${s} .auth-alt { text-align:center; margin-top:28px; font-size:13px; color:var(--text-muted); }
        ${s} .auth-alt a { color:var(--text-primary); font-weight:500; text-decoration:underline; text-underline-offset:3px; }
        ${s} .auth-foot { display:flex; justify-content:space-between; align-items:center; margin-top:auto; padding-top:24px; font-size:12px; color:var(--text-muted); border-top:1px solid var(--line); flex-shrink:0; }
        ${s} .auth-foot-links { display:flex; gap:20px; }
        ${s} .auth-foot-links a { color:var(--text-muted); transition:color .15s; }
        ${s} .auth-foot-links a:hover { color:var(--text-primary); }
        ${s} .auth-banner { display:flex; align-items:flex-start; gap:8px; padding:10px 12px; border-radius:12px; background:var(--surface); border:1px solid var(--hairline); color:var(--text-primary); font-size:13px; margin-bottom:16px; }
        ${s} .auth-banner button { background:none; border:none; color:inherit; cursor:pointer; padding:0; display:flex; align-items:center; }
        /* Error variant — red text for inline error banners (e.g. set-password). */
        ${s} .auth-banner--error { color:var(--error); }
        ${s} .auth-error { color:var(--error); font-size:12.5px; margin-top:8px; }
        ${s} .fp-progress { display:flex; align-items:center; justify-content:center; gap:6px; margin-bottom:24px; }
        ${s} .fp-progress-step { width:26px; height:4px; border-radius:99px; background:var(--hairline); transition:background .25s; }
        ${s} .fp-progress-step.active { background:var(--text-primary); }
        ${s} .fp-progress-step.done { background:var(--text-muted); }
        ${s} .fp-otp { display:grid; grid-template-columns:repeat(6, 1fr); gap:10px; margin-bottom:8px; }
        ${s} .fp-otp-input { width:100%; aspect-ratio:1 / 1.15; text-align:center; font-family:inherit; font-size:22px; font-weight:600; color:var(--text-primary); background:var(--card-bg); border:1px solid var(--hairline); border-radius:12px; transition:border-color .15s, background .15s; outline:none; }
        ${s} .fp-otp-input:focus { border-color:var(--text-primary); background:var(--panel-bg); }
        ${s} .fp-otp-input.filled { border-color:var(--text-primary); background:var(--surface); }
        ${s} .fp-resend { text-align:center; font-size:13px; color:var(--text-muted); margin-top:16px; }
        ${s} .fp-resend-btn { background:none; border:none; padding:0; font:inherit; color:var(--text-primary); font-weight:500; cursor:pointer; text-decoration:underline; text-underline-offset:3px; }
        ${s} .fp-resend-btn:disabled { color:var(--text-muted); cursor:not-allowed; text-decoration:none; }
        ${s} .fp-resend-btn:not(:disabled):hover { color:var(--text-primary); }
        ${s} .fp-back-step { display:block; margin:16px auto 0; background:none; border:none; padding:0; font:inherit; font-size:13px; color:var(--text-muted); cursor:pointer; }
        ${s} .fp-back-step:hover { color:var(--text-primary); }
        ${s} .qk-modal-overlay { position:fixed; inset:0; z-index:9999; background:rgba(0,0,0,0.6); backdrop-filter:blur(4px); display:flex; align-items:center; justify-content:center; padding:16px; animation:qkFadeInUp 0.2s ease-out both; }
        ${s} .qk-modal { background:var(--card-bg); border:1px solid var(--card-border); border-radius:20px; padding:36px 32px; max-width:380px; width:100%; display:flex; flex-direction:column; align-items:center; gap:16px; position:relative; box-shadow:0 24px 60px rgba(0,0,0,0.5); }
        ${s} .qk-modal-close { position:absolute; top:12px; right:12px; background:none; border:none; cursor:pointer; padding:6px; color:var(--text-muted); border-radius:8px; display:flex; align-items:center; justify-content:center; }
        ${s} .qk-modal-close:hover { background:var(--surface); color:var(--text-primary); }
        ${s} .qk-modal-icon { width:56px; height:56px; border-radius:16px; display:flex; align-items:center; justify-content:center; background:var(--surface); border:1px solid var(--hairline); color:var(--text-primary); }
        ${s} .qk-modal-icon.error { color:#e0736b; }
        ${s} .qk-modal-title { font-size:16px; font-weight:600; color:var(--text-primary); text-align:center; }
        ${s} .qk-modal-msg { font-size:13px; color:var(--text-muted); text-align:center; }
        ${s} .qk-spin { animation:qk-spin 1s linear infinite; }
        @keyframes qk-spin { from { transform:rotate(0deg); } to { transform:rotate(360deg); } }
        @media (max-width:900px) {
          ${s} { padding:14px; }
          /* Stack the panels and let each size to its own content (drop the
             desktop min-height so the stack isn't forced tall on phones). */
          ${s} .auth-layout { grid-template-columns:1fr; min-height:0; }
          ${s} .auth-side { padding:28px 24px; min-height:200px; }
          ${s} .auth-side-head { gap:18px; }
          ${s} .auth-brand-subtitle, ${s} .auth-brand-desc, ${s} .auth-side-bottom { display:none; }
          ${s} .auth-main { padding:24px 22px; }
          ${s} .auth-foot { flex-direction:column; gap:12px; align-items:flex-start; margin-top:32px; }
          ${s} .fp-otp { gap:8px; }
          ${s} .fp-otp-input { font-size:18px; }
        }
        @media (max-width:480px) {
          ${s} { padding:12px; }
          ${s} .auth-layout { gap:12px; }
          ${s} .auth-side, ${s} .auth-main { border-radius:18px; }
          ${s} .auth-card { padding:16px 0; }
          ${s} .auth-card h1 { font-size:23px; }
        }
      `;
}
