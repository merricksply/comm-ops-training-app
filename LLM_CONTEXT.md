# Comm Ops Training App — Full Source Bundle
> Auto-generated bundle for LLM context. Individual source files live in `apps-script/`.
- **Exported:** 2026-09-11
- **Apps Script ID:** `1qyoRO9kF4oo5xGc7naTtzCNz4Vu4QRJkuc6FHThVHnEZ0njYkd9cw8EC`
- **Spreadsheet ID:** `16gZOulSJ_tKLowa5bMnHpp8vwlP9GVRWrz3CRU6AY2s`
- **Version:** 1.1.0 (from Config.js)
- **Platform:** Google Apps Script (V8), bound spreadsheet + domain web app

## Architecture summary
Trainees complete weekly quizzes (Fridays) via a web app. Questions are stored in a Google Sheet (`Questions`, `Trainees`, `Responses`, `Session_Summary`, `Config`, `Guide`). Knowledge questions are MCQ-scored locally; ticket replies are scored via OpenAI Responses API (`API_KEY` script property). Trainers unlock weeks manually or via Friday auto-unlock, review/adjust scores, and send HTML email reports to trainee + manager.

## Key server functions (Code.js)
| Function | Role |
|----------|------|
| `doGet()` | Serves TrainingApp.html web UI |
| `getTraineeContext()` | Trainee profile, unlocked weeks, Friday gate |
| `getWeekQuiz(week)` | Returns sanitized questions for a week |
| `submitWeekQuiz(week, answersJson)` | Scores, persists responses + session summary |

## File index (recommended reading order)
1. **`apps-script/appsscript.json`** (10 lines) — Manifest — timezone, V8 runtime, domain web app settings
2. **`apps-script/Config.js`** (52 lines) — Constants, sheet names, column maps, defaults, OpenAI config
3. **`apps-script/DataService.js`** (425 lines) — Spreadsheet read/write, config, trainees, questions, sessions, responses
4. **`apps-script/ScoringService.js`** (233 lines) — MCQ + OpenAI ticket scoring, improvements summary
5. **`apps-script/ReportService.js`** (190 lines) — HTML email reports, trainer review workflow
6. **`apps-script/AutoUnlockService.js`** (310 lines) — Weekly auto-unlock triggers and start-date logic
7. **`apps-script/SheetBootstrap.js`** (187 lines) — Sheet tab creation, seed data, sample questions
8. **`apps-script/Code.js`** (357 lines) — Entry points: doGet, web API, trainer menu actions
9. **`apps-script/TrainingApp.html`** (426 lines) — Trainee web UI (HTML/CSS/JS client)

## External dependencies
- **OpenAI:** `POST https://api.openai.com/v1/responses` (model `gpt-5-mini-2025-08-07`)
- **Script property:** `API_KEY` (required for ticket scoring)
- **Spreadsheet:** EOR Support Training (bound at runtime via active spreadsheet)

## Refresh this bundle

```bash
clasp pull
python3 build_llm_bundle.py
```

---

## File: `apps-script/appsscript.json`

*Manifest — timezone, V8 runtime, domain web app settings*

```json
{
  "timeZone": "Europe/London",
  "dependencies": {},
  "exceptionLogging": "STACKDRIVER",
  "runtimeVersion": "V8",
  "webapp": {
    "executeAs": "USER_DEPLOYING",
    "access": "DOMAIN"
  }
}
```

---

## File: `apps-script/Config.js`

*Constants, sheet names, column maps, defaults, OpenAI config*

```javascript
/**
 * EOR Support Training App - configuration and column maps.
 */

const ST_CONFIG = {
  version: '1.1.0',
  lockWaitMs: 30000,
  spreadsheetId: '16gZOulSJ_tKLowa5bMnHpp8vwlP9GVRWrz3CRU6AY2s',
  sheets: {
    questions: 'Questions',
    trainees: 'Trainees',
    config: 'Config',
    responses: 'Responses',
    sessionSummary: 'Session_Summary',
    guide: 'Guide'
  },
  questionColumns: {
    questionId: 0, week: 1, type: 2, topic: 3, questionText: 4, ticketContext: 5,
    optionsJson: 6, correctAnswer: 7, modelAnswer: 8, styleGuide: 9, maxPoints: 10,
    sortOrder: 11, active: 12
  },
  traineeColumns: {
    email: 0, displayName: 1, managerEmail: 2, startDate: 3, weeksUnlocked: 4, active: 5
  },
  responseColumns: {
    responseId: 0, sessionId: 1, traineeEmail: 2, week: 3, questionId: 4,
    submittedAt: 5, responseText: 6, aiScore: 7, aiMaxPoints: 8, aiFeedback: 9,
    aiImprovements: 10, finalScore: 11, trainerFeedback: 12, reviewedBy: 13,
    reviewedAt: 14, status: 15
  },
  sessionColumns: {
    sessionId: 0, traineeEmail: 1, week: 2, startedAt: 3, submittedAt: 4,
    totalAiScore: 5, totalFinalScore: 6, maxPossible: 7, pctFinal: 8, passed: 9,
    improvementsSummary: 10, status: 11, reportSentAt: 12
  },
  defaults: {
    appTitle: 'EOR Support Training',
    passThresholdPct: 70,
    fridayOnly: true,
    timezone: 'Europe/London',
    trainerEmails: '',
    autoUnlockEnabled: true,
    autoUnlockFridayOnly: true,
    autoUnlockRequirePreviousWeek: false,
    autoUnlockHour: 8,
    maxTrainingWeeks: 4
  },
  openAi: {
    responsesUrl: 'https://api.openai.com/v1/responses',
    modelId: 'gpt-5-mini-2025-08-07'
  }
};
```

---

## File: `apps-script/DataService.js`

*Spreadsheet read/write, config, trainees, questions, sessions, responses*

