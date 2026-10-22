---
name: Customer Care
description: Optional customer care team that answers customer messages across channels through drafts, escalates decisions that need a human, and runs a weekly care review of open conversations.
schema: agentcompanies/v1
slug: customer-care
category: customer-care
key: paperclipai/optional/customer-care/customer-care
manager: agents/support-agent/AGENTS.md
includes:
  - projects/customer-support-queue/PROJECT.md
defaultInstall: false
recommendedForCompanyTypes:
  - services
  - software
  - agency
tags:
  - customer-care
  - support
  - escalation
  - conversations
---

# Customer Care

A two-agent team for customer messages. The Support Agent answers questions from the customer record and drafts replies; the Escalation Agent takes anything that needs a human decision and hands it over with the context. Installing this team does not connect any channel, and it does not change autonomy: every agent starts in `draft_only`.

## Procedure

1. Intake: the Support Agent (`support-agent`) reads each new conversation and the customer record, and decides whether it can answer from known facts.
2. Answer: the Support Agent drafts the reply with `channel-reply` and records any promise as a commitment.
3. Escalate: anything that needs a refund decision, an exception, a complaint about a person, a legal or security question, or an unknown fact goes to the Escalation Agent (`escalation-agent`), who sets the conversation priority, writes the handoff note, and tells the customer what happens next.
4. Close: the conversation returns to `waiting_them` or `closed` with `conversation_set_state`, once the next step is clear.
5. Review: the weekly care review checks open conversations and unresolved commitments.

## Contents

- `Support Agent` (`support-agent`) - team manager. Answers and drafts replies.
- `Escalation Agent` (`escalation-agent`) - handoffs to people with full context.
- `customer-support-queue` project - rolling queue of open customer conversations.
- `weekly-care-review` routine - weekly pass over waiting conversations and missed commitments.
