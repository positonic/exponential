# Free/busy existence is workspace-visible; event content never is

Status: accepted

The availability-grid view of the schedule-meeting flow shows the organizer
*each attendee's* busy time, where V3 previously exposed only the computed
intersection ("these slots work for everyone"). The exposed shape is
30-minute-quantized cell statuses (`free | busy | outside`), with "outside"
masking "busy" — strictly coarser than raw busy blocks. Returning raw
start/end blocks later would be an *expansion* of this boundary, not parity.
This deliberately loosens the exposure boundary: a non-viewer workspace
member can now see *when* another member is busy — late starts, gaps, how
packed a day is — which the intersection hid.

What does **not** change is the content invariant of ADR-0057's read path:
cross-user calendar reads still go exclusively through the structural
free/busy contract (`listBusyBlocksByUser`), whose Prisma `select` is the
whole contract — start/end/all-day/source, never title, location, or
attendees. The line we are drawing, permanently: **existence of busy time is
workspace-visible; the content of events never is.**

## Considered options

- **Intersection only (status quo)** — rejected: makes the grid impossible
  and hides *whose* conflict a proposed time steamrolls, which is the point
  of an availability view.
- **Anonymous heatmap** (counts, no names) — rejected: less revealing but
  the organizer can't negotiate around a specific person's conflict.
- **Per-attendee blocks, names attached, non-viewer members** — chosen.
  Times-only free/busy visibility inside an org is the established norm
  (Outlook, Google Calendar). A per-user "hide my free/busy" opt-out is an
  easy follow-on if a workspace needs stricter hygiene.