```javascript
/**
 * Sheet read/write helpers for the training app.
 */

function getTrainingSpreadsheet_() {
  return SpreadsheetApp.getActiveSpreadsheet();
}

function getConfigMap_() {
  const sheet = getTrainingSpreadsheet_().getSheetByName(ST_CONFIG.sheets.config);
  if (!sheet || sheet.getLastRow() < 2) {
    return Object.assign({}, ST_CONFIG.defaults, {
      app_title: ST_CONFIG.defaults.appTitle,
      pass_threshold_pct: ST_CONFIG.defaults.passThresholdPct,
      friday_only: ST_CONFIG.defaults.fridayOnly,
      timezone: ST_CONFIG.defaults.timezone,
      trainer_emails: ST_CONFIG.defaults.trainerEmails,
      web_app_url: ''
    });
  }

  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).getValues();
  const map = {};

  values.forEach(function(row) {
    const key = String(row[0] || '').trim();
    if (key) {
      map[key] = row[1];
    }
  });

  return map;
}

function getConfigValue_(key, fallback) {
  const map = getConfigMap_();
  if (map[key] === undefined || map[key] === null || String(map[key]).trim() === '') {
    return fallback;
  }
  return map[key];
}

function parseBoolConfig_(value, fallback) {
  if (value === undefined || value === null || String(value).trim() === '') {
    return fallback;
  }
  const normalized = String(value).trim().toLowerCase();
  return normalized === 'true' || normalized === 'yes' || normalized === '1';
}

function getTrainerEmails_() {
  const raw = String(getConfigValue_('trainer_emails', '') || '');
  return raw.split(',').map(function(e) {
    return e.trim().toLowerCase();
  }).filter(Boolean);
}

function isTrainer_(email) {
  const normalized = String(email || '').trim().toLowerCase();
  if (!normalized) {
    return false;
  }

  const trainers = getTrainerEmails_();
  if (trainers.indexOf(normalized) !== -1) {
    return true;
  }

  try {
    const ss = getTrainingSpreadsheet_();
    const editors = ss.getEditors().map(function(u) {
      return String(u.getEmail() || '').toLowerCase();
    });
    return editors.indexOf(normalized) !== -1;
  } catch (e) {
    return false;
  }
}

function getActiveUserEmail_() {
  const email = Session.getActiveUser().getEmail();
  if (!email) {
    throw new Error('Could not determine your Google account email. Open this app while signed in to your work account.');
  }
  return String(email).trim().toLowerCase();
}

function rowToTrainee_(row) {
  const c = ST_CONFIG.traineeColumns;
  return {
    email: String(row[c.email] || '').trim().toLowerCase(),
    displayName: String(row[c.displayName] || '').trim(),
    managerEmail: String(row[c.managerEmail] || '').trim().toLowerCase(),
    startDate: row[c.startDate],
    weeksUnlocked: Number(row[c.weeksUnlocked]) || 0,
    active: parseBoolConfig_(row[c.active], false)
  };
}

function getTraineeByEmail_(email) {
  const sheet = getTrainingSpreadsheet_().getSheetByName(ST_CONFIG.sheets.trainees);
  if (!sheet || sheet.getLastRow() < 2) {
    return null;
  }

  const normalized = String(email || '').trim().toLowerCase();
  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, 6).getValues();

  for (var i = 0; i < values.length; i++) {
    const trainee = rowToTrainee_(values[i]);
    if (trainee.email === normalized && trainee.active) {
      return trainee;
    }
  }

  return null;
}

function getAllActiveTrainees_() {
  const sheet = getTrainingSpreadsheet_().getSheetByName(ST_CONFIG.sheets.trainees);
  if (!sheet || sheet.getLastRow() < 2) {
    return [];
  }

  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, 6).getValues();
  const trainees = [];

  values.forEach(function(row) {
    const trainee = rowToTrainee_(row);
    if (trainee.active && trainee.email) {
      trainees.push(trainee);
    }
  });

  return trainees;
}

function updateTraineeWeeksUnlocked_(email, week) {
  const sheet = getTrainingSpreadsheet_().getSheetByName(ST_CONFIG.sheets.trainees);
  if (!sheet) {
    throw new Error('Trainees sheet not found.');
  }

  const normalized = String(email || '').trim().toLowerCase();
  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, 6).getValues();
  const c = ST_CONFIG.traineeColumns;

  for (var i = 0; i < values.length; i++) {
    if (String(values[i][c.email] || '').trim().toLowerCase() === normalized) {
      const current = Number(values[i][c.weeksUnlocked]) || 0;
      const next = Math.max(current, Number(week) || 0);
      sheet.getRange(i + 2, c.weeksUnlocked + 1).setValue(next);
      return next;
    }
  }

  throw new Error('Trainee not found: ' + email);
}

function rowToQuestion_(row) {
  const c = ST_CONFIG.questionColumns;
  let options = [];

  try {
    const raw = String(row[c.optionsJson] || '').trim();
    if (raw) {
      options = JSON.parse(raw);
    }
  } catch (e) {
    options = [];
  }

  return {
    questionId: String(row[c.questionId] || '').trim(),
    week: Number(row[c.week]) || 0,
    type: String(row[c.type] || '').trim().toLowerCase(),
    topic: String(row[c.topic] || '').trim(),
    questionText: String(row[c.questionText] || '').trim(),
    ticketContext: String(row[c.ticketContext] || '').trim(),
    options: options,
    correctAnswer: String(row[c.correctAnswer] || '').trim(),
    modelAnswer: String(row[c.modelAnswer] || '').trim(),
    styleGuide: String(row[c.styleGuide] || '').trim(),
    maxPoints: Number(row[c.maxPoints]) || 0,
    sortOrder: Number(row[c.sortOrder]) || 0,
    active: parseBoolConfig_(row[c.active], false)
  };
}

function getQuestionsForWeek_(week) {
  const sheet = getTrainingSpreadsheet_().getSheetByName(ST_CONFIG.sheets.questions);
  if (!sheet || sheet.getLastRow() < 2) {
    return [];
  }

  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, 13).getValues();
  const questions = [];

  values.forEach(function(row) {
    const q = rowToQuestion_(row);
    if (q.active && q.week === Number(week)) {
      questions.push(q);
    }
  });

  questions.sort(function(a, b) {
    return a.sortOrder - b.sortOrder;
  });

  return questions;
}

function getQuestionById_(questionId) {
  const sheet = getTrainingSpreadsheet_().getSheetByName(ST_CONFIG.sheets.questions);
  if (!sheet || sheet.getLastRow() < 2) {
    return null;
  }

  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, 13).getValues();
  const target = String(questionId || '').trim();

  for (var i = 0; i < values.length; i++) {
    const q = rowToQuestion_(values[i]);
    if (q.questionId === target) {
      return q;
    }
  }

  return null;
}

function rowToSession_(row) {
  const c = ST_CONFIG.sessionColumns;
  return {
    sessionId: String(row[c.sessionId] || '').trim(),
    traineeEmail: String(row[c.traineeEmail] || '').trim().toLowerCase(),
    week: Number(row[c.week]) || 0,
    startedAt: row[c.startedAt],
    submittedAt: row[c.submittedAt],
    totalAiScore: Number(row[c.totalAiScore]) || 0,
    totalFinalScore: Number(row[c.totalFinalScore]) || 0,
    maxPossible: Number(row[c.maxPossible]) || 0,
    pctFinal: Number(row[c.pctFinal]) || 0,
    passed: parseBoolConfig_(row[c.passed], false),
    improvementsSummary: String(row[c.improvementsSummary] || '').trim(),
    status: String(row[c.status] || '').trim().toLowerCase(),
    reportSentAt: row[c.reportSentAt]
  };
}

function getSessionsForTrainee_(email) {
  const sheet = getTrainingSpreadsheet_().getSheetByName(ST_CONFIG.sheets.sessionSummary);
  if (!sheet || sheet.getLastRow() < 2) {
    return [];
  }

  const normalized = String(email || '').trim().toLowerCase();
  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, 13).getValues();
  const sessions = [];

  values.forEach(function(row) {
    const session = rowToSession_(row);
    if (session.traineeEmail === normalized) {
      sessions.push(session);
    }
  });

  return sessions;
}

function getSessionById_(sessionId) {
  const sheet = getTrainingSpreadsheet_().getSheetByName(ST_CONFIG.sheets.sessionSummary);
  if (!sheet || sheet.getLastRow() < 2) {
    return null;
  }

  const target = String(sessionId || '').trim();
  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, 13).getValues();

  for (var i = 0; i < values.length; i++) {
    const session = rowToSession_(values[i]);
    if (session.sessionId === target) {
      return session;
    }
  }

  return null;
}

function getResponsesForSession_(sessionId) {
  const sheet = getTrainingSpreadsheet_().getSheetByName(ST_CONFIG.sheets.responses);
  if (!sheet || sheet.getLastRow() < 2) {
    return [];
  }

  const target = String(sessionId || '').trim();
  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, 16).getValues();
  const responses = [];

  values.forEach(function(row) {
    const response = rowToResponse_(row);
    if (response.sessionId === target) {
      responses.push(response);
    }
  });

  return responses;
}

function rowToResponse_(row) {
  const c = ST_CONFIG.responseColumns;
  return {
    responseId: String(row[c.responseId] || '').trim(),
    sessionId: String(row[c.sessionId] || '').trim(),
    traineeEmail: String(row[c.traineeEmail] || '').trim().toLowerCase(),
    week: Number(row[c.week]) || 0,
    questionId: String(row[c.questionId] || '').trim(),
    submittedAt: row[c.submittedAt],
    responseText: String(row[c.responseText] || '').trim(),
    aiScore: row[c.aiScore] === '' || row[c.aiScore] === null ? null : Number(row[c.aiScore]),
    aiMaxPoints: Number(row[c.aiMaxPoints]) || 0,
    aiFeedback: String(row[c.aiFeedback] || '').trim(),
    aiImprovements: String(row[c.aiImprovements] || '').trim(),
    finalScore: row[c.finalScore] === '' || row[c.finalScore] === null ? null : Number(row[c.finalScore]),
    trainerFeedback: String(row[c.trainerFeedback] || '').trim(),
    reviewedBy: String(row[c.reviewedBy] || '').trim(),
    reviewedAt: row[c.reviewedAt],
    status: String(row[c.status] || '').trim().toLowerCase()
  };
}

function effectiveScore_(response) {
  if (response.finalScore !== null && !isNaN(response.finalScore)) {
    return response.finalScore;
  }
  if (response.aiScore !== null && !isNaN(response.aiScore)) {
    return response.aiScore;
  }
  return 0;
}

function appendResponseRow_(responseRow) {
  const sheet = getTrainingSpreadsheet_().getSheetByName(ST_CONFIG.sheets.responses);
  if (!sheet) {
    throw new Error('Responses sheet not found.');
  }
  sheet.appendRow(responseRow);
}

function appendSessionRow_(sessionRow) {
  const sheet = getTrainingSpreadsheet_().getSheetByName(ST_CONFIG.sheets.sessionSummary);
  if (!sheet) {
    throw new Error('Session_Summary sheet not found.');
  }
  sheet.appendRow(sessionRow);
}

function updateSessionRow_(sessionId, updates) {
  const sheet = getTrainingSpreadsheet_().getSheetByName(ST_CONFIG.sheets.sessionSummary);
  if (!sheet || sheet.getLastRow() < 2) {
    throw new Error('Session not found.');
  }

  const c = ST_CONFIG.sessionColumns;
  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, 13).getValues();

  for (var i = 0; i < values.length; i++) {
    if (String(values[i][c.sessionId] || '').trim() === String(sessionId).trim()) {
      const rowNum = i + 2;
      Object.keys(updates).forEach(function(key) {
        if (c[key] !== undefined) {
          sheet.getRange(rowNum, c[key] + 1).setValue(updates[key]);
        }
      });
      return;
    }
  }

  throw new Error('Session not found: ' + sessionId);
}

function updateResponseStatusesForSession_(sessionId, status, reviewedBy) {
  const sheet = getTrainingSpreadsheet_().getSheetByName(ST_CONFIG.sheets.responses);
  if (!sheet || sheet.getLastRow() < 2) {
    return;
  }

  const c = ST_CONFIG.responseColumns;
  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, 16).getValues();
  const now = new Date();

  for (var i = 0; i < values.length; i++) {
    if (String(values[i][c.sessionId] || '').trim() === String(sessionId).trim()) {
      const rowNum = i + 2;
      sheet.getRange(rowNum, c.status + 1).setValue(status);
      if (reviewedBy) {
        sheet.getRange(rowNum, c.reviewedBy + 1).setValue(reviewedBy);
        sheet.getRange(rowNum, c.reviewedAt + 1).setValue(now);
      }
    }
  }
}

function generateUuid_() {
  return Utilities.getUuid();
}

function isFridayInTimezone_(timezone) {
  const tz = timezone || ST_CONFIG.defaults.timezone;
  const day = Number(Utilities.formatDate(new Date(), tz, 'u'));
  return day === 5;
}

function sanitizeQuestionForClient_(question) {
  return {
    questionId: question.questionId,
    week: question.week,
    type: question.type,
    topic: question.topic,
    questionText: question.questionText,
    ticketContext: question.ticketContext,
    options: question.options,
    maxPoints: question.maxPoints
  };
}
```

---

## File: `apps-script/ScoringService.js`

*MCQ + OpenAI ticket scoring, improvements summary*

```javascript
/**
 * Knowledge and ticket scoring.
 */

function getRequiredScriptProperty_(propertyName) {
  const value = PropertiesService.getScriptProperties().getProperty(propertyName);
  if (!value || !String(value).trim()) {
    throw new Error('Missing required Script Property: ' + propertyName);
  }
  return String(value).trim();
}

function callOpenAIResponses_(input, overrides) {
  const body = Object.assign(
    {
      model: ST_CONFIG.openAi.modelId,
      text: { verbosity: 'low' },
      reasoning: { effort: 'minimal' },
      input: input
    },
    overrides || {}
  );

  const options = {
    method: 'post',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + getRequiredScriptProperty_('API_KEY')
    },
    payload: JSON.stringify(body),
    muteHttpExceptions: true
  };

  const resp = UrlFetchApp.fetch(ST_CONFIG.openAi.responsesUrl, options);
  const code = resp.getResponseCode();
  const text = resp.getContentText();

  if (code !== 200) {
    throw new Error('OpenAI API error ' + code + ': ' + text.substring(0, 300));
  }

  const json = JSON.parse(text);
  return {
    text: flattenResponsesOutputText_(json),
    raw: json
  };
}

function flattenResponsesOutputText_(json) {
  try {
    if (typeof json.output_text === 'string' && json.output_text.trim()) {
      return json.output_text.trim();
    }

    const out = json.output || [];
    const pieces = [];

    for (var i = 0; i < out.length; i++) {
      var item = out[i];
      if (item && item.content && item.content.length) {
        for (var j = 0; j < item.content.length; j++) {
          var c = item.content[j];
          if (c && typeof c.text === 'string') {
            pieces.push(c.text);
          }
        }
      }
    }

    return pieces.join('').trim();
  } catch (e) {
    return '';
  }
}

function parseJsonObjectFromOpenAIText_(text) {
  if (!text) {
    throw new Error('Empty OpenAI response.');
  }

  let cleaned = String(text).trim();
  cleaned = cleaned
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```$/i, '')
    .trim();

  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    cleaned = cleaned.substring(firstBrace, lastBrace + 1);
  }

  return JSON.parse(cleaned);
}

