// ─────────────────────────────────────────────────────────────────────────────
// server.js — Backend minimal pour landing form + agent vocal
// npm install express cors
// node server.js
// ─────────────────────────────────────────────────────────────────────────────

const express = require('express');
const cors    = require('cors');
const crypto  = require('crypto');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const sessions = new Map();

const AGENT_WEBHOOK_URL = process.env.AGENT_WEBHOOK_URL || null;

app.post('/api/sessions', (req, res) => {
  const sessionId = 'sess_' + crypto.randomBytes(6).toString('hex').toUpperCase();
  const baseUrl   = process.env.BASE_URL || `http://localhost:${PORT}`;

  sessions.set(sessionId, {
    id:        sessionId,
    status:    'pending',
    data:      null,
    createdAt: new Date().toISOString(),
    filledAt:  null
  });

  console.log(`[SESSION] Créée : ${sessionId}`);

  res.json({
    session_id: sessionId,
    link:       `${baseUrl}/?session=${sessionId}`,
    status:     'pending'
  });
});

app.post('/api/submit', async (req, res) => {
  const { session_id, data } = req.body;

  if (!session_id || !sessions.has(session_id)) {
    return res.status(404).json({ error: 'Session introuvable ou expirée' });
  }

  const session = sessions.get(session_id);

  if (session.status === 'filled') {
    return res.status(409).json({ error: 'Formulaire déjà soumis pour cette session' });
  }

  session.status   = 'filled';
  session.data     = data;
  session.filledAt = new Date().toISOString();
  sessions.set(session_id, session);

  console.log(`[SUBMIT] Session ${session_id} remplie :`, data);

  const payload = {
    event:      'form_submitted',
    session_id: session_id,
    timestamp:  session.filledAt,
    data:       data
  };

  if (AGENT_WEBHOOK_URL) {
    try {
      const response = await fetch(AGENT_WEBHOOK_URL, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload)
      });
      console.log(`[WEBHOOK] Agent notifié → ${response.status}`);
    } catch (err) {
      console.error(`[WEBHOOK] Erreur envoi agent :`, err.message);
    }
  }

  res.json({ success: true, session_id, payload });
});

app.get('/api/sessions/:session_id', (req, res) => {
  const { session_id } = req.params;

  if (!sessions.has(session_id)) {
    return res.status(404).json({ error: 'Session introuvable' });
  }

  const session = sessions.get(session_id);
  res.json(session);
});

app.get('/api/sessions', (req, res) => {
  const all = Array.from(sessions.values())
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json({ count: all.length, sessions: all });
});

setInterval(() => {
  const now  = Date.now();
  const TTL  = 60 * 60 * 1000;
  let cleaned = 0;
  for (const [id, session] of sessions.entries()) {
    if (now - new Date(session.createdAt).getTime() > TTL) {
      sessions.delete(id);
      cleaned++;
    }
  }
  if (cleaned > 0) console.log(`[CLEANUP] ${cleaned} session(s) expirée(s) supprimée(s)`);
}, 5 * 60 * 1000);

app.listen(PORT, () => {
  console.log(`\n🚀 Serveur lancé sur http://localhost:${PORT}`);
  console.log(`   Agent webhook URL : ${AGENT_WEBHOOK_URL || '⚠️  Non configurée'}`);
});
