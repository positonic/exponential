"use client";

import { useState } from "react";
import { PRODUCT_NAME } from "~/lib/brand";
import type { AuthorizeParams } from "~/server/mcp/oauth/authorizeRequest";
import { api } from "~/trpc/react";

export interface ConsentAgent {
  id: string;
  name: string;
  workspaces: string[];
}

/** A workspace the person may give a new agent (they hold at least `member` there). */
export interface ConsentWorkspace {
  id: string;
  name: string;
  isPersonal: boolean;
}

interface AuthorizeFormProps {
  /** The authorization request exactly as received; `approve` re-validates it server-side. */
  request: AuthorizeParams;
  clientName: string;
  /** Where approving sends the person, as the server describes the redirect URI. */
  returnTo: string;
  agents: ConsentAgent[];
  workspaces: ConsentWorkspace[];
  /** False while `MCP_OAUTH_MODE` is `admin` and the person is not an admin. */
  canApprove: boolean;
  /** The client's redirect URI carrying `access_denied`, built by the server. */
  denyHref: string;
}

/**
 * `choose`: pick one of your agents and approve. `setup` then `review`: the
 * two steps that set up a new agent, which is where someone with no agent
 * starts. Nothing is written until Approve, which creates the agent and the
 * connection together.
 */
type Step = "choose" | "setup" | "review";

const NAME_MAX = 100;

