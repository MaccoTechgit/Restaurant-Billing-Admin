'use strict';
/* pos.js - Point of Sale, kitchen display, tables, order detail, payment, receipt */

const CHANNELS = [['dine_in', '🍽 Dine-in'], ['takeaway', '🛍 Takeaway'], ['delivery', '🛵 Delivery'], ['pickup', '🚶 Pick-up'], ['drive_thru', '🚗 Drive-thru'], ['pre_order', '🗓 Pre-order'], ['catering', '🎉 Catering']];
const PAY_METHODS = [['cash', '💵 Cash'], ['card', '💳 Card'], ['upi', '📱 UPI'], ['wallet', '👛 Wallet'], ['gift_card', '🎁 Gift card'], ['loyalty', '⭐ Points'], ['account', '🏢 On account'], ['other', 'Other']];
let MENU = null, MENU_TAG = '';

async function loadMenuData(force) {
  const h = { Authorization: 'Bearer ' + S.token };
  if (MENU_TAG && !force) h['If-None-Match'] = MENU_TAG;
  const r = await fetch('/api/menu', { headers: h });
  if (r.status === 401) return logout();
  if (r.status === 304 && MENU) return MENU;
  MENU = await r.json(); MENU_TAG = r.headers.get('ETag') || '';
  return MENU;
}

/* ---------- receipt ---------- */
function receiptHTML(o) {
  const c = S.cfg, ap = c.app || {};
  const lines = o.items.filter(i => i.status !== 'void');
  const pays = (o.payments || []).filter(p => p.kind === 'payment');
  const refunds = (o.payments || []).filter(p => p.kind === 'refund');
  const paid = pays.reduce((a, p) => a + p.amount, 0) - refunds.reduce((a, p) => a + p.amount, 0);
  return `<div class="receipt"><div class="c"><b style="font-size:15px">${esc(c.restaurant || '')}</b><br>${esc(ap.address || '')}${ap.phone ? '<br>Tel ' + esc(ap.phone) : ''}${ap.tax_id ? '<br>Tax no. ' + esc(ap.tax_id) : ''}${c.pos && c.pos.header ? '<br>' + esc(c.pos.header) : ''}</div><hr>
    <div class="r"><span>Order</span><b>${esc(o.no)}</b></div><div class="r"><span>Date</span><span>${esc(fdt(o.created_at))}</span></div><div class="r"><span>Type</span><span>${esc(nice(o.channel))}${o.table_name ? ' · ' + esc(o.table_name) : ''}</span></div>${o.customer && (!c.pos || c.pos.show_customer !== false) ? `<div class="r"><span>Customer</span><span>${esc(o.customer)}</span></div>` : ''}${!c.pos || c.pos.show_cashier !== false ? `<div class="r"><span>Order by</span><span>${esc(o.staff || '')}</span></div>${pays.length ? `<div class="r"><span>Cashier</span><span>${esc(pays[pays.length - 1].by || '')}</span></div>` : ''}` : ''}<hr>
    ${lines.map(i => `<div class="r"><span>${i.qty} × ${esc(i.name)}</span><span>${money(i.price * i.qty)}</span></div>${i.options ? `<div style="padding-left:14px;font-size:11px">${esc(i.options)}</div>` : ''}`).join('')}<hr>
    <div class="r"><span>Subtotal</span><span>${money(o.subtotal)}</span></div>${o.discount ? `<div class="r"><span>Discount${o.voucher ? ' (' + esc(o.voucher) + ')' : ''}</span><span>-${money(o.discount)}</span></div>` : ''}${o.service ? `<div class="r"><span>Service charge</span><span>${money(o.service)}</span></div>` : ''}<div class="r"><span>${c.pos && c.pos.inclusive ? 'Tax (included)' : 'Tax'}</span><span>${money(o.tax)}</span></div>${o.delivery_fee ? `<div class="r"><span>Delivery fee</span><span>${money(o.delivery_fee)}</span></div>` : ''}${o.tip ? `<div class="r"><span>Tip</span><span>${money(o.tip)}</span></div>` : ''}
    <div class="r" style="font-size:15px"><b>TOTAL</b><b>${money(o.total)}</b></div><hr>
    ${pays.map(p => `<div class="r"><span>${esc(nice(p.method))}${p.ref ? ' ' + esc(p.ref) : ''}</span><span>${money(p.amount)}</span></div>`).join('')}${refunds.length ? `<div class="r"><span>Refunded</span><span>-${money(refunds.reduce((a, p) => a + p.amount, 0))}</span></div>` : ''}
    ${o.pay_status !== 'paid' && o.pay_mode ? `<div class="r"><span>Payment mode</span><b>${esc(nice(o.pay_mode))} (to pay)</b></div>` : ''}<div class="c" style="margin-top:6px"><b>${o.pay_status === 'paid' ? 'PAID' : o.pay_status === 'refunded' ? 'REFUNDED' : paid > 0 ? 'PART-PAID ' + money(paid) : 'NOT PAID'}</b><br>${esc((c.pos && c.pos.footer) || ap.footer || 'Thank you! Visit again.')}</div>${!c.pos || c.pos.bill_barcode !== false ? `<div style="margin-top:8px">${barcodeSVG(o.no)}<div class="c"><small>${esc(o.no)}</small></div></div>` : ''}${!c.pos || c.pos.bill_qr !== false ? `<img data-qr="${encodeURIComponent((c.pos && c.pos.qr_text) || o.no)}" alt="">` : ''}</div>`;
}
function kotHTML(o) {
  return `<div class="receipt"><div class="c"><b style="font-size:16px">KITCHEN ORDER</b><br>${esc(o.no)} · ${esc(fdt(o.created_at))}</div><hr><div style="font-size:15px"><b>${esc(nice(o.channel))}${o.table_name ? ' · TABLE ' + esc(o.table_name) : ''}</b></div>${o.customer ? `<div>${esc(o.customer)}</div>` : ''}<hr>
    ${o.items.filter(i => i.status !== 'void').map(i => `<div style="font-size:15px;margin:4px 0"><b>${i.qty} ×</b> ${esc(i.name)}${i.options ? `<div style="padding-left:18px;font-size:12px">${esc(i.options)}</div>` : ''}${i.note ? `<div style="padding-left:18px;font-size:12px">NOTE: ${esc(i.note)}</div>` : ''}</div>`).join('')}${o.note ? `<hr><div>NOTE: ${esc(o.note)}</div>` : ''}<hr><div class="c">${esc(o.staff || '')}</div></div>`;
}
const pref = (k, d) => { const v = localStorage.getItem('pf_' + k); return v === null ? d : v === '1'; };
const setPref = (k, v) => localStorage.setItem('pf_' + k, v ? '1' : '0');
const PAGEBREAK = '<!--pagebreak-->';
async function printOrder(id) { const o = await api('/pos/orders/' + id); printHTML(receiptHTML(o)); }

