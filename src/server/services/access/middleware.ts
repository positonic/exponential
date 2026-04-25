/**
 * tRPC Middleware Factories for Access Control
 *
 * Provides composable middleware that can be chained onto tRPC procedures
 * to enforce access control at the router level.
 *
 * Usage:
 *   import { requireActionAccess } from '~/server/services/access/middleware';
 *
 *   update: protectedProcedure
 *     .input(z.object({ id: z.string(), ... }))
 *     .use(requireActionAccess('edit'))
 *     .mutation(async ({ ctx, input }) => { ... })
 */

import { TRPCError } from "@trpc/server";
import type { Permission, ResourceType } from "./types";
import { AccessControlService } from "./AccessControlService";
import { getProjectAccess, hasProjectAccess, canEditProject } from "./resolvers/projectResolver";
import { getActionAccess, canViewAction, canEditAction } from "./resolvers/actionResolver";

// ── Type for the tRPC middleware context ────────────────────────────
interface MiddlewareCtx {
  db: any; // PrismaClient
  session: { user: { id: string; isAdmin: boolean } };
}

type MiddlewareOpts = {
  ctx: MiddlewareCtx;
  input: any;
  next: (opts?: { ctx: any }) => any;
};

// ── Generic resource access middleware ──────────────────────────────

/**
 * Create a middleware that checks access to a resource.
 * The resourceId is extracted from the input using the idField parameter.
 */
export function requireAccess(
  resourceType: ResourceType,
  permission: Permission,
  idField = "id",
) {
  return async (opts: MiddlewareOpts) => {
    const { ctx, input, next } = opts;
    const userId = ctx.session.user.id;
    const resourceId = input?.[idField];

    if (!resourceId) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Missing required field '${idField}' for access check`,
      });
    }

    const service = new AccessControlService(ctx.db);
    const result = await service.canAccess({
      userId,
      resourceType,
      resourceId,
      permission,
    });

    if (!result.allowed) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: result.reason,
      });
    }

    return next({
      ctx: {
        ...ctx,
        access: result,
      },
    });
  };
}

// ── Convenience middleware for common patterns ──────────────────────

/** Require the user can view/edit/delete an action (by input.id) */
export function requireActionAccess(permission: Permission, idField = "id") {
  return async (opts: MiddlewareOpts) => {
    const { ctx, input, next } = opts;
    const userId = ctx.session.user.id;
    const actionId = input?.[idField];

    if (!actionId) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Missing required field '${idField}' for action access check`,
      });
    }

    const access = await getActionAccess(ctx.db, userId, actionId);

    if (!access) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Action not found",
      });
    }

    const allowed =
      permission === "view"
        ? canViewAction(access)
        : canEditAction(access);

    if (!allowed) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: `You do not have ${permission} access to this action`,
      });
    }

    return next({
      ctx: { ...ctx, actionAccess: access },
    });
  };
}

/** Require workspace membership with minimum role */
export function requireWorkspaceMembership(
  permission: Permission,
  workspaceIdField = "workspaceId",
) {
  return async (opts: MiddlewareOpts) => {
    const { ctx, input, next } = opts;
    const userId = ctx.session.user.id;
    const workspaceId = input?.[workspaceIdField];

    if (!workspaceId) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Missing required field '${workspaceIdField}' for workspace access check`,
      });
    }

    const service = new AccessControlService(ctx.db);
    const result = await service.canAccess({
      userId,
      resourceType: "workspace",
      resourceId: workspaceId,
      permission,
    });

    if (!result.allowed) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: result.reason,
      });
    }

    return next({
      ctx: { ...ctx, workspaceAccess: result },
    });
  };
}

/** Require team membership with minimum role */
export function requireTeamMembership(
  permission: Permission,
  teamIdField = "teamId",
) {
  return async (opts: MiddlewareOpts) => {
    const { ctx, input, next } = opts;
    const userId = ctx.session.user.id;
    const teamId = input?.[teamIdField];

    if (!teamId) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Missing required field '${teamIdField}' for team access check`,
      });
    }

    const service = new AccessControlService(ctx.db);
    const result = await service.canAccess({
      userId,
      resourceType: "team",
      resourceId: teamId,
      permission,
    });

    if (!result.allowed) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: result.reason,
      });
    }

    return next({
      ctx: { ...ctx, teamAccess: result },
    });
  };
}

/**
 * Require that the user has access to a project.
 * Checks all access paths: creator, member, team, workspace, public.
 */
export function requireProjectAccess(
  permission: Permission,
  projectIdField = "projectId",
) {
  return async (opts: MiddlewareOpts) => {
    const { ctx, input, next } = opts;
    const userId = ctx.session.user.id;
    const projectId = input?.[projectIdField];

    if (!projectId) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Missing required field '${projectIdField}' for project access check`,
      });
    }

    const access = await getProjectAccess(ctx.db, userId, projectId);

    if (permission === "view" && !hasProjectAccess(access)) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "You do not have access to this project",
      });
    }

    if ((permission === "edit" || permission === "delete") && !canEditProject(access)) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: `You do not have ${permission} access to this project`,
      });
    }

    return next({
      ctx: { ...ctx, projectAccess: access },
    });
  };
}
