"use client";

import {
  Container,
  Card,
  Title,
  Text,
  Button,
  Stack,
  Alert,
  Avatar,
  Group,
  Badge,
  Skeleton,
} from "@mantine/core";
import {
  IconAlertCircle,
  IconCheck,
  IconClock,
  IconMail,
} from "@tabler/icons-react";
import { useParams, useRouter } from "next/navigation";
import { signIn, signOut } from "next-auth/react";
import { type FormEvent, useMemo, useState } from "react";
import { api, type RouterOutputs } from "~/trpc/react";
import { PRODUCT_NAME } from "~/lib/brand";
import Image from "next/image";
import Link from "next/link";
import "~/styles/auth-surface.css";

type InvitationData = NonNullable<
  RouterOutputs["workspace"]["getInvitationByToken"]
>;
type MemberPreview = InvitationData["workspace"]["memberPreview"][number];

function initialsFor(nameOrEmail: string | null | undefined): string {
  const source = (nameOrEmail ?? "").trim();
  if (!source) return "?";
  const parts = source.split(/[\s@._-]+/).filter(Boolean);
  if (parts.length === 0) return source.slice(0, 2).toUpperCase();
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase();
}

export default function InviteAcceptPage() {
  const params = useParams();
  const router = useRouter();
  const token = params.token as string;

  const {
    data: invitation,
    isLoading,
    error,
  } = api.workspace.getInvitationByToken.useQuery(
    { token },
    { enabled: !!token }
  );

  const acceptMutation = api.workspace.acceptInvitation.useMutation({
    onSuccess: (data) => {
      window.location.href = `/w/${data.workspace.slug}`;
    },
  });

  if (isLoading) {
    return (
      <Container size="sm" className="py-16">
        <Card className="bg-surface-secondary border-border-primary" withBorder>
          <Stack gap="md" align="center">
            <Skeleton height={60} width={60} circle />
            <Skeleton height={24} width={200} />
            <Skeleton height={16} width={300} />
            <Skeleton height={40} width={150} />
          </Stack>
        </Card>
      </Container>
    );
  }

  if (error || !invitation) {
    return (
      <Container size="sm" className="py-16">
        <Card className="bg-surface-secondary border-border-primary" withBorder>
          <Stack gap="md" align="center" className="py-8">
            <IconAlertCircle size={48} className="text-red-500" />
            <Title order={2} className="text-text-primary">
              Invalid Invitation
            </Title>
            <Text className="text-text-secondary text-center">
              This invitation link is invalid or has been revoked.
            </Text>
            <Button variant="light" onClick={() => router.push("/")}>
              Go to Home
            </Button>
          </Stack>
        </Card>
      </Container>
    );
  }

  if (invitation.isExpired) {
    return (
      <Container size="sm" className="py-16">
        <Card className="bg-surface-secondary border-border-primary" withBorder>
          <Stack gap="md" align="center" className="py-8">
            <IconClock size={48} className="text-yellow-500" />
            <Title order={2} className="text-text-primary">
              Invitation Expired
            </Title>
            <Text className="text-text-secondary text-center">
              This invitation has expired. Please contact the workspace admin to
              request a new invitation.
            </Text>
            <Button variant="light" onClick={() => router.push("/")}>
              Go to Home
            </Button>
          </Stack>
        </Card>
      </Container>
    );
  }

  if (invitation.status !== "pending") {
    return (
      <Container size="sm" className="py-16">
        <Card className="bg-surface-secondary border-border-primary" withBorder>
          <Stack gap="md" align="center" className="py-8">
            <IconCheck size={48} className="text-green-500" />
            <Title order={2} className="text-text-primary">
              Invitation Already Used
            </Title>
            <Text className="text-text-secondary text-center">
              This invitation has already been accepted.
            </Text>
            <Button
              variant="light"
              onClick={() => router.push(`/w/${invitation.workspace.slug}`)}
            >
              Go to Workspace
            </Button>
          </Stack>
        </Card>
      </Container>
    );
  }

  if (!invitation.isLoggedIn) {
    return <InviteLandingPage token={token} invitation={invitation} />;
  }

  if (!invitation.isForCurrentUser) {
    return (
      <Container size="sm" className="py-16">
        <Card className="bg-surface-secondary border-border-primary" withBorder>
          <Stack gap="md" align="center" className="py-8">
            <IconMail size={48} className="text-blue-500" />
            <Title order={2} className="text-text-primary">
              Wrong Account
            </Title>
            <Text className="text-text-secondary text-center">
              This invitation was sent to <strong>{invitation.email}</strong>.
              Please sign in with that email address to accept.
            </Text>
            <Button
              variant="light"
              onClick={() =>
                signOut({
                  callbackUrl: `/signin?callbackUrl=${encodeURIComponent(`/invite/${token}`)}`,
                })
              }
            >
              Sign In with Different Account
            </Button>
          </Stack>
        </Card>
      </Container>
    );
  }

  return (
    <Container size="sm" className="py-16">
      <Card className="bg-surface-secondary border-border-primary" withBorder>
        <Stack gap="lg" className="py-4">
          <Stack gap="md" align="center">
            <Avatar size="xl" color="brand" radius="xl">
              {invitation.workspace.name.charAt(0).toUpperCase()}
            </Avatar>
            <div className="text-center">
              <Title order={2} className="text-text-primary">
                Join {invitation.workspace.name}
              </Title>
              <Text className="text-text-secondary mt-1">
                You&apos;ve been invited to join this workspace
              </Text>
            </div>
          </Stack>

          <Card className="bg-surface-primary" withBorder>
            <Stack gap="sm">
              <Group justify="space-between">
                <Text size="sm" className="text-text-muted">
                  Workspace
                </Text>
                <Text size="sm" className="text-text-primary font-medium">
                  {invitation.workspace.name}
                </Text>
              </Group>
              <Group justify="space-between">
                <Text size="sm" className="text-text-muted">
                  Your role
                </Text>
                <Badge
                  color={
                    invitation.role === "admin"
                      ? "blue"
                      : invitation.role === "viewer"
                        ? "gray"
                        : "green"
                  }
                >
                  {invitation.role}
                </Badge>
              </Group>
              <Group justify="space-between">
                <Text size="sm" className="text-text-muted">
                  Invited by
                </Text>
                <Text size="sm" className="text-text-primary">
                  {invitation.createdBy.name ?? invitation.createdBy.email}
                </Text>
              </Group>
            </Stack>
          </Card>

          {acceptMutation.error && (
            <Alert color="red" icon={<IconAlertCircle size={16} />}>
              {acceptMutation.error.message}
            </Alert>
          )}

          <Group justify="center" gap="md">
            <Button
              variant="subtle"
              onClick={() => router.push("/")}
              className="text-text-secondary"
            >
              Decline
            </Button>
            <Button
              onClick={() => acceptMutation.mutate({ token })}
              loading={acceptMutation.isPending}
              leftSection={<IconCheck size={16} />}
            >
              Accept Invitation
            </Button>
          </Group>
        </Stack>
      </Card>
    </Container>
  );
}