/* ---------- order detail modal ---------- */
async function orderModal(id, changed) {
  let o;
  try { o = await api('/pos/orders/' + id); } catch (e) { return toast(e.message, true); }
  const due = o.total - o.paid;
  const open = !['completed', 'cancelled', 'refunded'].includes(o.status);
  const steps = ['pending', 'preparing', 'ready', 'served', 'completed'], at = steps.indexOf(o.status);
  const box = modal(`<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><h2>Order ${esc(o.no)}</h2>${chip(o.status)}${chip(o.pay_status)}<span class="right muted">${esc(fdt(o.created_at))}</span></div>
    ${at >= 0 ? `<div class="stepper">${steps.map((s, i) => `<i class="${i <= at ? 'on' : ''}" title="${s}"></i>`).join('')}</div>` : ''}
    <div class="muted" style="margin-bottom:8px">${esc(nice(o.channel))}${o.table_name ? ' · ' + esc(o.table_name) : ''}${o.customer ? ' · ' + esc(o.customer) : ''}${o.phone ? ' · ' + esc(o.phone) : ''}${o.address ? '<br>📍 ' + esc(o.address) : ''}${o.staff ? ' · by ' + esc(o.staff) : ''}${o.reason ? '<br>Reason: ' + esc(o.reason) : ''}</div>
    <div class="tw"><table class="t"><thead><tr><th>Item</th><th class="num">Qty</th><th class="num">Price</th><th class="num">Total</th><th>Kitchen</th><th></th></tr></thead><tbody>${o.items.map(i => `<tr style="${i.status === 'void' ? 'opacity:.45;text-decoration:line-through' : ''}"><td>${esc(i.name)}${i.options ? `<br><small class="muted">${esc(i.options)}</small>` : ''}${i.note ? `<br><small class="muted">📝 ${esc(i.note)}</small>` : ''}</td><td class="num">${i.qty}</td><td class="num">${money(i.price)}</td><td class="num">${money(i.price * i.qty)}</td><td>${chip(i.status)}</td><td>${open && o.paid === 0 && i.status !== 'void' && can('pos', 2) ? `<button class="btn sm bad" data-v="${i.id}" title="Remove item">✕</button>` : ''}</td></tr>`).join('')}</tbody></table></div>
    <div class="sum" style="max-width:320px;margin-left:auto;margin-top:10px"><div><span>Subtotal</span><span>${money(o.subtotal)}</span></div>${o.discount ? `<div><span>Discount</span><span>-${money(o.discount)}</span></div>` : ''}${o.service ? `<div><span>Service charge</span><span>${money(o.service)}</span></div>` : ''}<div><span>Tax</span><span>${money(o.tax)}</span></div>${o.delivery_fee ? `<div><span>Delivery fee</span><span>${money(o.delivery_fee)}</span></div>` : ''}${o.tip ? `<div><span>Tip</span><span>${money(o.tip)}</span></div>` : ''}<div class="t"><span>Total</span><span>${money(o.total)}</span></div><div><span>Paid</span><span>${money(o.paid)}</span></div>${due > 0 && o.status !== 'cancelled' ? `<div style="color:var(--bad);font-weight:800"><span>Due</span><span>${money(due)}</span></div>` : ''}</div>
    ${(o.payments || []).length ? `<h4 style="margin:12px 0 4px">Payments</h4>${o.payments.map(p => `<div class="row"><span>${esc(nice(p.method))} ${p.kind === 'refund' ? chip('refunded') : ''}<small class="muted"> ${esc(fdt(p.created_at))}</small></span><b>${p.kind === 'refund' ? '-' : ''}${money(p.amount)}</b></div>`).join('')}` : ''}
    <div class="acts">${open && due > 0 && can('orders', 2) ? '<button class="btn ok" id="op">💰 Take payment</button>' : ''}${open && can('pos', 2) && o.status !== 'held' ? '<button class="btn" id="oa">+ Add items</button>' : ''}${o.status === 'held' && can('pos', 2) ? '<button class="btn pri" id="or">▶ Resume in POS</button>' : ''}
      ${o.status === 'ready' && can('pos', 2) ? '<button class="btn pri" data-s="served">Mark served</button>' : ''}${o.status === 'served' && o.pay_status === 'paid' ? '<button class="btn pri" data-s="completed">Complete</button>' : ''}
      ${open && o.paid === 0 && can('pos', 2) ? '<button class="btn bad" id="oc">Cancel order</button>' : ''}${o.paid > 0 && o.pay_status !== 'refunded' && o.status !== 'cancelled' && can('orders', 3) ? '<button class="btn bad" id="ox">↩ Refund</button>' : ''}
      ${o.pay_status === 'paid' && can('accounting', 2) ? '<button class="btn" id="oe">🧾 E-invoice</button>' : ''}<button class="btn pbtn" id="opr">🖨 Print</button><button class="btn" id="ocl">Close</button></div>`, { size: 'wide' });
  const done = () => { closeModal(); changed && changed(); };
  $('#ocl', box).onclick = () => closeModal();
  $('#opr', box).onclick = () => printHTML(receiptHTML(o));
  if ($('#op', box)) $('#op', box).onclick = () => { closeModal(); payModal(o, changed); };
  if ($('#oa', box)) $('#oa', box).onclick = () => { closeModal(); P.resumeFor = o; location.hash = '#/pos'; if (S.page.target === 'pos') S.page.refresh && S.page.refresh(true); };
  if ($('#or', box)) $('#or', box).onclick = () => { closeModal(); P.resumeFor = o; P.resumeHeld = true; location.hash = '#/pos'; if (S.page.target === 'pos') S.page.refresh && S.page.refresh(true); };
  $$('[data-s]', box).forEach(b => b.onclick = async () => { if (await act(() => api('/pos/orders/' + id + '/status', 'POST', { status: b.dataset.s }), 'Updated ✔')) done(); });
  if ($('#oc', box)) $('#oc', box).onclick = async () => { const why = await reasonPick('cancel', 'Cancel this order'); if (why === null) return; if (await act(() => api('/pos/orders/' + id + '/cancel', 'POST', { reason: why }), 'Order cancelled')) done(); };
  if ($('#ox', box)) $('#ox', box).onclick = async () => { const why = await reasonPick('refund', 'Refund this order'); if (why === null) return; if (await act(() => api('/pos/orders/' + id + '/refund', 'POST', { reason: why }), 'Refunded ✔')) done(); };
  if ($('#oe', box)) $('#oe', box).onclick = async () => { if (await act(() => api('/acc/e-invoice', 'POST', { order_id: id }), 'E-invoice created ✔')) closeModal(); };
  $$('[data-v]', box).forEach(b => b.onclick = async () => { if (await confirmBox('Remove this item from the order?', 'Remove', true) && await act(() => api('/pos/items/' + b.dataset.v + '/void', 'POST', {}), 'Removed')) { closeModal(); orderModal(id, changed); changed && changed(); } });
}

async function reasonPick(type, title) {
  let list = [];
  try { list = (await lookup('reasons', { full: true })).filter(r => r.d && r.d.type === type); } catch (e) { }
  return new Promise(res => {
    const b = modal(`<h2>${esc(title)}</h2><label class="f">Reason</label><select id="rp">${list.map(r => opt(r.label, r.label)).join('')}<option value="__other">Other…</option></select><input id="ro" class="hide" placeholder="Type the reason" style="margin-top:8px"><div class="acts"><button class="btn" id="cn">Back</button><button class="btn bad solid" id="cy">Confirm</button></div>`, { layer: 2, sticky: true });
    const sel = $('#rp', b), oth = $('#ro', b);
    sel.onchange = () => oth.classList.toggle('hide', sel.value !== '__other');
    if (!list.length) { sel.value = '__other'; oth.classList.remove('hide'); }
    $('#cn', b).onclick = () => { closeModal(2); res(null); };
    $('#cy', b).onclick = () => { const v = sel.value === '__other' ? oth.value : sel.value; closeModal(2); res(v || 'No reason given'); };
  });
}

