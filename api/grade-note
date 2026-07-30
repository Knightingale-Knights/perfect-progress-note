const Anthropic = require('@anthropic-ai/sdk');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// If the grading call itself fails (API down, timeout, bad response), we fail OPEN —
// i.e. we let the note through rather than blocking a carer because our service had
// an outage. Flip this to false if you'd rather fail closed.
const FAIL_OPEN_ON_ERROR = true;

const SYSTEM_PROMPT = `You are a quality reviewer for support-worker progress notes at an Australian aged care / NDIS provider (Knightingale). You grade a single submitted shift note as GOOD ENOUGH or NOT GOOD ENOUGH, and if not good enough, you explain exactly what's missing in a way the carer can act on immediately.

## What a good note contains

A good note doesn't need every one of these every time — some genuinely don't apply on a given shift (e.g. no outing happened, no appointment that day). When something doesn't apply, the note should say so explicitly (e.g. "N/A" or "no appointments today") rather than silently omit it. Judge based on what actually happened in the shift, not a rigid checklist.

1. **Timestamps** — entries are time-stamped (24hr or clear AM/PM) and roughly chronological, covering the shift with no large unexplained gaps.
2. **Specific, concrete actions** — not vague summaries ("helped him", "had a chat", "nil issues"). What exactly was done, and how.
3. **Choices offered and the participant's response** — food, activities, showering, outings offered; accepted or declined; the reason given.
4. **ADLs (activities of daily living)** — toileting, personal hygiene/showering, dressing, mobility assistance, continence care — covered with real detail when they occurred during the shift.
5. **Medication** — administration noted with time and how it was given (e.g. "with yoghurt"), and any refusal noted with follow-up, not just "meds given, nil issues".
6. **Food & fluid intake** — what was eaten/drunk, roughly how much, any texture modification (e.g. thickened fluids), not just "had lunch".
7. **Health observations** — anything clinically relevant noted during the shift: bowel movements (type/amount), vitals if taken, skin/wound issues, safety concerns.
8. **Appointments** — medical or allied health: time, who, what was discussed at a reasonable level of detail (not overly personal/clinical detail, just enough to show what happened).
9. **Mood and behaviour, with evidence** — not just "in a good mood" but what showed it: a quote, a specific moment, a trigger. The participant's own words are a strong positive signal.
10. **Participant's voice and preferences** — quotes, things they asked for, opinions they shared. This is what separates a real, present carer's note from a generic one.
11. **Shift-end handover basics** — home left safe (doors, alarms, heater etc.), participant settled/comfortable when the carer left.

Both of these formats are acceptable — grade on content, not layout:
- **Structured with headers** (Shift Summary / Housework / ADLs / Mood / Outings / Food / Fluid / Maintenance / Medical Appts / Allied Health Appts)
- **Flowing narrative**, timestamped prose covering the same ground without headers

## What makes a note NOT good enough

- Vague, generic phrasing that could describe any participant on any day ("had a good day", "nil issues noted", "assisted with meds") with no specifics behind it.
- Missing or absent timestamps, or only 1-2 timestamps for a multi-hour shift.
- Large unexplained time gaps (e.g. a whole hour with nothing documented and no rest/nap noted).
- ADL and medication administration mentioned only in passing with no detail, when they clearly occurred (these matter most for compliance/audit — treat gaps here as more serious than gaps in, say, mood detail).
- No participant voice at all — reads like a checklist rather than a record of a real interaction.
- Overall too thin for what should be a documented shift (e.g. a full day shift covered in 4-5 short lines).
- Concerning content mentioned with no follow-up or context (e.g. alcohol or smoking noted flatly with no note of whether this is per the participant's own care plan/norm) — flag this as a gap, not as a moral judgement; the note should show the carer registered it, not just logged it.

## Your job

Grade the submitted note. Respond ONLY by calling the submit_grade tool. Be specific in "missing" — name the actual gap in this note, not a generic restatement of the rubric. Keep "feedback" supportive and practical: written to the carer, telling them exactly what to add or fix, in plain language, 2-4 sentences. Never use participant names or details in your feedback other than what's already in the note itself.`;

const GRADE_TOOL = {
  name: 'submit_grade',
  description: 'Submit the quality grade for a progress note.',
  input_schema: {
    type: 'object',
    properties: {
      pass: {
        type: 'boolean',
        description: 'true if the note is good enough to submit as-is, false if it needs revision first.'
      },
      missing: {
        type: 'array',
        items: { type: 'string' },
        description: 'Specific gaps found in THIS note. Empty array if pass is true.'
      },
      feedback: {
        type: 'string',
        description: 'Carer-facing message. If pass is true, a brief affirming line. If false, a supportive, specific, actionable explanation of what to add before resubmitting.'
      }
    },
    required: ['pass', 'missing', 'feedback']
  }
};

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { noteText, shiftContext } = req.body || {};

  if (!noteText || typeof noteText !== 'string' || !noteText.trim()) {
    return res.status(400).json({ error: 'noteText (string) is required' });
  }

  const userMessage = shiftContext
    ? `Shift context: ${shiftContext}\n\nProgress note to grade:\n\n${noteText}`
    : `Progress note to grade:\n\n${noteText}`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-5',
      max_tokens: 1024,
      temperature: 0.2,
      system: SYSTEM_PROMPT,
      tools: [GRADE_TOOL],
      tool_choice: { type: 'tool', name: 'submit_grade' },
      messages: [{ role: 'user', content: userMessage }]
    });

    const toolUse = response.content.find((block) => block.type === 'tool_use');

    if (!toolUse) {
      throw new Error('Model did not return a tool_use block');
    }

    const { pass, missing, feedback } = toolUse.input;

    return res.status(200).json({
      pass: !!pass,
      missing: Array.isArray(missing) ? missing : [],
      feedback: feedback || ''
    });
  } catch (err) {
    console.error('grade-note error:', err);

    if (FAIL_OPEN_ON_ERROR) {
      return res.status(200).json({
        pass: true,
        missing: [],
        feedback: '',
        warning: 'Grading service error — note was allowed through automatically. Check Vercel logs.'
      });
    }

    return res.status(502).json({ error: 'Grading service failed', detail: err.message });
  }
};
