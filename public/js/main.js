(function () {
  const { $, $$, won, esc } = App;
  let tab = 'tables';
  const seen = new Set();
  let firstLoad = true;
  let bumpTable = null;

  // ---------- 탭 ----------
  function moveInd() {
    const on = $(`.tabs button[data-tab="${tab}"]`), ind = $('#tabInd');
    ind.style.left = on.offsetLeft + 'px'; ind.style.width = on.offsetWidth + 'px';
  }
  $$('.tabs button').forEach(b => b.onclick = () => {
    if (tab === b.dataset.tab) return;
    tab = b.dataset.tab;
    $$('.tabs button').forEach(x => x.classList.toggle('on', x === b));
    moveInd();
    render(true);
  });
  window.addEventListener('resize', moveInd);

  // 화면에 보여 줄 주문 (취소·결제대기·정리된 예전 기록은 빼기)
  const tableOrders = t => App.state.orders
    .filter(o => o.table === t && !o.closed && o.status !== 'cancelled' && o.status !== 'awaiting_payment')
    .sort((a, b) => b.createdAt - a.createdAt);

  function header() {
    $('#shopName').textContent = App.state.shopName;
    const d = new Date(App.now());
    $('#clock').textContent = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }

  // ---------- 테이블 (주문 건별로 나눠서) ----------
  function renderTables() {
    return `<div class="tables-grid">${App.state.tables.map(t => {
      const list = tableOrders(t);   // 최신 주문이 위
      const total = list.reduce((s, o) => s + o.total, 0);
      const boxes = list.map(o => {
        const isNew = !firstLoad && !seen.has(o.id);
        seen.add(o.id);
        return `<div class="ord ${isNew ? 'flash' : ''}">
          <div class="ord-head"><b>${App.orderNo(o.no)}</b><small>${App.timeStr(o.createdAt)} · ${App.ago(o.createdAt)}</small><span class="amt">${won(o.total)}</span></div>
          <div class="ord-items">${o.items.map(i => `<div class="oi"><div class="th2">${App.visual(App.menuById(i.id) || { id: i.id, name: i.name })}</div><span>${esc(i.name)}</span><em>${i.qty}개</em></div>`).join('')}</div>
        </div>`;
      }).join('');
      return `<div class="tcard ${bumpTable === t ? 'bump' : ''}">
        <div class="th"><b>${App.tableName(t)}</b><span class="chip ${list.length ? 'primary' : 'grey'}">${list.length ? `주문 ${list.length}건` : '주문 없음'}</span></div>
        ${list.length ? `<div class="orders">${boxes}<div class="more" hidden></div></div>` : `<div class="empty-t">🪑<br>아직 주문이 없어요</div>`}
        <div class="tsum"><span>주문 금액</span><b>${won(total)}</b></div>
      </div>`;
    }).join('')}</div>`;
  }

  // 칸이 넘치면: 글씨를 조금씩 줄이고(70%까지), 그래도 넘치면 오래된 주문부터 접기
  function fitCards() {
    $$('.tcard').forEach(card => {
      const list = $('.orders', card);
      if (!list) return;
      const boxes = $$('.ord', list), more = $('.more', list);
      const over = () => list.scrollHeight > list.clientHeight + 1;
      boxes.forEach(b => { b.hidden = false; }); more.hidden = true;
      let k = 1; card.style.setProperty('--k', k);
      while (over() && k > 0.71) { k = Math.round((k - 0.05) * 100) / 100; card.style.setProperty('--k', k); }
      let folded = 0;
      while (over() && folded < boxes.length - 1) {
        folded++;
        boxes[boxes.length - folded].hidden = true;
        more.hidden = false;
        more.textContent = `⬆ 이전 주문 ${folded}건은 접어 두었어요 (주문 금액에는 포함)`;
      }
    });
  }
  window.addEventListener('resize', () => { if (tab === 'tables') fitCards(); });

  // ---------- 메뉴 판매 설정 ----------
  function renderMenu() {
    return `<div class="menu-layout"><section class="panel">
      <h3>🥢 메뉴 판매 설정</h3>
      <p class="desc">스위치를 끄면 테이블 화면에 "오늘은 다 팔렸어요"로 보여요</p>
      ${App.state.menu.map(m => `<div class="switch-row"><div class="th2">${App.visual(m)}</div>
        <span>${esc(m.name)}${m.soldOut ? '<em>품절</em>' : ''}</span>
        <button class="switch ${m.soldOut ? '' : 'on'}" data-sold="${m.id}" aria-label="판매 켜기/끄기"></button></div>`).join('')}
    </section>
    <section class="panel reset-panel">
      <h3>🧹 주문 내역 초기화</h3>
      <p class="desc">테이블 1~4의 모든 주문 내역을 지우고 주문번호를 #001부터 다시 시작해요. 메뉴 판매(품절) 설정은 그대로 남아요.</p>
      <button class="btn dark" data-reset>초기화하기</button>
    </section></div>`;
  }

  // ---------- 그리기 ----------
  function render(enter) {
    header();
    const view = $('#view');
    const scrolls = $$('.orders', view).map(el => el.scrollTop);
    const scroll = view.scrollTop;
    view.innerHTML = tab === 'tables' ? renderTables() : renderMenu();
    view.classList.toggle('fit', tab === 'tables');
    if (tab === 'tables') fitCards();
    view.classList.remove('enter');
    if (enter) { void view.offsetWidth; view.classList.add('enter'); view.scrollTop = 0; }
    else { view.scrollTop = scroll; $$('.orders', view).forEach((el, i) => { el.scrollTop = scrolls[i] || 0; }); }
    $$('[data-sold]', view).forEach(b => b.onclick = async () => {
      const m = App.menuById(b.dataset.sold);
      b.classList.toggle('on');
      try { await App.post('/api/soldout', { id: m.id, soldOut: !m.soldOut }); }
      catch (e) { App.toast('😢 ' + esc(e.message)); }
    });
    $$('[data-reset]', view).forEach(b => b.onclick = async () => {
      const n = App.state.orders.length;
      if (!await App.confirm('주문 내역을 초기화할까요?', `지금까지 들어온 주문 ${n}건이 모두 지워지고 되돌릴 수 없어요.`, '초기화하기', true)) return;
      try { await App.post('/api/reset'); App.toast('🧹 주문 내역을 초기화했어요'); }
      catch (e) { App.toast('😢 ' + esc(e.message)); }
    });
    firstLoad = false;
    bumpTable = null;
  }

  // ---------- 시작 ----------
  App.mountFullscreen($('.m-header'), 'flat');
  // 시작하기를 누르면 소리 켜기 + 전체화면
  $('#btnStart').onclick = () => { App.sound.unlock(); App.prepareSounds(); App.fs.enter(); $('#starter').classList.add('hide'); };

  App.connect(msg => {
    const d = msg.data;
    if (msg.event === 'order:new') {
      App.sound.kitchen();
      App.toast(`🍣 새 주문! ${App.tableName(d.table)} · ${App.orderNo(d.no)}`, 3000);
      bumpTable = d.table;
    }
    if (msg.event === 'order:cancel') App.toast(`↩️ ${App.tableName(d.table)}에서 ${App.orderNo(d.no)} 주문을 취소했어요`, 3000);
    if (msg.event === 'table:done') App.toast(`😋 ${App.tableName(d.table)} 식사 끝! 테이블을 비웠어요`, 3000);
    if (msg.event === 'init') { moveInd(); render(true); }
    else render(false);
  });

  setInterval(() => { if (App.state) render(false); }, 20000);
})();