/* ---------- payment ---------- */
async function payModal(order, done) {
  let o = order.payments ? order : await api('/pos/orders/' + order.id);
  const tipsOpt = String((S.cfg.pos && S.cfg.pos.tips) || '5,10,15').split(',').map(x => +x.trim()).filter(x => x > 0);
  let tip = o.tip, rows = [{ method: ['cash', 'card', 'upi', 'wallet', 'other'].includes(o.pay_mode) ? o.pay_mode : 'cash', amount: '' }];
  const subtotalBase = () => o.subtotal - o.discount;
  const dueNow = () => (o.total - o.tip + tip) - o.paid;
  const box = modal(`<div id="pm"></div>`, { size: 'wide', sticky: true });
  const draw = () => {
    const due = dueNow(), entered = rows.reduce((a, r) => a + (r.method === 'loyalty' ? 0 : toMinor(r.amount)), 0);
    const cashRows = rows.filter(r => r.method === 'cash').reduce((a, r) => a + toMinor(r.amount), 0);
    const change = Math.max(0, entered - due), remaining = Math.max(0, due - entered);
    $('#pm', box).innerHTML = `<div style="display:flex;gap:10px;align-items:baseline;flex-wrap:wrap"><h2>Take payment · ${esc(o.no)}</h2><span class="muted">${esc(nice(o.channel))}${o.table_name ? ' · ' + esc(o.table_name) : ''}</span></div>
      <div class="grid" style="grid-template-columns:1fr 1fr;gap:18px;margin-top:8px">
      <div><div class="sum"><div><span>Subtotal</span><span>${money(o.subtotal)}</span></div>${o.discount ? `<div><span>Discount</span><span>-${money(o.discount)}</span></div>` : ''}<div><span>Tax</span><span>${money(o.tax)}</span></div>${o.service ? `<div><span>Service</span><span>${money(o.service)}</span></div>` : ''}${o.delivery_fee ? `<div><span>Delivery</span><span>${money(o.delivery_fee)}</span></div>` : ''}<div><span>Tip</span><span>${money(tip)}</span></div>${o.paid ? `<div><span>Already paid</span><span>-${money(o.paid)}</span></div>` : ''}<div class="t"><span>Amount due</span><span>${money(due)}</span></div></div>
        <label class="f">Add a tip</label><div class="pill-row"><button class="btn sm ${tip === 0 ? 'pri' : ''}" data-t="0">None</button>${tipsOpt.map(p => `<button class="btn sm ${tip === Math.round(subtotalBase() * p / 100) ? 'pri' : ''}" data-t="${p}">${p}%</button>`).join('')}<input id="tc" type="number" step="0.01" placeholder="Custom" style="width:90px"></div></div>
      <div><label class="f" style="margin-top:0">Payment method</label><div class="paym">${PAY_METHODS.map(m => `<button data-m="${m[0]}">${m[1]}</button>`).join('')}</div>
        <div style="margin-top:10px">${rows.map((r, i) => `<div class="ln" style="display:grid;grid-template-columns:110px 1fr ${r.method === 'gift_card' || r.method === 'loyalty' ? '1fr' : ''} auto;gap:6px;margin-bottom:6px;align-items:center"><b>${esc(nice(r.method))}</b>${r.method === 'loyalty' ? `<input data-pt="${i}" type="number" placeholder="Points to use" value="${attr(r.points || '')}">` : `<input data-a="${i}" type="number" step="0.01" placeholder="Amount" value="${attr(r.amount)}">`}${r.method === 'gift_card' ? `<input data-r="${i}" placeholder="Card code" value="${attr(r.ref || '')}">` : r.method === 'loyalty' ? '<span class="muted">1 point = ' + money(100) + '</span>' : ''}<button class="btn sm bad" data-x="${i}">✕</button></div>`).join('')}</div>
        <div class="pill-row"><button class="btn sm" id="ex">Exact amount</button>${[50, 100, 200, 500, 2000].map(v => `<button class="btn sm" data-q="${v}">+${v}</button>`).join('')}</div>
        ${change > 0 ? `<div class="okmsg" style="font-size:18px">Change to give back: <b>${money(change)}</b></div>` : remaining > 0 && entered > 0 ? `<div class="err">Still to pay: <b>${money(remaining)}</b> (part payments are allowed)</div>` : ''}</div></div>
      <div class="err inline hide" id="pe"></div><div class="acts" style="align-items:center"><label class="pbtn" style="display:flex;gap:7px;align-items:center;margin-right:auto;font-weight:600"><input type="checkbox" id="pprint" ${pref('printpay', true) ? 'checked' : ''}> 🖨 Print receipt after payment</label><button class="btn pbtn" id="pbill">🧾 Print bill first</button><button class="btn" id="pc">Cancel</button><button class="btn ok lg" id="pp" ${entered <= 0 && !rows.some(r => r.method === 'loyalty' && r.points) ? 'disabled' : ''}>Confirm payment</button></div>`;
    $$('[data-t]', box).forEach(b => b.onclick = () => { const p = +b.dataset.t; tip = p ? Math.round(subtotalBase() * p / 100) : 0; draw(); });
    $('#tc', box).onchange = e => { tip = toMinor(e.target.value); draw(); };
    $$('[data-m]', box).forEach(b => b.onclick = () => { const used = rows.reduce((a, r) => a + toMinor(r.amount), 0); rows = rows.filter(r => r.amount || r.points || r.method !== 'cash' ? true : false); rows.push({ method: b.dataset.m, amount: b.dataset.m === 'loyalty' ? '' : (Math.max(0, dueNow() - used) / 100 || '').toString() }); draw(); });
    $$('[data-a]', box).forEach(i => i.oninput = () => { rows[+i.dataset.a].amount = i.value; refreshSummary(); });
    $$('[data-pt]', box).forEach(i => i.oninput = () => { rows[+i.dataset.pt].points = i.value; });
    $$('[data-r]', box).forEach(i => i.oninput = () => { rows[+i.dataset.r].ref = i.value; });
    $$('[data-x]', box).forEach(b => b.onclick = () => { rows.splice(+b.dataset.x, 1); if (!rows.length) rows = [{ method: 'cash', amount: '' }]; draw(); });
    $('#ex', box).onclick = () => { const used = rows.slice(0, -1).reduce((a, r) => a + toMinor(r.amount), 0); rows[rows.length - 1].amount = (Math.max(0, dueNow() - used) / 100).toString(); draw(); };
    $$('[data-q]', box).forEach(b => b.onclick = () => { rows[rows.length - 1].amount = ((toMinor(rows[rows.length - 1].amount) / 100 || 0) + +b.dataset.q).toString(); draw(); });
    $('#pc', box).onclick = () => closeModal();
    $('#pprint', box).onchange = e => setPref('printpay', e.target.checked);
    $('#pbill', box).onclick = () => printHTML(receiptHTML({ ...o, tip, total: o.total - o.tip + tip }));
    $('#pp', box).onclick = async () => {
      const err = $('#pe', box); err.classList.add('hide');
      const payments = rows.map(r => ({ method: r.method, amount: toMinor(r.amount), ref: r.ref || '', points: +r.points || 0 })).filter(p => p.amount > 0 || p.points > 0);
      $('#pp', box).disabled = true;
      try {
        const r = await api('/pos/orders/' + o.id + '/pay', 'POST', { payments, tip });
        const wantPrint = $('#pprint', box).checked;
        closeModal(); done && done(r.order);
        const fin = r.order;
        const b2 = modal(`<h2>${fin.pay_status === 'paid' ? '✅ Payment complete' : 'Part payment saved'}</h2>${r.change > 0 ? `<div class="okmsg" style="font-size:20px">Give change: <b>${money(r.change)}</b></div>` : ''}<p class="muted">${fin.pay_status === 'paid' ? 'Order ' + esc(fin.no) + ' is paid.' : 'Still due: ' + money(fin.total - fin.paid)}</p><div class="acts"><button class="btn pbtn" id="rp">🖨 Print receipt</button><button class="btn pri" id="rc">Done</button></div>`, { sticky: true });
        $('#rp', b2).onclick = () => printHTML(receiptHTML(fin));
        $('#rc', b2).onclick = () => closeModal();
        if (wantPrint && can('printing', 2)) printHTML(receiptHTML(fin));
      } catch (e) { err.textContent = e.message; err.classList.remove('hide'); $('#pp', box).disabled = false; }
    };
  };
  const refreshSummary = () => { const due = dueNow(), entered = rows.reduce((a, r) => a + (r.method === 'loyalty' ? 0 : toMinor(r.amount)), 0); const btn = $('#pp', box); if (btn) btn.disabled = entered <= 0 && !rows.some(r => r.method === 'loyalty' && r.points); };
  draw();
}

/* ====================================================================
   POS screen
   ==================================================================== */
const isOp = () => S.me && S.me.role === 'pos_operator';
const P = { payMode: '', nameOnBill: '', cat: 0, q: '', channel: 'dine_in', table: null, customer: null, cart: [], disc: null, voucher: '', note: '', tab: 'tables', tables: [], orders: [], session: null, resumeFor: null, resumeHeld: false, zone: 0, schedule: '', address: '', phone: '', zoneId: 0, openOrder: null };

function cartTotals() {
  const incl = S.cfg.pos && S.cfg.pos.inclusive;
  let sub = 0, tax = 0;
  P.cart.forEach(l => { const g = l.unit * l.qty; sub += g; tax += incl ? g - g / (1 + l.rate / 100) : g * l.rate / 100; });
  let disc = 0;
  if (P.disc) disc = P.disc.type === 'percent' ? sub * Math.min(100, P.disc.value) / 100 : Math.min(sub, P.disc.value * 100);
  const f = sub ? (sub - disc) / sub : 1;
  tax *= f;
  const svc = P.channel === 'dine_in' ? (sub - disc) * (+(S.cfg.pos && S.cfg.pos.service) || 0) / 100 : 0;
  return { sub, disc: Math.round(disc), tax: Math.round(tax), svc: Math.round(svc), total: Math.round(sub - disc + svc + (incl ? 0 : tax)) };
}

