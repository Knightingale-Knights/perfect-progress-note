# progress-note-quality-agent

Standalone Vercel endpoint that grades a submitted progress note as good enough / not good enough, and returns specific feedback. Designed to be called **synchronously, before save**, so Bubble can block submission until the note passes.

Separate from the existing `progress-notes` repo (which flags incidents after the fact) — this one is a pre-save quality gate.

## Deploy

```bash
npm install
vercel deploy
```

Set the env var in Vercel project settings:

- `ANTHROPIC_API_KEY`

## Endpoint

`POST /api/grade-note`

**Request body:**

```json
{
  "noteText": "0900: Arrived at...",
  "shiftContext": "optional — e.g. shift length, participant care type"
}
```

**Response (pass):**

```json
{ "pass": true, "missing": [], "feedback": "Nice detail on ADLs and mood — good to go." }
```

**Response (fail):**

```json
{
  "pass": false,
  "missing": [
    "No timestamps at all — add times so the shift's timeline is clear",
    "Medication given but no detail on how or with what",
    "No mention of toileting/hygiene despite a full-day shift"
  ],
  "feedback": "Good detail on the outing, but this needs timestamps throughout, and a note on meds and personal care before it can go through. Add those and resubmit."
}
```

If the grading call itself errors (Anthropic API down, timeout, etc.), the endpoint **fails open** by default — it returns `pass: true` with a `warning` field so carers are never blocked by an outage. Flip `FAIL_OPEN_ON_ERROR` to `false` in `api/grade-note.js` if you'd rather fail closed.

## Wiring into Bubble

On the progress note submission workflow, before the "Create/Save Progress Note" step:

1. **API Connector call** → `POST` to `https://<your-deployment>.vercel.app/api/grade-note` with `noteText` = the note's text field.
2. **Conditional**: if response's `pass` is `no` →
   - Show an alert/popup with the response's `feedback` text.
   - Stop the workflow (don't run the Save step).
3. If `pass` is `yes` → continue to Save as normal.

Since this blocks on every submission, keep an eye on latency — a single Claude call typically returns in a few seconds, but test the actual round-trip from Bubble before rolling out to all carers.

## Tuning the rubric

The grading criteria and tone live entirely in `SYSTEM_PROMPT` in `api/grade-note.js`. Edit that text directly to tighten or loosen what counts as "good enough" — no need to touch the request/response logic.
