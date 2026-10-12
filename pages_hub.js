'use strict';
/* pages_hub.js - Hub dashboard, orders, payments, inventory, admin screens */

const stat = (label, value, extra = '') => `<div class="l">${esc(label)}</div><div class="v">${value}</div><div>${extra}</div>`;

/* ======================= Dashboard ======================= */
PAGES.dashboard = () => widgetDash({
  key: 'dash-hub', title: 'Dashboard', nav: 'dashboard', hint: 'Your restaurant at a glance', range: '7d', events: ['order'],
  load: (range) => { const [f, to] = rangeFor(range); return api('/dash/hub' + qs({ from: f, to, tz: tzMin() })); },
  defaultHidden: ['discounts', 'tips', 'cancel', 'service_time', 'new_customers', 'hourly', 'staff', 'categories'],
  widgets: [
    { id: 'sales', title: 'Total sales', stat: true, render: d => stat('Total sales', money(d.sales), delta(d.sales, d.prev_sales)) },
    { id: 'orders', title: 'Total orders', stat: true, tone: 2, render: d => stat('Total orders', num(d.orders), delta(d.orders, d.prev_orders)) },
    { id: 'active', title: 'Active orders', stat: true, tone: 3, render: d => stat('Active orders', num(d.active), '<span class="chip pending">● Live now</span>') },
    { id: 'aov', title: 'Average order value', stat: true, tone: 4, render: d => stat('Average order value', money(d.avg), delta(d.avg, d.prev_avg)) },
    { id: 'trend', title: 'Sales performance', w: 4, sub: 'Sales against the previous period', render: d => lineChart(d.series.map(x => x.label), [{ name: 'Sales', values: d.series.map(x => x.sales), area: true }, { name: 'Previous period', values: d.prev_series.slice(-d.series.length).map(x => x.sales), color: '#94a3b8', dash: true }]) },
    { id: 'status', title: 'Orders by status', w: 2, sub: 'What happened to every order', render: d => ['pending', 'preparing', 'ready', 'served', 'completed', 'cancelled', 'refunded', 'held'].filter(s => d.by_status[s]).map(s => `<div class="row">${chip(s)}<b>${num(d.by_status[s])}</b></div>`).join('') || '<div class="empty">No orders yet</div>' },
    { id: 'top', title: 'Top selling products', w: 2, sub: 'Ranked by quantity sold', render: d => hbars(d.top.map(x => ({ label: x.name, value: x.qty })), n => num(n) + ' sold') },
    { id: 'low', title: 'Low stock alerts', w: 2, sub: 'Ingredients at or below their reorder level', render: d => d.low_stock.length ? d.low_stock.map(s => `<div class="row"><span>${esc(s.name)}<br><small class="muted">Reorder at ${num(s.reorder, 1)} ${esc(s.unit)}</small></span><b style="color:var(--bad)">${num(s.qty, 1)} ${esc(s.unit)}</b></div>`).join('') : '<div class="empty">Everything is well stocked ✔</div>' },
    { id: 'payments', title: 'Payment methods', w: 2, render: d => donut(d.by_payment.map(x => ({ label: nice(x.name), value: x.sales })), money) },
    { id: 'channels', title: 'Sales by channel', w: 2, render: d => donut(d.by_channel.map(x => ({ label: nice(x.name), value: x.sales })), money) },
    { id: 'categories', title: 'Top categories', w: 2, render: d => hbars(d.top_categories.map(x => ({ label: x.name, value: x.revenue })), money) },
    { id: 'hourly', title: 'Busiest hours', w: 2, sub: 'Orders by hour of the day', render: d => { const m = {}; d.hourly.forEach(h => m[h.hour] = h.orders); const mx = Math.max(1, ...Object.values(m)); return `<div class="heat" style="grid-template-columns:repeat(12,1fr)">${[...Array(24).keys()].map(h => `<div style="opacity:${0.12 + (m[h] || 0) / mx * 0.88}" title="${h}:00 - ${m[h] || 0} orders">${h}</div>`).join('')}</div>`; } },
    { id: 'staff', title: 'Staff leaderboard', w: 2, render: d => hbars(d.staff.map(x => ({ label: x.name, value: x.sales })), money) },
    { id: 'tables', title: 'Table occupancy', stat: true, tone: 5, render: d => stat('Table occupancy', `${d.tables_occupied}/${d.tables_total}`, `<span class="muted">${d.tables_total ? Math.round(d.tables_occupied * 100 / d.tables_total) : 0}% of tables in use</span>`) },
    { id: 'new_customers', title: 'New customers', stat: true, tone: 2, render: d => stat('New customers', num(d.new_customers), `<span class="muted">${num(d.customers)} in total</span>`) },
    { id: 'discounts', title: 'Discounts given', stat: true, tone: 3, render: d => stat('Discounts given', money(d.discounts), '') },
    { id: 'tips', title: 'Tips & service charge', stat: true, tone: 4, render: d => stat('Tips & service charge', money(d.tips + d.service), `<span class="muted">Tips ${money(d.tips)}</span>`) },
    { id: 'cancel', title: 'Cancellations & refunds', stat: true, tone: 3, render: d => stat('Cancelled / refunded', `${num(d.cancelled)} / ${num(d.refunded)}`, `<span class="muted">Refunded ${money(d.refunded_amount)}</span>`) },
    { id: 'service_time', title: 'Average service time', stat: true, tone: 5, render: d => stat('Average service time', (d.avg_service_min || 0).toFixed(0) + ' min', '<span class="muted">order → completed</span>') },
  ],
});