function normalizeMcqAnswer_(answer) {
  const raw = String(answer || '').trim();
  if (!raw) {
    return '';
  }
  const letterMatch = raw.match(/^([A-Za-z])\b/);
  if (letterMatch) {
    return letterMatch[1].toUpperCase();
  }
  return raw.toLowerCase();
}

function scoreKnowledgeQuestion_(question, responseText) {
  const maxPoints = Number(question.maxPoints) || 0;
  const expected = normalizeMcqAnswer_(question.correctAnswer);
  const actual = normalizeMcqAnswer_(responseText);
  const correct = expected && actual && expected === actual;
  const score = correct ? maxPoints : 0;

  return {
    aiScore: score,
    aiMaxPoints: maxPoints,
    aiFeedback: correct
      ? 'Correct.'
      : 'Incorrect. Review the material for "' + question.topic + '".',
    aiImprovements: correct
      ? ''
      : 'Revisit ' + question.topic + ' — expected answer: ' + question.correctAnswer + '.'
  };
}

function scoreTicketQuestion_(question, responseText) {
  const maxPoints = Number(question.maxPoints) || 10;

  if (!String(responseText || '').trim()) {
    return {
      aiScore: 0,
      aiMaxPoints: maxPoints,
      aiFeedback: 'No response provided.',
      aiImprovements: 'Provide a complete reply addressing the employee\'s question.'
    };
  }

  const prompt = [
    'You are grading a support trainee ticket reply for an Employer of Record company.',
    'Return ONLY valid JSON with this shape:',
    '{"score": number, "maxPoints": number, "feedback": string, "improvements": string[]}',
    'score must be between 0 and maxPoints (integer or half-point allowed).',
    'maxPoints must be ' + maxPoints + '.',
    'feedback: 2-4 sentences for the trainee.',
    'improvements: short actionable bullets for gaps vs model answer and style guide.',
    '',
    'Ticket scenario:',
    question.ticketContext || '(none)',
    '',
    'Task:',
    question.questionText || 'Draft a reply.',
    '',
    'Model answer:',
    question.modelAnswer || '(none)',
    '',
    'Style guide:',
    question.styleGuide || '(none)',
    '',
    'Trainee reply:',
    responseText
  ].join('\n');

  const result = callOpenAIResponses_(prompt);

  let parsed;
  try {
    parsed = parseJsonObjectFromOpenAIText_(result.text);
  } catch (e) {
    parsed = {
      score: 0,
      maxPoints: maxPoints,
      feedback: 'Automatic scoring could not parse the AI result. A trainer will review manually.',
      improvements: ['Retry after trainer review or check API_KEY configuration.']
    };
  }

  const score = Math.max(0, Math.min(maxPoints, Number(parsed.score) || 0));
  const improvements = Array.isArray(parsed.improvements)
    ? parsed.improvements.map(String).filter(Boolean)
    : [];

  return {
    aiScore: score,
    aiMaxPoints: maxPoints,
    aiFeedback: String(parsed.feedback || '').trim() || 'Scored by AI.',
    aiImprovements: improvements.join('\n')
  };
}

function scoreQuestionResponse_(question, responseText) {
  if (question.type === 'knowledge') {
    return scoreKnowledgeQuestion_(question, responseText);
  }
  if (question.type === 'ticket') {
    return scoreTicketQuestion_(question, responseText);
  }
  throw new Error('Unknown question type: ' + question.type);
}

function buildImprovementsSummary_(scoredResponses, questionsById) {
  const bullets = [];
  const seen = {};

  scoredResponses.forEach(function(item) {
    const question = questionsById[item.questionId] || {};
    const maxPoints = Number(item.aiMaxPoints) || Number(question.maxPoints) || 0;
    const score = effectiveScore_(item);

    if (score < maxPoints && item.aiImprovements) {
      item.aiImprovements.split('\n').forEach(function(line) {
        const trimmed = String(line).replace(/^[-*]\s*/, '').trim();
        if (trimmed && !seen[trimmed.toLowerCase()]) {
          seen[trimmed.toLowerCase()] = true;
          bullets.push(trimmed);
        }
      });
    }

    if (question.type === 'knowledge' && score < maxPoints) {
      const msg = 'Knowledge gap: ' + (question.topic || question.questionId);
      if (!seen[msg.toLowerCase()]) {
        seen[msg.toLowerCase()] = true;
        bullets.push(msg);
      }
    }
  });

  return bullets.map(function(b) {
    return '• ' + b;
  }).join('\n');
}
```

---

## File: `apps-script/ReportService.js`

*HTML email reports, trainer review workflow*

```javascript
/**
 * Email reports for joiners and managers.
 */

function buildSessionReportData_(sessionId) {
  const session = getSessionById_(sessionId);
  if (!session) {
    throw new Error('Session not found: ' + sessionId);
  }

  const trainee = getTraineeByEmail_(session.traineeEmail);
  if (!trainee) {
    throw new Error('Trainee not found for session.');
  }

  const responses = getResponsesForSession_(sessionId);
  const questionsById = {};

  responses.forEach(function(r) {
    const q = getQuestionById_(r.questionId);
    if (q) {
      questionsById[r.questionId] = q;
    }
  });

  let totalFinal = 0;
  let maxPossible = 0;
  const breakdown = [];

  responses.forEach(function(r) {
    const q = questionsById[r.questionId] || {};
    const max = Number(r.aiMaxPoints) || Number(q.maxPoints) || 0;
    const score = effectiveScore_(r);
    totalFinal += score;
    maxPossible += max;

    breakdown.push({
      questionId: r.questionId,
      topic: q.topic || '',
      type: q.type || '',
      score: score,
      maxPoints: max,
      feedback: r.trainerFeedback || r.aiFeedback || '',
      improvements: r.aiImprovements || ''
    });
  });

  const pct = maxPossible > 0 ? Math.round((totalFinal / maxPossible) * 1000) / 10 : 0;
  const threshold = Number(getConfigValue_('pass_threshold_pct', ST_CONFIG.defaults.passThresholdPct)) || 70;
  const passed = pct >= threshold;

  return {
    session: session,
    trainee: trainee,
    responses: responses,
    breakdown: breakdown,
    totalFinal: totalFinal,
    maxPossible: maxPossible,
    pct: pct,
    threshold: threshold,
    passed: passed,
    improvementsSummary: session.improvementsSummary || buildImprovementsSummary_(responses, questionsById)
  };
}

function buildReportHtml_(report) {
  const trainee = report.trainee;
  const session = report.session;
  const statusLabel = report.passed ? 'Pass' : 'Needs improvement';
  const statusColor = report.passed ? '#12B76A' : '#D92D20';

  let breakdownHtml = report.breakdown.map(function(item) {
    return '<tr>' +
      '<td style="padding:8px;border-bottom:1px solid #E7E3F2;">' + escHtml_(item.questionId) + '</td>' +
      '<td style="padding:8px;border-bottom:1px solid #E7E3F2;">' + escHtml_(item.topic) + '</td>' +
      '<td style="padding:8px;border-bottom:1px solid #E7E3F2;">' + escHtml_(item.type) + '</td>' +
      '<td style="padding:8px;border-bottom:1px solid #E7E3F2;">' + item.score + ' / ' + item.maxPoints + '</td>' +
      '<td style="padding:8px;border-bottom:1px solid #E7E3F2;">' + escHtml_(item.feedback) + '</td>' +
      '</tr>';
  }).join('');

  const improvementsHtml = String(report.improvementsSummary || '')
    .split('\n')
    .filter(Boolean)
    .map(function(line) {
      return '<li style="margin-bottom:6px;">' + escHtml_(line.replace(/^•\s*/, '')) + '</li>';
    })
    .join('');

  return '<div style="font-family:Inter,Arial,sans-serif;color:#18181F;max-width:720px;">' +
    '<h1 style="color:#5F17F8;font-size:22px;">EOR Support Training — Week ' + session.week + ' Report</h1>' +
    '<p><strong>Trainee:</strong> ' + escHtml_(trainee.displayName) + ' (' + escHtml_(trainee.email) + ')</p>' +
    '<p><strong>Score:</strong> ' + report.totalFinal + ' / ' + report.maxPossible +
    ' (' + report.pct + '%) · <span style="color:' + statusColor + ';font-weight:600;">' + statusLabel + '</span></p>' +
    '<p><strong>Pass threshold:</strong> ' + report.threshold + '%</p>' +
    '<h2 style="font-size:16px;margin-top:24px;">Breakdown</h2>' +
    '<table style="width:100%;border-collapse:collapse;font-size:13px;">' +
    '<thead><tr style="background:#F8F7FC;">' +
    '<th style="text-align:left;padding:8px;">ID</th>' +
    '<th style="text-align:left;padding:8px;">Topic</th>' +
    '<th style="text-align:left;padding:8px;">Type</th>' +
    '<th style="text-align:left;padding:8px;">Score</th>' +
    '<th style="text-align:left;padding:8px;">Feedback</th>' +
    '</tr></thead><tbody>' + breakdownHtml + '</tbody></table>' +
    '<h2 style="font-size:16px;margin-top:24px;">Improvements</h2>' +
    '<ul style="padding-left:18px;">' + (improvementsHtml || '<li>No specific improvements recorded.</li>') + '</ul>' +
    '<p style="font-size:12px;color:#6B6578;margin-top:24px;">Generated by EOR Support Training App v' + ST_CONFIG.version + '</p>' +
    '</div>';
}