function InviteLandingPage({
  token,
  invitation,
}: {
  token: string;
  invitation: InvitationData;
}) {
  const callbackUrl = `/invite/${token}`;
  const workspaceName = invitation.workspace.name;
  const workspaceSlug = invitation.workspace.slug;
  const workspaceInitial = workspaceName.charAt(0).toUpperCase();
  const memberCount = invitation.workspace.memberCount;
  const memberPreview = invitation.workspace.memberPreview;
  const inviterName =
    invitation.createdBy.name ?? invitation.createdBy.email ?? "A teammate";

  const [email, setEmail] = useState(invitation.email);
  const [copied, setCopied] = useState(false);
  const [pendingProvider, setPendingProvider] = useState<string | null>(null);

  const daysUntilExpiry = useMemo(() => {
    const ms = new Date(invitation.expiresAt).getTime() - Date.now();
    return Math.max(1, Math.ceil(ms / (1000 * 60 * 60 * 24)));
  }, [invitation.expiresAt]);

  const visibleMembers = memberPreview.slice(0, 3);
  const extraMembers = Math.max(0, memberCount - visibleMembers.length);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(invitation.email);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // ignore – fall back to manual selection
    }
  };

  const startSignIn = async (provider: string, targetEmail?: string) => {
    setPendingProvider(provider);
    try {
      if (provider === "postmark") {
        await signIn("postmark", {
          email: targetEmail ?? invitation.email,
          callbackUrl,
        });
      } else {
        await signIn(provider, { callbackUrl });
      }
    } finally {
      setPendingProvider(null);
    }
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    void startSignIn("postmark", email);
  };

  const isBusy = pendingProvider !== null;

  return (
    <div className="auth-surface">
      <header className="auth-header">
        <Link href="/" className="auth-header__brand">
          <Image
            src="/expo-logo-20.png"
            alt={`${PRODUCT_NAME} logo`}
            width={22}
            height={22}
            priority
          />
          <span>{PRODUCT_NAME}.im</span>
        </Link>
        <div className="auth-header__right">
          <span className="auth-header__hint">
            Already have an account?{" "}
            <a
              href={`/signin?callbackUrl=${encodeURIComponent(callbackUrl)}`}
            >
              Sign in
            </a>
          </span>
        </div>
      </header>

      <div className="auth-shell">
        <section className="auth-left">
          <div className="auth-left__inner">
            <div className="eyebrow">
              <span className="eyebrow__dot" aria-hidden="true" />
              <span>
                You&apos;ve been invited · expires in {daysUntilExpiry} days
              </span>
            </div>

            <h1 className="auth-title">
              Join{" "}
              <span className="auth-title__brand">{workspaceName}</span> on{" "}
              {PRODUCT_NAME}
            </h1>
            <p className="auth-sub">
              <b>{inviterName}</b> invited you to collaborate on the{" "}
              <b>{workspaceName}</b> workspace — where the team runs its
              rituals, projects and OKRs together.
            </p>

            <div className="invite-card">
              <div className="invite-card__ws" aria-hidden="true">
                {workspaceInitial}
              </div>
              <div className="invite-card__body">
                <div className="invite-card__label">Workspace</div>
                <div className="invite-card__ws-name">
                  {workspaceName}{" "}
                  <small>
                    · {memberCount} {memberCount === 1 ? "member" : "members"}
                  </small>
                </div>
              </div>
              <div className="invite-card__members" aria-hidden="true">
                {visibleMembers.map((m, i) => (
                  <MemberAvatar key={m.id} member={m} tone={toneForIndex(i)} />
                ))}
                {extraMembers > 0 && (
                  <div className="invite-card__avatar plus">
                    +{extraMembers}
                  </div>
                )}
              </div>
            </div>

            <div className="email-pin">
              <div className="email-pin__icon" aria-hidden="true">
                <MailGlyph />
              </div>
              <div className="email-pin__body">
                <div className="email-pin__label">Sign in with this email</div>
                <div className="email-pin__addr">{invitation.email}</div>
              </div>
              <button
                type="button"
                className={`email-pin__copy ${copied ? "copied" : ""}`}
                onClick={() => void handleCopy()}
                aria-label="Copy email"
              >
                <CopyGlyph />
                <span>{copied ? "Copied" : "Copy"}</span>
              </button>
            </div>

            <p className="email-note">
              <InfoGlyph />
              <span>
                Sign in with the <b>same email address</b> you used before —
                otherwise you&apos;ll land in a new workspace instead of{" "}
                {workspaceName}.
              </span>
            </p>

            <div className="providers">
              <button
                type="button"
                className="provider"
                onClick={() => void startSignIn("google")}
                disabled={isBusy}
              >
                <span className="provider__logo" aria-hidden="true">
                  <GoogleLogo />
                </span>
                <span className="provider__label">Sign in with Google</span>
                <ChevGlyph />
              </button>

              <button
                type="button"
                className="provider"
                onClick={() => void startSignIn("microsoft-entra-id")}
                disabled={isBusy}
              >
                <span className="provider__logo" aria-hidden="true">
                  <MicrosoftLogo />
                </span>
                <span className="provider__label">
                  Sign in with Microsoft
                </span>
                <ChevGlyph />
              </button>

              <button
                type="button"
                className="provider"
                onClick={() => void startSignIn("microsoft-entra-id")}
                disabled={isBusy}
              >
                <span
                  className="provider__logo"
                  aria-hidden="true"
                  style={{ color: "var(--color-text-secondary)" }}
                >
                  <SsoGlyph />
                </span>
                <span className="provider__label">Sign in with SSO</span>
                <ChevGlyph />
              </button>
            </div>

            <div className="or-div">
              <span className="or-div__line" />
              <span className="or-div__txt">or email a magic link</span>
              <span className="or-div__line" />
            </div>

            <form className="field" onSubmit={handleSubmit}>
              <label className="field__label" htmlFor="invite-confirm-email">
                Confirm your email
              </label>
              <input
                id="invite-confirm-email"
                className="field__input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
              />
              <button
                className="btn-primary"
                type="submit"
                disabled={isBusy}
              >
                <span>Accept invite &amp; join {workspaceName}</span>
                <ArrowRightGlyph />
              </button>
            </form>

            <p className="terms">
              By joining, you agree to our{" "}
              <a href="/terms">Terms of Service</a> and{" "}
              <a href="/privacy">Privacy Policy</a>, and to share your name and
              email with members of <b>{workspaceName}</b>.
            </p>

            <div className="support">
              <div className="support__icon" aria-hidden="true">
                <ChatGlyph />
              </div>
              <div>
                Wasn&apos;t expecting this invite, or the email above
                isn&apos;t yours? Contact{" "}
                <a href="mailto:support@exponential.im">
                  support@exponential.im
                </a>{" "}
                and we&apos;ll sort it out.
              </div>
            </div>
          </div>
        </section>

        <aside className="auth-right">
          <div className="auth-right__inner">
            <div className="marketing-eyebrow">
              <span className="marketing-eyebrow__line" />
              <span>Inside {workspaceName}</span>
            </div>

            <h2 className="marketing-head">
              A live look at what <em>{workspaceName}</em> is shipping this
              week.
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
                  {workspaceSlug} / <b>today</b>
                </div>
              </div>
              <div className="snap__body">
                <div className="snap-greeting">{workspaceName} · Week 17</div>
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
                      1:1 with {inviterName.split(" ")[0]} · draft talking
                      points
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
                <div className="marketing-foot__avatars">
                  {visibleMembers.map((m, i) => (
                    <MarketingAvatar
                      key={m.id}
                      member={m}
                      tone={toneForIndex(i)}
                    />
                  ))}
                  {extraMembers > 0 && (
                    <div className="marketing-foot__avatar a4">
                      +{extraMembers}
                    </div>
                  )}
                </div>
                <span>
                  <b>
                    {memberCount}{" "}
                    {memberCount === 1 ? "member" : "members"}
                  </b>{" "}
                  already collaborating in {workspaceName}
                </span>
              </div>
              <div
                className="marketing-foot__group"
                style={{ marginLeft: "auto" }}
              >
                <CheckGlyph />
                <span>SOC 2 · SAML SSO</span>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

/* ========================================================================== */
/* Helpers + inline SVG glyphs                                                */
/* ========================================================================== */

function toneForIndex(i: number): "a1" | "a2" | "a3" | "a4" {
  const tones: Array<"a1" | "a2" | "a3" | "a4"> = ["a1", "a2", "a3", "a4"];
  return tones[i % tones.length]!;
}

function MemberAvatar({
  member,
  tone,
}: {
  member: MemberPreview;
  tone: "a1" | "a2" | "a3" | "a4";
}) {
  if (member.image) {
    return (
      <div
        className={`invite-card__avatar ${tone}`}
        style={{
          backgroundImage: `url(${member.image})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      />
    );
  }
  return (
    <div className={`invite-card__avatar ${tone}`}>
      {initialsFor(member.name ?? member.email)}
    </div>
  );
}

function MarketingAvatar({
  member,
  tone,
}: {
  member: MemberPreview;
  tone: "a1" | "a2" | "a3" | "a4";
}) {
  if (member.image) {
    return (
      <div
        className={`marketing-foot__avatar ${tone}`}
        style={{
          backgroundImage: `url(${member.image})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      />
    );
  }
  return (
    <div className={`marketing-foot__avatar ${tone}`}>
      {initialsFor(member.name ?? member.email)}
    </div>
  );
}

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

function MailGlyph() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 7l9 6 9-6" />
    </svg>
  );
}

function CopyGlyph() {
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
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function InfoGlyph() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v4M12 16h.01" />
    </svg>
  );
}

