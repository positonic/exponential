"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { api } from "~/trpc/react";
import { type RouterOutputs } from "~/trpc/react";
import { STEP_ORDER, type StepId } from "./welcomeCopy";

export type WelcomeSetup = RouterOutputs["welcome"]["getSetup"];
export type WelcomeSetupState = WelcomeSetup["state"];

/** A user's answer to a setup question (chip click or free text). */
export interface StepAnswer {
  value: string;
  /** Suggestion chip index (-1 for free text). Only meaningful for the goal step. */
  idx?: number;
  /** What to render as the user's chat bubble / checklist label. */
  label: string;
}

/** localStorage key stashing which calendar provider the user picked before the OAuth redirect. */
const CAL_PROVIDER_STASH = "welcome-cal-provider";

function localMidnight(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Pure step-completion derivation, shared by the hook and by chat messages
 * that need a live view of progress (e.g. the framework diagram).
 */
export function stepDone(
  data: WelcomeSetup | null | undefined,
  id: StepId,
): boolean {
  const state = data?.state;
  if (!state) return false;
  switch (id) {
    case "goal":
      return !!state.goal;
    case "action":
      return !!state.action;
    case "plan":
      return state.planCreated;
    case "cal":
      return state.calendar !== null || (data?.calendarConnected ?? false);
  }
}

/**
 * Shared setup state for the "Getting started" page. Both the Chat and
 * Checklist views drive this one hook, so progress stays in sync and every
 * answer creates a real object through the `welcome` router.
 */
export function useWelcomeSetup() {
  const utils = api.useUtils();
  const router = useRouter();

  const { data, isLoading } = api.welcome.getSetup.useQuery();
  const state = data?.state ?? null;
  const calendarConnected = data?.calendarConnected ?? false;

  const applyState = useCallback(
    (nextState: WelcomeSetupState) => {
      utils.welcome.getSetup.setData(undefined, (old) =>
        old ? { ...old, state: nextState } : old,
      );
    },
    [utils],
  );

  /** Refresh whatever the created object feeds elsewhere (sidebar badges, lists). */
  const invalidateAfter = useCallback(
    (step: StepId) => {
      void utils.user.getWelcomeProgress.invalidate();
      if (step === "goal") {
        void utils.goal.invalidate();
      }
      if (step === "action") {
        void utils.action.getToday.invalidate();
        void utils.action.getAll.invalidate();
      }
      if (step === "plan") {
        void utils.dailyPlan.invalidate();
        void utils.action.getToday.invalidate();
      }
    },
    [utils],
  );

  const createGoal = api.welcome.createGoal.useMutation({
    onSuccess: (nextState) => {
      applyState(nextState);
      invalidateAfter("goal");
    },
  });
  const createAction = api.welcome.createAction.useMutation({
    onSuccess: (nextState) => {
      applyState(nextState);
      invalidateAfter("action");
    },
  });
  const planDay = api.welcome.planDay.useMutation({
    onSuccess: (nextState) => {
      applyState(nextState);
      invalidateAfter("plan");
    },
  });
  const setCalendar = api.welcome.setCalendar.useMutation({
    onSuccess: (nextState) => {
      applyState(nextState);
      void utils.user.getWelcomeProgress.invalidate();
    },
  });
  const completeWelcome = api.user.completeWelcome.useMutation({
    onSuccess: () => {
      void utils.user.getWelcomeProgress.invalidate();
    },
  });

  const isStepDone = useCallback(
    (id: StepId): boolean => stepDone(data, id),
    [data],
  );

  const nextStep = useMemo(
    () => STEP_ORDER.find((id) => !isStepDone(id)) ?? null,
    [isStepDone],
  );
  const doneCount = useMemo(
    () => STEP_ORDER.filter((id) => isStepDone(id)).length,
    [isStepDone],
  );
  const allDone = !!state && nextStep === null;

  /**
   * Answer the given step. For calendar connections this navigates to the
   * OAuth flow (full-page redirect back to /welcome afterwards); everything
   * else resolves when the real object has been created.
   */
  const answerStep = useCallback(
    async (step: StepId, answer: StepAnswer): Promise<void> => {
      switch (step) {
        case "goal":
          await createGoal.mutateAsync({
            title: answer.value,
            suggestionIndex: answer.idx ?? -1,
          });
          return;
        case "action":
          // "Now" (not local midnight) so the action always lands inside the
          // server-computed today window used by action.getToday.
          await createAction.mutateAsync({
            name: answer.value,
            dueDate: new Date(),
          });
          return;
        case "plan":
          await planDay.mutateAsync({ date: localMidnight() });
          return;
        case "cal": {
          if (answer.value === "skipped") {
            await setCalendar.mutateAsync({ choice: "skipped" });
            return;
          }
          const provider = answer.value === "outlook" ? "outlook" : "google";
          try {
            localStorage.setItem(CAL_PROVIDER_STASH, provider);
          } catch {
            /* stash is best-effort; we fall back to google on return */
          }
          const route =
            provider === "outlook"
              ? "/api/auth/microsoft-calendar"
              : "/api/auth/google-calendar";
          window.location.assign(`${route}?returnUrl=${encodeURIComponent("/welcome")}`);
          return;
        }
      }
    },
    [createGoal, createAction, planDay, setCalendar],
  );

  // Back from the calendar OAuth flow: the ConnectedAccount now exists, so
  // record which provider was chosen in the setup state.
  const recordedCalRef = useRef(false);
  useEffect(() => {
    if (!state || !calendarConnected || state.calendar !== null) return;
    if (recordedCalRef.current) return;
    recordedCalRef.current = true;
    let stashed: string | null = null;
    try {
      stashed = localStorage.getItem(CAL_PROVIDER_STASH);
      localStorage.removeItem(CAL_PROVIDER_STASH);
    } catch {
      /* ignore */
    }
    setCalendar.mutate({ choice: stashed === "outlook" ? "outlook" : "google" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, calendarConnected]);

  // All four steps answered → mark welcome complete so the page never
  // reappears (the "Go to Today" CTA just navigates).
  const completedRef = useRef(false);
  useEffect(() => {
    if (!data || !allDone || data.welcomeCompletedAt || completedRef.current) return;
    completedRef.current = true;
    completeWelcome.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, allDone]);

  const goToToday = useCallback(() => {
    router.push("/today");
  }, [router]);

  const isAnswerPending =
    createGoal.isPending ||
    createAction.isPending ||
    planDay.isPending ||
    setCalendar.isPending;

  return {
    isLoading,
    userName: data?.userName ?? null,
    firstName: data?.userName?.trim().split(/\s+/)[0] ?? null,
    state,
    calendarConnected,
    isStepDone,
    nextStep,
    doneCount,
    allDone,
    answerStep,
    isAnswerPending,
    goToToday,
  };
}

export type WelcomeSetupApi = ReturnType<typeof useWelcomeSetup>;