function escHtml_(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function sendFinalReportForSession_(sessionId, sentByEmail) {
  if (!isTrainer_(sentByEmail)) {
    throw new Error('Only trainers or sheet editors can send final reports.');
  }

  const report = buildSessionReportData_(sessionId);
  const html = buildReportHtml_(report);
  const subject = 'Training Week ' + report.session.week + ' — ' +
    report.trainee.displayName + ' (' + report.pct + '%)';

  const recipients = [report.trainee.email];
  if (report.trainee.managerEmail) {
    recipients.push(report.trainee.managerEmail);
  }

  MailApp.sendEmail({
    to: recipients.join(','),
    subject: subject,
    htmlBody: html
  });

  const totalFinal = report.totalFinal;
  updateSessionRow_(sessionId, {
    totalFinalScore: totalFinal,
    pctFinal: report.pct,
    passed: report.passed,
    status: 'final',
    reportSentAt: new Date()
  });
  updateResponseStatusesForSession_(sessionId, 'final', sentByEmail);

  return {
    ok: true,
    sessionId: sessionId,
    recipients: recipients,
    pct: report.pct,
    passed: report.passed
  };
}

function markSessionReviewed_(sessionId, reviewerEmail) {
  if (!isTrainer_(reviewerEmail)) {
    throw new Error('Only trainers or sheet editors can mark sessions reviewed.');
  }

  const session = getSessionById_(sessionId);
  if (!session) {
    throw new Error('Session not found.');
  }

  const responses = getResponsesForSession_(sessionId);
  let totalFinal = 0;
  let maxPossible = 0;

  responses.forEach(function(r) {
    totalFinal += effectiveScore_(r);
    maxPossible += Number(r.aiMaxPoints) || 0;
  });

  const pct = maxPossible > 0 ? Math.round((totalFinal / maxPossible) * 1000) / 10 : 0;
  const threshold = Number(getConfigValue_('pass_threshold_pct', ST_CONFIG.defaults.passThresholdPct)) || 70;

  updateSessionRow_(sessionId, {
    totalFinalScore: totalFinal,
    pctFinal: pct,
    passed: pct >= threshold,
    status: 'reviewed'
  });
  updateResponseStatusesForSession_(sessionId, 'reviewed', reviewerEmail);

  return { ok: true, sessionId: sessionId, pct: pct };
}
```

---

## File: `apps-script/AutoUnlockService.js`

*Weekly auto-unlock triggers and start-date logic*

```javascript
/**
 * Automatic weekly unlock based on trainee start_date.
 */

const AUTO_UNLOCK_TRIGGER_HANDLER_ = 'autoUnlockWeeksForTrainees_';

function autoUnlockWeeksForTrainees_() {
  if (!parseBoolConfig_(getConfigValue_('auto_unlock_enabled', ST_CONFIG.defaults.autoUnlockEnabled), true)) {
    return { ok: true, skipped: true, reason: 'auto_unlock_enabled is FALSE' };
  }

  const lock = LockService.getDocumentLock();
  if (!lock.tryLock(ST_CONFIG.lockWaitMs)) {
    throw new Error('Auto unlock already running. Try again shortly.');
  }

  try {
    ensureAutoUnlockConfigKeys_();

    const timezone = String(getConfigValue_('timezone', ST_CONFIG.defaults.timezone));
    const maxWeeks = Number(getConfigValue_('max_training_weeks', ST_CONFIG.defaults.maxTrainingWeeks)) || 4;
    const requirePrevious = parseBoolConfig_(
      getConfigValue_('auto_unlock_require_previous_week', ST_CONFIG.defaults.autoUnlockRequirePreviousWeek),
      false
    );
    const runOnFridayOnly = parseBoolConfig_(
      getConfigValue_('auto_unlock_friday_only', ST_CONFIG.defaults.autoUnlockFridayOnly),
      true
    );

    if (runOnFridayOnly && !isFridayInTimezone_(timezone)) {
      return { ok: true, skipped: true, reason: 'Not Friday in ' + timezone };
    }

    const trainees = getAllActiveTrainees_();
    const results = [];

    trainees.forEach(function(trainee) {
      const calculatedWeek = calculateUnlockedWeekFromStartDate_(trainee.startDate, timezone, new Date(), maxWeeks);
      var targetWeek = calculatedWeek;

      if (requirePrevious && targetWeek > 0) {
        targetWeek = getMaxUnlockWeekWithPreviousCompleted_(trainee.email, targetWeek);
      }

      if (targetWeek <= 0) {
        results.push({
          email: trainee.email,
          action: 'skipped',
          reason: 'Before first training Friday or no week eligible',
          calculatedWeek: calculatedWeek,
          weeksUnlocked: trainee.weeksUnlocked
        });
        return;
      }

      if (targetWeek > trainee.weeksUnlocked) {
        const updated = setTraineeWeeksUnlocked_(trainee.email, targetWeek);
        results.push({
          email: trainee.email,
          action: 'updated',
          from: trainee.weeksUnlocked,
          to: updated,
          calculatedWeek: calculatedWeek
        });
      } else {
        results.push({
          email: trainee.email,
          action: 'unchanged',
          weeksUnlocked: trainee.weeksUnlocked,
          calculatedWeek: calculatedWeek
        });
      }
    });

    return {
      ok: true,
      skipped: false,
      timezone: timezone,
      traineeCount: trainees.length,
      updatedCount: results.filter(function(r) { return r.action === 'updated'; }).length,
      results: results
    };
  } finally {
    lock.releaseLock();
  }
}

function calculateUnlockedWeekFromStartDate_(startDate, timezone, asOfDate, maxWeeks) {
  const start = parseSheetDate_(startDate, timezone);
  if (!start) {
    return 0;
  }

  const tz = timezone || ST_CONFIG.defaults.timezone;
  const today = startOfDayInTimezone_(asOfDate || new Date(), tz);
  const firstFriday = findFirstFridayOnOrAfter_(start, tz);

  if (today.getTime() < firstFriday.getTime()) {
    return 0;
  }

  const msPerWeek = 7 * 24 * 60 * 60 * 1000;
  const weeksElapsed = 1 + Math.floor((today.getTime() - firstFriday.getTime()) / msPerWeek);
  return Math.min(maxWeeks, Math.max(1, weeksElapsed));
}

function getMaxUnlockWeekWithPreviousCompleted_(traineeEmail, calculatedWeek) {
  const sessions = getSessionsForTrainee_(traineeEmail);
  const submittedWeeks = {};

  sessions.forEach(function(session) {
    if (session.submittedAt) {
      submittedWeeks[session.week] = true;
    }
  });

  var maxUnlock = 0;
  for (var week = 1; week <= calculatedWeek; week++) {
    if (week === 1) {
      maxUnlock = 1;
      continue;
    }
    if (submittedWeeks[week - 1]) {
      maxUnlock = week;
    } else {
      break;
    }
  }

  return maxUnlock;
}

function parseSheetDate_(value, timezone) {
  if (!value) {
    return null;
  }

  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) {
    return startOfDayInTimezone_(value, timezone);
  }

  const raw = String(value).trim();
  if (!raw) {
    return null;
  }

  const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    return startOfDayInTimezone_(new Date(Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3])), timezone);
  }

  const parsed = new Date(raw);
  if (!isNaN(parsed.getTime())) {
    return startOfDayInTimezone_(parsed, timezone);
  }

  return null;
}

function startOfDayInTimezone_(date, timezone) {
  const tz = timezone || ST_CONFIG.defaults.timezone;
  const ymd = Utilities.formatDate(date, tz, 'yyyy-MM-dd');
  const parts = ymd.split('-');
  return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
}

function findFirstFridayOnOrAfter_(date, timezone) {
  const start = startOfDayInTimezone_(date, timezone);
  const dayOfWeek = Number(Utilities.formatDate(start, timezone, 'u'));
  const daysUntilFriday = (5 - dayOfWeek + 7) % 7;
  return new Date(start.getFullYear(), start.getMonth(), start.getDate() + daysUntilFriday);
}

function setTraineeWeeksUnlocked_(email, week) {
  const sheet = getTrainingSpreadsheet_().getSheetByName(ST_CONFIG.sheets.trainees);
  if (!sheet) {
    throw new Error('Trainees sheet not found.');
  }

  const normalized = String(email || '').trim().toLowerCase();
  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, 6).getValues();
  const c = ST_CONFIG.traineeColumns;
  const next = Math.max(0, Math.min(4, Number(week) || 0));

  for (var i = 0; i < values.length; i++) {
    if (String(values[i][c.email] || '').trim().toLowerCase() === normalized) {
      sheet.getRange(i + 2, c.weeksUnlocked + 1).setValue(next);
      return next;
    }
  }

  throw new Error('Trainee not found: ' + email);
}

function ensureAutoUnlockConfigKeys_() {
  const sheet = getTrainingSpreadsheet_().getSheetByName(ST_CONFIG.sheets.config);
  if (!sheet) {
    return;
  }

  const existing = {};
  if (sheet.getLastRow() >= 2) {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).getValues().forEach(function(row) {
      const key = String(row[0] || '').trim();
      if (key) {
        existing[key] = true;
      }
    });
  }

  const defaults = [
    ['auto_unlock_enabled', String(ST_CONFIG.defaults.autoUnlockEnabled).toUpperCase()],
    ['auto_unlock_friday_only', String(ST_CONFIG.defaults.autoUnlockFridayOnly).toUpperCase()],
    ['auto_unlock_require_previous_week', String(ST_CONFIG.defaults.autoUnlockRequirePreviousWeek).toUpperCase()],
    ['auto_unlock_hour', String(ST_CONFIG.defaults.autoUnlockHour)],
    ['max_training_weeks', String(ST_CONFIG.defaults.maxTrainingWeeks)]
  ];

  const toAppend = defaults.filter(function(row) {
    return !existing[row[0]];
  });

  if (toAppend.length) {
    sheet.getRange(sheet.getLastRow() + 1, 1, toAppend.length, 2).setValues(toAppend);
  }
}

