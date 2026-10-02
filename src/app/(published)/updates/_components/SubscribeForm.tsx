"use client";

import { Button, TextInput } from "@mantine/core";
import { useEffect, useRef, useState } from "react";

/**
 * Newsletter signup on a workspace's public updates page. Double opt-in: this
 * only sends a confirmation email; the address joins the List once its owner
 * follows the link. Carries the Forms spam defences: a hidden honeypot field
 * and the time the form was on screen.
 */
export function SubscribeForm({ workspaceSlug, workspaceName }: { workspaceSlug: string; workspaceName: string }) {
  const [email, setEmail] = useState("");
  const [honeypot, setHoneypot] = useState("");
  const [state, setState] = useState<{ kind: "idle" | "sending" | "sent" } | { kind: "error"; message: string }>({
    kind: "idle",
  });
  const renderedAtRef = useRef<number | null>(null);

  useEffect(() => {
    renderedAtRef.current = Date.now();
  }, []);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState({ kind: "sending" });
    try {
      const res = await fetch(`/api/updates/${encodeURIComponent(workspaceSlug)}/subscribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          honeypot,
          elapsedMs: renderedAtRef.current ? Date.now() - renderedAtRef.current : 0,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (res.ok && data.ok) {
        setState({ kind: "sent" });
      } else {
        setState({ kind: "error", message: data.error ?? "Something went wrong. Please try again." });
      }
    } catch {
      setState({ kind: "error", message: "Something went wrong. Please try again." });
    }
  }

  if (state.kind === "sent") {
    return (
      <section className="mb-10 rounded-lg border border-border-primary bg-surface-secondary p-5">
        <p className="font-semibold text-text-primary">Check your inbox</p>
        <p className="mt-1 text-sm text-text-secondary">
          We sent a link to {email}. Follow it to confirm and you&apos;re subscribed.
        </p>
      </section>
    );
  }

  return (
    <section className="mb-10 rounded-lg border border-border-primary bg-surface-secondary p-5">
      <p className="font-semibold text-text-primary">Get {workspaceName} updates by email</p>
      <p className="mt-1 text-sm text-text-secondary">A short update when there&apos;s news. Unsubscribe any time.</p>
      <form onSubmit={(e) => void submit(e)} className="relative mt-4 flex flex-col gap-2 sm:flex-row sm:items-start">
        <TextInput
          type="email"
          required
          aria-label="Email address"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.currentTarget.value)}
          error={state.kind === "error" ? state.message : undefined}
          className="flex-1"
        />
        <input
          type="text"
          name="website"
          tabIndex={-1}
          autoComplete="off"
          value={honeypot}
          onChange={(e) => setHoneypot(e.currentTarget.value)}
          style={{ position: "absolute", left: "-9999px", width: 1, height: 1 }}
          aria-hidden="true"
        />
        <Button type="submit" loading={state.kind === "sending"}>
          Subscribe
        </Button>
      </form>
    </section>
  );
}