PAGES.pos = () => ({
  events: ['order', 'tables', 'res:products', 'res:categories', 'res:options', 'res:taxes', 'res:tables', 'res:pos_sessions', 'res:customers'],
  async render(el, pg) {
    const menu = await loadMenuData();
    P.session = await api('/pos/session').catch(() => null);
    const regs = await lookup('registers').catch(() => []);
    el.classList.add('posview');
    el.innerHTML = `<div id="sbar"></div><div class="pos two"><section id="pl"></section><section id="pc"></section></div>`;
    const sessBar = () => {
      const s = P.session;
      $('#sbar', el).innerHTML = `<div class="toolbar" style="margin-bottom:8px">${s ? `<span class="chip ok">● Session open</span><span class="muted">${esc((regs.find(r => r.id === s.register) || {}).label || 'Register')} · since ${esc(String(s.opened_at || '').replace('T', ' '))} · opened with ${money(s.opening_cash)}</span><span class="muted">Cash sales ${money(s.cash_sales)}</span>` : '<span class="chip pending">No open session</span><span class="muted">Open a session to track the cash drawer (optional).</span>'}
        <span class="right"></span>${s ? '<button class="btn sm" id="cm">💸 Cash movement</button><button class="btn sm" id="cd">🖥 Customer display</button><button class="btn sm bad" id="cs">Close session</button>' : '<button class="btn sm pri" id="so">Open session</button>'}</div>`;
      if ($('#so', el)) $('#so', el).onclick = openSessionBox;
      if ($('#cs', el)) $('#cs', el).onclick = closeSessionBox;
      if ($('#cm', el)) $('#cm', el).onclick = () => openForm('cash_moves', null, async () => { P.session = await api('/pos/session').catch(() => null); sessBar(); }, { session: s.id });
      if ($('#cd', el)) $('#cd', el).onclick = async () => { const r = await api('/pos/display-key?register=' + s.register); window.open(r.url, '_blank'); };
    };
    const openSessionBox = () => {
      const box = modal(`<h2>Open cash session</h2><label class="f">Register</label><select id="sr">${regs.map(r => opt(r.id, r.label)).join('')}</select><label class="f">Opening cash in the drawer (${esc(S.cfg.currency.symbol)})</label><input id="sc" type="number" step="0.01" value="0"><div class="err inline hide" id="se"></div><div class="acts"><button class="btn" id="c">Cancel</button><button class="btn pri" id="o">Open session</button></div>`);
      $('#c', box).onclick = () => closeModal();
      $('#o', box).onclick = async () => { try { await api('/pos/session/open', 'POST', { register: +$('#sr', box).value, opening_cash: toMinor($('#sc', box).value) }); closeModal(); P.session = await api('/pos/session'); sessBar(); toast('Session opened ✔'); } catch (e) { $('#se', box).textContent = e.message; $('#se', box).classList.remove('hide'); } };
    };
    const closeSessionBox = () => {
      const s = P.session, exp = s.opening_cash + s.cash_sales - s.cash_refunds + s.moves_in - s.moves_out;
      const box = modal(`<h2>Close session</h2><div class="sum"><div><span>Opening cash</span><span>${money(s.opening_cash)}</span></div><div><span>Cash sales</span><span>${money(s.cash_sales)}</span></div><div><span>Cash refunds</span><span>-${money(s.cash_refunds)}</span></div><div><span>Paid in</span><span>${money(s.moves_in)}</span></div><div><span>Paid out</span><span>-${money(s.moves_out)}</span></div><div class="t"><span>Should be in the drawer</span><span>${money(exp)}</span></div></div><label class="f">Count the cash and type the total (${esc(S.cfg.currency.symbol)})</label><input id="cc" type="number" step="0.01"><label class="f">Note</label><input id="cn" placeholder="optional"><div class="err inline hide" id="se"></div><div class="acts"><button class="btn" id="c">Cancel</button><button class="btn bad solid" id="o">Close session</button></div>`);
      $('#c', box).onclick = () => closeModal();
      $('#o', box).onclick = async () => { try { const r = await api('/pos/session/close', 'POST', { closing_cash: toMinor($('#cc', box).value), note: $('#cn', box).value }); closeModal(); P.session = null; sessBar(); const d = r.difference; toast(d === 0 ? 'Session closed - drawer matches ✔' : `Session closed. Difference ${money(d)}`, d !== 0); } catch (e) { $('#se', box).textContent = e.message; $('#se', box).classList.remove('hide'); } };
    };

    /* ----- left: products ----- */
    const drawProducts = () => {
      const cats = menu.categories, q = P.q.toLowerCase();
      const list = menu.products.filter(p => (!P.cat || p.category === P.cat) && (!q || (p.name + (p.sku || '') + (p.barcode || '')).toLowerCase().includes(q)));
      $('#pl', el).innerHTML = `<div class="ph"><input type="search" id="ps" placeholder="🔍 Search or scan barcode…" value="${attr(P.q)}" style="flex:1"></div><div class="cats"><button class="tab ${!P.cat ? 'on' : ''}" data-c="0">All</button>${cats.map(c => `<button class="tab ${P.cat === c.id ? 'on' : ''}" data-c="${c.id}">${c.emoji ? c.emoji + ' ' : ''}${esc(c.name)}</button>`).join('')}</div>
        <div class="pb"><div class="prods">${list.map(p => `<button class="prod ${p.available ? '' : 'off'}" data-p="${p.id}">${p.image ? `<img class="ph-img" src="${attr(p.image)}" loading="lazy" style="height:54px">` : `<span class="em">${p.emoji || '🍽'}</span>`}<b>${esc(p.name)}</b><span>${money(p.price)}</span></button>`).join('') || '<div class="empty">No items</div>'}</div></div>`;
      $('#ps', el).oninput = e => { P.q = e.target.value; const pos = e.target.selectionStart; drawProducts(); const n = $('#ps', el); n.focus(); n.setSelectionRange(pos, pos); };
      $('#ps', el).onkeydown = e => { if (e.key === 'Enter') { const m = menu.products.find(p => p.barcode === P.q || p.sku === P.q); if (m) { addProduct(m); P.q = ''; drawProducts(); } } };
      $$('[data-c]', el).forEach(b => b.onclick = () => { P.cat = +b.dataset.c; drawProducts(); });
      $$('[data-p]', el).forEach(b => b.onclick = () => addProduct(menu.products.find(p => p.id === +b.dataset.p)));
    };
    const addProduct = p => {
      const opts = (p.options || []).map(id => menu.options.find(o => o.id === id)).filter(Boolean);
      if (!opts.length) return pushLine(p, [], 1, '');
      const box = modal(`<h2>${esc(p.name)}</h2><div class="muted">${money(p.price)}</div>${opts.map(o => `<label class="f">${esc(o.name)}${o.required ? ' *' : ''}</label><div class="multi" style="max-height:none">${o.choices.map((c, i) => `<label><input type="${o.kind === 'multiple' ? 'checkbox' : 'radio'}" name="o${o.id}" data-o="${o.id}" value="${attr(c.name)}" data-pr="${c.price}"> ${esc(c.name)} ${c.price ? `<small class="muted">+${money(c.price)}</small>` : ''}</label>`).join('')}</div>`).join('')}<label class="f">Quantity</label><input id="oq" type="number" min="1" max="99" value="1"><label class="f">Note for the kitchen</label><input id="on" placeholder="e.g. no onions"><div class="acts"><button class="btn" id="c">Cancel</button><button class="btn pri" id="a">Add to order</button></div>`);
      $('#c', box).onclick = () => closeModal();
      $('#a', box).onclick = () => { const ch = $$('input[data-o]:checked', box).map(i => ({ option: +i.dataset.o, choice: i.value, price: +i.dataset.pr })); const miss = opts.find(o => o.required && !ch.some(c => c.option === o.id)); if (miss) return toast('Please choose ' + miss.name, true); closeModal(); pushLine(p, ch, Math.max(1, +$('#oq', box).value || 1), $('#on', box).value); };
    };
    const pushLine = (p, ch, qty, note) => {
      if (P.channel === 'dine_in' && !P.table && !P.openOrder && !P.cart.length && !P.asked) { P.asked = true; setTimeout(openTables, 150); } // ask "which table?" up front
      const unit = p.price + ch.reduce((a, c) => a + c.price, 0), key = p.id + '|' + ch.map(c => c.option + c.choice).join(',') + '|' + note;
      const ex = P.cart.find(l => l.key === key);
      if (ex) ex.qty = Math.min(99, ex.qty + qty); else P.cart.push({ key, pid: p.id, name: p.name, unit, rate: p.tax_rate, qty, note, opts: ch, label: ch.map(c => c.choice).join(', ') });
      drawCart(); pushDisplay();
    };

    /* ----- centre: cart ----- */
    const drawCart = () => {
      const T = cartTotals(), canDisc = S.cfg.pos && S.cfg.pos.discount !== false, canPay = can('orders', 2);
      const oo = P.openOrder;
      const chanOpts = CHANNELS.map(c => `<option value="${c[0]}" ${P.channel === c[0] ? 'selected' : ''}>${c[1]}</option>`).join('');
      const custLabel = P.customer ? esc(P.customer.name) : P.nameOnBill ? esc(P.nameOnBill) : 'Customer';
      $('#pc', el).innerHTML = `<div class="chead">
          <select id="pch" class="chsel" title="Order type">${chanOpts}</select>
          ${P.channel === 'dine_in' ? `<button class="btn sm ${P.table ? 'pri' : ''}" id="pt">🪑 ${P.table ? esc(P.table.name) : 'Table'}</button>` : ''}
          <button class="btn sm ${P.customer || P.nameOnBill ? 'pri' : ''}" id="pcu" title="Customer / name on the bill">👤 ${custLabel}</button>
          ${P.channel === 'delivery' ? `<button class="btn sm ${P.address ? 'pri' : ''}" id="pad">📍 ${P.address ? 'Address ✓' : 'Address'}</button>` : ''}${['pre_order', 'catering'].includes(P.channel) ? `<button class="btn sm ${P.schedule ? 'pri' : ''}" id="psc">🗓 ${P.schedule ? esc(P.schedule.replace('T', ' ').slice(5)) : 'When?'}</button>` : ''}
          <button class="btn sm" id="pord" title="Open orders">📋 <span class="chip" id="pordn">${P.orders.length}</span></button>
        </div>
        ${oo ? `<div class="okmsg" style="margin:0 12px 6px;padding:6px 10px;font-size:13px">Adding to bill <b>${esc(oo.no.split('-').pop())}</b> (${money(oo.total)}) · <a href="#" id="nobill">new order instead</a></div>` : ''}
        <div class="cartl">${P.cart.length ? P.cart.map((l, i) => `<div class="line"><span><b>${esc(l.name)}</b>${l.label ? `<br><small class="muted">${esc(l.label)}</small>` : ''}${l.note ? `<br><small class="muted">📝 ${esc(l.note)}</small>` : ''}<br><small class="muted">${money(l.unit)}</small></span><span class="qty"><button data-m="${i}">−</button><b>${l.qty}</b><button data-pl="${i}">+</button></span><b>${money(l.unit * l.qty)}</b></div>`).join('') : '<div class="empty">Tap items to add them<br><small>or scan a barcode</small></div>'}</div>
        <div class="cfoot">
          <div class="crow"><select id="ppm" class="paysel" title="How will the guest pay?"><option value="">Pay by…</option>${[['cash', '💵 Cash'], ['card', '💳 Card'], ['upi', '📱 UPI'], ['other', 'Other']].map(m => `<option value="${m[0]}" ${P.payMode === m[0] ? 'selected' : ''}>${m[1]}</option>`).join('')}</select>${canDisc ? `<button class="btn sm ${P.disc || P.voucher ? 'pri' : ''}" id="pdi">🏷 ${P.disc ? (P.disc.type === 'percent' ? P.disc.value + '%' : money(P.disc.value * 100)) : P.voucher ? esc(P.voucher) : 'Discount'}</button>` : ''}<button class="btn sm ${P.note ? 'pri' : ''}" id="pno" title="Order note">📝</button></div>
          <div class="sum"><div class="mini"><span>Subtotal ${money(T.sub)}${T.disc ? ' · Discount -' + money(T.disc) : ''}${T.svc ? ' · Service ' + money(T.svc) : ''} · ${S.cfg.pos && S.cfg.pos.inclusive ? 'Tax (incl.)' : 'Tax'} ${money(T.tax)}</span></div><div class="t"><span>Total</span><span>${money(T.total)}</span></div></div>
          <div class="printopts pbtn"><label><input type="checkbox" id="pkb" ${pref('printbill', isOp()) ? 'checked' : ''}> 🧾 Print bill</label><label><input type="checkbox" id="pkk" ${pref('printkot', false) ? 'checked' : ''}> 🍳 Print kitchen ticket</label></div>
          <div class="cbtns"><button class="btn sm" id="hold" ${P.cart.length ? '' : 'disabled'} ${S.cfg.pos && S.cfg.pos.hold === false ? 'style="display:none"' : ''}>⏸ Hold</button><button class="btn sm" id="clr" ${P.cart.length ? '' : 'disabled'}>✕ Clear</button>
          <button class="btn pri lg" id="send" ${P.cart.length && can('pos', 2) ? '' : 'disabled'}>👨‍🍳 Send to kitchen</button>${canPay ? `<button class="btn ok lg" id="fire" ${P.cart.length ? '' : 'disabled'}>⚡ Pay & fire</button>` : (can('printing', 2) ? `<button class="btn lg" id="sendbill" style="border-color:var(--pri)" ${P.cart.length && can('pos', 2) ? '' : 'disabled'}>🖨 Send & print bill</button>` : '')}</div>
        </div>`;
      $('#pkb', el).onchange = e => setPref('printbill', e.target.checked); $('#pkk', el).onchange = e => setPref('printkot', e.target.checked);
      $('#pch', el).onchange = e => { P.channel = e.target.value; if (P.channel !== 'dine_in') { P.table = null; P.openOrder = null; } drawCart(); };
      $$('[data-m]', el).forEach(b => b.onclick = () => { const l = P.cart[+b.dataset.m]; l.qty--; if (l.qty < 1) P.cart.splice(+b.dataset.m, 1); drawCart(); pushDisplay(); });
      $$('[data-pl]', el).forEach(b => b.onclick = () => { P.cart[+b.dataset.pl].qty = Math.min(99, P.cart[+b.dataset.pl].qty + 1); drawCart(); pushDisplay(); });
      if ($('#pt', el)) $('#pt', el).onclick = () => openTables();
      $('#pord', el).onclick = () => openOrders();
      $('#ppm', el).onchange = e => { P.payMode = e.target.value; };
      $('#pcu', el).onclick = customerBox;
      if ($('#pad', el)) $('#pad', el).onclick = addressBox;
      if ($('#psc', el)) $('#psc', el).onclick = async () => { const v = await promptBox('When is it needed?', 'Date and time', P.schedule, { type: 'datetime-local' }); if (v !== null) { P.schedule = v; drawCart(); } };
      if ($('#pdi', el)) $('#pdi', el).onclick = discountBox;
      $('#pno', el).onclick = async () => { const v = await promptBox('Order note', '', P.note, { textarea: true }); if (v !== null) { P.note = v; drawCart(); } };
      if ($('#nobill', el)) $('#nobill', el).onclick = e => { e.preventDefault(); P.openOrder = null; P.table = null; drawCart(); drawRight(); };
      $('#clr', el).onclick = async () => { if (await confirmBox('Clear the whole cart?', 'Clear', true)) clearCart(); };
      $('#hold', el).onclick = () => submit('hold');
      $('#send', el).onclick = () => submit('send');
      if ($('#sendbill', el)) $('#sendbill', el).onclick = () => submit('send', true);
      if ($('#fire', el)) $('#fire', el).onclick = () => submit('fire');
    };
    const clearCart = () => { P.cart = []; P.disc = null; P.voucher = ''; P.note = ''; P.customer = null; P.nameOnBill = ''; P.payMode = ''; P.table = null; P.openOrder = null; P.address = ''; P.phone = ''; P.schedule = ''; P.asked = false; drawCart(); drawRight(); pushDisplay(); };
    const pushDisplay = debounce(() => { if (P.session) api('/pos/display', 'POST', { register: P.session.register, cart: { items: P.cart.map(l => ({ name: l.name, qty: l.qty, total: l.unit * l.qty, label: l.label })), totals: cartTotals(), customer: P.customer ? P.customer.name : '' } }).catch(() => { }); }, 400);

    const submit = async (mode, forceBill) => {
      if (!P.cart.length) return;
      if (P.channel === 'dine_in' && !P.table && !P.openOrder) { openTables(); return; }
      const body = { channel: P.channel, table_id: P.table ? P.table.id : 0, customer_id: P.customer ? P.customer.id : 0, customer: P.customer ? P.customer.name : P.nameOnBill, phone: P.phone || (P.customer && P.customer.phone) || '', address: P.address, note: P.note,
        voucher: P.voucher, pay_mode: P.payMode, disc_type: P.disc ? P.disc.type : '', disc_value: P.disc ? P.disc.value * (P.disc.type === 'fixed' ? 100 : 1) : 0, hold: mode === 'hold', zone: P.zoneId, scheduled_at: P.schedule ? Math.floor(new Date(P.schedule).getTime() / 1000) : 0,
        order_id: P.openOrder ? P.openOrder.id : (P.resumeHeld && P.resumeFor ? P.resumeFor.id : 0), replace: !!(P.resumeHeld && P.resumeFor),
        items: P.cart.map(l => ({ product_id: l.pid, qty: l.qty, note: l.note, options: l.opts.map(o => ({ option: o.option, choice: o.choice })) })) };
      const btn = mode === 'fire' ? $('#fire', el) : mode === 'hold' ? $('#hold', el) : $('#send', el); btn.disabled = true;
      try {
        const o = await api('/pos/orders', 'POST', body);
        P.resumeFor = null; P.resumeHeld = false;
        if (mode === 'hold') toast(`Order ${o.no} held ⏸`); else toast(`Order ${o.no} ${P.openOrder ? 'updated' : 'sent to the kitchen'} ✔`);
        const mayPrint = can('printing', 2), wantBill = mayPrint && mode !== 'hold' && mode !== 'fire' && (forceBill || ($('#pkb', el) && $('#pkb', el).checked)), wantKot = mayPrint && mode !== 'hold' && $('#pkk', el) && $('#pkk', el).checked;
        clearCart();
        if (wantBill || wantKot) { const full = await api('/pos/orders/' + o.id); printHTML((wantBill ? receiptHTML(full) : '') + (wantBill && wantKot ? PAGEBREAK : '') + (wantKot ? kotHTML(full) : '')); }
        if (mode === 'fire') { const full = await api('/pos/orders/' + o.id); payModal(full, () => refreshRight()); }
        refreshRight();
      } catch (e) { toast(e.message, true); btn.disabled = false; }
    };

    /* ----- pickers ----- */
    const customerBox = async () => {
      const all = await lookup('customers', { full: true });
      const box = modal(`<h2>Customer</h2><input id="cq" placeholder="🔍 Search name or phone" autofocus><div id="cl" style="max-height:260px;overflow:auto;margin-top:8px"></div><h4 style="margin:12px 0 4px">Just put a name on the bill</h4><input id="cnb" maxlength="60" placeholder="Name to print on the bill" value="${attr(P.nameOnBill)}"><h4 style="margin:12px 0 4px">Or add a new customer</h4><div class="fgrid"><div><input id="cn" placeholder="Name"></div><div><input id="cp" placeholder="Phone"></div></div><div class="acts">${P.customer ? '<button class="btn bad" id="cx">Remove customer</button>' : ''}<button class="btn" id="cc">Close</button><button class="btn" id="cs">Use this name</button><button class="btn pri" id="ca">Add & select</button></div>`);
      const show = () => { const q = $('#cq', box).value.toLowerCase(); $('#cl', box).innerHTML = all.filter(c => !q || (c.label + (c.d.phone || '')).toLowerCase().includes(q)).slice(0, 40).map(c => `<div class="row" style="cursor:pointer" data-i="${c.id}"><span><b>${esc(c.label)}</b><br><small class="muted">${esc(c.d.phone || '')}</small></span><span class="muted">⭐ ${num(c.d.points)} ${esc(c.d.tier || '')}</span></div>`).join('') || '<div class="empty">No match</div>'; $$('[data-i]', box).forEach(r => r.onclick = () => { const c = all.find(x => x.id === +r.dataset.i); P.customer = { id: c.id, name: c.label, phone: c.d.phone, points: c.d.points, address: c.d.address }; if (!P.address && c.d.address) P.address = c.d.address; closeModal(); drawCart(); pushDisplay(); }); };
      $('#cq', box).oninput = show; show();
      $('#cc', box).onclick = () => closeModal();
      $('#cs', box).onclick = () => { P.nameOnBill = $('#cnb', box).value.trim(); P.customer = null; closeModal(); drawCart(); };
      if ($('#cx', box)) $('#cx', box).onclick = () => { P.customer = null; closeModal(); drawCart(); };
      $('#ca', box).onclick = async () => { const n = $('#cn', box).value.trim(); if (!n) return toast('Enter a name', true); const r = await act(() => api('/r/customers', 'POST', { name: n, phone: $('#cp', box).value })); if (r) { invalidateLookup('customers'); P.customer = { id: r.id, name: r.name, phone: r.phone }; closeModal(); drawCart(); } };
    };
    const addressBox = async () => {
      const zones = await lookup('delivery_zones', { full: true }).catch(() => []);
      const box = modal(`<h2>Delivery details</h2><label class="f">Phone *</label><input id="ph" value="${attr(P.phone || (P.customer && P.customer.phone) || '')}"><label class="f">Address *</label><textarea id="ad">${esc(P.address)}</textarea><label class="f">Delivery zone</label><select id="zn">${opt(0, 'Default fee', !P.zoneId)}${zones.map(z => opt(z.id, z.label + ' · ' + money(z.d.fee), z.id === P.zoneId)).join('')}</select><div class="acts"><button class="btn" id="c">Cancel</button><button class="btn pri" id="s">Save</button></div>`);
      $('#c', box).onclick = () => closeModal();
      $('#s', box).onclick = () => { P.phone = $('#ph', box).value; P.address = $('#ad', box).value; P.zoneId = +$('#zn', box).value; closeModal(); drawCart(); };
    };
    const discountBox = async () => {
      const presets = (await lookup('discounts', { full: true }).catch(() => [])).filter(d => d.d && d.status === 'active');
      const box = modal(`<h2>Discount</h2>${presets.length ? `<label class="f">Ready-made discounts</label><div class="pill-row">${presets.map(d => `<button class="btn sm" data-d="${d.id}">${esc(d.label)}</button>`).join('')}</div>` : ''}<label class="f">Manual discount</label><div style="display:grid;grid-template-columns:120px 1fr;gap:8px"><select id="dt"><option value="percent">Percent %</option><option value="fixed">Amount ${esc(S.cfg.currency.symbol)}</option></select><input id="dv" type="number" step="0.01" placeholder="0" value="${P.disc ? P.disc.value : ''}"></div><label class="f">Voucher code</label><input id="vc" placeholder="e.g. WELCOME10" value="${attr(P.voucher)}"><div class="acts"><button class="btn bad" id="dx">Remove all</button><button class="btn" id="dc">Cancel</button><button class="btn pri" id="ds">Apply</button></div>`);
      $$('[data-d]', box).forEach(b => b.onclick = () => { const d = presets.find(x => x.id === +b.dataset.d); P.disc = { type: d.d.type, value: d.d.type === 'fixed' ? d.d.value / 100 : d.d.value }; closeModal(); drawCart(); });
      $('#dc', box).onclick = () => closeModal();
      $('#dx', box).onclick = () => { P.disc = null; P.voucher = ''; closeModal(); drawCart(); };
      $('#ds', box).onclick = () => { const v = +$('#dv', box).value; P.disc = v > 0 ? { type: $('#dt', box).value, value: v } : null; P.voucher = $('#vc', box).value.trim().toUpperCase(); closeModal(); drawCart(); };
    };

    /* ----- right: tables & orders ----- */
    const refreshRight = async () => {
      try { [P.tables, P.orders] = await Promise.all([api('/pos/tables').catch(() => []), api('/pos/orders' + qs({ status: 'held,pending,preparing,ready,served', limit: 80, items: 1 })).then(r => r.rows.filter(o => o.pay_status !== 'paid' || o.status !== 'completed')).catch(() => [])]); } catch (e) { }
      drawRight();
    };
    const drawRight = () => { const n = $('#pordn', el); if (n) n.textContent = P.orders.length; };
    /* Table picker: a small pop-up grid. Free table = select it; busy table = show ONLY that table's bill. */
    const openTables = () => {
      const zones = {}; P.tables.forEach(t => (zones[t.zone || 'Tables'] = zones[t.zone || 'Tables'] || []).push(t));
      const box = modal(`<div style="display:flex;align-items:center;gap:10px"><h2>🪑 Which table?</h2><span class="right muted" style="font-size:12px"><span class="chip available">free</span> <span class="chip occupied">busy</span> <span class="chip cleaning">cleaning</span></span></div>
        <div id="tpick" style="max-height:62vh;overflow:auto">${P.tables.length ? Object.keys(zones).map(z => `<h4 style="margin:8px 2px 5px;font-size:12px;color:var(--mut);text-transform:uppercase">${esc(z)}</h4><div class="tgrid small">${zones[z].map(t => `<div class="tbl ${t.order ? "occupied" : t.status} ${P.table && P.table.id === t.id ? "sel" : ""}" data-t="${t.id}" title="${attr(t.name + ' · ' + t.seats + ' seats')}"><b>${esc(t.name)}</b>${t.order ? `<small>${money(t.order.total)}</small>` : `<small>${t.seats}p</small>`}${t.reserved_next ? '<small style="color:#7c3aed">⏰</small>' : ''}</div>`).join('')}</div>`).join('') : '<div class="empty">No tables set up. Add them under Floor & Tables.</div>'}</div>
        <div class="acts"><button class="btn" id="tcx">Close</button></div>`, { size: 'wide' });
      $('#tcx', box).onclick = () => closeModal();
      $$('[data-t]', box).forEach(d => d.onclick = () => { closeModal(); pickTable(P.tables.find(t => t.id === +d.dataset.t)); });
    };
    const openOrders = () => {
      const body = P.orders.length ? `<div class="ogrid">${P.orders.map(o => `<div class="card ord" style="padding:10px"><div class="hd"><b>${esc(o.no.split('-').slice(-2).join('-'))} · ${esc(o.table_name || nice(o.channel))}</b>${chip(o.status)}</div><div class="muted" style="font-size:12px">${esc(ago(o.created_at))}${o.customer ? ' · ' + esc(o.customer) : ''}</div><div style="font-size:13px">${o.items.filter(i => i.status !== 'void').slice(0, 4).map(i => `${i.qty}× ${esc(i.name)}`).join(', ')}${o.items.length > 4 ? '…' : ''}</div><div class="hd"><b>${money(o.total)}</b>${chip(o.pay_status)}</div><div class="acts">${o.status === 'held' ? '<button class="btn sm pri" data-r="' + o.id + '">▶ Resume</button>' : '<button class="btn sm" data-a="' + o.id + '">+ Add</button>'}${o.pay_status !== 'paid' && can('orders', 2) ? `<button class="btn sm ok" data-pay="${o.id}">💰 Pay</button>` : ''}<button class="btn sm" data-v="${o.id}">View</button><button class="btn sm pbtn" data-pr="${o.id}">🖨</button></div></div>`).join('')}</div>` : '<div class="empty">No open orders</div>';
      const box = modal(`<h2>📋 Open orders</h2><div style="max-height:66vh;overflow:auto">${body}</div><div class="acts"><button class="btn" id="ocx">Close</button></div>`, { size: 'wide' });
      $('#ocx', box).onclick = () => closeModal();
      $$('[data-r]', box).forEach(b => b.onclick = () => { closeModal(); resume(P.orders.find(o => o.id === +b.dataset.r), true); });
      $$('[data-a]', box).forEach(b => b.onclick = () => { closeModal(); resume(P.orders.find(o => o.id === +b.dataset.a), false); });
      $$('[data-pay]', box).forEach(b => b.onclick = () => { closeModal(); payModal(P.orders.find(o => o.id === +b.dataset.pay), refreshRight); });
      $$('[data-v]', box).forEach(b => b.onclick = () => { closeModal(); orderModal(+b.dataset.v, refreshRight); });
      $$('[data-pr]', box).forEach(b => b.onclick = () => printOrder(+b.dataset.pr));
    };
    const pickTable = async t => {
      if (t.order) { // busy table: show ONLY this table's bill
        let o;
        try { o = await api('/pos/orders/' + t.order.id); } catch (e) {
          // not allowed to open someone else's bill (POS operator): show only a summary
          const bx = modal(`<h2>${esc(t.name)}</h2><p>This table has a bill taken by another person (${chip(t.order.status)}, ${money(t.order.total)}).<br><span class="muted">You can only open and print your own bills.</span></p><div class="acts"><button class="btn" id="bc">Close</button></div>`);
          $('#bc', bx).onclick = () => closeModal();
          return;
        }
        const live = o.items.filter(i => i.status !== 'void'), due = o.total - o.paid;
        const box = modal(`<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><h2>${esc(t.name)}</h2><span class="muted">bill ${esc(o.no)}</span>${chip(o.status)}${chip(o.pay_status)}<span class="right muted">${esc(ago(o.created_at))}</span></div>
          <div class="tw" style="max-height:40vh;overflow:auto"><table class="t"><thead><tr><th>Item</th><th class="num">Qty</th><th class="num">Amount</th></tr></thead><tbody>${live.map(i => `<tr><td>${esc(i.name)}${i.options ? `<br><small class="muted">${esc(i.options)}</small>` : ''}</td><td class="num">${i.qty}</td><td class="num">${money(i.price * i.qty)}</td></tr>`).join('')}</tbody></table></div>
          <div class="sum" style="max-width:280px;margin-left:auto;margin-top:8px"><div><span>Subtotal</span><span>${money(o.subtotal)}</span></div>${o.discount ? `<div><span>Discount</span><span>-${money(o.discount)}</span></div>` : ''}<div><span>Tax</span><span>${money(o.tax)}</span></div><div class="t"><span>Total</span><span>${money(o.total)}</span></div>${due > 0 ? `<div style="color:var(--bad);font-weight:800"><span>Due</span><span>${money(due)}</span></div>` : ''}</div>
          <div class="acts"><button class="btn" id="tc2">Table options</button><button class="btn pbtn" id="tpr">🖨 Print bill</button>${can('orders', 2) && due > 0 ? '<button class="btn ok" id="tpay">💰 Pay</button>' : ''}<button class="btn pri" id="ta">+ Add items</button></div>`, { size: 'wide' });
        $('#tpr', box).onclick = () => printHTML(receiptHTML(o));
        $('#tc2', box).onclick = () => { closeModal(); tableMenu(t, refreshRight); };
        if ($('#tpay', box)) $('#tpay', box).onclick = () => { closeModal(); payModal(o, refreshRight); };
        $('#ta', box).onclick = () => { closeModal(); P.channel = 'dine_in'; P.table = { id: t.id, name: t.name }; P.openOrder = o; drawCart(); drawRight(); };
        return;
      }
      if (['blocked', 'merged', 'cleaning'].includes(t.status)) return tableMenu(t, refreshRight);
      P.channel = 'dine_in'; P.table = { id: t.id, name: t.name }; P.openOrder = null; drawCart(); drawRight();
    };
    const resume = async (o, held) => {
      const full = await api('/pos/orders/' + o.id);
      if (held) {
        if (P.cart.length && !(await confirmBox('Replace what is in the cart with this held order?', 'Replace'))) return;
        P.cart = full.items.filter(i => i.status !== 'void').map(i => ({ key: 'r' + i.id, pid: i.product_id, name: i.name, unit: i.price, rate: i.tax_pct, qty: i.qty, note: i.note, opts: [], label: i.options }));
        P.channel = full.channel; P.table = full.table_id ? { id: full.table_id, name: full.table_name } : null; P.customer = full.customer_id ? { id: full.customer_id, name: full.customer, phone: full.phone } : null; P.note = full.note; P.address = full.address;
        P.resumeFor = full; P.resumeHeld = true; P.openOrder = null; P.voucher = full.voucher || ''; P.disc = full.disc_type ? { type: full.disc_type, value: full.disc_type === 'fixed' ? full.disc_value / 100 : full.disc_value } : null;
        toast('Held order loaded - change it and send, or pay'); drawCart();
      } else { P.channel = full.channel; P.table = full.table_id ? { id: full.table_id, name: full.table_name } : null; P.openOrder = full; P.resumeFor = null; P.resumeHeld = false; drawCart(); toast('New items will be added to ' + full.no); }
      drawRight();
    };

    pg.refresh = async force => {
      if (force === true) { /* coming back from an order screen */ }
      const m = await loadMenuData().catch(() => menu); Object.assign(menu, m);
      P.session = await api('/pos/session').catch(() => P.session); sessBar(); drawProducts();
      if (P.resumeFor) { const o = P.resumeFor; const held = P.resumeHeld; P.resumeFor = null; P.resumeHeld = false; await resume(o, held); } else await refreshRight();
    };
    sessBar(); drawProducts(); drawCart();
    await pg.refresh();
  },
});


