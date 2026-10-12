'use strict';
/* pages_delivery.js - Delivery dashboard, deliveries, dispatch board, live tracking, financials */

const DSTATUS = ['pending', 'assigned', 'accepted', 'picked_up', 'on_the_way', 'delivered', 'failed', 'cancelled'];
const NEXTD = { assigned: [['accepted', 'Accepted'], ['picked_up', 'Picked up']], accepted: [['picked_up', 'Picked up']], picked_up: [['on_the_way', 'On the way'], ['delivered', 'Delivered']], on_the_way: [['delivered', 'Delivered ✔'], ['failed', 'Failed']], failed: [['pending', 'Re-dispatch']] };

PAGES.delivery_dash = () => widgetDash({
  key: 'dash-delivery', title: 'Delivery dashboard', nav: 'delivery_dash', hint: 'Monitor delivery workload, service speed, SLA health and cash collection.', range: 'today', events: ['res:deliveries'],
  ranges: [['today', 'Today'], ['7d', 'Last 7 days'], ['30d', 'Last 30 days'], ['month', 'This month']],
  load: range => { const [a, b] = rangeFor(range); return api('/delivery/dash' + qs({ from: a, to: b })); },
  widgets: [
    { id: 'total', title: 'Total deliveries', stat: true, render: d => stat('Total deliveries', num(d.total), '<span class="muted">Created in the selected period</span>') },
    { id: 'active', title: 'Active now', stat: true, tone: 3, render: d => stat('Active now', num(d.active), '<span class="chip pending">● Live now</span>') },
    { id: 'delivered', title: 'Delivered', stat: true, tone: 2, render: d => stat('Delivered', num(d.delivered), '<span class="muted">Completed in the period</span>') },
    { id: 'cod', title: 'Unresolved COD', stat: true, tone: 4, render: d => stat('Unresolved COD', num(d.unresolved_cod), '<span class="muted">Collected but not yet settled</span>') },
    { id: 'trend', title: 'Delivery volume trend', w: 2, sub: 'Deliveries created over time', render: d => barChart(d.trend.map(x => ({ label: x.label, value: x.deliveries })), num) },
    { id: 'outcomes', title: 'Delivery outcomes', w: 2, sub: 'Completed delivery results', render: d => donut(Object.entries(d.outcomes).map(([k, v]) => ({ label: nice(k), value: v })).filter(x => x.value)) },
    { id: 'funnel', title: 'Workflow funnel', w: 2, sub: 'Progress through delivery stages', render: d => hbars([['Created', (d.total)], ['Assigned', d.funnel._assigned || 0], ['Picked up', d.funnel._picked || 0], ['Delivered', d.delivered]].map(x => ({ label: x[0], value: x[1] })), num) },
    { id: 'sla', title: 'Timing & SLA', w: 2, sub: 'Speed and live service health', render: d => `<div class="grid g3" style="gap:8px"><div><div class="big">${d.avg_pickup_min}</div><small class="muted">min avg pickup</small></div><div><div class="big">${d.avg_delivery_min}</div><small class="muted">min avg delivery</small></div><div><div class="big">${d.monitored}</div><small class="muted">monitored</small></div></div><div style="margin-top:10px"><span class="chip ok">${d.on_track} on track</span> <span class="chip failed">${d.delayed} delayed</span></div>` },
    { id: 'methods', title: 'Delivery method split', w: 2, sub: 'Internal fleet versus partners', render: d => donut(Object.entries(d.methods).map(([k, v]) => ({ label: nice(k), value: v }))) },
    { id: 'codstat', title: 'COD settlement statuses', w: 2, sub: 'Cash settlement workflow', render: d => donut(Object.entries(d.cod_status).map(([k, v]) => ({ label: nice(k), value: v }))) },
  ],
});

