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
