const BUBBLE_BASE_URL = process.env.BUBBLE_BASE_URL; // e.g. https://knightingale.com.au
const BUBBLE_API_TOKEN = process.env.BUBBLE_API_TOKEN;

// Fetches a participant's most recent prior progress notes, newest first.
// Used for the copy-paste comparison check. Returns [] on any failure rather
// than throwing — this is a nice-to-have check, not something that should
// block a carer's submission if Bubble/the token is briefly unavailable.
async function fetchRecentNotesForParticipant(participantId, limit = 10) {
  if (!participantId || !BUBBLE_BASE_URL || !BUBBLE_API_TOKEN) {
    return [];
  }

  try {
    const constraints = [{ key: 'participant', constraint_type: 'equals', value: participantId }];

    const params = new URLSearchParams();
    params.set('api_token', BUBBLE_API_TOKEN);
    params.set('constraints', JSON.stringify(constraints));
    params.set('sort_field', 'Created Date');
    params.set('descending', 'true');
    params.set('limit', String(limit));

    const url = `${BUBBLE_BASE_URL}/api/1.1/obj/Progress%20Note?${params.toString()}`;
    const res = await fetch(url);

    if (!res.ok) {
      console.error(`fetchRecentNotesForParticipant: Bubble API error (${res.status})`);
      return [];
    }

    const json = await res.json();
    const results = json.response?.results || [];

    return results
      .filter((note) => note.summary && note.summary.trim())
      .map((note) => ({
        date: note.date || note['Created Date'] || null,
        text: note.summary
      }));
  } catch (err) {
    console.error('fetchRecentNotesForParticipant error:', err.message);
    return [];
  }
}

module.exports = { fetchRecentNotesForParticipant };