/* ---------- table QR card: restaurant name + logo + QR, ready to print or stand on the table ---------- */
function qrCardHTML(tableName, img) {
  const c = S.cfg, col = c.color || '#f97316', ap = c.app || {}, logo = safeUrl(c.logo);
  return `<div style="width:148mm;height:209mm;box-sizing:border-box;position:relative;overflow:hidden;font-family:'Segoe UI',Arial,sans-serif;color:#1f2937;background:linear-gradient(165deg,#ffffff 0%,#fff6ec 100%)">
    <div style="height:66mm;background:linear-gradient(135deg,${col},#9a3412);color:#fff;text-align:center;padding-top:11mm;position:relative">
      <div style="position:absolute;right:-18mm;top:-18mm;width:60mm;height:60mm;border-radius:50%;background:rgba(255,255,255,.12)"></div><div style="position:absolute;left:-14mm;bottom:-24mm;width:50mm;height:50mm;border-radius:50%;background:rgba(255,255,255,.10)"></div>
      <div style="width:25mm;height:25mm;border-radius:50%;background:#fff;margin:0 auto 4mm;overflow:hidden;display:flex;align-items:center;justify-content:center;box-shadow:0 3mm 8mm rgba(0,0,0,.25);position:relative">${logo ? `<img src="${attr(logo)}" style="width:100%;height:100%;object-fit:cover">` : '<span style="font-size:15mm">🍴</span>'}</div>
      <div style="font-size:23px;font-weight:800;letter-spacing:.3px;position:relative">${esc(c.restaurant || '')}</div>${c.tagline ? `<div style="font-size:12px;opacity:.9;margin-top:1mm;position:relative">${esc(c.tagline)}</div>` : ''}
    </div>
    <div style="width:100mm;margin:-14mm auto 0;background:#fff;border-radius:9mm;box-shadow:0 4mm 14mm rgba(0,0,0,.18);padding:7mm 6mm 6mm;text-align:center;position:relative">
      <div style="display:inline-block;background:${col};color:#fff;border-radius:99px;padding:1.6mm 9mm;font-size:21px;font-weight:800;letter-spacing:1px">TABLE ${esc(tableName)}</div>
      <div style="margin:5mm auto 3mm;width:68mm;height:68mm;padding:3mm;border:1.6mm solid ${col};border-radius:7mm;box-sizing:border-box"><img src="${img}" style="width:100%;height:100%;display:block"></div>
      <div style="font-size:17px;font-weight:800">Scan to see our menu</div><div style="font-size:13px;color:#6b7280">and order straight from your phone</div>
    </div>
    <div style="display:flex;justify-content:center;gap:5mm;margin-top:9mm;text-align:center;font-size:12px;font-weight:700">
      ${[['1', 'Scan the code'], ['2', 'Choose dishes'], ['3', 'Place the order']].map(s => `<div style="width:30mm"><div style="width:9mm;height:9mm;line-height:9mm;border-radius:50%;background:${col};color:#fff;margin:0 auto 1.5mm;font-size:14px">${s[0]}</div>${s[1]}</div>`).join('')}
    </div>
    <div style="position:absolute;left:0;right:0;bottom:6mm;text-align:center;font-size:11px;color:#6b7280">We bring it to your table ${ap.phone ? ' · ☎ ' + esc(ap.phone) : ''}</div>
  </div>`;
}

