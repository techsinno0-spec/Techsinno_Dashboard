# TECHSINNO cloud-first sync plan

Goal: Electron and web must be clients of the same cloud data, not separate apps with copied state.

## Rule

Every shared dashboard feature should read/write through Azure Functions + Cosmos DB. Electron local storage should only be a cache, fallback, or desktop-only preference store.

## Already cloud-backed or moved

- Authentication and users
- Team tasks
- Projects
- Job cards
- CRM clients
- Quotes
- Reminders
- Templates
- Campaigns / marketing dashboard
- Social scheduled posts
- Email provider config and cloud inbox access
- 90-day weekly plan / goals / posts through `/api/sync`
- AI Agent queue through `/api/agent/queue`
- AI Agent full scan through `/api/agent/scan`

## Must remain sensitive / manager-only

These can be cloud-backed, but must never be public or staff-visible:

- Claude API key
- Zoho/Gmail/Outlook client secrets
- OAuth access/refresh tokens
- Cloudflare token
- Hunter.io key

They should remain in manager-only `config` records and eventually be encrypted before saving.

## Remaining local-only areas to audit

Search targets:

- `store.get(`
- `store.set(`
- `localStorage.getItem(`
- `localStorage.setItem(`
- hardcoded arrays used as live data

Likely remaining desktop-only/local features:

- Electron window/session preferences
- local file picker state
- attachment file paths
- local browser/open-external helpers
- local OneDrive fallback
- desktop-only OAuth callback helpers

## Migration order

1. Make every business object cloud-backed.
2. Make Electron read cloud first and write cloud first.
3. Keep Electron local store only as cache/fallback.
4. Add web UI parity for any page that still uses a simplified page.
5. Add encryption for secret config records.
6. Add a data health page showing cloud sync status per module.

## Acceptance test

For each page:

1. Change data in Electron.
2. Refresh web app.
3. Confirm the same data appears.
4. Change data in web app.
5. Reload Electron.
6. Confirm the same data appears.

No shared business data should require copying a file, OneDrive sync, or manual import/export.
