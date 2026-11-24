// 메뉴 사진 다듬기: 붓으로 남길 영역을 칠하고, 저장하면 앱 메뉴 사진으로 바로 적용
(function () {
  const { $, $$, esc } = App;
  const view = $('#view'), vctx = view.getContext('2d');
  const wrap = $('#wrap');
  const pv = $('#pv'), pctx = pv.getContext('2d');
  App.mountFullscreen($('#fsSlot'), 'flat');

  let menu = [];                 // 서버의 메뉴 목록
  let cur = null;                // 지금 다듬는 메뉴 id
  let src = null;                // 색 보정된 원본 사진
  let W = 0, H = 0;
  const mask = document.createElement('canvas'), mctx = mask.getContext('2d');   // 흰색=남길 곳
  const tint = document.createElement('canvas'), tctx = tint.getContext('2d');   // 분홍=지워질 곳
  let tool = 'add', size = 60, showTint = true, dirty = false;
  let scale = 1, tx = 0, ty = 0;
  const undoStack = [], redoStack = [];

  // ---------- 화면 크기 / 그리기 ----------
  function fitCanvas() {
    const r = wrap.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    view.width = Math.round(r.width * dpr); view.height = Math.round(r.height * dpr);
    render();
  }
  function zoomFit() {
    if (!W) return;
    const r = wrap.getBoundingClientRect();
    scale = Math.min(r.width / W, r.height / H) * 0.94;
    tx = (r.width - W * scale) / 2; ty = (r.height - H * scale) / 2;
    render();
  }
  let pointer = null;   // 붓 동그라미 위치 (화면 좌표)
  function render() {
    const dpr = window.devicePixelRatio || 1;
    vctx.setTransform(1, 0, 0, 1, 0, 0);
    vctx.clearRect(0, 0, view.width, view.height);
    if (!src) return;
    vctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * tx, dpr * ty);
    vctx.imageSmoothingQuality = 'high';
    vctx.drawImage(src, 0, 0);
    if (showTint) vctx.drawImage(tint, 0, 0);
    vctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (pointer && tool !== 'pan' && !spaceDown) {
      const r = size * scale / 2;
      vctx.lineWidth = 2;
      vctx.strokeStyle = 'rgba(0,0,0,.55)'; vctx.beginPath(); vctx.arc(pointer.x, pointer.y, r + 1, 0, Math.PI * 2); vctx.stroke();
      vctx.strokeStyle = tool === 'add' ? '#13B886' : '#F04452'; vctx.beginPath(); vctx.arc(pointer.x, pointer.y, r, 0, Math.PI * 2); vctx.stroke();
    }
  }
  // 분홍 덮개 다시 만들기 (변경된 부분만)
  function updateTint(x = 0, y = 0, w = W, h = H) {
    x = Math.max(0, Math.floor(x)); y = Math.max(0, Math.floor(y));
    w = Math.min(W - x, Math.ceil(w)); h = Math.min(H - y, Math.ceil(h));
    if (w <= 0 || h <= 0) return;
    tctx.save();
    tctx.globalCompositeOperation = 'source-over';
    tctx.clearRect(x, y, w, h);
    tctx.fillStyle = 'rgba(255, 40, 170, 0.55)';
    tctx.fillRect(x, y, w, h);
    tctx.globalCompositeOperation = 'destination-out';
    tctx.drawImage(mask, x, y, w, h, x, y, w, h);
    tctx.restore();
  }

  // ---------- 되돌리기 ----------
  function snapshot() {
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    c.getContext('2d').drawImage(mask, 0, 0);
    return c;
  }
  function pushUndo() {
    undoStack.push(snapshot()); if (undoStack.length > 12) undoStack.shift();
    redoStack.length = 0; updateButtons();
  }
  function restore(c) {
    mctx.globalCompositeOperation = 'source-over';
    mctx.clearRect(0, 0, W, H); mctx.drawImage(c, 0, 0);
    updateTint(); render(); setDirty(true); schedulePreview();
  }
  $('#undo').onclick = () => { if (!undoStack.length) return; redoStack.push(snapshot()); restore(undoStack.pop()); updateButtons(); };
  $('#redo').onclick = () => { if (!redoStack.length) return; undoStack.push(snapshot()); restore(redoStack.pop()); updateButtons(); };
  function updateButtons() { $('#undo').disabled = !undoStack.length; $('#redo').disabled = !redoStack.length; }

  // ---------- 도구 ----------
  function setTool(t) {
    tool = t;
    $$('.tool[data-tool]').forEach(b => b.classList.toggle('on', b.dataset.tool === t));
    wrap.classList.toggle('pan', t === 'pan'); wrap.classList.toggle('paint', t !== 'pan');
    render();
  }
  $$('.tool[data-tool]').forEach(b => b.onclick = () => setTool(b.dataset.tool));
  const sizeEl = $('#size');
  function setSize(v) { size = Math.max(6, Math.min(240, Math.round(v))); sizeEl.value = size; $('#sizeVal').textContent = size; render(); }
  sizeEl.oninput = () => setSize(Number(sizeEl.value));
  $('#toggleTint').onclick = () => { showTint = !showTint; $('#toggleTint').classList.toggle('on', !showTint); render(); };
  function zoomAt(f, cx, cy) {
    const ns = Math.max(0.05, Math.min(8, scale * f));
    tx = cx - (cx - tx) * (ns / scale); ty = cy - (cy - ty) * (ns / scale); scale = ns; render();
  }
  const center = () => { const r = wrap.getBoundingClientRect(); return [r.width / 2, r.height / 2]; };
  $('#zoomIn').onclick = () => zoomAt(1.25, ...center());
  $('#zoomOut').onclick = () => zoomAt(0.8, ...center());
  $('#zoomFit').onclick = zoomFit;

  // ---------- 칠하기 / 이동 / 확대 ----------
  const pts = new Map();
  let drawing = false, last = null, panning = false, panStart = null, pinch = null, spaceDown = false;
  const local = e => { const r = wrap.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  const toImg = p => ({ x: (p.x - tx) / scale, y: (p.y - ty) / scale });

  function stroke(a, b) {
    mctx.save();
    mctx.globalCompositeOperation = tool === 'add' ? 'source-over' : 'destination-out';
    mctx.strokeStyle = '#fff'; mctx.fillStyle = '#fff';
    mctx.lineWidth = size; mctx.lineCap = 'round'; mctx.lineJoin = 'round';
    mctx.beginPath(); mctx.moveTo(a.x, a.y); mctx.lineTo(b.x + 0.01, b.y); mctx.stroke();
    mctx.restore();
    const r = size / 2 + 2;
    updateTint(Math.min(a.x, b.x) - r, Math.min(a.y, b.y) - r, Math.abs(a.x - b.x) + r * 2, Math.abs(a.y - b.y) + r * 2);
  }

  wrap.addEventListener('pointerdown', e => {
    if (!src) return;
    wrap.setPointerCapture(e.pointerId);
    pts.set(e.pointerId, local(e));
    if (pts.size === 2) {            // 두 손가락: 확대/이동
      if (drawing) { drawing = false; }
      const [p1, p2] = [...pts.values()];
      pinch = { d: Math.hypot(p1.x - p2.x, p1.y - p2.y), cx: (p1.x + p2.x) / 2, cy: (p1.y + p2.y) / 2 };
      return;
    }
    const p = local(e);
    if (tool === 'pan' || spaceDown || e.button === 1) {
      panning = true; panStart = { x: p.x - tx, y: p.y - ty }; wrap.classList.add('panning'); return;
    }
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    pushUndo();
    drawing = true; last = toImg(p); stroke(last, last); render();
  });
  wrap.addEventListener('pointermove', e => {
    const p = local(e);
    if (pts.has(e.pointerId)) pts.set(e.pointerId, p);
    pointer = p;
    if (pinch && pts.size === 2) {
      const [p1, p2] = [...pts.values()];
      const d = Math.hypot(p1.x - p2.x, p1.y - p2.y), cx = (p1.x + p2.x) / 2, cy = (p1.y + p2.y) / 2;
      tx += cx - pinch.cx; ty += cy - pinch.cy;
      zoomAt(d / pinch.d, cx, cy);
      pinch = { d, cx, cy }; return;
    }
    if (panning) { tx = p.x - panStart.x; ty = p.y - panStart.y; render(); return; }
    if (drawing) { const q = toImg(p); stroke(last, q); last = q; }
    render();
  });
  const end = e => {
    pts.delete(e.pointerId);
    if (pts.size < 2) pinch = null;
    if (panning && !pts.size) { panning = false; wrap.classList.remove('panning'); }
    if (drawing) { drawing = false; setDirty(true); schedulePreview(); }
  };
  wrap.addEventListener('pointerup', end);
  wrap.addEventListener('pointercancel', end);
  wrap.addEventListener('pointerleave', () => { pointer = null; render(); });
  wrap.addEventListener('wheel', e => { e.preventDefault(); const p = local(e); zoomAt(e.deltaY < 0 ? 1.12 : 1 / 1.12, p.x, p.y); }, { passive: false });
  wrap.addEventListener('contextmenu', e => e.preventDefault());

  document.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT') return;
    const k = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && k === 'z') { e.preventDefault(); e.shiftKey ? $('#redo').click() : $('#undo').click(); return; }
    if ((e.ctrlKey || e.metaKey) && k === 'y') { e.preventDefault(); $('#redo').click(); return; }
    if (k === ' ') { if (!spaceDown) { spaceDown = true; wrap.classList.add('pan'); render(); } e.preventDefault(); return; }
    if (k === 'b') setTool('add');
    if (k === 'e') setTool('erase');
    if (k === 'h') setTool('pan');
    if (k === 'v') $('#toggleTint').click();
    if (k === '[') setSize(size * 0.8);
    if (k === ']') setSize(size * 1.25);
  });
  document.addEventListener('keyup', e => { if (e.key === ' ') { spaceDown = false; wrap.classList.toggle('pan', tool === 'pan'); render(); } });

  // ---------- 완성 사진 만들기 (앱에 들어가는 1200×900 투명 PNG) ----------
  function bounds(mk) {
    const s = 4, w = Math.ceil(W / s), h = Math.ceil(H / s);
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const cx = c.getContext('2d'); cx.drawImage(mk, 0, 0, w, h);
    const d = cx.getImageData(0, 0, w, h).data;
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (d[(y * w + x) * 4 + 3] > 60) {
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    if (x1 < 0) return null;
    // 바닥 그림자 폭: 아래쪽 10% 줄에서 칠해진 가로 범위
    let bx0 = w, bx1 = -1; const by = Math.floor(y1 - (y1 - y0) * 0.1);
    for (let y = by; y <= y1; y++) for (let x = x0; x <= x1; x++) if (d[(y * w + x) * 4 + 3] > 60) { if (x < bx0) bx0 = x; if (x > bx1) bx1 = x; }
    return { x0: x0 * s, y0: y0 * s, x1: Math.min(W, (x1 + 1) * s), y1: Math.min(H, (y1 + 1) * s), bx0: bx0 * s, bx1: (bx1 + 1) * s };
  }
  function compose(srcImg, mk) {
    const b = bounds(mk);
    const OW = 1200, OH = 900;
    const out = document.createElement('canvas'); out.width = OW; out.height = OH;
    if (!b) return out;
    const ctx = out.getContext('2d');
    const ow = b.x1 - b.x0, oh = b.y1 - b.y0;
    const sc = Math.min(OW * 0.9 / ow, OH * 0.8 / oh);
    const nw = Math.round(ow * sc), nh = Math.round(oh * sc);
    const ox = Math.round((OW - nw) / 2), oy = Math.round(OH * 0.9 - nh);
    // 바닥 그림자
    const rh = Math.max(10, nh * 0.07), rw = (b.bx1 - b.bx0) * sc * 0.52;
    const cx = ox + ((b.bx0 + b.bx1) / 2 - b.x0) * sc;
    ctx.save(); ctx.filter = `blur(${Math.round(rh * 0.9)}px)`; ctx.fillStyle = 'rgba(90,55,40,0.32)';
    ctx.beginPath(); ctx.ellipse(cx, oy + nh - rh * 0.35, rw, rh, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    // 초밥 (테두리 살짝 부드럽게)
    const t = document.createElement('canvas'); t.width = nw; t.height = nh;
    const tc = t.getContext('2d'); tc.imageSmoothingQuality = 'high';
    tc.drawImage(srcImg, b.x0, b.y0, ow, oh, 0, 0, nw, nh);
    tc.globalCompositeOperation = 'destination-in';
    tc.filter = 'blur(1.1px)';
    tc.drawImage(mk, b.x0, b.y0, ow, oh, 0, 0, nw, nh);
    ctx.drawImage(t, ox, oy);
    return out;
  }
  let pvTimer = null;
  function schedulePreview() { clearTimeout(pvTimer); pvTimer = setTimeout(drawPreview, 120); }
  function drawPreview() {
    if (!src) return;
    const out = compose(src, mask);
    pctx.clearRect(0, 0, pv.width, pv.height);
    pctx.imageSmoothingQuality = 'high';
    pctx.drawImage(out, 0, 0, pv.width, pv.height);
  }

  // ---------- 불러오기 ----------
  const loadImg = url => new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = url; });
  async function open(id) {
    if (dirty && cur && cur !== id) {
      const go = await App.confirm('저장하지 않은 변경이 있어요', '다른 메뉴로 넘어가면 지금 칠한 내용이 사라져요.', '그래도 이동', true);
      if (!go) return;
    }
    cur = id; $('#loading').hidden = false;
    $$('.item').forEach(b => b.classList.toggle('on', b.dataset.id === id));
    const m = menu.find(x => x.id === id);
    $('#pvName').textContent = m ? m.name : id;
    try {
      const [s, mk] = await Promise.all([loadImg(`/editor/src/${id}.jpg`), loadImg(`/editor/mask/${id}.png?v=${Date.now()}`)]);
      src = s; W = s.naturalWidth; H = s.naturalHeight;
      mask.width = tint.width = W; mask.height = tint.height = H;
      mctx.clearRect(0, 0, W, H); mctx.drawImage(mk, 0, 0, W, H);
      undoStack.length = 0; redoStack.length = 0; updateButtons();
      updateTint(); fitCanvas(); zoomFit(); drawPreview(); setDirty(false);
    } catch (e) { App.toast('😢 사진을 불러오지 못했어요'); }
    $('#loading').hidden = true;
  }

  function setDirty(v) { dirty = v; refreshStatus(); }
  function refreshStatus() {
    const m = menu.find(x => x.id === cur), st = $('#status');
    st.className = 'st';
    if (dirty) { st.classList.add('dirty'); st.textContent = '✏️ 고친 내용이 아직 저장되지 않았어요'; }
    else if (m && m.image) { st.classList.add('ok'); st.textContent = '✅ 앱에 사진으로 적용되어 있어요'; }
    else st.textContent = '🎨 아직 앱에는 기본 그림이 나와요';
  }

  // ---------- 저장 ----------
  async function save(id, srcImg, mk) {
    const out = compose(srcImg, mk);
    return App.post('/api/editor/save', { id, image: out.toDataURL('image/png'), mask: mk.toDataURL('image/png') });
  }
  $('#btnSave').onclick = async () => {
    if (!src) return;
    const btn = $('#btnSave'); btn.disabled = true; btn.textContent = '저장하는 중…';
    try { await save(cur, src, mask); setDirty(false); App.toast('✅ 저장했어요! 앱 메뉴 사진이 바뀌었어요'); App.sound.success(); }
    catch (e) { App.toast('😢 ' + esc(e.message)); }
    btn.disabled = false; btn.textContent = '💾 저장하고 앱에 적용';
  };
  $('#btnAuto').onclick = async () => {
    if (!src) return;
    if (!await App.confirm('자동 영역으로 되돌릴까요?', '처음에 자동으로 오린 영역으로 바뀌어요. 되돌리기(↶)로 다시 돌아올 수 있어요.', '되돌리기')) return;
    const mk = await loadImg(`/editor/mask-auto/${cur}.png`);
    pushUndo(); mctx.globalCompositeOperation = 'source-over'; mctx.clearRect(0, 0, W, H); mctx.drawImage(mk, 0, 0, W, H);
    updateTint(); render(); setDirty(true); drawPreview();
  };
  $('#btnRemove').onclick = async () => {
    if (!await App.confirm('사진을 빼고 기본 그림으로 할까요?', '앱 메뉴에 이 사진 대신 원래 그려 둔 초밥 그림이 나와요. 칠해 둔 영역은 남아 있어서 다시 저장하면 돼요.', '기본 그림으로', true)) return;
    try { await App.post('/api/editor/remove', { id: cur }); App.toast('🎨 기본 그림으로 바꿨어요'); } catch (e) { App.toast('😢 ' + esc(e.message)); }
  };
  $('#btnSaveAll').onclick = async () => {
    if (!await App.confirm('7장 모두 저장할까요?', '각 메뉴의 지금 영역(저장해 둔 영역 또는 자동 영역)으로 사진을 만들어 앱에 한꺼번에 적용해요.', '모두 저장')) return;
    const btn = $('#btnSaveAll'); btn.disabled = true;
    let n = 0;
    for (const m of menu) {
      btn.textContent = `저장하는 중… (${n + 1}/${menu.length})`;
      try {
        if (m.id === cur) await save(m.id, src, mask);
        else {
          const [s, mk] = await Promise.all([loadImg(`/editor/src/${m.id}.jpg`), loadImg(`/editor/mask/${m.id}.png?v=${Date.now()}`)]);
          const c = document.createElement('canvas'); c.width = s.naturalWidth; c.height = s.naturalHeight; c.getContext('2d').drawImage(mk, 0, 0, c.width, c.height);
          const keepW = W, keepH = H; W = c.width; H = c.height;      // bounds()가 W,H를 사용
          await save(m.id, s, c); W = keepW; H = keepH;
        }
        n++;
      } catch (e) { App.toast(`😢 ${esc(m.name)} 저장 실패`); }
    }
    if (cur) setDirty(false);
    btn.disabled = false; btn.textContent = '📦 7장 모두 지금 영역으로 저장';
    App.toast(`✅ ${n}장을 앱에 적용했어요`); App.sound.success();
  };

  // ---------- 메뉴 목록 ----------
  function renderList() {
    const list = $('#list'), anchor = list.querySelector('.all');
    $$('.item', list).forEach(x => x.remove());
    menu.forEach(m => {
      const b = document.createElement('button');
      b.className = 'item' + (m.id === cur ? ' on' : ''); b.dataset.id = m.id;
      b.innerHTML = `<img src="${m.image || `/editor/src/${m.id}.jpg`}" alt=""><div><b>${esc(m.name)}</b><i class="${m.image ? 'ok' : 'no'}">${m.image ? '● 사진 적용됨' : '○ 기본 그림'}</i></div>`;
      b.onclick = () => open(m.id);
      list.insertBefore(b, anchor);
    });
  }

  window.addEventListener('resize', () => { fitCanvas(); });
  window.addEventListener('beforeunload', e => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });

  App.connect(msg => {
    menu = App.state.menu;
    renderList(); refreshStatus();
    if (!cur && menu.length) open(menu[0].id);
  });
  setSize(60); fitCanvas();
})();
