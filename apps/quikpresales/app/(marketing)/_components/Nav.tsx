/**
 * Landing-page nav. Server component — no interactivity, so no "use client".
 */
export function Nav() {
  return (
    <nav className="ps-nav">
      <a className="ps-brand" href="/">
        <span className="ps-brand-mark" aria-hidden="true">
          PS
        </span>
        QuikPreSales
      </a>
      <a className="ps-btn ps-btn-ghost" href="/dashboard">
        Sign in
      </a>
    </nav>
  );
}
