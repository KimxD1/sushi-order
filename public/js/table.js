(function () {
  const { $, $$, won, esc } = App;
  const m = location.pathname.match(/table\/(\d+)/);
  const T = Number((m && m[1]) || new URLSearchParams(location.search).get('t') || 1);

  const cart = {};               // { 메뉴id: 개수 }
  let menuSig = '';
  let doneTimer = null;

  $('#tableName').textContent = App.tableName(T);
  document.title = App.tableName(T) + ' · 주문';

  App.mountFullscreen($('.t-actions'));

  const dim = $('#dim'), cartSheet = $('#cartSheet'), ordersSheet = $('#ordersSheet');

  // ---------- 메뉴 그리기 ----------
  function buildMenu() {
    const grid = $('#menuGrid');
    grid.innerHTML = App.state.menu.map((item, i) => `
      <button class="menu-card press rise" data-id="${item.id}" style="animation-delay:${i * 55}ms">
        <div class="menu-img">${App.visual(item)}<span class="qty-badge">0</span></div>
        <div class="menu-info">
          <div class="menu-name">${esc(item.name)}</div>
          <div class="menu-desc">${esc(item.desc || '')}</div>
          <div class="menu-price">${won(item.price)}</div>
        </div>
        <div class="add-btn">+</div>
        <div class="soldout-mask">오늘은 다 팔렸어요</div>
      </button>`).join('');
    $$('.menu-card', grid).forEach(card => card.addEventListener('click', () => addToCart(card.dataset.id, card)));
  }

  function refreshMenu() {
    $$('.menu-card').forEach(card => {
      const item = App.menuById(card.dataset.id);
      const q = cart[card.dataset.id] || 0;
      card.classList.toggle('in-cart', q > 0);
      card.classList.toggle('soldout', !!(item && item.soldOut));
      $('.qty-badge', card).textContent = q;
    });
  }

  // ---------- 장바구니 ----------
  const cartCount = () => Object.values(cart).reduce((a, b) => a + b, 0);
  const cartTotal = () => Object.entries(cart).reduce((s, [id, q]) => s + ((App.menuById(id) || {}).price || 0) * q, 0);

  function addToCart(id, card) {
    const item = App.menuById(id);
    if (!item || item.soldOut) return;
    cart[id] = (cart[id] || 0) + 1;
    App.sound.add(); App.vibrate(15);
    const bar = $('#cartBar');
    const wasHidden = !bar.classList.contains('show');
    refreshCart();
    const slot = $('#cartSlot').getBoundingClientRect();
    const target = { x: slot.left + slot.width / 2 - Math.min(760, slot.width) / 2 + 60, y: slot.bottom - 66 };
    App.fly($('.menu-img', card), target, () => { if (!wasHidden) App.bump(bar); });
    App.bump($('.qty-badge', card));
  }

  function refreshCart() {
    const n = cartCount(), total = cartTotal();
    $('#cartBar').classList.toggle('show', n > 0);
    $('#cbCount').textContent = n;
    App.countTo($('#cbTotal'), total, 450);
    App.countTo($('#sheetTotal'), total, 450);
    refreshMenu();
    if (cartSheet.classList.contains('show')) renderCartList();
    if (n === 0 && cartSheet.classList.contains('show')) App.closeSheet(cartSheet, dim);
  }

  function renderCartList() {
    const rows = Object.entries(cart).filter(([, q]) => q > 0);
    $('#cartList').innerHTML = rows.map(([id, q]) => {
      const item = App.menuById(id);
      return `<div class="cart-row">
        <div class="thumb">${App.visual(item)}</div>
        <div class="nm"><b>${esc(item.name)}</b><span>${won(item.price * q)}</span></div>
        <div class="stepper"><button data-id="${id}" data-d="-1">−</button><span>${q}</span><button data-id="${id}" data-d="1">+</button></div>
      </div>`;
    }).join('');
    $$('#cartList .stepper button').forEach(b => b.onclick = () => {
      const id = b.dataset.id, d = Number(b.dataset.d);
      cart[id] = Math.max(0, (cart[id] || 0) + d);
      if (!cart[id]) delete cart[id];
      d > 0 ? App.sound.add() : App.sound.remove();
      refreshCart();
    });
  }

  $('#cartBar').onclick = () => { renderCartList(); App.openSheet(cartSheet, dim); };
  $('#btnClear').onclick = () => { Object.keys(cart).forEach(k => delete cart[k]); App.sound.remove(); refreshCart(); };

  $('#btnOrder').onclick = async () => {
    const btn = $('#btnOrder');
    if (!cartCount()) return;
    btn.disabled = true;
    try {
      const order = await App.post('/api/orders', { table: T, items: Object.entries(cart).map(([id, qty]) => ({ id, qty })) });
      Object.keys(cart).forEach(k => delete cart[k]);
      App.closeSheet(cartSheet, dim);
      refreshCart();
      showDone(order);
    } catch (e) { App.toast('😢 ' + esc(e.message)); App.sound.error(); }
    btn.disabled = false;
  };

  // ---------- 주문 완료 ----------
  function showDone(order) {
    $('#doneCheck').innerHTML = App.checkSvg();
    $('#doneNo').textContent = '주문번호 ' + App.orderNo(order.no);
    $('#doneOverlay').classList.add('show');
    App.sound.success(); App.vibrate([30, 60, 30]);
    confetti();
    clearTimeout(doneTimer);
    doneTimer = setTimeout(hideDone, 6000);
  }
  function hideDone() { $('#doneOverlay').classList.remove('show'); }
  $('#doneOk').onclick = hideDone;

  function confetti() {
    const colors = ['#FF6B4A', '#FFA81F', '#13B886', '#3D7BFF', '#FFD84D', '#FF8FB1'];
    for (let i = 0; i < 46; i++) {
      const c = document.createElement('div');
      c.className = 'confetti';
      c.style.left = Math.random() * 100 + 'vw';
      c.style.background = colors[i % colors.length];
      document.body.appendChild(c);
      const x = (Math.random() - .5) * 200, rot = Math.random() * 720;
      c.animate([
        { transform: 'translate(0,0) rotate(0)', opacity: 1 },
        { transform: `translate(${x}px, 105vh) rotate(${rot}deg)`, opacity: .9 }
      ], { duration: 1800 + Math.random() * 1400, delay: Math.random() * 300, easing: 'cubic-bezier(.25,.6,.4,1)' }).onfinish = () => c.remove();
    }
  }

  // ---------- 내 주문 ----------
  const myOrders = () => App.state.orders
    .filter(o => o.table === T && !o.closed && o.status !== 'cancelled' && o.status !== 'awaiting_payment')
    .sort((a, b) => b.createdAt - a.createdAt);

  function renderOrders() {
    const list = myOrders();
    const total = list.reduce((s, o) => s + o.total, 0);
    $('#ordersList').innerHTML = list.length ? list.map(o => `<div class="my-order" data-oid="${o.id}">
        <span class="cfill"></span>
        <div class="top"><b>${App.orderNo(o.no)} · ${App.timeStr(o.createdAt)}</b><span class="chip primary">주문 완료</span></div>
        <div class="items">${esc(App.itemsText(o.items))}</div>
        <div class="sum">${won(o.total)}</div>
        <div class="hint">✋ 이 상자를 꾹 누르면 주문이 취소돼요</div>
      </div>`).join('') + `<div class="my-total"><span>모두 합쳐서</span><b>${won(total)}</b></div>`
      : `<div class="empty"><span class="em">🍽️</span>아직 주문한 초밥이 없어요</div>`;
  }
  // 주문 상자를 꾹 눌러 취소
  let cHold = null;
  const ordersList = $('#ordersList');
  ordersList.addEventListener('pointerdown', e => {
    const box = e.target.closest('.my-order');
    if (!box || box.classList.contains('gone')) return;
    box.classList.add('holding'); App.vibrate(10);
    const timer = setTimeout(async () => {
      cHold = null;
      box.classList.remove('holding');
      App.vibrate([30, 60, 30]);
      try {
        await App.post(`/api/orders/${box.dataset.oid}/cancel`, { table: T });
        box.classList.add('gone'); App.sound.remove();
        App.toast('↩️ 주문을 취소했어요');
      } catch (err) { App.toast('😢 ' + esc(err.message)); App.sound.error(); }
    }, 1500);
    cHold = { box, timer };
  });
  const cStop = () => {
    if (!cHold) return;
    clearTimeout(cHold.timer); cHold.box.classList.remove('holding'); cHold = null;
  };
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(ev => ordersList.addEventListener(ev, cStop));
  ordersList.addEventListener('pointerout', e => { if (cHold && !cHold.box.contains(e.relatedTarget)) cStop(); });
  ordersList.addEventListener('contextmenu', e => e.preventDefault());

  $('#btnMyOrders').onclick = () => { renderOrders(); App.openSheet(ordersSheet, dim); };
  $('#btnOrdersClose').onclick = () => App.closeSheet(ordersSheet, dim);

  // ---------- 다 먹었어요 (꾹 누르기) ----------
  const btnDone = $('#btnDone');
  let holdTimer = null, tipEl = null;
  function showTip() {
    if (tipEl) return;
    const r = btnDone.getBoundingClientRect();
    tipEl = document.createElement('div');
    tipEl.className = 'hold-tip'; tipEl.textContent = '👆 손가락으로 꾹 누르고 있어요';
    tipEl.style.top = (r.bottom + 10) + 'px'; tipEl.style.right = (innerWidth - r.right) + 'px';
    document.body.appendChild(tipEl);
    setTimeout(() => { tipEl && tipEl.remove(); tipEl = null; }, 1800);
  }
  function holdStart(e) {
    e.preventDefault();
    btnDone.classList.add('holding'); App.sound.tap(); App.vibrate(10);
    holdTimer = setTimeout(finishMeal, 1500);
  }
  function holdCancel() {
    if (!holdTimer) return;
    clearTimeout(holdTimer); holdTimer = null;
    btnDone.classList.remove('holding');
    showTip();
  }
  async function finishMeal() {
    holdTimer = null;
    btnDone.classList.remove('holding');
    App.vibrate([30, 60, 30]);
    try { await App.post(`/api/tables/${T}/done`); }
    catch (e) { App.toast('😢 ' + esc(e.message)); App.sound.error(); }
  }
  btnDone.addEventListener('pointerdown', holdStart);
  ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => btnDone.addEventListener(ev, holdCancel));
  btnDone.addEventListener('contextmenu', e => e.preventDefault());

  function showBye() {
    Object.keys(cart).forEach(k => delete cart[k]);
    refreshCart();
    App.closeSheet(cartSheet, dim); App.closeSheet(ordersSheet, dim);
    $('#doneOverlay').classList.remove('show');
    $('#byeOverlay').classList.add('show');
    App.sound.success();
    setTimeout(() => $('#byeOverlay').classList.remove('show'), 3500);
  }

  // ---------- 서버 소식 받기 ----------
  App.connect(msg => {
    const s = App.state;
    $('#shopName').textContent = s.shopName;
    const sig = s.menu.map(x => x.id + (x.image || '') + x.price + x.name).join('|');
    if (sig !== menuSig) { menuSig = sig; buildMenu(); }
    // 품절된 메뉴는 장바구니에서 빼기
    s.menu.forEach(x => { if (x.soldOut && cart[x.id]) { delete cart[x.id]; App.toast(`${esc(x.name)}이(가) 방금 다 팔렸어요`); } });
    refreshCart();

    const mine = myOrders();
    $('#myOrderCount').textContent = mine.length;
    $('#myOrderCount').classList.toggle('zero', !mine.length);
    btnDone.hidden = !mine.length;
    if (ordersSheet.classList.contains('show') && !cHold) {
      if (msg.event === 'order:cancel' && msg.data.table === T) setTimeout(renderOrders, 450); else renderOrders();
    }
    if (msg.event === 'reset') { App.closeSheet(ordersSheet, dim); }
    if (msg.event === 'table:done' && msg.data.table === T) showBye();
  });
})();
