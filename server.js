#!/usr/bin/env node
const http = require('http');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const PORT = 8765;
const DATA_FILE = path.join(__dirname, 'scheduler-data.json');
const ROOT = __dirname;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
  '.woff2':'font/woff2',
  '.woff': 'font/woff',
};

function sendJSON(res, code, data) {
  res.writeHead(code, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => resolve(body));
    req.on('error', () => resolve(''));
  });
}

function execGit(args) {
  try {
    const stdout = execSync(`git ${args}`, { cwd: ROOT, encoding: 'utf-8', timeout: 30000 });
    return { ok: true, output: stdout.trim() };
  } catch (e) {
    return { ok: false, error: (e.stderr || e.stdout || e.message).trim() };
  }
}

function ensureDataFile() {
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify({ items: [], workLogs: [] }, null, 2), 'utf-8');
    console.log('  ✓ Created scheduler-data.json');
  }
}

async function handleRequest(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const method = req.method;

  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    res.end();
    return;
  }

  // ── API routes ──

  if (url.pathname === '/api/data' && method === 'GET') {
    ensureDataFile();
    try {
      const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
      return sendJSON(res, 200, data);
    } catch (e) {
      return sendJSON(res, 500, { ok: false, error: e.message });
    }
  }

  if (url.pathname === '/api/data' && method === 'POST') {
    const body = await readBody(req);
    try {
      fs.writeFileSync(DATA_FILE, body, 'utf-8');
      return sendJSON(res, 200, { ok: true });
    } catch (e) {
      return sendJSON(res, 500, { ok: false, error: e.message });
    }
  }

  if (url.pathname === '/api/sync-push' && method === 'POST') {
    // pull --rebase first (best-effort, may fail for new repos)
    execGit('pull --rebase origin main 2>&1');
    execGit('pull --rebase origin master 2>&1');
    execGit('add scheduler-data.json');
    const diff = execGit('diff --cached --quiet');
    if (diff.ok) {
      return sendJSON(res, 200, { ok: true, message: '✓ 没有变更需要同步' });
    }
    const ts = new Date().toISOString().replace('T', ' ').slice(0, 19);
    let r = execGit(`commit -m "sync data ${ts}"`);
    if (!r.ok) return sendJSON(res, 500, { ok: false, error: r.error });
    r = execGit('push');
    if (!r.ok) return sendJSON(res, 200, { ok: false, message: '⚠ 推送失败: ' + r.error });
    return sendJSON(res, 200, { ok: true, message: '✓ 同步推送成功' });
  }

  if (url.pathname === '/api/sync-pull' && method === 'POST') {
    let r = execGit('pull 2>&1');
    if (!r.ok) r = execGit('pull origin master 2>&1');
    if (!r.ok) return sendJSON(res, 200, { ok: false, message: '⚠ 拉取失败: ' + r.error });
    ensureDataFile();
    try {
      const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
      return sendJSON(res, 200, { ok: true, message: '✓ 同步拉取成功', data });
    } catch (e) {
      return sendJSON(res, 500, { ok: false, error: e.message });
    }
  }

  // ── Static files ──
  let filePath = path.join(ROOT, url.pathname === '/' ? 'index.html' : url.pathname);
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403); res.end('Forbidden'); return;
  }
  try {
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) filePath = path.join(filePath, 'index.html');
    const ext = path.extname(filePath);
    const content = fs.readFileSync(filePath);
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    res.end(content);
  } catch {
    const fallback = path.join(ROOT, 'index.html');
    if (fs.existsSync(fallback)) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(fs.readFileSync(fallback));
    } else {
      res.writeHead(404); res.end('Not found');
    }
  }
}

// ── Startup ──
ensureDataFile();

const gitCheck = execGit('status --porcelain');
if (!gitCheck.ok) {
  console.log('\n  ⚠ Git 仓库未初始化');
  console.log('  运行以下命令初始化:');
  console.log('    git init');
  console.log('    git add .');
  console.log('    git commit -m "init"');
  console.log('    git remote add origin <你的仓库地址>');
  console.log('    git push -u origin main\n');
}

const server = http.createServer(handleRequest);
server.listen(PORT, () => {
  console.log('');
  console.log('  ┌─────────────────────────────────────────────────────┐');
  console.log('  │  日程工作台 · Sync Server              │');
  console.log(`  │  http://localhost:${PORT}                      │`);
  console.log('  └─────────────────────────────────────────────────────┘');
  console.log('');
});
