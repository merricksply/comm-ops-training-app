# Comm Ops Training App — Runbook

## Links

- [Spreadsheet](https://docs.google.com/spreadsheets/d/16gZOulSJ_tKLowa5bMnHpp8vwlP9GVRWrz3CRU6AY2s/edit)
- [Apps Script project](https://script.google.com/home/projects/1qyoRO9kF4oo5xGc7naTtzCNz4Vu4QRJkuc6FHThVHnEZ0njYkd9cw8EC/edit)

## Auto week unlock (v1.1.0)

1. Each trainee needs a valid `start_date` in **Trainees**
2. **Training App → Install weekly auto-unlock trigger** (once)
3. Config `auto_unlock_enabled` = TRUE
4. Test: **Training App → Run auto unlock now**

Week 1 unlocks on the first Friday on or after `start_date`; each subsequent Friday unlocks the next week (max 4).

| Config key | Default | Purpose |
|------------|---------|---------|
| auto_unlock_enabled | TRUE | Master switch |
| auto_unlock_friday_only | TRUE | Only run on Fridays |
| auto_unlock_require_previous_week | FALSE | Require prior week submitted before unlocking next |
| auto_unlock_hour | 8 | Trigger hour |
| max_training_weeks | 4 | Programme length |

## Weekly trainer checklist

1. Confirm trainee rows and `start_date` are correct
2. Auto unlock runs Friday AM (or run manually)
3. Share web app URL with joiners
4. Review **Responses** after submission
5. **Mark session reviewed** → **Send final report**
6. Manual override still available: **Unlock week for trainee**

## Deploy code changes

```bash
cd comm-ops-training-app
clasp push
```

Apps Script → **Deploy → Manage deployments → New version**

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Weeks not unlocking | Check `start_date`, `auto_unlock_enabled`, trigger installed |
| Skipped (not Friday) | Set `auto_unlock_friday_only` FALSE to test |
| Week 2 blocked | Set `auto_unlock_require_previous_week` FALSE or complete Week 1 |
