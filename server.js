// 꼬마 초밥집 주문 서버 (간단 버전: 테이블 주문 → 주방·카운터에서 확인) (외부 패키지 없이 Node.js만으로 동작)
// 실행: npm start  →  같은 와이파이의 태블릿에서 화면에 표시되는 주소로 접속
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PORT = Number(process.env.PORT) || 3000;
const ROOT = __dirname;
const PUBLIC = path.join(ROOT, 'public');
const DATA_FILE = path.join(ROOT, 'data', 'orders.json');

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, ''));
}
const CONFIG = readJson(path.join(ROOT, 'menu.json'));
const MENU = new Map(CONFIG.menu.map(m => [m.id, m]));

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.m4a': 'audio/mp4'
};

// ---------- 데이터 ----------
function emptyState() { return { seq: 0, orders: [], soldOut: {} }; }
let state = emptyState();
try { state = Object.assign(emptyState(), readJson(DATA_FILE)); } catch (e) { /* 처음 실행 */ }

function save() {
  try {
    fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify(state));
  } catch (e) { console.error('저장 실패:', e.message); }
}

function imageFor(id) {
  for (const ext of ['jpg', 'jpeg', 'png', 'webp']) {
    const f = path.join(PUBLIC, 'images', `${id}.${ext}`);
    if (fs.existsSync(f)) return `/images/${id}.${ext}?v=${Math.floor(fs.statSync(f).mtimeMs)}`;
  }
  return null;
}

function soundFiles() {
  const out = {};
  try {
    for (const f of fs.readdirSync(path.join(PUBLIC, 'sounds'))) {
      const ext = path.extname(f).toLowerCase();
      if (!['.mp3', '.wav', '.ogg', '.m4a'].includes(ext)) continue;
      const name = path.basename(f, path.extname(f)).toLowerCase();
      out[name] = `/sounds/${encodeURIComponent(f)}?v=${Math.floor(fs.statSync(path.join(PUBLIC, 'sounds', f)).mtimeMs)}`;
    }
  } catch (e) { /* 폴더 없음 */ }
  return out;
}

function publicState() {
  return {
    shopName: CONFIG.shopName,
    tables: CONFIG.tables,
    menu: CONFIG.menu.map(m => ({ ...m, image: imageFor(m.id), soldOut: !!state.soldOut[m.id] })),
    orders: state.orders,
    sounds: soundFiles(),
    serverTime: Date.now()
  };
}

// ---------- 실시간 전송 (Server-Sent Events) ----------
const clients = new Set();
function broadcast(event, data) {
  const payload = `event: update\ndata: ${JSON.stringify({ event, data, state: publicState() })}\n\n`;
  for (const res of clients) res.write(payload);
}
setInterval(() => { for (const res of clients) res.write(': ping\n\n'); }, 20000);

// ---------- 도우미 ----------
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const findOrder = id => state.orders.find(o => o.id === id);

function send(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}
function readBody(req, limit = 1e5) {
  return new Promise(resolve => {
    let s = '';
    req.on('data', c => { s += c; if (s.length > limit) req.destroy(); });
    req.on('end', () => { try { resolve(JSON.parse(s || '{}')); } catch (e) { resolve({}); } });
  });
}