/* ---------- table options menu (also used by the Tables page) ---------- */
async function tableMenu(t, changed) {
  const users = await api('/users/brief').catch(() => []);
  const box = modal(`<h2>${esc(t.name)}</h2><div class="muted">${esc(t.zone || '')} · ${t.seats} seats · ${chip(t.status)}</div>
    ${t.order ? `<p>Open bill <b>${esc(t.order.no)}</b> · ${money(t.order.total)}</p>` : ''}
    <label class="f">Set status</label><div class="pill-row">${['available', 'occupied', 'cleaning', 'reserved', 'blocked'].map(s => `<button class="btn sm ${t.status === s ? 'pri' : ''}" data-s="${s}">${nice(s)}</button>`).join('')}</div>
    <label class="f">Assigned waiter</label><select id="tw">${opt(0, '— none —', !t.waiter)}${users.filter(u => ['waiter', 'manager', 'cashier'].includes(u.role)).map(u => opt(u.id, u.name, u.id === t.waiter)).join('')}</select>
    <div class="acts">${t.order ? '<button class="btn" id="tb">View bill</button>' : ''}<button class="btn" id="tx">Close</button><button class="btn pri" id="ts">Save waiter</button></div>`);
  $$('[data-s]', box).forEach(b => b.onclick = async () => { if (await act(() => api('/pos/tables/' + t.id + '/status', 'POST', { status: b.dataset.s }), 'Table updated')) { closeModal(); changed && changed(); } });
  $('#ts', box).onclick = async () => { if (await act(() => api('/pos/tables/' + t.id + '/status', 'POST', { waiter: +$('#tw', box).value }), 'Saved ✔')) { closeModal(); changed && changed(); } };
  $('#tx', box).onclick = () => closeModal();
  if ($('#tb', box)) $('#tb', box).onclick = () => { closeModal(); orderModal(t.order.id, changed); };
}

