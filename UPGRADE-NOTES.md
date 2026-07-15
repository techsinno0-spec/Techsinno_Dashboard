# TECHSINNO AI Agent Upgrade — Install Notes

This upgrade turns the AI agent from a read-only chat + queue into a working assistant with five roles: secretary, administrator, bookkeeper, marketing agent, and sourcing lead. Nine files, all complete and ready to paste via the GitHub web UI. The deploy workflow will pick them up as usual.

## Where each file goes

| File | Repo path | New or replace |
|---|---|---|
| `zoho-books.js` | `api/shared/zoho-books.js` | NEW |
| `mail-scan.js` | `api/shared/mail-scan.js` | NEW |
| `agent-tools.js` | `api/shared/agent-tools.js` | NEW |
| `ai-chat.js` | `api/src/functions/ai-chat.js` | REPLACE |
| `agent-scan.js` | `api/src/functions/agent-scan.js` | REPLACE |
| `agent-briefing.js` | `api/src/functions/agent-briefing.js` | NEW |
| `agent-queue-get.js` | `api/src/functions/agent-queue-get.js` | REPLACE |
| `agent-briefing.yml` | `.github/workflows/agent-briefing.yml` | NEW |
| `ai-agent.js` | `web/js/pages/ai-agent.js` | REPLACE |

No changes to `web/app.html`, `email-send.js`, `zoho-dashboard.js`, `package.json` or the existing scan workflow. The chat response contract is unchanged, so the Electron app and web chat keep working as-is.

## What changed

**1. The chat is now a real agent (managers/owner only).** `ai-chat.js` runs a tool-use loop with 19 tools defined in `agent-tools.js`. Claude can read live tasks, CRM, job cards, quotes, reminders, unread email from all three providers, and Zoho Books figures — and can act: create/update tasks, set reminders, add/update CRM clients, draft quotes, and draft emails. Try: "What should I focus on today?", "Chase the overdue invoices", "Reply to the RFQ from this morning and set a follow-up reminder", "Draft a quote for [client] for a control-panel inspection at R2,500". Staff chat is unchanged (simple, task-scoped, no tools).

**2. Approval model.** The agent NEVER sends email. `queue_email_for_approval` parks drafts in the existing AI Agent queue where you review, edit and press Send — same flow you already use. Every write the agent makes (tasks, clients, quotes, reminders) is logged to the activity feed with an `ai_` prefix, so you can audit everything it did.

**3. Bookkeeper.** The scan now pulls Zoho Books (using your existing connection) and creates `invoice_overdue` queue items — each with a polite, ready-to-send payment chaser, pre-addressed when the client's email is in the CRM. The chat has `get_books_summary` and `list_overdue_invoices` (owner-only, same rule as the Zoho dashboard page).

**4. Morning briefing.** New endpoint `POST /api/agent/briefing` composes a plaintext briefing — top 3 priorities (written by Claude), money, follow-ups due, tasks, problem jobs, reminders, unread inbox, pending approvals — and emails it to you through a connected account. The new workflow triggers it weekdays at 07:00 SAST; there is also an "Email briefing" button on the AI Agent page. Test without sending: `curl -X POST "$API_BASE/api/agent/briefing" -H "X-Agent-Scan-Secret: $SECRET" -H "Content-Type: application/json" -d '{"dryRun":true}'`.

**5. Scan fixes.** The Upwork RSS leg is removed — Upwork discontinued public RSS feeds on 20 Aug 2024, so it has been silently returning nothing. Mail-fetch failures are no longer swallowed: the scan records them, and the AI Agent page now shows a red "last scan reported problems" banner when any source failed. The scan response also reports item counts by type.

## Setup (2 minutes)

1. Upload the nine files to the paths above and let the deploy run.
2. GitHub secrets: nothing new needed — the briefing workflow reuses `DASHBOARD_API_BASE` and `AGENT_SCAN_SECRET` (or the SCAN_USERNAME/PASSWORD fallback), same as the scan.
3. Briefing recipient (optional): it resolves in this order — `AGENT_BRIEFING_TO` application setting in Azure SWA → `briefingTo` field on a `cfg_agent` config doc in Cosmos → your connected Zoho/Gmail address → `frank@techsinno.com`. If the default chain suits you, skip this step.

## Test order after deploy

1. Open the chat as owner and ask: "Give me a business snapshot — what should I focus on today?" You should see it pull live numbers and, if it takes actions, an "⚡ Actions taken" footer.
2. Ask: "List overdue invoices and queue payment chasers for the worst two." Then open the AI Agent page — the drafts should be waiting with Review & send.
3. Run a full scan. Check the new warnings banner: if any mail account is actually broken, you will now SEE it instead of getting a quietly empty scan.
4. Press "Email briefing" and check your inbox. Then confirm the scheduled workflow appears under GitHub → Actions → "Morning briefing (scheduled)".

## Notes and limits

- The agent caps at 6 tool rounds and ~90s per chat message; very broad requests may ask you to narrow down.
- Financial tools require the owner account (same as the Zoho dashboard page).
- Sourcing rebuild (replacing the dead Upwork feed with SA eTenders + search-based leads) is the planned next phase — the Opportunities tab notes this.
- Reminder of two items already on your list, unrelated to this upgrade: remove `debug-auth.js`, and rotate the hardcoded JWT secret in `api/shared/auth.js` plus the Cosmos key once you're stable.