function installWeeklyUnlockTrigger_() {
  removeWeeklyUnlockTriggers_();
  ensureAutoUnlockConfigKeys_();

  const timezone = String(getConfigValue_('timezone', ST_CONFIG.defaults.timezone));
  const hour = Number(getConfigValue_('auto_unlock_hour', ST_CONFIG.defaults.autoUnlockHour)) || 8;

  ScriptApp.newTrigger(AUTO_UNLOCK_TRIGGER_HANDLER_)
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.FRIDAY)
    .atHour(hour)
    .inTimezone(timezone)
    .create();

  return { ok: true, timezone: timezone, hour: hour };
}

function removeWeeklyUnlockTriggers_() {
  const triggers = ScriptApp.getProjectTriggers();
  var removed = 0;

  triggers.forEach(function(trigger) {
    if (trigger.getHandlerFunction() === AUTO_UNLOCK_TRIGGER_HANDLER_) {
      ScriptApp.deleteTrigger(trigger);
      removed++;
    }
  });

  return { ok: true, removed: removed };
}

function menuInstallAutoUnlockTrigger() {
  const ui = SpreadsheetApp.getUi();
  const actor = getActiveUserEmail_();

  if (!isTrainer_(actor)) {
    ui.alert('Only trainers or sheet editors can install triggers.');
    return;
  }

  const result = installWeeklyUnlockTrigger_();
  ui.alert(
    'Weekly auto-unlock trigger installed.',
    'Runs every Friday at ' + result.hour + ':00 (' + result.timezone + ').\n\nEnsure Config auto_unlock_enabled is TRUE.',
    ui.ButtonSet.OK
  );
}

function menuRunAutoUnlockNow() {
  const ui = SpreadsheetApp.getUi();
  const actor = getActiveUserEmail_();

  if (!isTrainer_(actor)) {
    ui.alert('Only trainers or sheet editors can run auto unlock.');
    return;
  }

  const result = autoUnlockWeeksForTrainees_();
  if (result.skipped) {
    ui.alert('Auto unlock skipped: ' + (result.reason || 'unknown'));
    return;
  }

  ui.alert(
    'Auto unlock complete.',
    'Trainees checked: ' + result.traineeCount + '\nUpdated: ' + result.updatedCount,
    ui.ButtonSet.OK
  );
}

function menuRemoveAutoUnlockTrigger() {
  const ui = SpreadsheetApp.getUi();
  const actor = getActiveUserEmail_();

  if (!isTrainer_(actor)) {
    ui.alert('Only trainers or sheet editors can remove triggers.');
    return;
  }

  const result = removeWeeklyUnlockTriggers_();
  ui.alert('Removed ' + result.removed + ' auto-unlock trigger(s).');
}
```

---

## File: `apps-script/SheetBootstrap.js`

*Sheet tab creation, seed data, sample questions*

```javascript
/**
 * Run once from the bound spreadsheet: Training App → Bootstrap sheet tabs.
 * Creates tabs, headers, config defaults, guide text, and sample questions.
 */

function bootstrapTrainingSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const lock = LockService.getDocumentLock();

  if (!lock.tryLock(ST_CONFIG.lockWaitMs)) {
    throw new Error('Another bootstrap is already running. Try again shortly.');
  }

  try {
    ensureSheetWithHeaders_(ss, ST_CONFIG.sheets.config, ['setting', 'value']);
    ensureSheetWithHeaders_(ss, ST_CONFIG.sheets.trainees, [
      'email', 'display_name', 'manager_email', 'start_date', 'weeks_unlocked', 'active'
    ]);
    ensureSheetWithHeaders_(ss, ST_CONFIG.sheets.questions, [
      'question_id', 'week', 'type', 'topic', 'question_text', 'ticket_context',
      'options_json', 'correct_answer', 'model_answer', 'style_guide',
      'max_points', 'sort_order', 'active'
    ]);
    ensureSheetWithHeaders_(ss, ST_CONFIG.sheets.responses, [
      'response_id', 'session_id', 'trainee_email', 'week', 'question_id',
      'submitted_at', 'response_text', 'ai_score', 'ai_max_points', 'ai_feedback',
      'ai_improvements', 'final_score', 'trainer_feedback', 'reviewed_by',
      'reviewed_at', 'status'
    ]);
    ensureSheetWithHeaders_(ss, ST_CONFIG.sheets.sessionSummary, [
      'session_id', 'trainee_email', 'week', 'started_at', 'submitted_at',
      'total_ai_score', 'total_final_score', 'max_possible', 'pct_final', 'passed',
      'improvements_summary', 'status', 'report_sent_at'
    ]);
    ensureSheetWithHeaders_(ss, ST_CONFIG.sheets.guide, ['section', 'content']);

    seedConfigDefaults_(ss);
    seedGuideContent_(ss);
    seedSampleQuestions_(ss);
    seedSampleTrainee_(ss);

    SpreadsheetApp.getUi().alert(
      'Training sheet bootstrapped.',
      'Tabs, config, sample questions (weeks 1–4), and a placeholder trainee row are ready. ' +
        'Update Trainees with real joiner emails, set Script Property API_KEY for ticket scoring, then deploy the web app.',
      SpreadsheetApp.getUi().ButtonSet.OK
    );
  } finally {
    lock.releaseLock();
  }
}

function ensureSheetWithHeaders_(ss, name, headers) {
  let sheet = ss.getSheetByName(name);

  if (!sheet) {
    sheet = ss.insertSheet(name);
  }

  const existing = sheet.getLastRow() >= 1 ? sheet.getRange(1, 1, 1, headers.length).getValues()[0] : [];
  const hasHeaders = headers.every(function(h, i) {
    return String(existing[i] || '').toLowerCase() === String(h).toLowerCase();
  });

  if (!hasHeaders) {
    sheet.clear();
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
  }

  return sheet;
}

function seedConfigDefaults_(ss) {
  const sheet = ss.getSheetByName(ST_CONFIG.sheets.config);
  if (!sheet || sheet.getLastRow() > 1) {
    return;
  }

  const rows = [
    ['app_title', ST_CONFIG.defaults.appTitle],
    ['pass_threshold_pct', String(ST_CONFIG.defaults.passThresholdPct)],
    ['friday_only', 'TRUE'],
    ['timezone', ST_CONFIG.defaults.timezone],
    ['trainer_emails', ST_CONFIG.defaults.trainerEmails],
    ['web_app_url', ''],
    ['auto_unlock_enabled', 'TRUE'],
    ['auto_unlock_friday_only', 'TRUE'],
    ['auto_unlock_require_previous_week', 'FALSE'],
    ['auto_unlock_hour', '8'],
    ['max_training_weeks', '4']
  ];

  sheet.getRange(2, 1, rows.length, 2).setValues(rows);
}

function seedGuideContent_(ss) {
  const sheet = ss.getSheetByName(ST_CONFIG.sheets.guide);
  if (!sheet || sheet.getLastRow() > 1) {
    return;
  }

  const rows = [
    ['Overview', 'New joiners complete weekly training on Fridays via the web app. Weeks are unlocked by trainers.'],
    ['Adding questions', 'Add rows to Questions. type = knowledge (MCQ) or ticket (free text). Set active=TRUE.'],
    ['Knowledge questions', 'options_json must be valid JSON array, e.g. ["A) Option one","B) Option two"]. correct_answer = A, B, etc.'],
    ['Ticket questions', 'Fill ticket_context (scenario), model_answer (ideal reply), and style_guide (tone/structure rubric).'],
    ['Trainees', 'Add joiner email, manager_email, start_date, weeks_unlocked (1–4), active=TRUE.'],
    ['Unlocking weeks', 'Menu: Training App - Unlock week for trainee (manual), or enable auto unlock.'],
    ['Auto unlock', 'Menu: Install weekly auto-unlock trigger (Fridays). Config: auto_unlock_enabled, auto_unlock_require_previous_week.'],
    ['Reviewing scores', 'Edit final_score and trainer_feedback in Responses. Menu: Mark session reviewed.'],
    ['Sending reports', 'Menu: Training App → Send final report. Uses final_score when set, otherwise ai_score.'],
    ['OpenAI key', 'Apps Script → Project settings → Script properties → API_KEY (never store in this sheet).'],
    ['Deploy web app', 'Deploy → New deployment → Web app. Execute as: Me. Access: Anyone at playroll.com (or your domain).']
  ];

  sheet.getRange(2, 1, rows.length, 2).setValues(rows);
}

function seedSampleTrainee_(ss) {
  const sheet = ss.getSheetByName(ST_CONFIG.sheets.trainees);
  if (!sheet || sheet.getLastRow() > 1) {
    return;
  }

  sheet.getRange(2, 1, 1, 6).setValues([[
    'trainee@playroll.com',
    'Example Trainee',
    'manager@playroll.com',
    Utilities.formatDate(new Date(), ST_CONFIG.defaults.timezone, 'yyyy-MM-dd'),
    1,
    true
  ]]);
}