/* ====================================================================
   Kitchen display
   ==================================================================== */
PAGES.kds = () => ({
  events: ['order'],
  async render(el, pg) {
    const stations = await lookup('stations').catch(() => []);
    const st = { station: localStorage.kdsStation || '', seen: new Set(), first: true };
    const showTimer = !!(S.cfg.kitchen && S.cfg.kitchen.show_timer);
    const warn = (S.cfg.kitchen && S.cfg.kitchen.warn) || 10, late = (S.cfg.kitchen && S.cfg.kitchen.late) || 20;
    el.innerHTML = `<div class="page-h"><div><h1>Kitchen display</h1><div class="hint">New tickets appear here by themselves. Tap an item when it is cooking or ready.</div></div><div class="acts"><select id="ks" style="width:auto"><option value="">All stations</option>${stations.map(s => opt(s.label, s.label, s.label === st.station)).join('')}</select><label class="btn pbtn" id="kpl" style="cursor:pointer" title="Prints a kitchen ticket by itself for every new order that reaches this screen"><input type="checkbox" id="kprint" style="margin-right:6px"> 🖨 Auto-print tickets</label><button class="btn" id="ksound">🔔 Sound on</button></div></div><div class="kcols" id="kc"></div>`;
    const autoDefault = !!(S.cfg.kitchen && S.cfg.kitchen.auto_print);
    let autoPrint = can('printing', 2) && (localStorage.getItem('kds_autoprint') === null ? autoDefault : localStorage.getItem('kds_autoprint') === '1');
    $('#kprint', el).checked = autoPrint;
    const printed = new Set(JSON.parse(sessionStorage.getItem('kds_printed') || '[]'));
    let chain = Promise.resolve();
    const printTicket = o => { printed.add(o.id); sessionStorage.setItem('kds_printed', JSON.stringify([...printed].slice(-300))); chain = chain.then(() => { printHTML(kotHTML(o)); return new Promise(r => setTimeout(r, 1200)); }); };
    let sound = true, data = [];
    const beep = () => { if (!sound) return; try { const a = new (window.AudioContext || window.webkitAudioContext)(), o = a.createOscillator(), g = a.createGain(); o.connect(g); g.connect(a.destination); o.frequency.value = 880; g.gain.value = .15; o.start(); setTimeout(() => { o.stop(); a.close(); }, 250); } catch (e) { } };
    const age = o => Math.floor((Date.now() / 1000 - o.created_at) / 60);
    const draw = () => {
      const col = (s, title) => {
        const list = data.filter(o => o.status === s);
        return `<div class="kcol"><h3>${title} <span class="chip ${s}">${list.length}</span></h3>${list.map(o => {
          const m = age(o), cls = s === 'ready' ? 'fine' : m >= late ? 'late' : m >= warn ? 'warn' : '';
          return `<div class="card tk ${cls}"><div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><span class="onum">#${esc(o.no.split('-').pop())}</span><b style="font-size:17px;flex:1;text-align:right">${esc(o.table_name || nice(o.channel))}</b>${showTimer ? `<span class="timer">${m} min</span>` : ''}</div><div class="muted" style="font-size:12px">${esc(o.no)} · ${esc(nice(o.channel))}${o.customer ? ' · ' + esc(o.customer) : ''}</div>${o.note ? `<div class="chip pending" style="margin:4px 0">📝 ${esc(o.note)}</div>` : ''}
            ${o.items.filter(i => i.status !== 'void').map(i => `<div class="it ${i.status === 'ready' || i.status === 'served' ? 'done' : ''}"><span><b>${i.qty} ×</b> ${esc(i.name)}${i.options ? `<br><small class="muted">${esc(i.options)}</small>` : ''}${i.note ? `<br><small style="color:var(--bad)">📝 ${esc(i.note)}</small>` : ''}</span>${i.status === 'pending' ? `<button class="btn sm" data-i="${i.id}" data-to="preparing">Start</button>` : i.status === 'preparing' ? `<button class="btn sm ok" data-i="${i.id}" data-to="ready">Ready</button>` : chip(i.status)}</div>`).join('')}
            <div style="display:flex;gap:6px;margin-top:8px">${s === 'pending' ? `<button class="btn pri block" data-o="${o.id}" data-to="preparing">Start all</button>` : s === 'preparing' ? `<button class="btn ok block" data-o="${o.id}" data-to="ready">All ready ✔</button>` : `<button class="btn block" data-o="${o.id}" data-to="served">Picked up / served</button>`}</div></div>`;
        }).join('') || '<div class="empty">Nothing here</div>'}</div>`;
      };
      $('#kc', el).innerHTML = col('pending', '🆕 New') + col('preparing', '🔥 Cooking') + col('ready', '✅ Ready');
      $$('[data-i]', el).forEach(b => b.onclick = async () => { if (await act(() => api('/pos/items/' + b.dataset.i + '/status', 'POST', { status: b.dataset.to }))) load(); });
      $$('[data-o]', el).forEach(b => b.onclick = async () => { if (await act(() => api('/pos/orders/' + b.dataset.o + '/status', 'POST', { status: b.dataset.to }))) load(); });
    };
    const load = async () => {
      data = await api('/pos/kds' + qs({ station: st.station }));
      const fresh = data.filter(o => !st.seen.has(o.id) && o.status === 'pending');
      if (!st.first && fresh.length && (!S.cfg.kitchen || S.cfg.kitchen.sound !== false)) beep();
      if (autoPrint) data.filter(o => o.status === 'pending' && !printed.has(o.id) && (!st.first || false)).forEach(printTicket);
      data.forEach(o => { st.seen.add(o.id); if (st.first) printed.add(o.id); }); st.first = false; draw();
    };
    pg.refresh = load;
    const timer = setInterval(() => { if (S.page === pg) draw(); else clearInterval(timer); }, 30000);
    $('#ks', el).onchange = e => { st.station = e.target.value; localStorage.kdsStation = st.station; load(); };
    $('#kprint', el).onchange = e => { autoPrint = e.target.checked; localStorage.setItem('kds_autoprint', autoPrint ? '1' : '0'); toast(autoPrint ? 'New tickets will print automatically on this screen' : 'Auto-print is off'); };
    $('#ksound', el).onclick = e => { sound = !sound; e.target.textContent = sound ? '🔔 Sound on' : '🔕 Sound off'; };
    await load();
  },
});

