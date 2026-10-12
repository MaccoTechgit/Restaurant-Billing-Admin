'use strict';
/* pages_misc.js - Reports rail, services & integrations, passkeys */

function repPage(kind, title, hint, extra = {}) {
  return () => tablePage(Object.assign({
    title, hint, file: title, events: ['order'],
    load: p => api('/rep/' + kind + qs({ from: p.from, to: p.to, tz: p.tz, group: p.group })),
  }, extra));
}
PAGES.rep_sales = repPage('sales', 'Sales report', 'Sales grouped by day, week or month.', {
  filters: {
    html: '<select id="rg" style="width:auto"><option value="day">By day</option><option value="week">By week</option><option value="month">By month</option></select>',
    read: el => ({ group: $('#rg', el).value }), bind: (el, load) => { $('#rg', el).onchange = load; },
  },
  top: d => `<div class="grid g4" style="margin-bottom:14px"><div class="card stat">${stat('Orders', num(d.totals.orders || 0))}</div><div class="card stat t2">${stat('Items sold', num(d.totals.products || 0))}</div><div class="card stat t4">${stat('Tax', money(d.totals.tax || 0))}</div><div class="card stat t5">${stat('Total sales', money(d.totals.total || 0))}</div></div>`,
});
PAGES.rep_products = repPage('products', 'Product report', 'What sold, what it earned and what it cost.');
PAGES.rep_categories = repPage('categories', 'Category report', 'Sales by menu category.');
PAGES.rep_payments = repPage('payments', 'Payment methods', 'How customers paid, and what was refunded.');
PAGES.rep_tax = repPage('tax', 'Tax report', 'Tax collected by rate - ready for your tax return.');
PAGES.rep_staff = repPage('staff', 'Staff performance', 'Orders, sales, tips and discounts per team member.');
PAGES.rep_branches = repPage('branches', 'Branch comparison', 'Sales side by side for every branch.');
PAGES.rep_hours = repPage('hours', 'Hourly sales', 'Which hours of the day are busiest.');
PAGES.rep_voids = repPage('voids', 'Cancellations & refunds', 'Orders that were cancelled or refunded, with reasons.');
PAGES.rep_inventory = repPage('inventory', 'Inventory report', 'Stock on hand, its value and how fast it is used.');
PAGES.rep_delivery = repPage('delivery', 'Delivery report', 'Deliveries per rider or courier partner.');

/* ---------- services & integrations ---------- */
PAGES.services = () => ({
  events: ['settings'],
  async render(el, pg) {
    const load = async () => {
      const rows = await api('/services');
      const canEdit = can('settings', 2);
      el.innerHTML = `<div class="page-h"><div><h1>Services & integrations</h1><div class="hint">Notification channels: email, in-app, push, SMS and WhatsApp.</div></div></div><div class="grid g2">${rows.map(r => `<div class="card"><div style="display:flex;gap:10px;align-items:center"><h3>${esc(r.name)}</h3><span class="right"></span>${chip(r.active ? 'active' : 'inactive')}</div><div class="sub">${esc(r.desc)}</div><div class="muted" style="font-size:12.5px">Provider: <b>${esc(r.type || '—')}</b> · ${r.configured ? '<span style="color:var(--ok)">configured</span>' : '<span style="color:var(--warn)">needs setup</span>'}</div><div class="pill-row" style="margin-top:10px">${canEdit && r.key !== 'webhook' ? `<button class="btn sm ${r.active ? 'bad' : 'pri'}" data-t="${r.key}">${r.active ? 'Turn off' : 'Turn on'}</button>` : ''}<a class="btn sm" href="#/set:${r.link || 'services'}">Configure</a></div></div>`).join('')}</div>`;
      $$('[data-t]', el).forEach(b => b.onclick = async () => {
        const g = await api('/settings/services'); const k = b.dataset.t + '_on';
        if (b.dataset.t === 'email') { const e = await api('/settings/email'); await api('/settings/email', 'PUT', { ...e, enabled: !g[k] }); }
        await act(() => api('/settings/services', 'PUT', { ...g, [k]: !g[k] }), 'Updated ✔'); load();
      });
    };
    pg.refresh = load; await load();
  },
});

/* ---------- passkeys ---------- */
PAGES.passkeys = () => ({
  events: [],
  async render(el) {
    el.innerHTML = `<div class="page-h"><div><h1>Passkeys</h1><div class="hint">Passwordless sign-in with fingerprint, face or a security key.</div></div></div><div class="card" style="max-width:720px"><h3>Not available in this version</h3><p>Passkey (WebAuthn) sign-in needs a full cryptographic verification library and is <b>not included</b> yet, so the "Sign in with a passkey" button stays hidden.</p><p>For strong protection right now use <b>Two-factor authentication</b> (authenticator app) - it works for every account.</p><a class="btn pri" href="#/set:two_factor">Open two-factor settings</a></div>`;
  },
});


