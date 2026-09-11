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