function ChevGlyph() {
  return (
    <svg
      className="provider__chev"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    >
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

function ArrowRightGlyph() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5 12h14" />
      <path d="M13 5l7 7-7 7" />
    </svg>
  );
}

function ChatGlyph() {
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
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
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

function SsoGlyph() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="2" y="4" width="20" height="16" rx="4" />
      <path d="M8 10v2M16 10v2" />
      <path d="M7 16c1.5 1 3 1.4 5 1.4s3.5-.4 5-1.4" />
    </svg>
  );
}

/* Brand logos — colors come from CSS variables declared under .auth-surface
   in globals.css (per provider brand guidelines). Inline SVG reads CSS vars
   via the `fill` attribute, so no hex appears in this file. */
function GoogleLogo() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.71v2.26h2.91c1.7-1.57 2.69-3.88 2.69-6.61z"
        fill="var(--google-blue)"
      />
      <path
        d="M9 18c2.43 0 4.47-.8 5.96-2.19l-2.91-2.26c-.81.54-1.84.86-3.05.86-2.34 0-4.33-1.58-5.04-3.71H.96v2.33A9 9 0 0 0 9 18z"
        fill="var(--google-green)"
      />
      <path
        d="M3.96 10.7A5.4 5.4 0 0 1 3.68 9c0-.59.1-1.16.28-1.7V4.97H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.04l3-2.34z"
        fill="var(--google-yellow)"
      />
      <path
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.97l3 2.33C4.67 5.17 6.66 3.58 9 3.58z"
        fill="var(--google-red)"
      />
    </svg>
  );
}

function MicrosoftLogo() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16">
      <rect x="0" y="0" width="7" height="7" fill="var(--microsoft-red)" />
      <rect x="9" y="0" width="7" height="7" fill="var(--microsoft-green)" />
      <rect x="0" y="9" width="7" height="7" fill="var(--microsoft-blue)" />
      <rect x="9" y="9" width="7" height="7" fill="var(--microsoft-yellow)" />
    </svg>
  );
}
