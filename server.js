const express = require('express');
const session = require('express-session');
const fs = require('fs');
const path = require('path');

const app = express();

// 共有パスワード（本番では環境変数 APP_PASSWORD で必ず変更してください）
const APP_PASSWORD = process.env.APP_PASSWORD || 'shop2026';
const SESSION_SECRET = process.env.SESSION_SECRET || 'please-change-this-secret';

// ---- データ保存先の切り替え ----
// UPSTASH_REDIS_REST_URL と UPSTASH_REDIS_REST_TOKEN が設定されていれば
// Upstash（無料のクラウドデータベース）に保存する。
// 未設定の場合は、これまで通りローカルの data/db.json に保存する（自分のPCで試す用）。
const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const USE_UPSTASH = !!(UPSTASH_URL && UPSTASH_TOKEN);
const DATA_KEY = 'shop-schedule-data';

const DEFAULT_DATA = {
  members: [],
  leaves: [],
  lunch: {},
  categories: ['社員', 'ホール', 'キッチン', 'お手伝い'],
  categoryColors: {},
  changeLog: [],
  closedDays: [],
  seeded: false
};

// --- ローカルファイル保存（Upstash未設定時のフォールバック） ---
const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
function ensureLocalDb() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify(DEFAULT_DATA, null, 2));
  }
}
if (!USE_UPSTASH) ensureLocalDb();

async function readData() {
  if (USE_UPSTASH) {
    const res = await fetch(`${UPSTASH_URL}/get/${DATA_KEY}`, {
      headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` }
    });
    const json = await res.json();
    if (!json.result) return DEFAULT_DATA;
    return JSON.parse(json.result);
  } else {
    const raw = fs.readFileSync(DB_FILE, 'utf8');
    return JSON.parse(raw);
  }
}

async function writeData(data) {
  if (USE_UPSTASH) {
    await fetch(`${UPSTASH_URL}/set/${DATA_KEY}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${UPSTASH_TOKEN}`,
        'Content-Type': 'text/plain'
      },
      body: JSON.stringify(data)
    });
  } else {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
  }
}

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
app.get('/api/data', requireAuth, async (req, res) => {
  try {
    const data = await readData();
    res.json(data);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'failed to read data' });
  }
});

app.post('/api/data', requireAuth, async (req, res) => {
  try {
    await writeData(req.body);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'failed to save data' });
  }
});

// ---- static frontend ----
app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`店舗スケジュールボードが起動しました: http://localhost:${PORT}`);
  console.log(`データ保存先: ${USE_UPSTASH ? 'Upstash（クラウド）' : 'ローカルファイル（data/db.json）'}`);
});
