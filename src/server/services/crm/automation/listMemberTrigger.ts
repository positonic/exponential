/**
 * `WorkflowDefinition.triggerType` value for a "contact added to a List"
 * Automation trigger — the `list_member_added` event of
 * [ADR-0031](../../../../../docs/adr/0031-state-transitions-are-triggers-not-a-merged-table.md).
 *
 * A List does not contain automation logic; adding a member *emits* this event,
 * and an Automation whose `config.listId` matches the List subscribes to it.
 * The matching definition's first step is run via the shared `WorkflowEngine`.
 */
export const LIST_MEMBER_ADDED_TRIGGER = "list_member_added";
