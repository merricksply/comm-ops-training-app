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