/* ====================================================================
   Tables board (floor management)
   ==================================================================== */
PAGES.tables = () => ({
  events: ['tables', 'order', 'res:tables'],
  async render(el, pg) {
    let filter = '';
    el.innerHTML = `<div class="page-h"><div><h1>Tables</h1><div class="hint">See every table at a glance. Click one for options, the QR code for guest ordering, or to edit it.</div></div><div class="acts">${can('floor', 2) ? '<button class="btn pri" id="tn">+ New table</button>' : ''}<button class="btn" id="tq">🖨 Print all QR codes</button></div></div>
      <div class="toolbar"><div class="tabs" id="tf"><button class="tab on" data-f="">All</button>${['available', 'occupied', 'cleaning', 'reserved', 'blocked'].map(s => `<button class="tab" data-f="${s}">${nice(s)}</button>`).join('')}</div></div><div id="tb"></div>`;
    let tables = [], full = {};
    const draw = () => {
      const zones = {}; tables.filter(t => !filter || t.status === filter).forEach(t => (zones[t.zone || 'No zone'] = zones[t.zone || 'No zone'] || []).push(t));
      $('#tb', el).innerHTML = Object.keys(zones).map(z => `<h3 style="margin:10px 2px 6px">${esc(z)}</h3><div class="tgrid" style="margin-bottom:12px">${zones[z].map(t => `<div class="tbl ${t.status}" data-t="${t.id}"><b>${esc(t.name)}</b><small>${t.seats} seats${S.me.branch_id || !S.branch ? '' : ''}</small><br>${chip(t.status)}${t.order ? `<br><small>${esc(t.order.no.split('-').pop())} · ${money(t.order.total)}</small>` : ''}</div>`).join('')}</div>`).join('') || '<div class="card empty">No tables.</div>';
      $$('[data-t]', el).forEach(d => d.onclick = () => tableCard(tables.find(t => t.id === +d.dataset.t)));
    };
    const tableCard = async t => {
      const rec = await api('/r/tables/' + t.id).catch(() => ({}));
      const url = location.origin + '/qr?t=' + (rec.qr_token || '');
      const img = rec.qr_token ? await qrDataURL(url, 200) : '';
      const card = img ? qrCardHTML(t.name, img) : '';
      const box = modal(`<h2>${esc(t.name)} <small class="muted">${esc(t.zone || '')}</small></h2><div style="display:flex;gap:18px;flex-wrap:wrap;align-items:flex-start"><div style="min-width:200px;flex:1">${chip(t.status)}<p class="muted">${t.seats} seats${t.order ? `<br>Open bill ${esc(t.order.no)} · ${money(t.order.total)}` : ''}</p><div class="pill-row">${t.order ? '<button class="btn sm" id="vb">View bill</button>' : ''}<button class="btn sm" id="to">Table options</button>${can('floor', 2) ? '<button class="btn sm" id="te">✎ Edit</button>' : ''}</div>
        ${img ? `<div class="pill-row" style="margin-top:12px"><button class="btn pri" id="tp">🖨 Print QR card</button><a class="btn" href="${attr(url)}" target="_blank" rel="noopener">Open guest page ↗</a></div><div class="muted" style="font-size:12px;margin-top:6px">Guests scan the card, see the menu and order for this table.</div>` : ''}</div>
        ${img ? `<div style="width:67mm;height:95mm;overflow:hidden;border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.2);flex:none"><div style="transform:scale(.452);transform-origin:top left;width:148mm;height:209mm">${card}</div></div>` : ''}</div><div class="acts"><button class="btn" id="tc">Close</button></div>`, { size: 'wide' });
      $('#tc', box).onclick = () => closeModal();
      if ($('#vb', box)) $('#vb', box).onclick = () => { closeModal(); orderModal(t.order.id, load); };
      $('#to', box).onclick = () => { closeModal(); tableMenu(t, load); };
      if ($('#te', box)) $('#te', box).onclick = () => { closeModal(); openForm('tables', rec, load); };
      if ($('#tp', box)) $('#tp', box).onclick = () => printHTML(card, { paper: 'A5', margin: '0' });
    };
    const load = async () => { tables = await api('/pos/tables'); draw(); };
    pg.refresh = load;
    $('#tf', el).onclick = e => { const b = e.target.closest('.tab'); if (!b) return; filter = b.dataset.f; $$('#tf .tab', el).forEach(x => x.classList.toggle('on', x === b)); draw(); };
    if ($('#tn', el)) $('#tn', el).onclick = () => openForm('tables', null, load);
    $('#tq', el).onclick = async () => {
      const recs = (await api('/r/tables?limit=500')).rows;
      const cards = await Promise.all(recs.map(async r => qrCardHTML(r.name, await qrDataURL(location.origin + '/qr?t=' + r.qr_token, 400))));
      printHTML(cards.join('<!--pagebreak-->'), { paper: 'A5', margin: '0' });
    };
    await load();
  },
});