/* ---------- assign / status helpers ---------- */
async function assignBox(d, done) {
  const [drivers, couriers] = await Promise.all([lookup('drivers', { full: true }).catch(() => []), lookup('couriers', { full: true }).catch(() => [])]);
  const box = modal(`<h2>Assign ${esc(d.order)}</h2><p class="muted">${esc(d.customer || '')} · ${esc(d.address || '')}</p><label class="f">Your own rider</label><div>${drivers.filter(x => x.status !== 'inactive').map(x => `<div class="row"><span><b>${esc(x.label)}</b> <small class="muted">${esc(x.d.vehicle || '')}</small></span><span>${chip(x.status)} <button class="btn sm pri" data-d="${x.id}" ${x.status === 'offline' ? 'disabled' : ''}>Assign</button></span></div>`).join('') || '<div class="muted">No riders yet</div>'}</div>
    ${couriers.filter(x => x.status === 'active').length ? `<label class="f">Outside courier</label>${couriers.filter(x => x.status === 'active').map(x => `<div class="row"><span><b>${esc(x.label)}</b></span><button class="btn sm" data-p="${x.id}">Send</button></div>`).join('')}` : ''}<div class="acts"><button class="btn" id="c">Close</button></div>`);
  $('#c', box).onclick = () => closeModal();
  $$('[data-d]', box).forEach(b => b.onclick = async () => { if (await act(() => api('/delivery/' + d.id + '/assign', 'POST', { driver: +b.dataset.d }), 'Assigned ✔')) { closeModal(); done && done(); } });
  $$('[data-p]', box).forEach(b => b.onclick = async () => { if (await act(() => api('/delivery/' + d.id + '/assign', 'POST', { provider: +b.dataset.p }), 'Sent to courier ✔')) { closeModal(); done && done(); } });
}
async function setDStatus(d, to, done) {
  let reason = '';
  if (to === 'failed') { reason = await promptBox('Why did it fail?', 'Reason', 'Customer not reachable'); if (reason === null) return; }
  if (await act(() => api('/delivery/' + d.id + '/status', 'POST', { status: to, reason }), 'Updated ✔')) done && done();
}

/* ---------- deliveries list ---------- */
PAGES.deliveries = () => ({
  events: ['res:deliveries', 'order'],
  async render(el, pg) {
    const st = { page: 1, status: pg.params.status || '', q: '' }, limit = 25;
    el.innerHTML = `<div class="page-h"><div><h1>Deliveries</h1><div class="hint">Every delivery order. Assign a rider, follow it, close it out.</div></div><div class="acts"><a class="btn" href="#/dispatch">🗺 Dispatch monitor</a></div></div><div class="toolbar"><input class="q" id="dq" placeholder="🔍 Order, customer, phone"><div class="tabs" id="ds"><button class="tab ${!st.status ? 'on' : ''}" data-s="">All</button>${DSTATUS.map(s => `<button class="tab ${st.status === s ? 'on' : ''}" data-s="${s}">${nice(s)}</button>`).join('')}</div></div><div id="db"></div>`;
    const load = async () => {
      const [r, drv] = await Promise.all([api('/r/deliveries' + qs({ page: st.page, limit, q: st.q, status: st.status })), labels('drivers').catch(() => ({}))]);
      $('#db', el).innerHTML = r.rows.length ? `<div class="tw"><table class="t"><thead><tr><th>Order</th><th>Customer</th><th>Address</th><th>Driver</th><th class="num">Fee</th><th>COD</th><th>Status</th><th></th></tr></thead><tbody>${r.rows.map(d => `<tr data-id="${d.id}"><td><b>${esc(d.order)}</b><br><small class="muted">${esc(ago(d.created_at))}</small></td><td>${esc(d.customer || '')}<br><small class="muted">${esc(d.phone || '')}</small></td><td style="max-width:220px">${esc(d.address || '')}</td><td>${d.method === 'partner' ? '<span class="chip">partner</span>' : esc(drv[d.driver] || '—')}</td><td class="num">${money(d.fee)}</td><td>${d.cod ? money(d.cod_amount) + '<br>' + chip(d.cod_status) : '—'}</td><td>${chip(d.status)}${d.sla_due && !['delivered', 'cancelled', 'failed'].includes(d.status) && Date.now() / 1000 > d.sla_due ? ' <span class="chip failed">late</span>' : ''}</td><td><div class="acts">${d.status === 'pending' && can('delivery', 2) ? `<button class="btn sm pri" data-a="${d.id}">Assign</button>` : ''}${(NEXTD[d.status] || []).filter(() => can('delivery', 2)).map(n => `<button class="btn sm" data-n="${d.id}|${n[0]}">${n[1]}</button>`).join('')}${d.tracking ? `<button class="btn sm" data-t="${attr(d.tracking)}" title="Customer tracking link">🔗</button>` : ''}</div></td></tr>`).join('')}</tbody></table></div>${pager(st, r.total, limit)}` : '<div class="card empty">No deliveries yet. Delivery orders taken in the POS appear here.</div>';
      bindPager($('#db', el), st, r.total, limit, load);
      $$('[data-a]', el).forEach(b => b.onclick = () => assignBox(r.rows.find(x => x.id === +b.dataset.a), load));
      $$('[data-n]', el).forEach(b => { const [id, to] = b.dataset.n.split('|'); b.onclick = () => setDStatus(r.rows.find(x => x.id === +id), to, load); });
      $$('[data-t]', el).forEach(b => b.onclick = () => promptBox('Tracking link', 'Send this to the customer', location.origin + '/track?c=' + b.dataset.t));
    };
    pg.refresh = load;
    $('#dq', el).oninput = debounce(e => { st.q = e.target.value; st.page = 1; load(); });
    $('#ds', el).onclick = e => { const b = e.target.closest('.tab'); if (!b) return; st.status = b.dataset.s; st.page = 1; $$('#ds .tab', el).forEach(x => x.classList.toggle('on', x === b)); load(); };
    await load();
  },
});

