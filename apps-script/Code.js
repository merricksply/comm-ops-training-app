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