/* ======================= Orders / invoices ======================= */
function ordersPage(mode) {
  return {
    events: ['order'],
    async render(el, pg) {
      const st = { page: 1, q: '', status: mode === 'invoices' ? 'completed,served,ready,preparing,pending' : (pg.params.status || ''), channel: '', pay: mode === 'invoices' ? 'paid' : '', range: mode === 'invoices' ? '30d' : '7d' };
      el.innerHTML = `<div class="page-h"><div><h1>${mode === 'invoices' ? 'Invoices' : 'Orders overview'}</h1><div class="hint">${mode === 'invoices' ? 'Paid bills. Open one to print the invoice.' : 'Every order from every channel. Open one to see items, payments and actions.'}</div></div></div>
        <div class="toolbar"><input type="search" class="q" id="oq" placeholder="🔍 Order no., customer, phone">
        ${mode === 'invoices' ? '' : `<select id="os"><option value="">All statuses</option>${['held', 'pending', 'preparing', 'ready', 'served', 'completed', 'cancelled', 'refunded'].map(s => opt(s, nice(s), s === st.status)).join('')}<option value="active">Active (in progress)</option></select>`}
        <select id="oc"><option value="">All channels</option>${['dine_in', 'takeaway', 'delivery', 'pickup', 'drive_thru', 'pre_order', 'catering'].map(s => opt(s, nice(s))).join('')}</select>
        ${mode === 'invoices' ? '' : `<select id="op"><option value="">Any payment</option>${['unpaid', 'partial', 'paid', 'refunded'].map(s => opt(s, nice(s))).join('')}</select>`}
        <select id="orr">${RANGES.map(r => opt(r[0], r[1], r[0] === st.range)).join('')}<option value="all">All time</option></select><button class="btn sm right" id="orf">⟳</button></div><div id="ol"></div>`;
      const limit = 25;
      const load = async () => {
        const [f, to] = st.range === 'all' ? [0, 0] : rangeFor(st.range);
        const r = await api('/pos/orders' + qs({ page: st.page, limit, q: st.q, status: st.status, channel: st.channel, pay: st.pay, from: f, to, items: 1 }));
        $('#ol', el).innerHTML = r.rows.length ? `<div class="tw"><table class="t"><thead><tr><th>${mode === 'invoices' ? 'Invoice' : 'Order'}</th><th>Date</th><th>Channel</th><th>Table / customer</th><th class="num">Items</th><th class="num">Total</th><th>Payment</th>${mode === 'invoices' ? '' : '<th>Status</th>'}<th>Staff</th><th></th></tr></thead><tbody>${r.rows.map(o => `<tr class="click" data-id="${o.id}"><td><b>${mode === 'invoices' ? 'INV-' : ''}${esc(o.no)}</b></td><td>${esc(fdt(o.created_at))}</td><td>${esc(nice(o.channel))}</td><td>${esc(o.table_name || o.customer || '—')}</td><td class="num">${o.items.filter(i => i.status !== 'void').reduce((a, i) => a + i.qty, 0)}</td><td class="num">${money(o.total)}</td><td>${chip(o.pay_status)}</td>${mode === 'invoices' ? '' : `<td>${chip(o.status)}</td>`}<td>${esc(o.staff || '')}</td><td><button class="btn sm" data-p="${o.id}">🖨</button></td></tr>`).join('')}</tbody></table></div>${pager(st, r.total, limit)}` : '<div class="card empty">No orders match these filters.</div>';
        bindPager($('#ol', el), st, r.total, limit, load);
        $$('#ol tbody tr', el).forEach(tr => tr.onclick = e => { const b = e.target.closest('[data-p]'); if (b) return printOrder(+b.dataset.p); orderModal(+tr.dataset.id, load); });
      };
      pg.refresh = load;
      $('#oq', el).oninput = debounce(e => { st.q = e.target.value; st.page = 1; load(); });
      if ($('#os', el)) $('#os', el).onchange = e => { st.status = e.target.value; st.page = 1; load(); };
      $('#oc', el).onchange = e => { st.channel = e.target.value; st.page = 1; load(); };
      if ($('#op', el)) $('#op', el).onchange = e => { st.pay = e.target.value; st.page = 1; load(); };
      $('#orr', el).onchange = e => { st.range = e.target.value; st.page = 1; load(); };
      $('#orf', el).onclick = load;
      await load();
    },
  };
}
PAGES.orders = () => ordersPage('orders');
PAGES.invoices = () => ordersPage('invoices');