/* ---------- dispatch monitor ---------- */
PAGES.dispatch = () => ({
  events: ['res:deliveries', 'res:drivers', 'tracking', 'order'],
  async render(el, pg) {
    const load = async () => {
      const d = await api('/delivery/live');
      const cols = [['pending', 'Waiting for a rider'], ['assigned', 'Assigned'], ['picked_up', 'Picked up'], ['on_the_way', 'On the way']];
      const names = {}; d.drivers.forEach(x => names[x.id] = x.name);
      el.innerHTML = `<div class="page-h"><div><h1>Dispatch monitor</h1><div class="hint">Live board of everything on the road.</div></div></div>
        <div class="toolbar">${d.drivers.map(x => `<span class="chip ${x.status}">🛵 ${esc(x.name)} · ${x.status}</span>`).join('')}</div>
        <div class="board" style="grid-template-columns:repeat(4,minmax(220px,1fr))">${cols.map(c => { const l = d.deliveries.filter(x => x.status === c[0] || (c[0] === 'assigned' && x.status === 'accepted')); return `<div class="col"><h4>${c[1]} <span class="chip">${l.length}</span></h4>${l.map(x => `<div class="card" style="${x.late ? 'border-color:var(--bad)' : ''}"><b>${esc(x.order)}</b> ${x.late ? '<span class="chip failed">late</span>' : ''}<br><small class="muted">${esc(x.customer || '')} · ${esc(x.address || '')}</small>${x.driver ? `<br>🛵 ${esc(names[x.driver] || '')}` : ''}<div class="acts" style="display:flex;gap:5px;margin-top:6px;flex-wrap:wrap">${x.status === 'pending' ? `<button class="btn sm pri" data-a="${x.id}">Assign</button>` : ''}${(NEXTD[x.status] || []).map(n => `<button class="btn sm" data-n="${x.id}|${n[0]}">${n[1]}</button>`).join('')}</div></div>`).join('') || '<div class="muted" style="padding:6px">—</div>'}</div>`; }).join('')}</div>`;
      $$('[data-a]', el).forEach(b => b.onclick = () => assignBox(d.deliveries.find(x => x.id === +b.dataset.a), load));
      $$('[data-n]', el).forEach(b => { const [id, to] = b.dataset.n.split('|'); b.onclick = () => setDStatus(d.deliveries.find(x => x.id === +id), to, load); });
    };
    pg.refresh = load; await load();
  },
});

