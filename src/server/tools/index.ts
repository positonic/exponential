import { adderTool } from './adderTool';
import { createVideoSearchTool } from './videoSearchTool';
import { createAddVideoTool } from './addVideoTool';
import { gmTool } from './gmTool';
import { createActionTools } from "~/server/tools/actionTools";
import { createGithubTools } from "~/server/tools/githubTools";

export const getTools = (ctx: any) => {
  const actionTools = createActionTools(ctx);
  const githubTools = createGithubTools(ctx);
  return [
    adderTool,
    gmTool(),
    createVideoSearchTool(ctx),
    createAddVideoTool(ctx),
    actionTools.createActionTool,
    actionTools.readActionTool,
    actionTools.updateActionTool,
    actionTools.deleteActionTool,
    actionTools.retrieveActionsTool
  ]
}