PAGES.payments = () => ({
  events: ['order'],
  async render(el, pg) {
    const st = { page: 1, method: '', kind: '', range: '7d' }, limit = 30;
    el.innerHTML = `<div class="page-h"><div><h1>Payments</h1><div class="hint">Every payment and refund taken at the till.</div></div></div>
      <div class="toolbar"><select id="pm"><option value="">All methods</option>${['cash', 'card', 'upi', 'wallet', 'gift_card', 'loyalty', 'cod', 'account', 'bank_transfer', 'cheque', 'other'].map(s => opt(s, nice(s))).join('')}</select>
      <select id="pk"><option value="">Payments & refunds</option><option value="payment">Payments</option><option value="refund">Refunds</option></select>
      <select id="pr">${RANGES.map(r => opt(r[0], r[1], r[0] === st.range)).join('')}</select></div><div id="ps" class="grid g4" style="margin-bottom:14px"></div><div id="pl"></div>`;
    const load = async () => {
      const [f, to] = rangeFor(st.range);
      const r = await api('/pos/payments' + qs({ page: st.page, limit, method: st.method, kind: st.kind, from: f, to }));
      $('#ps', el).innerHTML = r.by_method.map(m => `<div class="card stat"><div class="l">${esc(nice(m.method))}</div><div class="v">${money(m.amount)}</div><small class="muted">${num(m.n)} transactions</small></div>`).join('');
      $('#pl', el).innerHTML = r.rows.length ? `<div class="tw"><table class="t"><thead><tr><th>When</th><th>Order</th><th>Method</th><th>Type</th><th class="num">Amount</th><th>Reference</th><th>Staff</th></tr></thead><tbody>${r.rows.map(p => `<tr><td>${esc(fdt(p.created_at))}</td><td>${esc(p.no || '#' + p.order_id)}</td><td>${esc(nice(p.method))}</td><td>${chip(p.kind === 'refund' ? 'refunded' : 'paid')}</td><td class="num">${p.kind === 'refund' ? '-' : ''}${money(p.amount)}</td><td>${esc(p.ref || '')}</td><td>${esc(p.staff)}</td></tr>`).join('')}</tbody></table></div>${pager(st, r.total, limit)}` : '<div class="card empty">No payments in this period.</div>';
      bindPager($('#pl', el), st, r.total, limit, load);
    };
    pg.refresh = load;
    $('#pm', el).onchange = e => { st.method = e.target.value; st.page = 1; load(); };
    $('#pk', el).onchange = e => { st.kind = e.target.value; st.page = 1; load(); };
    $('#pr', el).onchange = e => { st.range = e.target.value; st.page = 1; load(); };
    await load();
  },
});

