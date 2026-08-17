require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 4173;
const DATA_DIR = path.join(__dirname, 'data');
const STORE_FILE = path.join(DATA_DIR, 'store.json');
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
const MODEL = 'claude-sonnet-5';

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
let store = {};
if (fs.existsSync(STORE_FILE)) {
  try { store = JSON.parse(fs.readFileSync(STORE_FILE, 'utf8')); }
  catch (e) { console.error('Could not parse store.json, starting fresh:', e.message); }
}

let writeQueued = false;
function persist() {
  if (writeQueued) return;
  writeQueued = true;
  setTimeout(() => {
    writeQueued = false;
    fs.writeFile(STORE_FILE, JSON.stringify(store, null, 2), (err) => {
      if (err) console.error('Failed to write store.json:', err.message);
    });
  }, 200);
}

const app = express();
app.use(express.json({ limit: '2mb' }));
app.use(express.static(__dirname, { index: 'index.html' }));

// ---- generic key/value storage (replaces the old window.storage shim) ----
app.get('/api/storage/:key', (req, res) => {
  const key = decodeURIComponent(req.params.key);
  if (!(key in store)) return res.status(404).json({ error: 'not found' });
  res.json({ value: store[key] });
});

app.post('/api/storage/:key', (req, res) => {
  const key = decodeURIComponent(req.params.key);
  store[key] = req.body.value;
  persist();
  res.json({ ok: true });
});

app.get('/api/storage', (req, res) => {
  res.json(store);
});

// ---- AI feedback on a draft ----
app.post('/api/feedback', async (req, res) => {
  if (!ANTHROPIC_API_KEY) {
    return res.status(503).json({ error: 'no-api-key', message: 'Set ANTHROPIC_API_KEY in .env and restart the server to enable AI feedback.' });
  }
  const { schoolName, essayTitle, prompt, limit, draftText } = req.body;
  if (!draftText || draftText.trim().split(/\s+/).length < 20) {
    return res.status(400).json({ error: 'too-short', message: 'Write at least ~20 words before requesting feedback.' });
  }

  const system = `You are a sharp, encouraging MBA admissions essay coach. You score a single draft against its prompt and give specific, actionable feedback. You are honest about weaknesses but never discouraging. Respond with ONLY valid JSON, no markdown fences, matching exactly this shape:
{"scores":{"clarity":0-100,"structure":0-100,"specificity":0-100,"soWhat":0-100,"wordLimitFit":0-100},"overall":0-100,"suggestions":["...","...","..."],"note":"one short encouraging sentence"}
"soWhat" measures whether the essay makes clear why this matters to the reader/admissions committee, not just what happened. "wordLimitFit" measures how well the draft respects the stated word/character limit (100 = well within limit with room, lower if far under or over). Give exactly 3 suggestions, each one specific and actionable (reference actual content from the draft, not generic advice).`;

  const userMsg = `School: ${schoolName}\nEssay: ${essayTitle}\nPrompt: ${prompt}\nLimit: ${limit}\n\nDraft:\n${draftText}`;

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1024,
        system,
        messages: [{ role: 'user', content: userMsg }],
      }),
    });
    if (!r.ok) {
      const errText = await r.text();
      console.error('Anthropic API error:', r.status, errText);
      return res.status(502).json({ error: 'upstream', message: `Anthropic API returned ${r.status}` });
    }
    const data = await r.json();
    const raw = (data.content || []).map(b => b.text || '').join('');
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      const match = raw.match(/\{[\s\S]*\}/);
      if (!match) throw new Error('could not parse model output');
      parsed = JSON.parse(match[0]);
    }
    res.json(parsed);
  } catch (e) {
    console.error('Feedback request failed:', e.message);
    res.status(500).json({ error: 'server-error', message: e.message });
  }
});

app.listen(PORT, () => {
  console.log(`MBA Dossier running at http://localhost:${PORT}`);
  console.log(ANTHROPIC_API_KEY ? 'AI feedback: enabled' : 'AI feedback: disabled (no ANTHROPIC_API_KEY in .env)');
});
