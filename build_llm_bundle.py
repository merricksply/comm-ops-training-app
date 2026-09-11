#!/usr/bin/env python3
"""Build LLM_CONTEXT.md from local Apps Script source files."""

from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SOURCE_DIR = ROOT / "apps-script"
SCRIPT_ID = "1qyoRO9kF4oo5xGc7naTtzCNz4Vu4QRJkuc6FHThVHnEZ0njYkd9cw8EC"
SHEET_ID = "16gZOulSJ_tKLowa5bMnHpp8vwlP9GVRWrz3CRU6AY2s"

FILES = [
    ("appsscript.json", "json", "Manifest — timezone, V8 runtime, domain web app settings"),
    ("Config.js", "javascript", "Constants, sheet names, column maps, defaults, OpenAI config"),
    ("DataService.js", "javascript", "Spreadsheet read/write, config, trainees, questions, sessions, responses"),
    ("ScoringService.js", "javascript", "MCQ + OpenAI ticket scoring, improvements summary"),
    ("ReportService.js", "javascript", "HTML email reports, trainer review workflow"),
    ("AutoUnlockService.js", "javascript", "Weekly auto-unlock triggers and start-date logic"),
    ("SheetBootstrap.js", "javascript", "Sheet tab creation, seed data, sample questions"),
    ("Code.js", "javascript", "Entry points: doGet, web API, trainer menu actions"),
    ("TrainingApp.html", "html", "Trainee web UI (HTML/CSS/JS client)"),
]

parts: list[str] = []

parts.append("# Comm Ops Training App — Full Source Bundle\n")
parts.append(
    "> Auto-generated bundle for LLM context. "
    "Individual source files live in `apps-script/`.\n"
)
parts.append(f"- **Exported:** {date.today().isoformat()}\n")
parts.append(f"- **Apps Script ID:** `{SCRIPT_ID}`\n")
parts.append(f"- **Spreadsheet ID:** `{SHEET_ID}`\n")
parts.append("- **Version:** 1.1.0 (from Config.js)\n")
parts.append("- **Platform:** Google Apps Script (V8), bound spreadsheet + domain web app\n")
parts.append("\n## Architecture summary\n")
parts.append(
    "Trainees complete weekly quizzes (Fridays) via a web app. Questions are stored in a "
    "Google Sheet (`Questions`, `Trainees`, `Responses`, `Session_Summary`, `Config`, `Guide`). "
    "Knowledge questions are MCQ-scored locally; ticket replies are scored via OpenAI Responses "
    "API (`API_KEY` script property). Trainers unlock weeks manually or via Friday auto-unlock, "
    "review/adjust scores, and send HTML email reports to trainee + manager.\n"
)
parts.append("\n## Key server functions (Code.js)\n")
parts.append("| Function | Role |\n|----------|------|\n")
parts.append("| `doGet()` | Serves TrainingApp.html web UI |\n")
parts.append("| `getTraineeContext()` | Trainee profile, unlocked weeks, Friday gate |\n")
parts.append("| `getWeekQuiz(week)` | Returns sanitized questions for a week |\n")
parts.append("| `submitWeekQuiz(week, answersJson)` | Scores, persists responses + session summary |\n")
parts.append("\n## File index (recommended reading order)\n")
for i, (name, _, desc) in enumerate(FILES, 1):
    lines = len((SOURCE_DIR / name).read_text(encoding="utf-8").splitlines())
    parts.append(f"{i}. **`apps-script/{name}`** ({lines} lines) — {desc}\n")

parts.append("\n## External dependencies\n")
parts.append("- **OpenAI:** `POST https://api.openai.com/v1/responses` (model `gpt-5-mini-2025-08-07`)\n")
parts.append("- **Script property:** `API_KEY` (required for ticket scoring)\n")
parts.append("- **Spreadsheet:** EOR Support Training (bound at runtime via active spreadsheet)\n")
parts.append("\n## Refresh this bundle\n\n```bash\nclasp pull\npython3 build_llm_bundle.py\n```\n")
parts.append("\n---\n")

for name, lang, desc in FILES:
    content = (SOURCE_DIR / name).read_text(encoding="utf-8").rstrip()
    parts.append(f"\n## File: `apps-script/{name}`\n")
    parts.append(f"\n*{desc}*\n\n")
    parts.append(f"```{lang}\n{content}\n```\n")
    parts.append("\n---\n")

out = ROOT / "LLM_CONTEXT.md"
out.write_text("".join(parts), encoding="utf-8")
print(f"Wrote {out} ({out.stat().st_size:,} bytes, {len(out.read_text(encoding='utf-8').splitlines()):,} lines)")