/* ======================= Support ======================= */
const TK_CAT = [['bug', '🐞 Something is broken'], ['billing', '🧾 Billing / payment'], ['kitchen', '👨‍🍳 Kitchen screen'], ['printing', '🖨 Printing'], ['login', '🔑 Login / access'], ['report', '📊 Wrong numbers / report'], ['other', '💬 Something else']];
const TK_STATUS = ['open', 'in_progress', 'resolved', 'closed'];
const tkChip = s => chip(s === 'in_progress' ? 'preparing' : s).replace(/>[^<]*</, '>' + esc(nice(s)) + '<');

function ticketThread(t, staff) {
  return `<div class="thread">${(t.replies || []).map(r => `<div class="msg ${r.staff ? 'staff' : ''}"><b>${esc(r.name)}${r.staff ? ' · support' : ''}</b><small>${esc(fdt(r.at))}</small><div>${esc(r.text).replace(/\n/g, '<br>')}</div></div>`).join('') || '<div class="muted" style="padding:8px">No replies yet.</div>'}</div>`;
}

async function openTicket(id, changed, staff) {
  let t;
  try { t = await api('/support/' + id); } catch (e) { return toast(e.message, true); }
  const box = modal(`<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><h2>${esc(t.no)}</h2>${tkChip(t.status)}${chip(t.priority === 'urgent' || t.priority === 'high' ? 'failed' : 'pending').replace(/>[^<]*</, '>' + esc(t.priority) + '<')}<span class="right muted">${esc(fdt(t.created_at))}</span></div>
    <h3 style="margin-top:6px">${esc(t.subject)}</h3><div class="muted" style="font-size:12.5px">${esc(nice(t.category))} · by ${esc(t.reporter)} (${esc(t.role)})${t.page ? ' · on screen <b>' + esc(t.page) + '</b>' : ''}</div>
    <div class="card" style="margin:10px 0;background:var(--bg)">${esc(t.message).replace(/\n/g, '<br>')}</div>${ticketThread(t)}
    ${t.status === 'closed' ? '<div class="muted">This ticket is closed.</div>' : '<textarea id="tr" placeholder="Write a reply…" style="margin-top:8px"></textarea>'}
    ${staff && t.agent ? `<details style="margin-top:8px"><summary class="muted">Technical details</summary><small class="muted">${esc(t.agent)}</small></details>` : ''}
    <div class="acts">${staff ? TK_STATUS.filter(s => s !== t.status).map(s => `<button class="btn sm ${s === 'resolved' ? 'ok' : ''}" data-s="${s}">Mark ${nice(s)}</button>`).join('') : ''}<button class="btn" id="tc">Close</button>${t.status === 'closed' ? '' : '<button class="btn pri" id="ts">Send reply</button>'}</div>`, { size: 'wide' });
  $('#tc', box).onclick = () => closeModal();
  if ($('#ts', box)) $('#ts', box).onclick = async () => { const v = $('#tr', box).value.trim(); if (!v) return; if (await act(() => api('/support/' + id + '/reply', 'POST', { text: v }), 'Sent ✔')) { closeModal(); changed && changed(); openTicket(id, changed, staff); } };
  $$('[data-s]', box).forEach(b => b.onclick = async () => { if (await act(() => api('/support/' + id + '/status', 'POST', { status: b.dataset.s }), 'Updated ✔')) { closeModal(); changed && changed(); openTicket(id, changed, staff); } });
}