// ---------- API ----------
async function api(req, res, url) {
  const p = url.pathname;

  if (req.method === 'GET' && p === '/api/events') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store', Connection: 'keep-alive', 'X-Accel-Buffering': 'no'
    });
    res.write('retry: 1500\n\n');
    res.write(`event: update\ndata: ${JSON.stringify({ event: 'init', state: publicState() })}\n\n`);
    clients.add(res);
    req.on('close', () => clients.delete(res));
    return;
  }
  if (req.method === 'GET' && p === '/api/state') return send(res, 200, publicState());
  if (req.method !== 'POST') return send(res, 404, { error: '없는 주소예요' });

  const body = await readBody(req, p.startsWith('/api/editor/') ? 25e6 : 1e5);
  const now = Date.now();

  // ---------- 메뉴 사진 다듬기 (편집 화면) ----------
  // 저장: 완성 사진 → public/images/<id>.png, 칠한 영역 → public/editor/mask/<id>.png
  if (p === '/api/editor/save' || p === '/api/editor/remove') {
    const id = String(body.id || '');
    if (!MENU.has(id)) return send(res, 400, { error: '없는 메뉴예요' });
    const imgFile = path.join(PUBLIC, 'images', id + '.png');
    if (p === '/api/editor/remove') {
      for (const ext of ['png', 'jpg', 'jpeg', 'webp']) { try { fs.unlinkSync(path.join(PUBLIC, 'images', `${id}.${ext}`)); } catch (e) {} }
      broadcast('menu:image', { id });
      return send(res, 200, { ok: true });
    }
    const dec = d => { const m = /^data:image\/png;base64,(.+)$/.exec(String(d || '')); return m ? Buffer.from(m[1], 'base64') : null; };
    const img = dec(body.image), mask = dec(body.mask);
    if (!img) return send(res, 400, { error: '사진 데이터가 없어요' });
    fs.mkdirSync(path.join(PUBLIC, 'images'), { recursive: true });
    for (const ext of ['jpg', 'jpeg', 'webp']) { try { fs.unlinkSync(path.join(PUBLIC, 'images', `${id}.${ext}`)); } catch (e) {} }
    fs.writeFileSync(imgFile, img);
    if (mask) fs.writeFileSync(path.join(PUBLIC, 'editor', 'mask', id + '.png'), mask);
    broadcast('menu:image', { id });
    return send(res, 200, { ok: true, image: imageFor(id) });
  }

  // 새 주문 (테이블에서 [주문하기] → 바로 주방으로)
  if (p === '/api/orders') {
    const table = Number(body.table);
    if (!CONFIG.tables.includes(table)) return send(res, 400, { error: '테이블 번호가 올바르지 않아요' });
    const items = [];
    for (const it of Array.isArray(body.items) ? body.items : []) {
      const menu = MENU.get(it.id);
      const qty = Math.min(20, Math.max(0, Math.floor(Number(it.qty) || 0)));
      if (!menu || !qty) continue;
      if (state.soldOut[menu.id]) return send(res, 400, { error: `${menu.name}은(는) 품절이에요` });
      items.push({ id: menu.id, name: menu.name, price: menu.price, qty });
    }
    if (!items.length) return send(res, 400, { error: '메뉴를 골라 주세요' });
    const order = {
      id: uid(), no: ++state.seq, table, items,
      total: items.reduce((s, i) => s + i.price * i.qty, 0),
      status: 'ordered', createdAt: now
    };
    state.orders.push(order);
    save();
    broadcast('order:new', order);
    return send(res, 200, order);
  }

  // 다 먹었어요 (테이블 비우기)
  const done = p.match(/^\/api\/tables\/(\d+)\/done$/);
  if (done) {
    const table = Number(done[1]);
    if (!CONFIG.tables.includes(table)) return send(res, 400, { error: '테이블 번호가 올바르지 않아요' });
    let count = 0;
    state.orders.forEach(o => { if (o.table === table && !o.closed) { o.closed = true; o.closedAt = now; count++; } });
    save(); broadcast('table:done', { table, count });
    return send(res, 200, { ok: true, count });
  }

  // 내 주문 취소 (테이블에서 꾹 눌러 취소)
  const cancel = p.match(/^\/api\/orders\/([\w]+)\/cancel$/);
  if (cancel) {
    const o = state.orders.find(x => x.id === cancel[1]);
    if (!o || o.closed) return send(res, 404, { error: '주문을 찾을 수 없어요' });
    if (body.table != null && Number(body.table) !== o.table) return send(res, 403, { error: '다른 테이블의 주문이에요' });
    if (o.status === 'cancelled') return send(res, 409, { error: '이미 취소된 주문이에요' });
    o.status = 'cancelled'; o.cancelledAt = now;
    save(); broadcast('order:cancel', o);
    return send(res, 200, o);
  }

  // 주문 내역 초기화 (품절 설정은 그대로 두기)
  if (p === '/api/reset') {
    state.orders = []; state.seq = 0;
    save(); broadcast('reset', null);
    return send(res, 200, { ok: true });
  }

  // 품절 설정
  if (p === '/api/soldout') {
    if (!MENU.has(body.id)) return send(res, 400, { error: '없는 메뉴예요' });
    state.soldOut[body.id] = !!body.soldOut;
    save(); broadcast('menu:soldout', { id: body.id, soldOut: !!body.soldOut });
    return send(res, 200, { ok: true });
  }

  return send(res, 404, { error: '없는 주소예요' });
}

// ---------- 정적 파일 ----------
const ROUTES = { '/': 'index.html', '/main': 'main.html', '/editor': 'editor.html' };
function serveStatic(req, res, url) {
  if (url.pathname === '/favicon.ico') { res.writeHead(204); return res.end(); }
  let p = decodeURIComponent(url.pathname);
  if (ROUTES[p]) p = '/' + ROUTES[p];
  else if (/^\/table\/\d+\/?$/.test(p)) p = '/table.html';
  const file = path.normalize(path.join(PUBLIC, p));
  if (!file.startsWith(PUBLIC)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('페이지를 찾을 수 없어요'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(buf);
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname.startsWith('/api/')) {
    api(req, res, url).catch(e => { console.error(e); send(res, 500, { error: '서버 오류' }); });
  } else serveStatic(req, res, url);
});

server.listen(PORT, '0.0.0.0', () => {
  const ips = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const n of list || []) if (n.family === 'IPv4' && !n.internal) ips.push(n.address);
  }
  const base = ips.length ? `http://${ips[0]}:${PORT}` : `http://localhost:${PORT}`;
  console.log('\n🍣  꼬마 초밥집 주문 서버가 켜졌어요!\n');
  console.log('  태블릿(같은 와이파이)에서 아래 주소로 접속하세요');
  console.log('  ─────────────────────────────────────────');
  console.log(`  처음 화면(기기 고르기)  ${base}/`);
  for (const t of CONFIG.tables) console.log(`  테이블 ${t}                ${base}/table/${t}`);
  console.log(`  주방 · 카운터           ${base}/main`);
  console.log(`  메뉴 사진 다듬기(PC)    http://localhost:${PORT}/editor`);
  console.log('  ─────────────────────────────────────────');
  if (ips.length > 1) console.log(`  (다른 주소 후보: ${ips.slice(1).join(', ')})`);
  console.log('  끄려면 이 창에서 Ctrl + C\n');
});
