# Comm Ops Training App

Google Sheet–bound Apps Script web app for 4-week new joiner support training: business knowledge (MCQ) and simulated ticket replies (AI-scored), with automatic weekly unlock and trainer review workflow.

## Source linkage

| Item | Value |
|------|-------|
| Sheet name | EOR Support Training |
| Sheet ID | `16gZOulSJ_tKLowa5bMnHpp8vwlP9GVRWrz3CRU6AY2s` |
| Sheet URL | https://docs.google.com/spreadsheets/d/16gZOulSJ_tKLowa5bMnHpp8vwlP9GVRWrz3CRU6AY2s/edit |
| Script project ID | `1qyoRO9kF4oo5xGc7naTtzCNz4Vu4QRJkuc6FHThVHnEZ0njYkd9cw8EC` |
| Script editor | https://script.google.com/home/projects/1qyoRO9kF4oo5xGc7naTtzCNz4Vu4QRJkuc6FHThVHnEZ0njYkd9cw8EC/edit |
| Web app | Set in spreadsheet Config → `web_app_url` |

## Project layout

```
comm-ops-training-app/
  README.md              ← this file
  MANUAL-SETUP.md        ← paste-into-Apps-Script guide
  docs/RUNBOOK.md        ← trainer / ops runbook
  .clasp.json            ← clasp config (rootDir: apps-script)
  apps-script/           ← all Apps Script source files
```

## Quick start

### Deploy code (clasp)

```bash
cd comm-ops-training-app
clasp push
```

Then in Apps Script: **Deploy → Manage deployments → New version**.

### First-time sheet setup

1. Open the [spreadsheet](https://docs.google.com/spreadsheets/d/16gZOulSJ_tKLowa5bMnHpp8vwlP9GVRWrz3CRU6AY2s/edit)
2. **Training App → Bootstrap sheet tabs**
3. Script property `API_KEY` (OpenAI)
4. Update **Trainees** and **Config**
5. **Training App → Install weekly auto-unlock trigger**
6. Deploy web app (domain-restricted)

See [MANUAL-SETUP.md](./MANUAL-SETUP.md) for full instructions.

## Version

`1.1.0` — includes automatic weekly unlock from trainee `start_date`.
