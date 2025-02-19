import { adderTool } from './adderTool';
import { createVideoSearchTool } from './videoSearchTool';
import { createAddVideoTool } from './addVideoTool';
import { gmTool } from './gmTool';
import { createActionTools } from "~/server/tools/actionTools";


export const getTools = (ctx: any) => {
  const actionTools = createActionTools(ctx);
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