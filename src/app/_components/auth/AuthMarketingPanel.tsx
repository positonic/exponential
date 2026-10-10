import { PRODUCT_NAME } from "~/lib/brand";

/**
 * The generic right-hand marketing aside of the `.auth-surface` chrome, shared
 * by /signin and /auth/verify-request so the two pages cannot drift apart. The
 * invite page renders its own workspace-personalized variant and deliberately
 * does not use this one.
 *
 * No hooks — safe to render from a Server Component or inside a client page.
 */
export function AuthMarketingPanel() {
  return (
    <aside className="auth-right">
      <div className="auth-right__inner">
        <div className="marketing-eyebrow">
          <span className="marketing-eyebrow__line" />
          <span>Inside {PRODUCT_NAME}</span>
        </div>

        <h2 className="marketing-head">
          A live look at what teams are{" "}
          <em>shipping this week</em>.
        </h2>

        <p className="marketing-sub">
          Rituals, projects, OKRs and meetings — woven into a single home
          the team already uses every day. Sign in to see the real thing.
        </p>

        <div className="snap" aria-hidden="true">
          <div className="snap__bar">
            <div className="snap__dot" />
            <div className="snap__dot" />
            <div className="snap__dot" />
            <div className="snap__crumb">
              your-workspace / <b>today</b>
            </div>
          </div>
          <div className="snap__body">
            <div className="snap-greeting">Your workspace · Week 17</div>
            <h3 className="snap-title">
              Shipping this week.{" "}
              <em>3 rituals, 2 launches.</em>
            </h3>

            <div className="snap-metrics">
              <div className="snap-metric">
                <div className="snap-metric__label">
                  <span
                    className="snap-metric__dot"
                    style={{ background: "var(--brand-400)" }}
                  />
                  Focus
                </div>
                <div className="snap-metric__value">2h 40m</div>
                <div className="snap-metric__meta">Protected block</div>
              </div>
              <div className="snap-metric">
                <div className="snap-metric__label">
                  <span
                    className="snap-metric__dot"
                    style={{ background: "var(--accent-okr)" }}
                  />
                  OKR
                </div>
                <div className="snap-metric__value">68%</div>
                <div className="snap-metric__meta">On track · Q2</div>
              </div>
              <div className="snap-metric">
                <div className="snap-metric__label">
                  <span
                    className="snap-metric__dot"
                    style={{ background: "var(--accent-meetings)" }}
                  />
                  Meetings
                </div>
                <div className="snap-metric__value">3</div>
                <div className="snap-metric__meta">1 async draft</div>
              </div>
            </div>

            <div className="snap-list">
              <div className="snap-row done">
                <span className="snap-check done" />
                <span className="snap-row__label">
                  Review KR-2 movement from last week
                </span>
                <span className="snap-row__tag">ritual</span>
              </div>
              <div className="snap-row">
                <span className="snap-check" />
                <span className="snap-row__label">
                  Ship onboarding redesign to staging
                </span>
                <span className="snap-row__tag">#orbit</span>
              </div>
              <div className="snap-row">
                <span className="snap-check" />
                <span className="snap-row__label">
                  1:1 with the team · draft talking points
                </span>
                <span className="snap-row__tag">14:00</span>
              </div>
            </div>
          </div>
        </div>

        <div className="feats">
          <Feat
            title="Weekly rituals"
            sub="Planning, review and retro baked into your calendar — not another Notion doc."
            icon={<ClockGlyph />}
          />
          <Feat
            title="Living OKRs"
            sub="Key results that update themselves from the work you're already doing."
            icon={<TrendGlyph />}
          />
          <Feat
            title="Project orbits"
            sub="Every task, note and decision in a single, searchable timeline."
            icon={<ListGlyph />}
          />
          <Feat
            title="Zoe, your copilot"
            sub="Drafts your plan, reviews your week, and answers across every doc."
            icon={<StarGlyph />}
          />
        </div>

        <div className="marketing-foot">
          <div className="marketing-foot__group">
            <CheckGlyph />
            <span>SOC 2 · SAML SSO</span>
          </div>
          <div
            className="marketing-foot__group"
            style={{ marginLeft: "auto" }}
          >
            <span>
              Where humans and AI{" "}
              <b>build together</b>
            </span>
          </div>
        </div>
      </div>
    </aside>
  );
}

/* ==========================================================================
 * Helpers + inline SVG glyphs (colors via CSS variables only — no hex here)
 * ========================================================================== */

function Feat({
  title,
  sub,
  icon,
}: {
  title: string;
  sub: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="feat">
      <div className="feat__mark">{icon}</div>
      <div className="feat__body">
        <div className="feat__title">{title}</div>
        <div className="feat__sub">{sub}</div>
      </div>
    </div>
  );
}

function CheckGlyph() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="var(--accent-crm)"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M20 7L9 18l-5-5" />
    </svg>
  );
}

function ClockGlyph() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

function TrendGlyph() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 12l4-4 4 4 6-6 4 4" />
      <path d="M3 20h18" />
    </svg>
  );
}

function ListGlyph() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 7h16M4 12h10M4 17h16" />
    </svg>
  );
}

function StarGlyph() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 2l3 6 6 .9-4.5 4.3 1 6.3L12 16.8 6.5 19.5l1-6.3L3 8.9 9 8z" />
    </svg>
  );
}