function seedSampleQuestions_(ss) {
  const sheet = ss.getSheetByName(ST_CONFIG.sheets.questions);
  if (!sheet || sheet.getLastRow() > 1) {
    return;
  }

  const rows = [
    sampleKnowledgeRow_(1, 'W1-K01', 'EOR basics', 'What does Employer of Record (EOR) mean in our context?',
      '["A) We employ workers on behalf of clients in foreign countries","B) We only process payroll","C) We provide visa services only","D) We are a recruitment agency"]',
      'A', 5, 1),
    sampleTicketRow_(1, 'W1-T01', 'Zendesk tone', 'Draft a reply to the employee below.',
      'Subject: When will I be paid?\n\nEmployee message:\nHi, I started on the 1st and haven\'t received my first payslip yet. Can you help?\n\nInternal note: Employee started 1st of current month; first payroll run is on the 25th.',
      'Thank the employee, confirm their start date, explain the payroll cycle and when they can expect their first payslip, and offer to follow up if needed.',
      'Professional and empathetic tone. Acknowledge the concern. Do not promise exact dates outside policy. Include next steps.',
      10, 2),
    sampleKnowledgeRow_(2, 'W2-K01', 'Payroll', 'When is payroll typically processed for most EOR employees?',
      '["A) On the 1st only","B) According to the schedule in the employment agreement / country rules","C) Whenever the employee requests","D) Never — clients pay directly"]',
      'B', 5, 1),
    sampleTicketRow_(2, 'W2-T01', 'Leave policy', 'Draft a reply about annual leave balance.',
      'Subject: Leave balance\n\nEmployee message:\nHow many annual leave days do I have left this year?\n\nInternal note: Employee has 15 days entitlement, 6 days used YTD per platform.',
      'Confirm you can help, state remaining balance (9 days), mention where they can view leave in the platform, and invite further questions.',
      'Concise, accurate numbers, friendly tone, no internal system names exposed unnecessarily.',
      10, 2),
    sampleKnowledgeRow_(3, 'W3-K01', 'Compliance', 'Who is responsible for local employment compliance in an EOR arrangement?',
      '["A) The employee only","B) The client company only","C) Playroll as the legal employer in the country","D) No one"]',
      'C', 5, 1),
    sampleTicketRow_(3, 'W3-T01', 'Contract amendment', 'Draft a reply about a contract change request.',
      'Subject: Change my job title\n\nEmployee message:\nMy manager said my title will change to Senior Analyst from next month. What do I need to do?\n\nInternal note: Amendment requires client approval and updated EA; not yet received.',
      'Acknowledge the request, explain that title changes require an employment agreement amendment and client confirmation, outline expected timeline steps, and set expectations that you will follow up.',
      'Clear process explanation, no commitment without approval, proactive tone.',
      10, 2),
    sampleKnowledgeRow_(4, 'W4-K01', 'Escalation', 'When should you escalate a ticket to a senior or specialist team?',
      '["A) Never — always resolve alone","B) When policy is unclear, legal risk exists, or SLA/deadline is at risk","C) Only when the employee is upset","D) After closing the ticket"]',
      'B', 5, 1),
    sampleTicketRow_(4, 'W4-T01', 'Complex termination query', 'Draft a reply to a sensitive offboarding question.',
      'Subject: Notice period\n\nEmployee message:\nI need to resign. How much notice do I give and what is the process?\n\nInternal note: Country = UK, 1 month notice per EA, offboarding checklist applies.',
      'Provide notice period per their agreement, outline resignation steps (written notice, dates, final pay/leave), link to relevant help article if applicable, offer to confirm in writing.',
      'Accurate notice period, empathetic, structured steps, compliance-aware wording.',
      10, 2)
  ];

  sheet.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
}

function sampleKnowledgeRow_(week, id, topic, questionText, optionsJson, correctAnswer, maxPoints, sortOrder) {
  return [id, week, 'knowledge', topic, questionText, '', optionsJson, correctAnswer, '', '', maxPoints, sortOrder, true];
}

function sampleTicketRow_(week, id, topic, questionText, ticketContext, modelAnswer, styleGuide, maxPoints, sortOrder) {
  return [id, week, 'ticket', topic, questionText, ticketContext, '', '', modelAnswer, styleGuide, maxPoints, sortOrder, true];
}
```

---

## File: `apps-script/Code.js`

*Entry points: doGet, web API, trainer menu actions*

```javascript
/**
 * EOR Support Training App — entry points, web API, trainer menu.
 */

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Training App')
    .addItem('Bootstrap sheet tabs', 'bootstrapTrainingSheet')
    .addSeparator()
    .addItem('Unlock week for trainee', 'menuUnlockWeekForTrainee')
    .addItem('Run auto unlock now', 'menuRunAutoUnlockNow')
    .addItem('Mark session reviewed', 'menuMarkSessionReviewed')
    .addItem('Send final report', 'menuSendFinalReport')
    .addSeparator()
    .addItem('Install weekly auto-unlock trigger', 'menuInstallAutoUnlockTrigger')
    .addItem('Remove weekly auto-unlock trigger', 'menuRemoveAutoUnlockTrigger')
    .addSeparator()
    .addItem('Open web app (browser)', 'menuOpenWebApp')
    .addItem('Copy web app URL', 'menuCopyWebAppUrl')
    .addToUi();
}

