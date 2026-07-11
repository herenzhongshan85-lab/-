const express = require('express');
const session = require('express-session');
const fs = require('fs');
const path = require('path');

const app = express();

const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

// 共有パスワード（本番では環境変数 APP_PASSWORD で必ず変更してください）
const APP_PASSWORD = process.env.APP_PASSWORD || 'shop2026';
const SESSION_SECRET = process.env.SESSION_SECRET || 'please-change-this-secret';

app.use(express.json({ limit: '2mb' }));
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 1000 * 60 * 60 * 24 * 30, // 30日間ログイン保持
    httpOnly: true
  }
}));

function ensureDb() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DB_FILE)) {
    const initial = {
      members: [],
      leaves: [],
      lunch: {},
      categories: ['社員', 'ホール', 'キッチン', 'お手伝い'],
      categoryColors: {},
      changeLog: [],
      closedDays: [],
      seeded: false
    };
    fs.writeFileSync(DB_FILE, JSON.stringify(initial, null, 2));
  }
}
ensureDb();

function requireAuth(req, res, next) {
  if (req.session && req.session.authed) return next();
  return res.status(401).json({ error: 'unauthorized' });
}

// ---- auth routes ----
app.post('/api/login', (req, res) => {
  const { password } = req.body || {};
  if (password === APP_PASSWORD) {
    req.session.authed = true;
    return res.json({ ok: true });
  }
  return res.status(401).json({ error: 'invalid password' });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get('/api/session', (req, res) => {
  res.json({ authed: !!(req.session && req.session.authed) });
});

// ---- data routes ----
app.get('/api/data', requireAuth, (req, res) => {
  try {
    const raw = fs.readFileSync(DB_FILE, 'utf8');
    res.json(JSON.parse(raw));
  } catch (e) {
    res.status(500).json({ error: 'failed to read data' });
  }
});

app.post('/api/data', requireAuth, (req, res) => {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(req.body, null, 2));
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'failed to save data' });
  }
});

// ---- static frontend ----
app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`店舗スケジュールボードが起動しました: http://localhost:${PORT}`);
});
