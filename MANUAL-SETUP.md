# Manual setup — Comm Ops Training App

All Apps Script source is in [`apps-script/`](./apps-script/).

**Spreadsheet:** https://docs.google.com/spreadsheets/d/16gZOulSJ_tKLowa5bMnHpp8vwlP9GVRWrz3CRU6AY2s/edit

---

## Option A — clasp (recommended)

```bash
cd comm-ops-training-app
clasp push
```

Then redeploy the web app in Apps Script (**Deploy → Manage deployments → New version**).

---

## Option B — paste manually

1. Open the spreadsheet → **Extensions → Apps Script**
2. Create these files and paste from `apps-script/`:

| Apps Script file | Repo file |
|------------------|-----------|
| `Config.gs` | `apps-script/Config.js` |
| `DataService.gs` | `apps-script/DataService.js` |
| `ScoringService.gs` | `apps-script/ScoringService.js` |
| `ReportService.gs` | `apps-script/ReportService.js` |
| `AutoUnlockService.gs` | `apps-script/AutoUnlockService.js` |
| `SheetBootstrap.gs` | `apps-script/SheetBootstrap.js` |
| `Code.gs` | `apps-script/Code.js` |
| `TrainingApp.html` | `apps-script/TrainingApp.html` |

3. **Project settings → Script properties** → `API_KEY` = OpenAI key
4. Reload spreadsheet → **Training App → Bootstrap sheet tabs**
5. **Training App → Install weekly auto-unlock trigger**
6. Deploy web app

---

## Config keys (auto-unlock)

| setting | default |
|---------|---------|
| auto_unlock_enabled | TRUE |
| auto_unlock_friday_only | TRUE |
| auto_unlock_require_previous_week | FALSE |
| auto_unlock_hour | 8 |
| max_training_weeks | 4 |

Run **Training App → Run auto unlock now** to append missing keys to an existing Config tab.