/* ---------- live tracking (plain map: positions scaled into the box) ---------- */
PAGES.tracking = () => ({
  events: ['tracking', 'res:deliveries'],
  async render(el, pg) {
    const load = async () => {
      const d = await api('/delivery/live');
      const pts = d.drivers.filter(x => x.lat).map(x => ({ ...x, t: 'd' })).concat(d.deliveries.filter(x => x.lat).map(x => ({ id: x.id, name: x.order, lat: x.lat, lng: x.lng, t: 'p', status: x.status })));
      const la = pts.map(p => p.lat), ln = pts.map(p => p.lng);
      const minA = Math.min(...la, 99), maxA = Math.max(...la, -99), minN = Math.min(...ln, 999), maxN = Math.max(...ln, -999);
      const pos = p => ({ x: 8 + (maxN === minN ? .5 : (p.lng - minN) / (maxN - minN)) * 84, y: 8 + (maxA === minA ? .5 : 1 - (p.lat - minA) / (maxA - minA)) * 82 });
      el.innerHTML = `<div class="page-h"><div><h1>Live tracking</h1><div class="hint">Where your riders are right now. Riders' phones send their location to the server; positions update automatically.</div></div><div class="acts"><button class="btn" id="tl">📍 Send test location</button></div></div>
        <div class="grid" style="grid-template-columns:2fr 1fr"><div class="map">${pts.map(p => { const q = pos(p); return `<div class="pin" style="left:${q.x}%;top:${q.y}%" title="${attr(p.name)}">${p.t === 'd' ? '🛵' : '📦'}<small>${esc(p.name)}</small></div>`; }).join('') || '<div class="empty">No positions reported yet</div>'}</div>
        <div class="card"><h3>Riders</h3>${d.drivers.map(x => `<div class="row"><span><b>${esc(x.name)}</b><br><small class="muted">${x.last_seen ? 'seen ' + esc(x.last_seen.replace('T', ' ')) : 'no signal'}</small></span>${chip(x.status)}</div>`).join('')}</div></div>`;
      $('#tl', el).onclick = async () => { const drv = d.drivers[0]; if (!drv) return toast('Add a driver first', true); if (await act(() => api('/delivery/location', 'POST', { driver: drv.id, lat: 18.94 + Math.random() * .05, lng: 72.82 + Math.random() * .05 }), 'Location sent for ' + drv.name)) load(); };
    };
    pg.refresh = load; await load();
  },
});

/* ---------- delivery financials ---------- */
PAGES.delivery_fin = () => ({
  events: ['res:deliveries'],
  async render(el, pg) {
    let range = '30d';
    el.innerHTML = `<div class="page-h"><div><h1>Financial analytics</h1><div class="hint">Delivery income, rider cost and cash on delivery.</div></div><div class="acts"><select id="fr">${RANGES.map(r => opt(r[0], r[1], r[0] === range)).join('')}</select></div></div><div id="fb"></div>`;
    const load = async () => {
      const [a, b] = rangeFor(range); const d = await api('/delivery/finance' + qs({ from: a, to: b }));
      $('#fb', el).innerHTML = `<div class="grid g4" style="margin-bottom:14px"><div class="card stat">${stat('Delivery fee income', money(d.fee_income), `<span class="muted">${num(d.deliveries)} deliveries</span>`)}</div><div class="card stat t3">${stat('Driver cost', money(d.driver_cost))}</div><div class="card stat t2">${stat('Margin', money(d.margin))}</div><div class="card stat t4">${stat('COD to collect', money(d.cod_outstanding), `<span class="muted">Settled ${money(d.cod_settled)}</span>`)}</div></div><div class="grid g2"><div class="card"><h3>Fees by zone</h3>${hbars(Object.entries(d.by_zone).map(([k, v]) => ({ label: k || 'No zone', value: v })), money)}</div><div class="card"><h3>Earnings by driver</h3>${hbars(Object.entries(d.by_driver).map(([k, v]) => ({ label: k || '—', value: v })), money)}<div class="row" style="margin-top:8px"><span>Pending payout</span><b>${money(d.earnings_pending)}</b></div><div class="row"><span>Paid out</span><b>${money(d.earnings_paid)}</b></div></div></div>`;
    };
    $('#fr', el).onchange = e => { range = e.target.value; load(); };
    pg.refresh = load; await load();
  },
});