export function AuthorizeForm({
  request,
  clientName,
  returnTo,
  agents,
  workspaces,
  canApprove,
  denyHref,
}: AuthorizeFormProps) {
  const [step, setStep] = useState<Step>(agents.length > 0 ? "choose" : "setup");
  const [agentId, setAgentId] = useState(agents[0]?.id ?? "");
  const [newName, setNewName] = useState(clientName.slice(0, NAME_MAX));
  // A lone workspace is the only possible answer, so it starts ticked.
  const [workspaceIds, setWorkspaceIds] = useState<string[]>(
    workspaces.length === 1 && workspaces[0] ? [workspaces[0].id] : [],
  );
  const [error, setError] = useState<string | null>(null);
  const [isNavigating, setIsNavigating] = useState(false);

  const approve = api.oauthConnection.approve.useMutation({
    onSuccess: ({ redirectTo }) => {
      setIsNavigating(true);
      window.location.href = redirectTo;
    },
    onError: (err) => setError(err.message),
  });
  const isBusy = approve.isPending || isNavigating;

  const deny = (
    <a className="btn-secondary" href={denyHref}>
      Deny
    </a>
  );
  const errorBox = error && (
    <p className="auth-error" role="alert">
      {error}
    </p>
  );
  const returnNote = (
    <p className="auth-note">
      Approving sends you back to <b>{returnTo}</b>. Only continue if you started this from {clientName}.
    </p>
  );

  if (!canApprove) {
    return (
      <div className="verify-form">
        <p className="auth-error" role="alert">
          Connecting apps with OAuth is limited to admins on this install for now.
        </p>
        {deny}
      </div>
    );
  }

  if (step === "choose") {
    return (
      <form
        className="verify-form"
        onSubmit={(event) => {
          event.preventDefault();
          setError(null);
          approve.mutate({ request, agentId });
        }}
      >
        <p className="consent-intro">
          {clientName} wants to work in {PRODUCT_NAME}. Choose which of your agents it acts as: it can do what
          that agent can, in that agent&apos;s workspaces, and everything it does is labelled with that
          agent&apos;s name.
        </p>
        {errorBox}

        <fieldset className="consent-agents">
          <legend className="field__label">Act as</legend>
          {agents.map((agent) => (
            <label key={agent.id} className="consent-agent">
              <input
                type="radio"
                name="agent"
                value={agent.id}
                checked={agentId === agent.id}
                onChange={() => setAgentId(agent.id)}
              />
              <span className="consent-agent__text">
                <span className="consent-agent__name">{agent.name}</span>
                <span className="consent-agent__desc">
                  {agent.workspaces.length > 0 ? agent.workspaces.join(", ") : "No workspaces yet"}
                </span>
              </span>
            </label>
          ))}
        </fieldset>
        <button
          type="button"
          className="consent-back"
          onClick={() => {
            setError(null);
            setStep("setup");
          }}
        >
          Or set up a new agent for {clientName}
        </button>

        {returnNote}
        <button type="submit" className="btn-primary" disabled={isBusy || !agentId}>
          {isBusy ? "Connecting…" : `Approve ${clientName}`}
        </button>
        {deny}
      </form>
    );
  }

  if (workspaces.length === 0) {
    return (
      <div className="verify-form">
        <p className="auth-error" role="alert">
          An agent needs at least one workspace to work in, and you aren&apos;t a member of any workspace you can
          share. Ask a workspace owner to make you a member, then start again from {clientName}.
        </p>
        {deny}
      </div>
    );
  }

  const chosen = workspaces.filter((workspace) => workspaceIds.includes(workspace.id));
  const name = newName.trim();
  const backToAgents = agents.length > 0 && (
    <button type="button" className="consent-back" onClick={() => setStep("choose")}>
      Back to my agents
    </button>
  );

  if (step === "setup") {
    return (
      <form
        className="verify-form"
        onSubmit={(event) => {
          event.preventDefault();
          setError(null);
          setStep("review");
        }}
      >
        <p className="consent-step">Step 1 of 2</p>
        <h2 className="consent-heading">Set up an agent for {clientName}</h2>
        <p className="consent-intro">
          {clientName} works in {PRODUCT_NAME} as an <b>agent</b>: a helper account that belongs to you. It can
          only see the workspaces you pick here, and everything it does is labelled with its name, so you can
          always tell its work from yours.
        </p>

        <div className="field">
          <label className="field__label" htmlFor="consent-agent-name">
            Agent name
          </label>
          <input
            id="consent-agent-name"
            className="field__input"
            value={newName}
            maxLength={NAME_MAX}
            onChange={(event) => setNewName(event.target.value)}
            required
          />
          <p className="field__hint">You&apos;ll see this name next to everything {clientName} creates.</p>
        </div>

        <fieldset className="consent-agents">
          <legend className="field__label">Which workspaces can it see?</legend>
          {workspaces.map((workspace) => (
            <label key={workspace.id} className="consent-agent">
              <input
                type="checkbox"
                checked={workspaceIds.includes(workspace.id)}
                onChange={(event) =>
                  setWorkspaceIds((ids) =>
                    event.target.checked ? [...ids, workspace.id] : ids.filter((id) => id !== workspace.id),
                  )
                }
              />
              <span className="consent-agent__text">
                <span className="consent-agent__name">{workspace.name}</span>
                {workspace.isPersonal && <span className="consent-agent__desc">Your personal workspace</span>}
              </span>
            </label>
          ))}
          <p className="field__hint">Pick at least one. You can change this later in Settings → Agents.</p>
        </fieldset>

        <button type="submit" className="btn-primary" disabled={!name || chosen.length === 0}>
          Continue
        </button>
        {backToAgents}
        {deny}
      </form>
    );
  }

  return (
    <form
      className="verify-form"
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        approve.mutate({ request, newAgent: { name, workspaceIds: chosen.map((workspace) => workspace.id) } });
      }}
    >
      <p className="consent-step">Step 2 of 2</p>
      <h2 className="consent-heading">Approve {clientName}</h2>
      <p className="consent-intro">
        Approving creates your agent <b>{name}</b> and connects {clientName} to it. {clientName} will be able to
        read and change things in <b>{chosen.map((workspace) => workspace.name).join(", ")}</b>, and nothing
        else.
      </p>
      <button type="button" className="consent-back" onClick={() => setStep("setup")} disabled={isBusy}>
        Change the name or workspaces
      </button>
      {errorBox}

      {returnNote}
      <button type="submit" className="btn-primary" disabled={isBusy}>
        {isBusy ? "Connecting…" : `Approve ${clientName}`}
      </button>
      {deny}
    </form>
  );
}
