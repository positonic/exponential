"use client";

/**
 * Voice debug page (Voice — Web Client, ticket #12). Proves the browser-side
 * auth-and-dispatch contract by TYPING — before any WebRTC/audio lands on top.
 *
 * Flow: mint a voice session via `voice.createSession` (NextAuth cookie auth,
 * scoped to the current workspace) → pick one of the 5 tools from the catalog →
 * type a phrase → POST to `voice.dispatch` via `brainDispatcher` → render the
 * DispatchResult. complete_action exercises the confirmation handshake.
 */
import { useMemo, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Code,
  Container,
  Group,
  Paper,
  Select,
  Stack,
  Text,
  Textarea,
  Title,
} from "@mantine/core";

import { api } from "~/trpc/react";
import { useWorkspace } from "~/providers/WorkspaceProvider";
import {
  dispatch,
  BrainDispatchError,
  type BrainDispatchInput,
} from "~/lib/voice/brainDispatcher";
import { VOICE_TOOL_CATALOG } from "~/lib/voice/voiceToolCatalog";
import type { DispatchResult } from "~/server/api/routers/voice";

/** Narrow the `pendingCompletion.id` out of a complete_action gate result. */
function pendingActionIdOf(structured: unknown): string | undefined {
  if (typeof structured !== "object" || structured === null) return undefined;
  const pending = (structured as Record<string, unknown>).pendingCompletion;
  if (typeof pending !== "object" || pending === null) return undefined;
  const id = (pending as Record<string, unknown>).id;
  return typeof id === "string" ? id : undefined;
}

export default function VoiceDebugPage() {
  const { workspace, workspaceId } = useWorkspace();

  const [token, setToken] = useState<string | null>(null);
  const [toolName, setToolName] = useState<string>(VOICE_TOOL_CATALOG[0]!.name);
  const [phrase, setPhrase] = useState("");
  const [result, setResult] = useState<DispatchResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dispatching, setDispatching] = useState(false);

  const createSession = api.voice.createSession.useMutation({
    onSuccess: (data) => {
      setToken(data.voiceSessionToken);
      setError(null);
      setResult(null);
    },
    onError: (e) => setError(e.message),
  });

  const toolOptions = useMemo(
    () => VOICE_TOOL_CATALOG.map((t) => ({ value: t.name, label: t.name })),
    [],
  );

  const pendingActionId = result?.needsConfirmation
    ? pendingActionIdOf(result.structured)
    : undefined;

  async function runDispatch(confirm: boolean) {
    if (!token) return;
    setDispatching(true);
    setError(null);
    const input: BrainDispatchInput = {
      toolName,
      voiceSessionToken: token,
      ...(phrase.trim() ? { args: { phrase: phrase.trim() } } : {}),
      ...(confirm ? { confirm: true } : {}),
      ...(confirm && pendingActionId ? { pendingActionId } : {}),
    };
    try {
      const res = await dispatch(input);
      setResult(res);
    } catch (e) {
      const msg =
        e instanceof BrainDispatchError
          ? `[${e.kind}${e.code ? `/${e.code}` : ""}] ${e.message}`
          : e instanceof Error
            ? e.message
            : "Unknown error";
      setError(msg);
    } finally {
      setDispatching(false);
    }
  }

  return (
    <Container size="sm" py="xl">
      <Stack gap="lg">
        <div>
          <Title order={2}>Voice brain — debug console</Title>
          <Text size="sm" c="dimmed">
            Type to exercise <Code>voice.dispatch</Code> in workspace{" "}
            <strong>{workspace?.name ?? "—"}</strong>. No audio; auth is your
            signed-in session.
          </Text>
        </div>

        <Paper withBorder p="md" radius="md">
          <Group justify="space-between">
            <div>
              <Text fw={500}>Session</Text>
              <Text size="xs" c="dimmed">
                {token ? "Voice session minted." : "No session yet."}
              </Text>
            </div>
            <Group gap="xs">
              {token ? <Badge color="green">ready</Badge> : null}
              <Button
                onClick={() =>
                  createSession.mutate(
                    workspaceId ? { workspaceId } : undefined,
                  )
                }
                loading={createSession.isPending}
                variant="light"
              >
                {token ? "Re-mint session" : "Mint session"}
              </Button>
            </Group>
          </Group>
        </Paper>

        <Paper withBorder p="md" radius="md">
          <Stack gap="sm">
            <Select
              label="Tool"
              data={toolOptions}
              value={toolName}
              onChange={(v) => v && setToolName(v)}
              allowDeselect={false}
            />
            <Textarea
              label="Phrase / args"
              placeholder="e.g. draft the investor update by Friday"
              value={phrase}
              onChange={(e) => setPhrase(e.currentTarget.value)}
              autosize
              minRows={2}
              description="get_todays_plan ignores this; the other tools pass it verbatim as `phrase`."
            />
            <Group>
              <Button
                onClick={() => void runDispatch(false)}
                loading={dispatching}
                disabled={!token}
              >
                Dispatch
              </Button>
              {result?.needsConfirmation ? (
                <Button
                  color="red"
                  variant="light"
                  onClick={() => void runDispatch(true)}
                  loading={dispatching}
                  disabled={!token}
                >
                  Confirm (yes)
                </Button>
              ) : null}
            </Group>
          </Stack>
        </Paper>

        {error ? (
          <Alert color="red" title="Dispatch error">
            {error}
          </Alert>
        ) : null}

        {result ? (
          <Paper withBorder p="md" radius="md">
            <Stack gap="xs">
              <Group gap="xs">
                <Text fw={500}>Result</Text>
                {result.needsConfirmation ? (
                  <Badge color="orange">needs confirmation</Badge>
                ) : (
                  <Badge color="gray">final</Badge>
                )}
              </Group>
              <Text>{result.speakable}</Text>
              <Text size="xs" c="dimmed">
                structured
              </Text>
              <Code block>{JSON.stringify(result.structured, null, 2)}</Code>
            </Stack>
          </Paper>
        ) : null}
      </Stack>
    </Container>
  );
}
