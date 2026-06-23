# TECHSINNO Dashboard — Desktop App
**Frank Muland · TECHSINNO (Pty) Ltd**

A Windows desktop app combining your 90-day business plan, tasks, goals,
LinkedIn post planner, reminders, and live Zoho Books financial data.

---

## Quick Start (Windows)

### Step 1 — Install Node.js
Download and install from: https://nodejs.org (choose LTS version)

### Step 2 — Install app dependencies
Open Command Prompt or PowerShell in this folder, then run:
```
npm install
```
Wait for it to complete (2-3 minutes first time).

### Step 3 — Run the app
```
npm start
```
The TECHSINNO Dashboard window will open.

---

## Connect Zoho Books (optional but recommended)

### Get your API credentials (free, 10 minutes):

1. Go to: https://api-console.zoho.com
2. Click **Self Client** → **Generate**
3. In the **Scope** field, paste exactly:
   ```
   ZohoBooks.invoices.READ,ZohoBooks.expenses.READ,ZohoBooks.reports.READ,ZohoBooks.contacts.READ
   ```
4. Set **Time Duration** to the maximum available
5. Click **Create** — copy your **Client ID** and **Client Secret**

### Get your Organisation ID:
1. Log into Zoho Books
2. Go to **Settings → Organisation Profile**
3. Copy the **Organisation ID** number

### Connect in the app:
1. In the dashboard, click **Settings** in the left sidebar
2. Paste your Client ID, Client Secret, and Organisation ID
3. Click **Save**
4. Click **Connect & authorise**
5. A browser window opens — log in with your Zoho account
6. Return to the dashboard — Zoho Books data loads automatically

---

## Build a standalone .exe (optional)

To create an installable Windows .exe that you can run without Node.js:

```
npm run build
```

The installer will be in the `dist/` folder.

---

## Files

```
techsinno-app/
  main.js          — Electron main process, Zoho OAuth, API calls
  preload.js       — Secure bridge between app and UI
  package.json     — Dependencies and build config
  src/
    index.html     — Full dashboard UI
  assets/
    icon.png       — App icon (replace with your own if desired)
```

---

## Data storage

- All task/goal/post data stored securely on your PC (encrypted local store)
- Zoho credentials stored encrypted — never sent anywhere except Zoho's servers
- No cloud sync required — works fully offline except for Zoho data refresh

---

## Support

techsinno0@gmail.com | techsinno0@outlook.com
TECHSINNO (Pty) Ltd · Reg: 2022/364165/07
