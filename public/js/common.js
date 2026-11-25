// 모든 화면에서 같이 쓰는 기능
window.App = (function () {
  const App = { state: null, offset: 0 };

  const pad = n => String(n).padStart(2, '0');
  App.$ = (s, el = document) => el.querySelector(s);
  App.$$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  App.won = n => (Number(n) || 0).toLocaleString('ko-KR') + '원';
  App.tableName = t => '테이블 ' + t;
  App.orderNo = no => '#' + String(no).padStart(3, '0');
  App.now = () => Date.now() + App.offset;
  App.timeStr = ts => { const d = new Date(ts); return pad(d.getHours()) + ':' + pad(d.getMinutes()); };
  App.ago = ts => { const m = Math.floor((App.now() - ts) / 60000); return m < 1 ? '방금' : m + '분 전'; };
  App.esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  App.STATUS = {
    awaiting_payment: { label: '결제 대기', color: 'yellow' },
    paid: { label: '신규 주문', color: 'primary' },
    cooking: { label: '조리 중', color: 'blue' },
    ready: { label: '조리 완료', color: 'mint' },
    served: { label: '서빙 완료', color: 'grey' },
    cancelled: { label: '취소됨', color: 'red' }
  };
  App.METHOD = { nfc: 'NFC 카드', card: '카운터 카드', cash: '현금' };
  App.itemsText = items => items.map(i => `${i.name} ${i.qty}개`).join(', ');

  App.menuById = id => (App.state && App.state.menu.find(m => m.id === id)) || null;
  App.visual = item => item && item.image
    ? `<img class="food-img" src="${item.image}" alt="${App.esc(item.name)}" draggable="false">`
    : window.SushiArt.svg(item ? item.id : '');

  // 서버로 보내기
  App.post = async function (url, body) {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || '요청에 실패했어요');
    return j;
  };

  // 실시간 연결
  App.connect = function (onUpdate) {
    const banner = document.createElement('div');
    banner.className = 'offline';
    banner.textContent = '⚠️ 서버와 연결이 끊겼어요. 다시 연결 중…';
    document.body.appendChild(banner);
    let failTimer = null;
    const es = new EventSource('/api/events');
    es.addEventListener('update', e => {
      const msg = JSON.parse(e.data);
      App.state = msg.state;
      App.offset = msg.state.serverTime - Date.now();
      App.loadSounds();
      clearTimeout(failTimer); banner.classList.remove('show');
      try { onUpdate(msg); } catch (err) { console.error(err); }
    });
    es.onopen = () => { clearTimeout(failTimer); banner.classList.remove('show'); };
    es.onerror = () => { clearTimeout(failTimer); failTimer = setTimeout(() => banner.classList.add('show'), 1500); };
  };

  // 토스트
  let toastWrap;
  App.toast = function (msg, ms = 2200) {
    if (!toastWrap) { toastWrap = document.createElement('div'); toastWrap.className = 'toast-wrap'; document.body.appendChild(toastWrap); }
    const t = document.createElement('div');
    t.className = 'toast'; t.innerHTML = msg;
    toastWrap.appendChild(t);
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 320); }, ms);
  };

  // 확인 대화상자
  App.confirm = function (title, desc, okText = '확인', danger = false) {
    return new Promise(resolve => {
      const dim = document.createElement('div'); dim.className = 'dim dialog-dim';
      const wrap = document.createElement('div'); wrap.className = 'dialog-wrap';
      wrap.innerHTML = `<div class="dialog"><h3>${title}</h3><p>${desc}</p><div class="row">
        <button class="btn secondary" data-v="0">닫기</button><button class="btn ${danger ? 'dark' : ''}" data-v="1">${okText}</button></div></div>`;
      document.body.append(dim, wrap);
      requestAnimationFrame(() => { dim.classList.add('show'); wrap.firstChild.classList.add('show'); });
      const close = v => {
        dim.classList.remove('show'); wrap.firstChild.classList.remove('show');
        setTimeout(() => { dim.remove(); wrap.remove(); }, 350);
        resolve(v);
      };
      dim.onclick = () => close(false);
      wrap.querySelectorAll('button').forEach(b => b.onclick = () => close(b.dataset.v === '1'));
    });
  };

  // 바텀시트 열고 닫기
  App.openSheet = function (sheet, dim) {
    dim.classList.add('show'); sheet.classList.add('show');
    dim.onclick = () => App.closeSheet(sheet, dim);
  };
  App.closeSheet = function (sheet, dim) { dim.classList.remove('show'); sheet.classList.remove('show'); };

  // 숫자 굴러가는 효과
  App.countTo = function (el, to, dur = 650) {
    const from = Number(el.dataset.val || 0);
    el.dataset.val = to;
    if (from === to) { el.textContent = App.won(to); return; }
    const start = performance.now();
    cancelAnimationFrame(el._raf);
    const step = t => {
      const p = Math.min(1, (t - start) / dur), e = 1 - Math.pow(1 - p, 3);
      el.textContent = App.won(Math.round(from + (to - from) * e));
      if (p < 1) el._raf = requestAnimationFrame(step);
    };
    el._raf = requestAnimationFrame(step);
  };

  // 진동
  App.vibrate = p => { try { navigator.vibrate && navigator.vibrate(p); } catch (e) {} };

  // ---------- 효과음 ----------
  // public/sounds 폴더에 아래 이름의 파일(mp3/wav/ogg/m4a)이 있으면 그 파일을 틀고,
  // 없으면 아래에서 직접 만든 기본 소리를 냅니다.
  //   tap 버튼 · add 메뉴 담기 · remove 빼기 · order 주문하기 · success 결제 완료
  //   beep 카드 인식/결제 대기 · kitchen 주방 새 주문 알람 · ready 초밥 완성(테이블)
  //   call 직원 호출 · error 오류
  let ctx;
  function audio() {
    if (!ctx) { const A = window.AudioContext || window.webkitAudioContext; if (!A) return null; ctx = new A(); }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }
  function tone(freq, start, dur, type = 'sine', vol = .25, toFreq) {
    const c = audio(); if (!c) return;
    const o = c.createOscillator(), g = c.createGain();
    const t = c.currentTime + start;
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (toFreq) o.frequency.exponentialRampToValueAtTime(toFreq, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + .008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(c.destination);
    o.start(t); o.stop(t + dur + .05);
  }
  // 종소리 (배음을 섞어서 진짜 벨처럼)
  function bell(freq, start, vol = .3, dur = 1.2) {
    [[1, 1], [2.76, .35], [5.4, .15], [8.9, .06]].forEach(([m, v]) => tone(freq * m, start, dur / m * 1.5 > dur ? dur : dur / Math.sqrt(m), 'sine', vol * v));
  }

  // 소리 파일은 미리 받아서 메모리에 올려 두고(지연 없이) 재생
  const files = {};      // url → { buf: AudioBuffer, el: Audio }
  function decode(url) {
    const c = audio(); const f = files[url];
    if (!c || !f || f.buf || f.loading || !f.data) return;
    f.loading = true;
    c.decodeAudioData(f.data.slice(0), buf => { f.buf = buf; }, () => { f.loading = false; });
  }
  App.loadSounds = function () {
    const list = Object.values((App.state && App.state.sounds) || {});
    ((App.state && App.state.menu) || []).forEach(m => { if (m.voice) list.push(m.voice); });   // 메뉴 목소리도 미리 받기
    list.forEach(url => {
      if (files[url]) return;
      const f = files[url] = { el: new Audio(url) };
      f.el.preload = 'auto';
      fetch(url).then(r => r.arrayBuffer()).then(d => { f.data = d; if (ctx) decode(url); }).catch(() => {});
    });
  };
  function playFile(name) {
    const url = App.state && App.state.sounds && App.state.sounds[name];
    if (!url) return false;
    const c = audio(), f = files[url];
    if (c && f && f.buf) {
      const src = c.createBufferSource(); src.buffer = f.buf; src.connect(c.destination); src.start();
    } else {
      if (f) decode(url);
      const el = (f && f.el ? f.el : new Audio(url)).cloneNode();
      el.play().catch(() => {});
    }
    return true;
  }
  // ---------- 메뉴 목소리 (아이들 녹음) ----------
  // 규칙
  //  1) 목소리는 한 번에 하나만 나와요 (겹치지 않음)
  //  2) 같은 메뉴를 다시 누르면: 지금 나오는 목소리를 끝까지 듣고, 새로 시작하지 않아요
  //     → "가가가가지초밥"처럼 앞부분만 반복되는 일이 없어요 (담기는 누를 때마다 그대로 돼요)
  //  3) 다른 메뉴를 누르면: 지금 목소리를 0.08초 동안 부드럽게 줄이고 새 메뉴 목소리를 처음부터
  //  4) 메뉴를 0.35초 안에 연달아 누르면: 손이 멈출 때(0.25초)까지 기다렸다가 마지막 메뉴 목소리만 나와요
  //  5) 같은 메뉴라도 목소리가 끝난 뒤 0.4초가 지나면 다시 들려줘요
  const voice = { id: null, url: null, stop: null, until: 0, lastStart: 0, lastTap: 0, pending: null, pendingId: null };
  const VOICE_BURST = 350, VOICE_SETTLE = 250, VOICE_REPEAT_GAP = 400, VOICE_FADE = 0.08;
  function voiceStop(fade = true) {
    if (voice.stop) { try { voice.stop(fade); } catch (e) {} }
    voice.stop = null;
  }
  function voiceStart(id, url) {
    voiceStop(true);
    const c = audio(), f = files[url];
    voice.id = id; voice.url = url; voice.lastStart = Date.now();
    if (c && f && f.buf) {
      const src = c.createBufferSource(), g = c.createGain();
      src.buffer = f.buf; src.connect(g); g.connect(c.destination); src.start();
      voice.until = Date.now() + f.buf.duration * 1000;
      const me = src;
      src.onended = () => { if (voice.stop && voice.stop.src === me) { voice.stop = null; voice.until = Date.now(); } };
      voice.stop = fade => {
        const t = c.currentTime;
        if (fade) { g.gain.setValueAtTime(g.gain.value, t); g.gain.linearRampToValueAtTime(0, t + VOICE_FADE); src.stop(t + VOICE_FADE + 0.01); }
        else src.stop();
      };
      voice.stop.src = me;
    } else {
      if (f) decode(url);
      const el = (f && f.el ? f.el : new Audio(url)).cloneNode();
      el.play().catch(() => {});
      voice.until = Date.now() + 2500;                     // 길이를 아직 모를 때 잠시 막아 두기
      el.onloadedmetadata = () => { voice.until = voice.lastStart + el.duration * 1000; };
      el.onended = () => { voice.stop = null; voice.until = Date.now(); };
      voice.stop = () => { el.pause(); };
    }
  }
  App.voice = {
    play(id) {
      const m = App.menuById(id);
      if (!m || !m.voice) return false;
      const now = Date.now(), burst = now - voice.lastTap < VOICE_BURST;
      voice.lastTap = now;
      const playing = !!voice.stop && now < voice.until;
      // 규칙 2·5: 같은 메뉴 → 재생 중이거나 끝난 지 얼마 안 됐으면 처음부터 다시 틀지 않음
      if (voice.id === id && !voice.pendingId && (playing || now < voice.until + VOICE_REPEAT_GAP)) return 'same';
      clearTimeout(voice.pending);
      // 규칙 4: 연달아 누르는 중이면 손이 멈출 때까지 기다렸다가 마지막 메뉴만
      if (burst && (playing || voice.pendingId)) {
        voice.pendingId = id;
        voice.pending = setTimeout(() => { voice.pendingId = null; if (voice.id !== id || Date.now() > voice.until) voiceStart(id, m.voice); }, VOICE_SETTLE);
        return 'queued';
      }
      voice.pendingId = null;
      voiceStart(id, m.voice);                              // 규칙 1·3
      return 'play';
    },
    stop() { clearTimeout(voice.pending); voice.pendingId = null; voiceStop(true); voice.id = null; voice.until = 0; }
  };

  // 소리가 켜지는 순간 받아 둔 파일을 모두 준비
  App.prepareSounds = () => Object.keys(files).forEach(decode);
  function make(name, synth) { return () => { if (!playFile(name)) synth(); }; }

  App.sound = {
    unlock: audio,
    tap: make('tap', () => tone(1400, 0, .045, 'sine', .09, 700)),
    add: make('add', () => { tone(520, 0, .09, 'sine', .2, 900); tone(1040, .07, .12, 'sine', .12, 1300); }),
    remove: make('remove', () => tone(700, 0, .1, 'sine', .14, 380)),
    order: make('order', () => [784, 988, 1175, 1568].forEach((f, i) => tone(f, i * .07, .22, 'triangle', .16))),
    success: make('success', () => { [1047, 1319, 1568].forEach((f, i) => tone(f, i * .1, .35, 'triangle', .18)); bell(2093, .32, .2, 1.2); }),
    beep: make('beep', () => { tone(1975, 0, .08, 'square', .06); tone(1975, .11, .08, 'square', .06); }),
    kitchen: make('kitchen', () => { bell(1319, 0, .34); bell(1047, .42, .34); bell(1319, 1.15, .34); bell(1047, 1.57, .34, 1.6); }),
    ready: make('ready', () => { bell(1568, 0, .28); bell(1319, .3, .28); bell(1047, .6, .28, 1.5); }),
    call: make('call', () => { for (let i = 0; i < 3; i++) bell(2093, i * .18, .22, .5); }),
    error: make('error', () => { tone(330, 0, .16, 'triangle', .14); tone(247, .15, .26, 'triangle', .14); })
  };
  App.sound.dingdong = App.sound.kitchen;

  // 버튼을 누르면 '톡' 소리 (메뉴 담기·개수 버튼처럼 자기 소리가 있는 곳은 빼기)
  document.addEventListener('pointerdown', e => {
    audio(); App.prepareSounds();
    const el = e.target.closest('button, a.dev');
    if (!el || el.disabled) return;
    if (el.closest('.menu-card, .pos-item, #reader, .stepper, [data-nosound]')) return;
    App.sound.tap();
  });

  // 날아가는 효과 (담기 → 장바구니)
  App.fly = function (fromEl, toRect, onEnd) {
    const a = fromEl.getBoundingClientRect();
    const c = fromEl.cloneNode(true);
    Object.assign(c.style, { position: 'fixed', left: a.left + 'px', top: a.top + 'px', width: a.width + 'px', height: a.height + 'px', zIndex: 800, pointerEvents: 'none', margin: 0, borderRadius: '20px', overflow: 'hidden' });
    document.body.appendChild(c);
    const dx = toRect.x - (a.left + a.width / 2), dy = toRect.y - (a.top + a.height / 2);
    const anim = c.animate([
      { transform: 'translate(0,0) scale(1)', opacity: 1 },
      { transform: `translate(${dx * .45}px, ${dy * .45 - 90}px) scale(.55)`, opacity: 1, offset: .45 },
      { transform: `translate(${dx}px, ${dy}px) scale(.12)`, opacity: .4 }
    ], { duration: 620, easing: 'cubic-bezier(.45,0,.6,1)' });
    anim.onfinish = () => { c.remove(); onEnd && onEnd(); };
  };

  App.bump = el => el && el.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.06)' }, { transform: 'scale(1)' }], { duration: 320, easing: 'ease-out' });

  // ---------- 전체화면 ----------
  const docEl = document.documentElement;
  App.fs = {
    supported: () => !!(docEl.requestFullscreen || docEl.webkitRequestFullscreen),
    active: () => !!(document.fullscreenElement || document.webkitFullscreenElement),
    enter() {
      if (this.active() || !this.supported()) return;
      try { const r = (docEl.requestFullscreen || docEl.webkitRequestFullscreen).call(docEl); if (r && r.catch) r.catch(() => {}); } catch (e) {}
    },
    exit() {
      if (!this.active()) return;
      try { const r = (document.exitFullscreen || document.webkitExitFullscreen).call(document); if (r && r.catch) r.catch(() => {}); } catch (e) {}
    },
    toggle() { this.active() ? this.exit() : this.enter(); }
  };
  const ICON_EXPAND = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>';
  const ICON_SHRINK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/></svg>';
  // 전체화면 버튼 만들기: App.mountFullscreen(넣을 곳, '추가 클래스')
  App.mountFullscreen = function (target, extra = '') {
    if (!App.fs.supported() || !target) return null;
    const b = document.createElement('button');
    b.className = 'fs-btn ' + extra;
    const paint = () => {
      const on = App.fs.active();
      b.innerHTML = (on ? ICON_SHRINK : ICON_EXPAND) + `<span>${on ? '전체화면 끄기' : '전체화면'}</span>`;
      b.setAttribute('aria-label', on ? '전체화면 끄기' : '전체화면');
      b.classList.toggle('on', on);
    };
    b.onclick = () => App.fs.toggle();
    document.addEventListener('fullscreenchange', paint);
    document.addEventListener('webkitfullscreenchange', paint);
    paint();
    target.appendChild(b);
    return b;
  };

  App.checkSvg = () => `<svg class="check-circle" viewBox="0 0 120 120"><circle cx="60" cy="60" r="56"/><path d="M36 62 L53 78 L85 44"/></svg>`;

  return App;
})();
