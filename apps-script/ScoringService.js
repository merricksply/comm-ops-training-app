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