function openSupport(tab) {
  const draw = async (t) => {
    const box = modal(`<div style="display:flex;align-items:center;gap:10px"><h2>🛟 Help & support</h2></div><div class="muted" style="font-size:13px">Something not working? Tell the super admin here - they get a notification straight away.</div>
      <div class="tabs" style="margin:12px 0"><button class="tab ${t === 'new' ? 'on' : ''}" data-t="new">Report a problem</button><button class="tab ${t === 'mine' ? 'on' : ''}" data-t="mine">My tickets</button></div><div id="sb"></div>`, { size: 'wide' });
    $$('[data-t]', box).forEach(x => x.onclick = () => draw(x.dataset.t));
    const sb = $('#sb', box);
    if (t === 'new') {
      sb.innerHTML = `<div class="fgrid"><div class="full"><label class="f">What is it about? *</label><input id="ts" maxlength="120" placeholder="e.g. Kitchen printer is not printing"></div>
        <div><label class="f">Type</label><select id="tcat">${TK_CAT.map(c => opt(c[0], c[1])).join('')}</select></div><div><label class="f">How urgent?</label><select id="tpri">${[['low', 'Low - when you can'], ['normal', 'Normal'], ['high', 'High - slowing us down'], ['urgent', 'Urgent - we cannot work']].map((c, i) => opt(c[0], c[1], i === 1)).join('')}</select></div>
        <div class="full"><label class="f">Tell us what happened *</label><textarea id="tm" style="min-height:120px" placeholder="What were you doing? What did you expect? What happened instead?"></textarea></div></div>
        <div class="muted" style="font-size:12px">We attach the screen you are on (<b>${esc(S.page ? S.page.target : '')}</b>) and your browser details to help find the cause.</div><div class="err inline hide" id="te"></div><div class="acts"><button class="btn" id="tx">Cancel</button><button class="btn pri" id="tsend">Send to support</button></div>`;
      $('#tx', box).onclick = () => closeModal();
      $('#tsend', box).onclick = async () => { try { const r = await api('/support', 'POST', { subject: $('#ts', box).value, message: $('#tm', box).value, category: $('#tcat', box).value, priority: $('#tpri', box).value, page: S.page ? S.page.target : '' }); closeModal(); toast('Sent ✔ ticket ' + r.no); openSupport('mine'); } catch (e) { $('#te', box).textContent = e.message; $('#te', box).classList.remove('hide'); } };
    } else {
      const rows = await api('/support/mine');
      sb.innerHTML = rows.length ? `<div class="tw"><table class="t"><thead><tr><th>Ticket</th><th>Problem</th><th>Status</th><th>Replies</th><th>Updated</th></tr></thead><tbody>${rows.map(r => `<tr class="click" data-id="${r.id}"><td><b>${esc(r.no)}</b></td><td>${esc(r.subject)}</td><td>${tkChip(r.status)}</td><td>${r.replies_n}</td><td>${esc(ago(r.updated_at))}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">You have not reported anything yet 🎉</div>';
      $$('tr[data-id]', sb).forEach(tr => tr.onclick = () => { closeModal(); openTicket(+tr.dataset.id, () => { }, false); });
    }
  };
  draw(tab || 'new');
}

PAGES.support_admin = () => ({
  events: ['res:support_tickets'],
  async render(el, pg) {
    const st = { page: 1, status: pg.params.status || '', q: '' };
    el.innerHTML = `<div class="page-h"><div><h1>Support inbox</h1><div class="hint">Problems reported by your team. Reply, then mark them resolved.</div></div></div><div id="sc" class="grid g4" style="margin-bottom:14px"></div><div class="toolbar"><input class="q" id="sq" placeholder="🔍 Ticket, title or person"><div class="tabs" id="stt"><button class="tab ${!st.status ? 'on' : ''}" data-s="">All</button>${TK_STATUS.map(s => `<button class="tab ${st.status === s ? 'on' : ''}" data-s="${s}">${nice(s)}</button>`).join('')}</div></div><div id="sl"></div>`;
    const staff = can('support', 2);
    const load = async () => {
      const r = await api('/support' + qs({ page: st.page, status: st.status, q: st.q }));
      $('#sc', el).innerHTML = TK_STATUS.map((s, i) => `<div class="card stat t${[3, 4, 2, 5][i]}"><div class="l">${nice(s)}</div><div class="v">${num(r.counts[s] || 0)}</div></div>`).join('');
      $('#sl', el).innerHTML = r.rows.length ? `<div class="tw"><table class="t"><thead><tr><th>Ticket</th><th>Problem</th><th>From</th><th>Type</th><th>Priority</th><th>Status</th><th>Replies</th><th>Updated</th></tr></thead><tbody>${r.rows.map(x => `<tr class="click" data-id="${x.id}"><td><b>${esc(x.no)}</b></td><td>${esc(x.subject)}</td><td>${esc(x.reporter)}<br><small class="muted">${esc(x.role)}${x.branch_id ? ' · ' + esc(S.branchName(x.branch_id)) : ''}</small></td><td>${esc(nice(x.category))}</td><td>${chip(x.priority === 'urgent' || x.priority === 'high' ? 'failed' : x.priority === 'low' ? 'ok' : 'pending').replace(/>[^<]*</, '>' + esc(x.priority) + '<')}</td><td>${tkChip(x.status)}</td><td>${x.replies_n}</td><td>${esc(ago(x.updated_at))}</td></tr>`).join('')}</tbody></table></div>${pager(st, r.total, r.limit)}` : '<div class="card empty">No tickets here. 🎉</div>';
      bindPager($('#sl', el), st, r.total, r.limit, load);
      $$('tr[data-id]', el).forEach(tr => tr.onclick = () => openTicket(+tr.dataset.id, load, staff));
    };
    pg.refresh = load;
    $('#sq', el).oninput = debounce(e => { st.q = e.target.value; st.page = 1; load(); });
    $('#stt', el).onclick = e => { const b = e.target.closest('.tab'); if (!b) return; st.status = b.dataset.s; st.page = 1; $$('#stt .tab', el).forEach(x => x.classList.toggle('on', x === b)); load(); };
    await load();
  },
});