function doGet() {
  return HtmlService.createHtmlOutputFromFile('TrainingApp')
    .setTitle(String(getConfigValue_('app_title', ST_CONFIG.defaults.appTitle)))
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function getTraineeContext() {
  const email = getActiveUserEmail_();
  const trainee = getTraineeByEmail_(email);

  if (!trainee) {
    throw new Error('You are not registered as an active trainee. Ask your trainer to add your email to the Trainees sheet.');
  }

  const timezone = String(getConfigValue_('timezone', ST_CONFIG.defaults.timezone));
  const fridayOnly = parseBoolConfig_(getConfigValue_('friday_only', ST_CONFIG.defaults.fridayOnly), true);
  const isFriday = isFridayInTimezone_(timezone);
  const sessions = getSessionsForTrainee_(email);
  const completedWeeks = {};

  sessions.forEach(function(session) {
    if (session.submittedAt) {
      completedWeeks[session.week] = session;
    }
  });

  const availableWeeks = [];
  for (var week = 1; week <= trainee.weeksUnlocked; week++) {
    availableWeeks.push({
      week: week,
      completed: !!completedWeeks[week],
      sessionId: completedWeeks[week] ? completedWeeks[week].sessionId : '',
      status: completedWeeks[week] ? completedWeeks[week].status : '',
      pctFinal: completedWeeks[week] ? completedWeeks[week].pctFinal : null
    });
  }

  return {
    version: ST_CONFIG.version,
    appTitle: String(getConfigValue_('app_title', ST_CONFIG.defaults.appTitle)),
    trainee: {
      email: trainee.email,
      displayName: trainee.displayName,
      weeksUnlocked: trainee.weeksUnlocked
    },
    gates: {
      fridayOnly: fridayOnly,
      isFriday: isFriday,
      canStartQuiz: !fridayOnly || isFriday,
      timezone: timezone
    },
    passThresholdPct: Number(getConfigValue_('pass_threshold_pct', ST_CONFIG.defaults.passThresholdPct)) || 70,
    availableWeeks: availableWeeks
  };
}

function getWeekQuiz(week) {
  const email = getActiveUserEmail_();
  const trainee = getTraineeByEmail_(email);
  if (!trainee) {
    throw new Error('Trainee not found.');
  }

  const weekNum = Number(week);
  if (!weekNum || weekNum < 1 || weekNum > 4) {
    throw new Error('Invalid week.');
  }

  if (weekNum > trainee.weeksUnlocked) {
    throw new Error('Week ' + weekNum + ' is not unlocked yet. Ask your trainer.');
  }

  const fridayOnly = parseBoolConfig_(getConfigValue_('friday_only', ST_CONFIG.defaults.fridayOnly), true);
  const timezone = String(getConfigValue_('timezone', ST_CONFIG.defaults.timezone));
  if (fridayOnly && !isFridayInTimezone_(timezone)) {
    throw new Error('Training sessions run on Fridays only (' + timezone + '). Come back on Friday.');
  }

  const existing = getSessionsForTrainee_(email).filter(function(s) {
    return s.week === weekNum && s.submittedAt;
  });
  if (existing.length > 0) {
    throw new Error('You have already completed Week ' + weekNum + '. Contact your trainer if you need a retake.');
  }

  const questions = getQuestionsForWeek_(weekNum).map(sanitizeQuestionForClient_);
  if (!questions.length) {
    throw new Error('No active questions found for Week ' + weekNum + '.');
  }

  return {
    week: weekNum,
    questions: questions
  };
}

function submitWeekQuiz(week, answersJson) {
  const lock = LockService.getDocumentLock();
  if (!lock.tryLock(ST_CONFIG.lockWaitMs)) {
    throw new Error('Another submission is in progress. Please wait and try again.');
  }

  try {
    const email = getActiveUserEmail_();
    const trainee = getTraineeByEmail_(email);
    if (!trainee) {
      throw new Error('Trainee not found.');
    }

    const weekNum = Number(week);
    getWeekQuiz(weekNum);

    let answers;
    try {
      answers = typeof answersJson === 'string' ? JSON.parse(answersJson) : answersJson;
    } catch (e) {
      throw new Error('Invalid answers payload.');
    }

    if (!answers || typeof answers !== 'object') {
      throw new Error('Answers are required.');
    }

    const questions = getQuestionsForWeek_(weekNum);
    const sessionId = generateUuid_();
    const now = new Date();
    const scoredResults = [];
    const responseRows = [];
    const questionsById = {};

    questions.forEach(function(question) {
      questionsById[question.questionId] = question;
      const responseText = String(answers[question.questionId] || '').trim();
      const scored = scoreQuestionResponse_(question, responseText);
      const responseId = generateUuid_();

      const responseObj = {
        responseId: responseId,
        sessionId: sessionId,
        traineeEmail: email,
        week: weekNum,
        questionId: question.questionId,
        submittedAt: now,
        responseText: responseText,
        aiScore: scored.aiScore,
        aiMaxPoints: scored.aiMaxPoints,
        aiFeedback: scored.aiFeedback,
        aiImprovements: scored.aiImprovements,
        finalScore: null,
        trainerFeedback: '',
        reviewedBy: '',
        reviewedAt: '',
        status: 'ai_scored'
      };

      scoredResults.push(Object.assign({}, responseObj, {
        topic: question.topic,
        type: question.type
      }));

      responseRows.push([
        responseId,
        sessionId,
        email,
        weekNum,
        question.questionId,
        now,
        responseText,
        scored.aiScore,
        scored.aiMaxPoints,
        scored.aiFeedback,
        scored.aiImprovements,
        '',
        '',
        '',
        '',
        'ai_scored'
      ]);
    });

    responseRows.forEach(function(row) {
      appendResponseRow_(row);
    });

    let totalAi = 0;
    let maxPossible = 0;
    scoredResults.forEach(function(r) {
      totalAi += Number(r.aiScore) || 0;
      maxPossible += Number(r.aiMaxPoints) || 0;
    });

    const pct = maxPossible > 0 ? Math.round((totalAi / maxPossible) * 1000) / 10 : 0;
    const threshold = Number(getConfigValue_('pass_threshold_pct', ST_CONFIG.defaults.passThresholdPct)) || 70;
    const improvementsSummary = buildImprovementsSummary_(scoredResults, questionsById);

    appendSessionRow_([
      sessionId,
      email,
      weekNum,
      now,
      now,
      totalAi,
      totalAi,
      maxPossible,
      pct,
      pct >= threshold,
      improvementsSummary,
      'ai_scored',
      ''
    ]);

    return {
      sessionId: sessionId,
      week: weekNum,
      totalScore: totalAi,
      maxPossible: maxPossible,
      pct: pct,
      passed: pct >= threshold,
      passThresholdPct: threshold,
      results: scoredResults.map(function(r) {
        return {
          questionId: r.questionId,
          topic: r.topic,
          type: r.type,
          score: r.aiScore,
          maxPoints: r.aiMaxPoints,
          feedback: r.aiFeedback,
          improvements: r.aiImprovements
        };
      }),
      improvementsSummary: improvementsSummary,
      trainerReviewNote: 'Ticket scores may be adjusted by your trainer before the final report is sent.'
    };
  } finally {
    lock.releaseLock();
  }
}

function menuUnlockWeekForTrainee() {
  const ui = SpreadsheetApp.getUi();
  const emailResp = ui.prompt('Unlock week', 'Trainee email:', ui.ButtonSet.OK_CANCEL);
  if (emailResp.getSelectedButton() !== ui.Button.OK) {
    return;
  }

  const weekResp = ui.prompt('Unlock week', 'Week number (1–4):', ui.ButtonSet.OK_CANCEL);
  if (weekResp.getSelectedButton() !== ui.Button.OK) {
    return;
  }

  const reviewer = getActiveUserEmail_();
  if (!isTrainer_(reviewer)) {
    ui.alert('Only trainers or sheet editors can unlock weeks.');
    return;
  }

  const week = Number(weekResp.getResponseText());
  if (!week || week < 1 || week > 4) {
    ui.alert('Invalid week. Enter 1, 2, 3, or 4.');
    return;
  }

  const updated = updateTraineeWeeksUnlocked_(emailResp.getResponseText(), week);
  ui.alert('Updated weeks_unlocked to ' + updated + ' for ' + emailResp.getResponseText().trim());
}

function menuMarkSessionReviewed() {
  const ui = SpreadsheetApp.getUi();
  const resp = ui.prompt('Mark session reviewed', 'Session ID:', ui.ButtonSet.OK_CANCEL);
  if (resp.getSelectedButton() !== ui.Button.OK) {
    return;
  }

  const reviewer = getActiveUserEmail_();
  const result = markSessionReviewed_(resp.getResponseText().trim(), reviewer);
  ui.alert('Session marked reviewed. Score: ' + result.pct + '%');
}

function menuSendFinalReport() {
  const ui = SpreadsheetApp.getUi();
  const resp = ui.prompt('Send final report', 'Session ID:', ui.ButtonSet.OK_CANCEL);
  if (resp.getSelectedButton() !== ui.Button.OK) {
    return;
  }

  const sender = getActiveUserEmail_();
  const result = sendFinalReportForSession_(resp.getResponseText().trim(), sender);
  ui.alert('Report sent to: ' + result.recipients.join(', ') + '\nScore: ' + result.pct + '%');
}

function menuOpenWebApp() {
  const url = getWebAppUrl_();
  if (!url) {
    SpreadsheetApp.getUi().alert('Deploy the web app first, then set web_app_url in Config or redeploy.');
    return;
  }
  const html = HtmlService.createHtmlOutput(
    '<script>window.open("' + url.replace(/"/g, '\\"') + '","_blank");google.script.host.close();</script>'
  );
  SpreadsheetApp.getUi().showModalDialog(html, 'Opening training app…');
}

function menuCopyWebAppUrl() {
  const ui = SpreadsheetApp.getUi();
  const url = getWebAppUrl_();
  if (!url) {
    ui.alert('Deploy the web app first. After deployment, paste the URL into Config → web_app_url.');
    return;
  }
  ui.alert('Web app URL:\n\n' + url);
}

function getWebAppUrl_() {
  const configured = String(getConfigValue_('web_app_url', '') || '').trim();
  if (configured) {
    return configured;
  }

  try {
    const deployments = ScriptApp.getProject().getDeployments();
    for (var i = 0; i < deployments.length; i++) {
      const entry = deployments[i].getEntryPoint();
      if (entry && entry.getEntryPointType() === ScriptApp.EntryPointType.WEB_APP) {
        const url = entry.getUrl();
        if (url) {
          return url;
        }
      }
    }
  } catch (e) {
    // ignore
  }

  return '';
}
```

---

## File: `apps-script/TrainingApp.html`

*Trainee web UI (HTML/CSS/JS client)*

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>EOR Support Training</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
  <style>
    :root {
      --pr-purple-600: #5F17F8;
      --pr-purple-50: #F5F1FF;
      --pr-purple-100: #E9D7FE;
      --pr-ink-900: #18181F;
      --pr-text-muted: #6B6578;
      --pr-white: #FFFFFF;
      --pr-surface-app: #F8F7FC;
      --pr-border: #E7E3F2;
      --pr-success: #12B76A;
      --pr-warning: #F79009;
      --pr-danger: #D92D20;
      --pr-radius-lg: 18px;
      --pr-radius-pill: 999px;
      --pr-shadow-card: 0 1px 2px rgba(24, 24, 31, 0.04), 0 8px 24px rgba(24, 24, 31, 0.05);
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: Inter, ui-sans-serif, system-ui, sans-serif;
      background: var(--pr-surface-app);
      color: var(--pr-ink-900);
      font-size: 14px;
      line-height: 1.5;
    }
    .app { max-width: 900px; margin: 0 auto; padding: 24px 20px 48px; }
    .hero { margin-bottom: 24px; }
    .hero .eyebrow { color: var(--pr-purple-600); font-size: 13px; font-weight: 600; margin: 0 0 4px; }
    .hero h1 { margin: 0; font-size: 28px; font-weight: 700; letter-spacing: -0.02em; }
    .hero .sub { margin: 8px 0 0; color: var(--pr-text-muted); max-width: 640px; }
    .card {
      background: var(--pr-white);
      border: 1px solid var(--pr-border);
      border-radius: var(--pr-radius-lg);
      box-shadow: var(--pr-shadow-card);
      padding: 20px 22px;
      margin-bottom: 16px;
    }
    .btn-primary {
      background: var(--pr-purple-600);
      color: #fff;
      border: 0;
      border-radius: var(--pr-radius-pill);
      padding: 10px 20px;
      font-weight: 600;
      font-size: 14px;
      cursor: pointer;
    }
    .btn-primary:disabled { opacity: 0.55; cursor: wait; }
    .btn-secondary {
      background: var(--pr-white);
      color: var(--pr-ink-900);
      border: 1px solid var(--pr-border);
      border-radius: var(--pr-radius-pill);
      padding: 10px 16px;
      font-weight: 600;
      cursor: pointer;
    }
    .week-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 12px;
      margin-top: 16px;
    }
    .week-card {
      border: 1px solid var(--pr-border);
      border-radius: 14px;
      padding: 16px;
      background: var(--pr-white);
      cursor: pointer;
      transition: border-color 0.15s, box-shadow 0.15s;
    }
    .week-card:hover:not(.disabled) {
      border-color: var(--pr-purple-600);
      box-shadow: var(--pr-shadow-card);
    }
    .week-card.disabled { opacity: 0.55; cursor: not-allowed; }
    .week-card h3 { margin: 0 0 6px; font-size: 16px; }
    .week-card p { margin: 0; font-size: 13px; color: var(--pr-text-muted); }
    .badge {
      display: inline-block;
      padding: 3px 10px;
      border-radius: var(--pr-radius-pill);
      font-size: 12px;
      font-weight: 600;
      margin-top: 8px;
    }
    .badge.open { background: var(--pr-purple-50); color: var(--pr-purple-600); }
    .badge.done { background: #ECFDF3; color: var(--pr-success); }
    .badge.locked { background: #F2F4F7; color: var(--pr-text-muted); }
    .alert {
      border-radius: 12px;
      padding: 12px 14px;
      margin-bottom: 16px;
      font-size: 13px;
    }
    .alert.warn { background: #FFFAEB; border: 1px solid #FEDF89; color: #7A2E0E; }
    .alert.info { background: var(--pr-purple-50); border: 1px solid var(--pr-purple-100); color: var(--pr-ink-900); }
    .question-block { margin-bottom: 20px; padding-bottom: 20px; border-bottom: 1px solid var(--pr-border); }
    .question-block:last-child { border-bottom: 0; margin-bottom: 0; padding-bottom: 0; }
    .question-meta { font-size: 12px; color: var(--pr-text-muted); margin-bottom: 8px; }
    .question-meta strong { color: var(--pr-purple-600); }
    .question-title { font-size: 16px; font-weight: 600; margin: 0 0 12px; }
    .ticket-context {
      background: var(--pr-surface-app);
      border: 1px solid var(--pr-border);
      border-radius: 12px;
      padding: 12px 14px;
      font-size: 13px;
      white-space: pre-wrap;
      margin-bottom: 12px;
    }
    .options label {
      display: block;
      padding: 10px 12px;
      border: 1px solid var(--pr-border);
      border-radius: 12px;
      margin-bottom: 8px;
      cursor: pointer;
    }
    .options label:hover { border-color: var(--pr-purple-600); }
    .options input { margin-right: 8px; }
    textarea {
      width: 100%;
      min-height: 160px;
      border: 1px solid var(--pr-border);
      border-radius: 12px;
      padding: 12px 14px;
      font-family: inherit;
      font-size: 14px;
      resize: vertical;
    }
    textarea:focus, select:focus { outline: 2px solid var(--pr-purple-100); border-color: var(--pr-purple-600); }
    .actions { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 20px; }
    .result-item { margin-bottom: 16px; }
    .result-score { font-weight: 700; font-size: 15px; }
    .result-score.pass { color: var(--pr-success); }
    .result-score.fail { color: var(--pr-danger); }
    .improvements { margin: 8px 0 0; padding-left: 18px; color: var(--pr-text-muted); font-size: 13px; }
    .kpi-row { display: flex; flex-wrap: wrap; gap: 16px; margin-bottom: 16px; }
    .kpi { flex: 1; min-width: 120px; }
    .kpi .label { font-size: 12px; color: var(--pr-text-muted); }
    .kpi .value { font-size: 28px; font-weight: 700; margin-top: 4px; }
    .loader { text-align: center; padding: 40px; color: var(--pr-text-muted); }
    .error-state h2 { margin: 0 0 8px; color: var(--pr-danger); }
    .hidden { display: none !important; }
    .progress { font-size: 13px; color: var(--pr-text-muted); margin-bottom: 12px; }
  </style>
</head>
<body>
  <div class="app">
    <header class="hero">
      <p class="eyebrow">Playroll Support</p>
      <h1 id="appTitle">EOR Support Training</h1>
      <p class="sub" id="welcomeText">Loading your training profile…</p>
    </header>

    <div id="alerts"></div>
    <div id="viewHome" class="hidden">
      <section class="card">
        <h2 style="margin:0 0 6px;font-size:18px;">Choose a week</h2>
        <p style="margin:0;color:var(--pr-text-muted);font-size:13px;">Complete one session per week. Training runs on Fridays.</p>
        <div class="week-grid" id="weekGrid"></div>
      </section>
    </div>

    <div id="viewQuiz" class="hidden">
      <section class="card">
        <div class="progress" id="quizProgress"></div>
        <div id="quizQuestions"></div>
        <div class="actions">
          <button type="button" class="btn-secondary" id="btnBackHome">Back</button>
          <button type="button" class="btn-primary" id="btnSubmit">Submit week</button>
        </div>
      </section>
    </div>

    <div id="viewResults" class="hidden">
      <section class="card" id="resultsCard"></section>
      <div class="actions">
        <button type="button" class="btn-primary" id="btnResultsHome">Back to weeks</button>
      </div>
    </div>

    <div id="viewLoading" class="card loader">Loading…</div>
    <div id="viewError" class="hidden"></div>
  </div>

  <script>
    var state = {
      context: null,
      currentWeek: null,
      questions: [],
      answers: {}
    };

    function $(id) { return document.getElementById(id); }

    function esc(s) {
      return String(s || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }

    function showView(name) {
      ['viewHome', 'viewQuiz', 'viewResults', 'viewLoading', 'viewError'].forEach(function(id) {
        $(id).classList.add('hidden');
      });
      if (name) $(name).classList.remove('hidden');
    }

    function showError(message) {
      showView('viewError');
      $('viewError').innerHTML = '<div class="card error-state"><h2>Something went wrong</h2><p>' + esc(message) + '</p><div class="actions"><button type="button" class="btn-primary" onclick="loadContext()">Try again</button></div></div>';
    }

    function renderAlerts(ctx) {
      var html = '';
      if (ctx.gates.fridayOnly && !ctx.gates.canStartQuiz) {
        html += '<div class="alert warn">Training sessions open on Fridays (' + esc(ctx.gates.timezone) + '). You can review completed weeks, but new quizzes unlock on Friday.</div>';
      }
      html += '<div class="alert info">Pass mark: ' + ctx.passThresholdPct + '%. Ticket replies are AI-scored immediately; your trainer may adjust marks before the final report.</div>';
      $('alerts').innerHTML = html;
    }

    function renderHome(ctx) {
      $('appTitle').textContent = ctx.appTitle;
      $('welcomeText').textContent = 'Welcome, ' + ctx.trainee.displayName + '. Weeks unlocked: ' + ctx.trainee.weeksUnlocked + ' of 4.';

      var html = '';
      ctx.availableWeeks.forEach(function(w) {
        var disabled = w.completed || (!ctx.gates.canStartQuiz && !w.completed);
        var badge = w.completed
          ? '<span class="badge done">Completed' + (w.pctFinal != null ? ' · ' + w.pctFinal + '%' : '') + '</span>'
          : (disabled ? '<span class="badge locked">Friday only</span>' : '<span class="badge open">Ready</span>');
        html += '<div class="week-card' + (disabled ? ' disabled' : '') + '" data-week="' + w.week + '"' + (disabled ? '' : ' tabindex="0"') + '>' +
          '<h3>Week ' + w.week + '</h3>' +
          '<p>' + (w.completed ? 'Session submitted' : 'Knowledge + ticket exercises') + '</p>' +
          badge + '</div>';
      });

      $('weekGrid').innerHTML = html;

      Array.prototype.forEach.call(document.querySelectorAll('.week-card:not(.disabled)'), function(el) {
        function start() {
          var week = Number(el.getAttribute('data-week'));
          startWeek(week);
        }
        el.addEventListener('click', start);
        el.addEventListener('keydown', function(e) {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); start(); }
        });
      });
    }

    function renderQuiz(data) {
      state.currentWeek = data.week;
      state.questions = data.questions;
      state.answers = {};

      $('quizProgress').textContent = 'Week ' + data.week + ' · ' + data.questions.length + ' question(s)';
      var html = '';

      data.questions.forEach(function(q, idx) {
        html += '<div class="question-block" data-qid="' + esc(q.questionId) + '">';
        html += '<div class="question-meta"><strong>' + esc(q.topic) + '</strong> · ' + esc(q.type) + ' · ' + q.maxPoints + ' pts</div>';
        html += '<p class="question-title">' + (idx + 1) + '. ' + esc(q.questionText) + '</p>';

        if (q.type === 'ticket') {
          if (q.ticketContext) {
            html += '<div class="ticket-context">' + esc(q.ticketContext) + '</div>';
          }
          html += '<textarea id="answer_' + esc(q.questionId) + '" placeholder="Draft your reply…" data-qid="' + esc(q.questionId) + '"></textarea>';
        } else {
          html += '<div class="options">';
          (q.options || []).forEach(function(opt) {
            var id = 'opt_' + q.questionId + '_' + opt.replace(/[^a-zA-Z0-9]/g, '').substring(0, 12);
            html += '<label><input type="radio" name="q_' + esc(q.questionId) + '" value="' + esc(opt) + '" data-qid="' + esc(q.questionId) + '" /> ' + esc(opt) + '</label>';
          });
          html += '</div>';
        }
        html += '</div>';
      });

      $('quizQuestions').innerHTML = html;
      showView('viewQuiz');
    }

    function collectAnswers() {
      var answers = {};
      state.questions.forEach(function(q) {
        if (q.type === 'ticket') {
          var ta = document.querySelector('textarea[data-qid="' + q.questionId + '"]');
          answers[q.questionId] = ta ? ta.value : '';
        } else {
          var selected = document.querySelector('input[name="q_' + q.questionId + '"]:checked');
          answers[q.questionId] = selected ? selected.value : '';
        }
      });
      return answers;
    }

    function validateAnswers(answers) {
      for (var i = 0; i < state.questions.length; i++) {
        var q = state.questions[i];
        if (!String(answers[q.questionId] || '').trim()) {
          return 'Please answer all questions before submitting (missing: ' + q.questionId + ').';
        }
      }
      return '';
    }

    function renderResults(data) {
      var scoreClass = data.passed ? 'pass' : 'fail';
      var html = '<h2 style="margin:0 0 16px;font-size:20px;">Week ' + data.week + ' results</h2>';
      html += '<div class="kpi-row">';
      html += '<div class="kpi"><div class="label">Score</div><div class="value ' + scoreClass + '">' + data.totalScore + ' / ' + data.maxPossible + '</div></div>';
      html += '<div class="kpi"><div class="label">Percentage</div><div class="value ' + scoreClass + '">' + data.pct + '%</div></div>';
      html += '<div class="kpi"><div class="label">Result</div><div class="value ' + scoreClass + '" style="font-size:18px;">' + (data.passed ? 'Pass' : 'Needs improvement') + '</div></div>';
      html += '</div>';

      if (data.trainerReviewNote) {
        html += '<div class="alert info">' + esc(data.trainerReviewNote) + '</div>';
      }

      (data.results || []).forEach(function(r) {
        html += '<div class="result-item">';
        html += '<div class="result-score">' + esc(r.questionId) + ' · ' + esc(r.topic) + ' — ' + r.score + ' / ' + r.maxPoints + '</div>';
        html += '<p style="margin:6px 0 0;">' + esc(r.feedback) + '</p>';
        if (r.improvements) {
          html += '<ul class="improvements">';
          String(r.improvements).split('\n').filter(Boolean).forEach(function(line) {
            html += '<li>' + esc(line.replace(/^[-*•]\s*/, '')) + '</li>';
          });
          html += '</ul>';
        }
        html += '</div>';
      });

      if (data.improvementsSummary) {
        html += '<h3 style="margin:20px 0 8px;font-size:15px;">Summary improvements</h3>';
        html += '<ul class="improvements">';
        String(data.improvementsSummary).split('\n').filter(Boolean).forEach(function(line) {
          html += '<li>' + esc(line.replace(/^[-*•]\s*/, '')) + '</li>';
        });
        html += '</ul>';
      }

      $('resultsCard').innerHTML = html;
      showView('viewResults');
    }

    function startWeek(week) {
      showView('viewLoading');
      google.script.run
        .withSuccessHandler(renderQuiz)
        .withFailureHandler(showError)
        .getWeekQuiz(week);
    }

    function submitQuiz() {
      var answers = collectAnswers();
      var validationError = validateAnswers(answers);
      if (validationError) {
        $('alerts').innerHTML = '<div class="alert warn">' + esc(validationError) + '</div>';
        return;
      }

      $('btnSubmit').disabled = true;
      $('btnSubmit').textContent = 'Scoring…';

      google.script.run
        .withSuccessHandler(function(data) {
          $('btnSubmit').disabled = false;
          $('btnSubmit').textContent = 'Submit week';
          renderResults(data);
        })
        .withFailureHandler(function(err) {
          $('btnSubmit').disabled = false;
          $('btnSubmit').textContent = 'Submit week';
          showError(err.message || String(err));
        })
        .submitWeekQuiz(state.currentWeek, JSON.stringify(answers));
    }

    function loadContext() {
      showView('viewLoading');
      google.script.run
        .withSuccessHandler(function(ctx) {
          state.context = ctx;
          renderAlerts(ctx);
          renderHome(ctx);
          showView('viewHome');
        })
        .withFailureHandler(showError)
        .getTraineeContext();
    }

    $('btnBackHome').addEventListener('click', function() {
      if (state.context) {
        renderHome(state.context);
        showView('viewHome');
      } else {
        loadContext();
      }
    });

    $('btnResultsHome').addEventListener('click', loadContext);
    $('btnSubmit').addEventListener('click', submitQuiz);

    document.addEventListener('DOMContentLoaded', loadContext);
  </script>
</body>
</html>
```

---
