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
