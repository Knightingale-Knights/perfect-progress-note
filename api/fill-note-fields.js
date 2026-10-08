const FIELDS = [
  "activities_of_daily_living",
  "allied_health",
  "best_day",
  "comms",
  "fluid_intake",
  "food_intake",
  "general_mood",
  "housework",
  "maintenance",
  "medical_appointments",
  "outings",
];

const EMPTY_TEXT = "Not on this shift";

const SYSTEM_PROMPT = `You read a carer's shift summary for an NDIS or aged care participant and sort its content into fixed fields.

Return ONLY a JSON object with exactly these keys, each a string:
${FIELDS.join(", ")}

Field definitions:
- activities_of_daily_living: personal care such as showering, dressing, toileting, grooming, mobility, transfers, medication prompts
- allied_health: physio, OT, speech pathology, podiatry, dietitian or similar visits, plus any exercises or programs from them
- best_day: the highlight of the shift, what went well or what the participant enjoyed most
- comms: communication with family, coordinators, other staff, phone calls, messages, handover
- fluid_intake: drinks and hydration
- food_intake: meals, snacks, appetite, food preparation
- general_mood: the participant's mood and emotional state, with the evidence given
- housework: cleaning, laundry, dishes, tidying, bed making, rubbish
- maintenance: repairs, faults, hazards or equipment issues at the home
- medical_appointments: GP, specialist, hospital, pathology or other medical appointments, including transport and outcome
- outings: community access, shopping, walks, social activities, drives

Rules:
- Use only information in the summary. Never invent or assume details.
- Keep the carer's facts, names and times. Rewrite lightly for clarity, concise.
- If something fits more than one field, put it in the best fit and do not repeat it.
- If the summary has nothing for a field, write exactly: ${EMPTY_TEXT}
- Plain text only. No markdown, no bullet symbols.
- No text outside the JSON object.`;

async function readRaw(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

function extractSummary(raw) {
  try {
    const obj = JSON.parse(raw);
    if (obj && typeof obj.summary === "string") return obj.summary;
  } catch (e) {
    // fall through to tolerant parsing
  }
  const m = raw.match(/^\s*\{\s*"summary"\s*:\s*"([\s\S]*)"\s*\}\s*$/);
  if (!m) return "";
  return m[1]
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "")
    .replace(/\\t/g, "\t")
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, "\\");
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST only" });
  }

  let raw = "";
  try {
    raw = await readRaw(req);
  } catch (e) {
    raw = "";
  }

  let summary = extractSummary(raw).trim();

  if (!summary && !raw) {
    try {
      if (req.body && req.body.summary) summary = String(req.body.summary).trim();
    } catch (e) {
      // ignore
    }
  }

  if (!summary) {
    return res.status(400).json({ error: "summary is required or body was not readable", rawLength: raw.length });
  }

  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-5",
        max_tokens: 1500,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: summary }],
      }),
    });

    if (!r.ok) {
      const detail = await r.text();
      return res.status(502).json({ error: "Claude call failed", detail });
    }

    const data = await r.json();
    const text = (data.content || [])
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("")
      .replace(/```json|```/g, "")
      .trim();

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      return res.status(502).json({ error: "Could not parse model output", raw: text });
    }

    const out = {};
    for (const key of FIELDS) {
      const v = parsed[key];
      out[key] = typeof v === "string" && v.trim() ? v.trim() : EMPTY_TEXT;
    }

    return res.status(200).json(out);
  } catch (err) {
    return res.status(500).json({ error: "Server error", detail: String(err) });
  }
}