/* ======================= Inventory ======================= */
PAGES.inventory = () => ({
  events: ['res:ingredients', 'res:purchases', 'order'],
  async render(el, pg) {
    const load = async () => {
      const d = await api('/inventory/overview');
      el.innerHTML = `<div class="page-h"><div><h1>Inventory overview</h1><div class="hint">Stock levels, value and what needs re-ordering.</div></div><div class="acts"><a class="btn" href="#/waste">Log waste</a><a class="btn" href="#/counts">Stock count</a><a class="btn pri" href="#/purchases">+ Purchase order</a></div></div>
        <div class="grid g4" style="margin-bottom:14px"><div class="card stat">${stat('Stock value', money(d.value))}</div><div class="card stat t2">${stat('Ingredients', num(d.items))}</div><div class="card stat t3">${stat('Need re-ordering', num(d.low_count), d.low_count ? '<span class="chip pending">Action needed</span>' : '<span class="chip ok">All good</span>')}</div></div>
        <div class="grid g2"><div class="card"><h3>Low stock</h3><div class="sub">At or below the reorder level</div>${d.low.length ? d.low.map(s => `<div class="row"><span>${esc(s.name)}<br><small class="muted">Reorder at ${num(s.reorder, 1)} ${esc(s.unit)}</small></span><b style="color:var(--bad)">${num(s.qty, 1)} ${esc(s.unit)}</b></div>`).join('') : '<div class="empty">Nothing is running low ✔</div>'}</div>
        <div class="card"><h3>Most used ingredients</h3><div class="sub">Last 30 days, from sales</div>${hbars(d.top_used.map(x => ({ label: x.name, value: x.qty })), n => num(n, 1))}</div>
        <div class="card" style="grid-column:1/-1"><h3>Recent stock movements</h3>${d.recent.length ? `<div class="tw"><table class="t"><thead><tr><th>When</th><th>Ingredient</th><th>Type</th><th class="num">Change</th></tr></thead><tbody>${d.recent.map(m => `<tr><td>${esc(fdt(m.created_at))}</td><td>${esc(m.ingredient)}</td><td>${chip(m.kind)}</td><td class="num" style="color:${m.qty < 0 ? 'var(--bad)' : 'var(--ok)'}">${m.qty > 0 ? '+' : ''}${num(m.qty, 2)}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">No movements yet</div>'}</div></div>`;
    };
    pg.refresh = load; await load();
  },
});

PAGES.stock = () => ({
  events: ['res:ingredients', 'order'],
  async render(el, pg) {
    let rows = [], q = '', lowOnly = false;
    el.innerHTML = `<div class="page-h"><div><h1>Stock</h1><div class="hint">What is on the shelf right now${S.branch ? ' at ' + esc(S.branchName(S.branch)) : ' across all branches'}.</div></div></div>
      <div class="toolbar"><input type="search" class="q" id="sq" placeholder="🔍 Search ingredient"><label style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="sl"> Low stock only</label><button class="btn sm" id="sx">⤓ Export</button></div><div id="sb"></div>`;
    const draw = () => {
      const list = rows.filter(r => (!q || (r.name + r.category + r.sku).toLowerCase().includes(q)) && (!lowOnly || r.low));
      const total = list.reduce((a, r) => a + r.value, 0);
      $('#sb', el).innerHTML = list.length ? `<div class="tw"><table class="t"><thead><tr><th>Ingredient</th><th>Category</th><th>Unit</th><th class="num">On hand</th><th class="num">Reorder at</th><th class="num">Unit cost</th><th class="num">Value</th><th>State</th></tr></thead><tbody>${list.map(r => `<tr><td><b>${esc(r.name)}</b></td><td>${esc(r.category)}</td><td>${esc(r.unit)}</td><td class="num">${num(r.qty, 2)}</td><td class="num">${num(r.reorder, 1)}</td><td class="num">${money(r.cost)}</td><td class="num">${money(r.value)}</td><td>${r.low ? chip('pending').replace('pending', 'low') : chip('ok')}</td></tr>`).join('')}</tbody><tfoot><tr><td colspan="6">Total value</td><td class="num">${money(total)}</td><td></td></tr></tfoot></table></div>` : '<div class="card empty">No ingredients found.</div>';
    };
    const load = async () => { rows = await api('/stock'); draw(); };
    pg.refresh = load;
    $('#sq', el).oninput = e => { q = e.target.value.toLowerCase(); draw(); };
    $('#sl', el).onchange = e => { lowOnly = e.target.checked; draw(); };
    $('#sx', el).onclick = () => saveText('stock.csv', csvOf([{ key: 'name', label: 'Ingredient' }, { key: 'category', label: 'Category' }, { key: 'unit', label: 'Unit' }, { key: 'qty', label: 'On hand' }, { key: 'reorder', label: 'Reorder level' }, { key: 'cost', label: 'Unit cost', type: 'money' }, { key: 'value', label: 'Value', type: 'money' }], rows));
    await load();
  },
});

PAGES.stock_moves = () => ({
  events: ['order', 'res:purchases'],
  async render(el, pg) {
    const st = { page: 1, kind: '', ingredient: 0 }, limit = 40;
    const ings = await lookup('ingredients');
    el.innerHTML = `<div class="page-h"><div><h1>Stock movements</h1><div class="hint">The full history behind every stock number.</div></div></div>
      <div class="toolbar"><select id="mi"><option value="">All ingredients</option>${ings.map(i => opt(i.id, i.label)).join('')}</select><select id="mk"><option value="">All types</option>${['purchase', 'sale', 'return', 'transfer_in', 'transfer_out', 'count', 'waste', 'production', 'adjust'].map(k => opt(k, nice(k))).join('')}</select></div><div id="mb"></div>`;
    const load = async () => {
      const r = await api('/stock/moves' + qs({ page: st.page, limit, kind: st.kind, ingredient: st.ingredient }));
      $('#mb', el).innerHTML = r.rows.length ? `<div class="tw"><table class="t"><thead><tr><th>When</th><th>Ingredient</th><th>Type</th><th class="num">Change</th><th class="num">Unit cost</th><th>Reference</th><th>Note</th></tr></thead><tbody>${r.rows.map(m => `<tr><td>${esc(fdt(m.created_at))}</td><td>${esc(m.ingredient)}</td><td>${chip(m.kind)}</td><td class="num" style="color:${m.qty < 0 ? 'var(--bad)' : 'var(--ok)'}">${m.qty > 0 ? '+' : ''}${num(m.qty, 2)}</td><td class="num">${money(m.unit_cost)}</td><td>${esc(m.ref)}</td><td>${esc(m.note)}</td></tr>`).join('')}</tbody></table></div>${pager(st, r.total, limit)}` : '<div class="card empty">No movements.</div>';
      bindPager($('#mb', el), st, r.total, limit, load);
    };
    pg.refresh = load;
    $('#mi', el).onchange = e => { st.ingredient = +e.target.value; st.page = 1; load(); };
    $('#mk', el).onchange = e => { st.kind = e.target.value; st.page = 1; load(); };
    await load();
  },
});

/* ======================= Customers & loyalty ======================= */
PAGES.loyalty = () => ({
  events: ['res:customers'],
  async render(el, pg) {
    const st = { page: 1, q: '' }, limit = 25;
    el.innerHTML = `<div class="page-h"><div><h1>Customer points</h1><div class="hint">Loyalty points earned from sales. Adjust a balance when you need to fix or gift points.</div></div></div><div class="toolbar"><input class="q" id="lq" placeholder="🔍 Name or phone"></div><div id="lb"></div>`;
    const load = async () => {
      const r = await api('/r/customers' + qs({ page: st.page, limit, q: st.q }));
      $('#lb', el).innerHTML = r.rows.length ? `<div class="tw"><table class="t"><thead><tr><th>Customer</th><th>Phone</th><th>Tier</th><th class="num">Visits</th><th class="num">Spent</th><th class="num">Points</th><th></th></tr></thead><tbody>${r.rows.map(c => `<tr><td><b>${esc(c.name)}</b></td><td>${esc(c.phone || '')}</td><td>${esc(c.tier || '—')}</td><td class="num">${num(c.visits)}</td><td class="num">${money(c.spent)}</td><td class="num"><b>${num(c.points)}</b></td><td><button class="btn sm" data-i="${c.id}">± Adjust</button></td></tr>`).join('')}</tbody></table></div>${pager(st, r.total, limit)}` : '<div class="card empty">No customers.</div>';
      bindPager($('#lb', el), st, r.total, limit, load);
      $$('[data-i]', el).forEach(b => b.onclick = async () => {
        const d = await promptBox('Adjust points', 'Points to add (use a minus to remove)', '10', { type: 'number' }); if (d === null) return;
        const why = await promptBox('Reason', 'Why? (shown in the activity log)', 'Goodwill'); if (why === null) return;
        if (await act(() => api('/customers/' + b.dataset.i + '/points', 'POST', { delta: +d, reason: why }), 'Points updated ✔')) load();
      });
    };
    pg.refresh = load;
    $('#lq', el).oninput = debounce(e => { st.q = e.target.value; st.page = 1; load(); });
    await load();
  },
});

PAGES.customer_analytics = () => ({
  events: ['res:customers', 'order'],
  async render(el, pg) {
    const load = async () => {
      const d = await api('/customers/analytics');
      el.innerHTML = `<div class="page-h"><div><h1>Customer analytics</h1><div class="hint">Who your best customers are and how loyal they are.</div></div></div>
        <div class="grid g4" style="margin-bottom:14px"><div class="card stat">${stat('Customers', num(d.count))}</div><div class="card stat t2">${stat('Lifetime spend', money(d.lifetime_spend))}</div><div class="card stat t4">${stat('Repeat customers', num(d.repeat), `<span class="muted">${num(d.one_time)} came once</span>`)}</div><div class="card stat t5">${stat('Points outstanding', num(d.points_outstanding))}</div></div>
        <div class="grid g2"><div class="card"><h3>Top customers</h3><div class="sub">By total spend</div>${d.top.length ? d.top.map((c, i) => `<div class="row"><span>${i + 1}. <b>${esc(c.name)}</b><br><small class="muted">${num(c.visits)} visits · ${esc(c.tier || 'no tier')}</small></span><b>${money(c.spent)}</b></div>`).join('') : '<div class="empty">No customers yet</div>'}</div>
        <div class="card"><h3>Loyalty tiers</h3>${donut(Object.entries(d.tiers).map(([k, v]) => ({ label: k, value: v })))}</div>
        <div class="card"><h3>Birthdays this month 🎂</h3>${d.birthdays.length ? d.birthdays.map(b => `<div class="row"><b>${esc(b.name)}</b><span class="muted">${esc(b.date)} · ${esc(b.phone || '')}</span></div>`).join('') : '<div class="empty">None this month</div>'}</div></div>`;
    };
    pg.refresh = load; await load();
  },
});

/* ======================= Users & roles ======================= */
PAGES.users = () => ({
  events: [],
  async render(el, pg) {
    const [roles] = await Promise.all([api('/roles')]);
    const canEdit = can('admin', 2);
    let q = '';
    el.innerHTML = `<div class="page-h"><div><h1>Users</h1><div class="hint">People who can sign in. Their role decides what they can see and do.</div></div><div class="acts">${canEdit ? '<button class="btn pri" id="un">+ New user</button>' : ''}</div></div><div class="toolbar"><input class="q" id="uq" placeholder="🔍 Name, username or email"></div><div id="ub"></div>`;
    const roleLabel = k => (roles.roles.find(r => r.key === k) || {}).label || k;
    const load = async () => {
      const rows = await api('/users' + qs({ q }));
      $('#ub', el).innerHTML = `<div class="tw"><table class="t"><thead><tr><th>Name</th><th>Username</th><th>Role</th><th>Branch</th><th>Status</th><th>2FA</th><th>Last sign-in</th><th></th></tr></thead><tbody>${rows.map(u => `<tr><td><b>${esc(u.name)}</b><br><small class="muted">${esc(u.email || '')}</small></td><td>${esc(u.username)}</td><td>${esc(roleLabel(u.role))}</td><td>${u.branch_id ? esc(S.branchName(u.branch_id)) : '<span class="muted">All</span>'}</td><td>${chip(u.active ? 'active' : 'inactive')}</td><td>${u.totp_on ? '🛡 on' : '—'}</td><td>${u.last_login ? esc(fdt(u.last_login)) : '—'}</td><td>${canEdit ? `<button class="btn sm" data-e="${u.id}">Edit</button>` : ''}</td></tr>`).join('')}</tbody></table></div>`;
      $$('[data-e]', el).forEach(b => b.onclick = () => userForm(rows.find(r => r.id === +b.dataset.e)));
    };
    const userForm = (u = {}) => {
      const creating = !u.id;
      const box = modal(`<h2>${creating ? 'New' : 'Edit'} user</h2><div class="fgrid"><div><label class="f">Full name *</label><input id="fn" value="${attr(u.name || '')}"></div><div><label class="f">Username *</label><input id="fu" value="${attr(u.username || '')}" ${creating ? '' : 'disabled'}></div>
        <div><label class="f">Email</label><input id="fe" value="${attr(u.email || '')}"></div><div><label class="f">Phone</label><input id="fp" value="${attr(u.phone || '')}"></div>
        <div><label class="f">Role *</label><select id="fr">${roles.roles.filter(r => isSuper() || (r.key !== 'superadmin' && r.key !== 'admin')).map(r => opt(r.key, r.label, r.key === u.role)).join('')}</select></div>
        <div><label class="f">Branch</label><select id="fb" ${S.me.branch_id ? 'disabled' : ''}>${opt(0, 'All branches', !u.branch_id)}${S.branches.map(b => opt(b.id, b.label, b.id === u.branch_id)).join('')}</select><div class="help">Required for "Admin Branch".</div></div>
        <div class="full"><label class="f">${creating ? 'Password * (8+ characters)' : 'New password (leave empty to keep)'}</label><input id="fw" type="password" autocomplete="new-password"></div>
        ${creating ? '' : `<div><label class="f">Account active</label><label class="sw"><input type="checkbox" id="fa" ${u.active ? 'checked' : ''}><span></span></label></div>`}</div>
        <div class="err inline hide" id="fe2"></div><div class="acts">${creating ? '' : '<button class="btn" id="fl">Make reset link</button>'}<button class="btn" id="fc">Cancel</button><button class="btn pri" id="fs">Save</button></div>`);
      $('#fc', box).onclick = () => closeModal();
      if ($('#fl', box)) $('#fl', box).onclick = async () => { const r = await act(() => api('/users/' + u.id + '/reset-link', 'POST', {})); if (r) promptBox('Password reset link', 'Send this link to the user (valid for 1 hour)', r.link); };
      $('#fs', box).onclick = async () => {
        const body = { name: $('#fn', box).value, username: $('#fu', box).value, email: $('#fe', box).value, phone: $('#fp', box).value, role: $('#fr', box).value, branch_id: +$('#fb', box).value, password: $('#fw', box).value };
        if (!creating) body.active = $('#fa', box).checked;
        try { await api('/users' + (creating ? '' : '/' + u.id), creating ? 'POST' : 'PUT', body); closeModal(); toast('Saved ✔'); load(); } catch (e) { $('#fe2', box).textContent = e.message; $('#fe2', box).classList.remove('hide'); }
      };
    };
    if ($('#un', el)) $('#un', el).onclick = () => userForm();
    $('#uq', el).oninput = debounce(e => { q = e.target.value; load(); });
    await load();
  },
});

PAGES.roles = () => ({
  events: [],
  async render(el, pg) {
    let data = await api('/roles'), sel = data.roles[0].key;
    const canEdit = can('admin', 3);
    const LV = [[0, 'No access'], [1, 'View'], [2, 'Manage'], [3, 'Approve']];
    const draw = () => {
      const r = data.roles.find(x => x.key === sel);
      el.innerHTML = `<div class="page-h"><div><h1>Roles & permissions</h1><div class="hint">Choose what each role can do in every part of the system.</div></div><div class="acts">${canEdit ? '<button class="btn pri" id="rn">+ New role</button>' : ''}</div></div>
        <div class="grid" style="grid-template-columns:230px 1fr"><div class="card" style="padding:8px">${data.roles.map(x => `<a class="btn block" style="justify-content:flex-start;margin-bottom:5px;${x.key === sel ? 'background:var(--pri-l);border-color:var(--pri)' : ''}" data-r="${attr(x.key)}">${esc(x.label)}${x.builtin ? '' : ' <small class="muted">(custom)</small>'}</a>`).join('')}</div>
        <div class="card"><div style="display:flex;gap:10px;align-items:center"><h3>${esc(r.label)}</h3><span class="muted">key: ${esc(r.key)}</span><span class="right"></span>${canEdit && !r.builtin ? '<button class="btn sm bad" id="rd">Delete role</button>' : ''}</div>
        ${r.key === 'superadmin' ? '<div class="sub">Super admin always has full access and cannot be changed.</div>' : `<div class="sub"><b>View</b> = see data · <b>Manage</b> = add / edit / delete · <b>Approve</b> = approve, post, refund, close periods.</div>`}
        <div class="tw"><table class="t perm"><thead><tr><th>Area</th><th>Access level</th></tr></thead><tbody>${data.modules.map(m => `<tr><td>${esc(m.Label || m.label)}</td><td><select data-m="${attr(m.Key || m.key)}" ${!canEdit || r.key === 'superadmin' ? 'disabled' : ''}>${LV.map(l => opt(l[0], l[1], (r.key === 'superadmin' ? 3 : (r.perms[m.Key || m.key] || 0)) === l[0])).join('')}</select></td></tr>`).join('')}</tbody></table></div>
        ${canEdit && r.key !== 'superadmin' ? '<div class="acts" style="display:flex;justify-content:flex-end;margin-top:12px"><button class="btn pri" id="rs">Save permissions</button></div>' : ''}</div></div>`;
      $$('[data-r]', el).forEach(a => a.onclick = () => { sel = a.dataset.r; draw(); });
      if ($('#rs', el)) $('#rs', el).onclick = async () => {
        const perms = {}; $$('[data-m]', el).forEach(s => { if (+s.value) perms[s.dataset.m] = +s.value; });
        if (await act(() => api('/roles/' + r.key, 'PUT', { label: r.label, perms }), 'Permissions saved - applies immediately ✔')) { data = await api('/roles'); draw(); }
      };
      if ($('#rd', el)) $('#rd', el).onclick = async () => { if (await confirmBox('Delete this role?', 'Delete', true) && await act(() => api('/roles/' + r.key, 'DELETE'), 'Deleted')) { data = await api('/roles'); sel = data.roles[0].key; draw(); } };
      if ($('#rn', el)) $('#rn', el).onclick = async () => {
        const label = await promptBox('New role', 'Role name (e.g. Supervisor)', ''); if (!label) return;
        const key = label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
        if (await act(() => api('/roles', 'POST', { key, label, perms: { pos: 2, orders: 1 } }), 'Role created ✔')) { data = await api('/roles'); sel = key; draw(); }
      };
    };
    draw();
  },
});

/* ======================= Activity logs ======================= */
function logPage(kind) {
  return {
    events: [],
    async render(el, pg) {
      const st = { page: 1, q: '', user: '', res: '', action: '', ok: '' }, limit = 40;
      el.innerHTML = `<div class="page-h"><div><h1>${kind === 'audit' ? 'Activity logs' : 'Authentication logs'}</h1><div class="hint">${kind === 'audit' ? 'Who changed what, and when.' : 'Every sign-in attempt, successful or not.'}</div></div></div>
        <div class="toolbar"><input class="q" id="gq" placeholder="🔍 Search">${kind === 'audit' ? '<input class="q" id="gu" placeholder="User" style="max-width:150px"><input class="q" id="gr" placeholder="Screen (e.g. orders)" style="max-width:170px">' : '<select id="gok"><option value="">All attempts</option><option value="1">Successful</option><option value="0">Failed</option></select>'}<button class="btn sm right" id="gx">⟳</button></div><div id="gb"></div>`;
      const load = async () => {
        const r = await api((kind === 'audit' ? '/audit' : '/authlog') + qs({ page: st.page, limit, q: st.q, user: st.user, res: st.res, ok: st.ok }));
        $('#gb', el).innerHTML = r.rows.length ? (kind === 'audit'
          ? `<div class="tw"><table class="t"><thead><tr><th>When</th><th>User</th><th>Role</th><th>Screen</th><th>Action</th><th>Details</th><th>IP</th></tr></thead><tbody>${r.rows.map(x => `<tr><td>${esc(fdt(x.ts))}</td><td>${esc(x.user)}</td><td>${esc(x.role)}</td><td>${esc(x.res)}${x.rec_id ? ' #' + x.rec_id : ''}</td><td>${chip(x.action)}</td><td>${esc(x.detail)}</td><td>${esc(x.ip)}</td></tr>`).join('')}</tbody></table></div>`
          : `<div class="tw"><table class="t"><thead><tr><th>When</th><th>Username</th><th>Result</th><th>Note</th><th>IP</th><th>Device</th></tr></thead><tbody>${r.rows.map(x => `<tr><td>${esc(fdt(x.ts))}</td><td>${esc(x.username)}</td><td>${chip(x.ok ? 'ok' : 'failed')}</td><td>${esc(x.note)}</td><td>${esc(x.ip)}</td><td style="max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${attr(x.agent)}">${esc(x.agent)}</td></tr>`).join('')}</tbody></table></div>`) + pager(st, r.total, limit) : '<div class="card empty">Nothing logged yet.</div>';
        bindPager($('#gb', el), st, r.total, limit, load);
      };
      pg.refresh = load;
      $('#gq', el).oninput = debounce(e => { st.q = e.target.value; st.page = 1; load(); });
      if ($('#gu', el)) $('#gu', el).oninput = debounce(e => { st.user = e.target.value; st.page = 1; load(); });
      if ($('#gr', el)) $('#gr', el).oninput = debounce(e => { st.res = e.target.value; st.page = 1; load(); });
      if ($('#gok', el)) $('#gok', el).onchange = e => { st.ok = e.target.value; st.page = 1; load(); };
      $('#gx', el).onclick = load;
      await load();
    },
  };
}
PAGES.audit = () => logPage('audit');
PAGES.authlog = () => logPage('auth');

/* ======================= Media ======================= */
PAGES.media = () => ({
  events: [],
  async render(el, pg) {
    const st = { page: 1, q: '' }, limit = 40;
    el.innerHTML = `<div class="page-h"><div><h1>Media</h1><div class="hint">Images for products, categories and your logo. Copy the link into any "file" field.</div></div><div class="acts"><button class="btn pri" id="mu">⤒ Upload</button></div></div>
      <div class="toolbar"><input class="q" id="mq" placeholder="🔍 File name"></div><div id="mb"></div>`;
    const load = async () => {
      const r = await api('/media' + qs({ page: st.page, limit, q: st.q }));
      $('#mb', el).innerHTML = r.rows.length ? `<div class="media">${r.rows.map(m => `<div class="m">${/^image/.test(m.mime) ? `<img src="${attr(m.url)}" loading="lazy">` : '<div style="height:100px;display:grid;place-items:center;font-size:30px">📄</div>'}<div>${esc(m.name)}<br><small class="muted">${num(m.size / 1024, 0)} KB</small><br><button class="btn sm" data-c="${attr(m.url)}">Copy link</button> ${can('admin', 2) ? `<button class="btn sm bad" data-d="${m.id}">✕</button>` : ''}</div></div>`).join('')}</div>${pager(st, r.total, limit)}` : '<div class="card empty">No files yet. Click Upload.</div>';
      bindPager($('#mb', el), st, r.total, limit, load);
      $$('[data-c]', el).forEach(b => b.onclick = () => { navigator.clipboard && navigator.clipboard.writeText(location.origin + b.dataset.c); toast('Link copied'); });
      $$('[data-d]', el).forEach(b => b.onclick = async () => { if (await confirmBox('Delete this file?', 'Delete', true) && await act(() => api('/media/' + b.dataset.d, 'DELETE'), 'Deleted')) load(); });
    };
    $('#mu', el).onclick = () => { const fi = document.createElement('input'); fi.type = 'file'; fi.multiple = true; fi.onchange = async () => { for (const f of fi.files) await act(() => uploadFile(f), f.name + ' uploaded'); load(); }; fi.click(); };
    $('#mq', el).oninput = debounce(e => { st.q = e.target.value; st.page = 1; load(); });
    pg.refresh = load; await load();
  },
});

/* ======================= Database ======================= */
PAGES.database = () => ({
  events: [],
  async render(el, pg) {
    const load = async () => {
      const d = await api('/db/info');
      const mb = n => (n / 1048576).toFixed(2) + ' MB';
      el.innerHTML = `<div class="page-h"><div><h1>Database</h1><div class="hint">Backups and housekeeping. Keep a copy of your data somewhere safe!</div></div><div class="acts"><button class="btn" id="dop">🧹 Optimise & clean old logs</button><button class="btn pri" id="dbk">💾 Create backup now</button></div></div>
        <div class="grid g4" style="margin-bottom:14px"><div class="card stat">${stat('Database size', mb(d.size))}</div><div class="card stat t2">${stat('Write-ahead log', mb(d.wal))}</div><div class="card stat t4">${stat('Engine', 'SQLite ' + esc(d.sqlite))}</div></div>
        <div class="grid g2"><div class="card"><h3>Backups</h3><div class="sub">Stored in the server's data/backups folder</div>${d.backups.length ? d.backups.map(b => `<div class="row"><span><b>${esc(b.name)}</b><br><small class="muted">${esc(fdt(b.at))} · ${mb(b.size)}</small></span><span><button class="btn sm" data-dl="${attr(b.name)}">⤓ Download</button> <button class="btn sm bad" data-rm="${attr(b.name)}">✕</button></span></div>`).join('') : '<div class="empty">No backups yet</div>'}</div>
        <div class="card"><h3>What is stored</h3>${d.tables.map(t => `<div class="row"><span>${esc(t.name)}</span><b>${num(t.rows)}</b></div>`).join('')}</div></div>
        <div class="card" style="margin-top:14px"><h3>To restore a backup</h3><p class="muted">Stop the server, replace <code>${esc(d.path)}</code> with the backup file (rename it), and start the server again. Restoring from the browser is deliberately not offered, to prevent accidents.</p></div>`;
      $('#dbk', el).onclick = async () => { if (await act(() => api('/db/backup', 'POST', {}), 'Backup created ✔')) load(); };
      $('#dop', el).onclick = async () => { if (await act(() => api('/db/optimize', 'POST', {}), 'Done ✔')) load(); };
      $$('[data-dl]', el).forEach(b => b.onclick = () => download('/db/backup/' + b.dataset.dl, b.dataset.dl));
      $$('[data-rm]', el).forEach(b => b.onclick = async () => { if (await confirmBox('Delete this backup file?', 'Delete', true) && await act(() => api('/db/backup/' + b.dataset.rm, 'DELETE'), 'Deleted')) load(); });
    };
    pg.refresh = load; await load();
  },
});
