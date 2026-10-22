---
name: Agency Content
description: Optional agency content team that turns client briefs into pieces, runs them through editorial correction and a final review, and delivers them with a weekly delivery check.
schema: agentcompanies/v1
slug: agency-content
category: content
key: paperclipai/optional/content/agency-content
manager: agents/account-manager/AGENTS.md
includes:
  - projects/client-deliveries/PROJECT.md
defaultInstall: false
recommendedForCompanyTypes:
  - agency
  - marketing
tags:
  - content
  - agency
  - client
  - delivery
---

# Agency Content

A four-agent team for client content work. Briefs go in, reviewed pieces come out, and nothing reaches a client without a review verdict and the owner's approval. Installing this team does not connect any client channel or publishing account, and it does not change autonomy: every agent starts in `draft_only`.

## Procedure

Each client request moves through these steps. The owner of each step is named.

1. Brief: the Account Manager (`account-manager`) runs `client-brief-intake`, fills the brief, and asks the client for anything critical that is missing.
2. Pieces: the Writer (`writer`) drafts each piece against the brief and its listed sources.
3. Correction: the Editor (`editor`) revises the draft for voice, structure, and facts, and sends it back with the open questions.
4. Review: the Reviewer (`reviewer`) runs `delivery-review` and returns approve, revise, or block.
5. Delivery: the Account Manager delivers approved pieces through the gate, and tracks the client's response.

## Contents

- `Account Manager` (`account-manager`) - team manager. Owns the brief, the client relationship, and delivery.
- `Writer` (`writer`) - drafts pieces from approved briefs.
- `Editor` (`editor`) - correction pass on drafts.
- `Reviewer` (`reviewer`) - final check against the brief and the delivery standard.
- `client-deliveries` project - rolling queue of client pieces from brief to delivery.
- `weekly-delivery-review` routine - weekly pass over pieces stuck in review and deadlines at risk.
