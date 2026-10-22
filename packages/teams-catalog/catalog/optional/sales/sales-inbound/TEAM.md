---
name: Sales Inbound
description: Optional inbound sales team that triages new leads, qualifies them, replies through drafts, books meetings, and follows up, with a weekly pipeline review.
schema: agentcompanies/v1
slug: sales-inbound
category: sales
key: paperclipai/optional/sales/sales-inbound
manager: agents/sdr/AGENTS.md
includes:
  - projects/sales-pipeline/PROJECT.md
defaultInstall: false
recommendedForCompanyTypes:
  - agency
  - services
  - software
tags:
  - sales
  - leads
  - inbound
  - crm
---

# Sales Inbound

A three-agent team that works inbound leads from first contact to meeting. It depends on the CRM, lead, conversation, and calendar tools of the Sprint 2 surface. Installing this team does not connect any channel, calendar, or mailbox, and it does not change autonomy: every agent starts in `draft_only`.

## Procedure

Each lead moves through these steps. The owner of each step is named.

1. Lead: the SDR (`sdr`) runs `lead-triage` on every new lead, checks for duplicates, and sets priority or discards with a stated reason.
2. Qualification: the Qualifier (`qualifier`) asks the qualifying questions in a drafted reply, records the answers on the opportunity, and recommends whether to continue.
3. Reply: the SDR answers the contact in the channel they used, using `channel-reply`. Every reply is a draft until the owner allows sending.
4. Follow-up: the SDR tracks open commitments and next actions, and nudges the contact once per agreed interval.
5. Meeting: the Scheduler (`scheduler`) offers verified slots and books only the slot the contact chose, following `booking-etiquette`.

## Contents

- `SDR` (`sdr`) - team manager. Owns triage, replies, and follow-up.
- `Qualifier` (`qualifier`) - qualification questions and opportunity fields.
- `Scheduler` (`scheduler`) - meeting offers, bookings, moves, and cancellations.
- `sales-pipeline` project - rolling pipeline for inbound leads and their next actions.
- `weekly-pipeline-review` routine - weekly pass over stale leads, overdue follow-ups, and stage changes.
