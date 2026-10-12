'use strict';
/* pages_acc.js - Accounting: dashboard, chart of accounts, journals, statements, restaurant reports */

const accRange = (range) => range === 'fy' ? [todayStr().slice(0, 4) + '-01-01', todayStr()] : dateRangeFor(range);
const ACC_RANGES = [['month', 'This month'], ['lastmonth', 'Last month'], ['30d', 'Last 30 days'], ['year', 'This year'], ['7d', 'Last 7 days']];

PAGES.acc_dash = () => widgetDash({
  key: 'dash-acc', title: 'Accounting overview', nav: 'acc_dash', hint: 'A consolidated view of financial performance, position, cash and close readiness.', range: 'month', ranges: ACC_RANGES, events: ['res:periods', 'res:supplier_bills'],
  load: range => { const [a, b] = accRange(range); return api('/acc/dash' + qs({ from: a, to: b })); },
  defaultHidden: [],
  widgets: [
    { id: 'rev', title: 'Revenue', stat: true, render: d => stat('Revenue', money(d.revenue), delta(d.revenue, d.prev_revenue)) },
    { id: 'gp', title: 'Gross profit', stat: true, tone: 2, render: d => stat('Gross profit', money(d.gross_profit), delta(d.gross_profit, d.prev_gross_profit)) },
    { id: 'ni', title: 'Net income', stat: true, tone: 4, render: d => stat('Net income', `<span style="color:${d.net_income < 0 ? 'var(--bad)' : 'inherit'}">${money(d.net_income)}</span>`, delta(d.net_income, d.prev_net_income)) },
    { id: 'cash', title: 'Cash & bank', stat: true, tone: 5, render: d => stat('Cash & bank', money(d.cash), delta(d.cash, d.prev_cash)) },
    { id: 'trend', title: 'Performance trend', w: 4, sub: 'Revenue, gross profit and net income over time', render: d => lineChart(d.trend.map(x => x.label), [{ name: 'Revenue', values: d.trend.map(x => x.revenue), area: true }, { name: 'Gross profit', values: d.trend.map(x => x.gross_profit), color: '#16a34a' }, { name: 'Net income', values: d.trend.map(x => x.net_income), color: '#7c3aed' }]) },
    { id: 'mix', title: 'Expense mix', w: 2, sub: 'Largest cost and expense accounts', render: d => donut(d.expense_mix.map(x => ({ label: x.name, value: x.value })), money) },
    { id: 'cashmove', title: 'Cash movement', w: 2, sub: 'Cash inflows, outflows and net movement', render: d => lineChart(d.cash_movement.map(x => x.label), [{ name: 'Inflow', values: d.cash_movement.map(x => x.inflow), color: '#16a34a' }, { name: 'Outflow', values: d.cash_movement.map(x => x.outflow), color: '#dc2626' }, { name: 'Net', values: d.cash_movement.map(x => x.net), color: '#2563eb', dash: true }]) },
    { id: 'bs', title: 'Balance sheet', w: 2, sub: 'Financial position at the end date', render: d => `<div class="grid g3" style="gap:8px"><div><small class="muted">Assets</small><div style="font-weight:800">${money(d.assets)}</div></div><div><small class="muted">Liabilities</small><div style="font-weight:800">${money(d.liabilities)}</div></div><div><small class="muted">Equity</small><div style="font-weight:800">${money(d.equity)}</div></div></div><div style="margin:8px 0">${d.bs_difference === 0 ? '<span class="chip ok">✔ Accounting equation is balanced</span>' : `<span class="chip failed">Difference ${money(d.bs_difference)}</span>`}</div>${d.top_assets.map(a => `<div class="row"><span>${esc(a.code)} · ${esc(a.name)}</span><b>${money(a.balance)}</b></div>`).join('')}` },
    { id: 'branches', title: 'Branch performance', w: 2, sub: 'Operating performance by branch', render: d => d.branches.length ? `<table class="t"><thead><tr><th>Branch</th><th class="num">Revenue</th><th class="num">Net income</th><th class="num">Margin</th><th class="num">Change</th></tr></thead><tbody>${d.branches.map(b => `<tr><td>${esc(b.name)}</td><td class="num">${money(b.revenue)}</td><td class="num">${money(b.net_income)}</td><td class="num">${b.margin ? b.margin.toFixed(1) + '%' : '—'}</td><td class="num">${b.change ? (b.change > 0 ? '▲' : '▼') + Math.abs(b.change).toFixed(1) + '%' : '—'}</td></tr>`).join('')}</tbody></table>` : '<div class="empty">No branches</div>' },
    { id: 'close', title: 'Close controls', w: 2, sub: 'Exceptions requiring accounting attention', render: d => `<div class="row"><span>Open or soft-locked periods</span><b>${d.open_periods}</b></div><div class="row"><a href="#/journals">Draft journals</a><b>${d.draft_journals}</b></div><div class="row"><a href="#/posting_exceptions">Failed postings</a><b style="color:${d.failed_journals ? 'var(--bad)' : 'inherit'}">${d.failed_journals}</b></div><div class="row"><a href="#/bank_recs">Pending reconciliations</a><b>${d.pending_recs}</b></div>` },
    { id: 'recent', title: 'Recent journals', w: 2, sub: 'Latest entries', render: d => d.recent.length ? d.recent.map(j => `<div class="row"><span><b>${esc(j.ref)}</b> <small class="muted">${esc(j.date)} · ${esc(j.memo || j.source)}</small></span><b>${money(j.amount)}</b></div>`).join('') : '<div class="empty">No posted ledger activity</div>' },
  ],
});

/* ---------- chart of accounts ---------- */
PAGES.accounts = () => ({
  events: [],
  async render(el, pg) {
    const canEdit = can('accounting', 3);
    let rows = [], q = '', type = '';
    el.innerHTML = `<div class="page-h"><div><h1>Chart of accounts</h1><div class="hint">Every place money can sit or be spent. The system posts sales, purchases and payroll to these automatically.</div></div><div class="acts">${canEdit ? '<button class="btn pri" id="an">+ New account</button>' : ''}</div></div><div class="toolbar"><input class="q" id="aq" placeholder="🔍 Code or name"><div class="tabs" id="at"><button class="tab on" data-t="">All</button>${['asset', 'liability', 'equity', 'revenue', 'cogs', 'expense'].map(x => `<button class="tab" data-t="${x}">${nice(x)}</button>`).join('')}</div></div><div id="ab"></div>`;
    const draw = () => {
      const l = rows.filter(r => (!type || r.type === type) && (!q || (r.code + r.name).toLowerCase().includes(q)));
      $('#ab', el).innerHTML = `<div class="tw"><table class="t"><thead><tr><th>Code</th><th>Name</th><th>Type</th><th class="num">Debit</th><th class="num">Credit</th><th class="num">Balance</th><th>Cash?</th><th>Status</th>${canEdit ? '<th></th>' : ''}</tr></thead><tbody>${l.map(r => `<tr class="click" data-id="${r.id}"><td><b>${esc(r.code)}</b></td><td>${esc(r.name)}${r.sys ? ` <small class="muted">· ${esc(r.sys)}</small>` : ''}</td><td>${chip(r.type)}</td><td class="num">${money(r.debit)}</td><td class="num">${money(r.credit)}</td><td class="num"><b>${money(r.balance)}</b></td><td>${r.is_cash ? '💵' : ''}</td><td>${chip(r.active ? 'active' : 'inactive')}</td>${canEdit ? `<td><button class="btn sm" data-e="${r.id}">✎</button></td>` : ''}</tr>`).join('')}</tbody></table></div>`;
      $$('tbody tr', el).forEach(tr => tr.onclick = e => { const b = e.target.closest('[data-e]'); if (b) return form(rows.find(r => r.id === +b.dataset.e)); location.hash = '#/ledger?account=' + tr.dataset.id; });
    };
    const load = async () => { rows = await api('/acc/accounts?balances=1'); draw(); };
    const form = (a = {}) => {
      const box = modal(`<h2>${a.id ? 'Edit' : 'New'} account</h2><div class="fgrid"><div><label class="f">Code *</label><input id="ac" value="${attr(a.code || '')}"></div><div><label class="f">Type *</label><select id="ay">${['asset', 'liability', 'equity', 'revenue', 'cogs', 'expense'].map(x => opt(x, nice(x), x === a.type)).join('')}</select></div><div class="full"><label class="f">Name *</label><input id="an2" value="${attr(a.name || '')}"></div><div><label class="f">Cash / bank account?</label><label class="sw"><input type="checkbox" id="acs" ${a.is_cash ? 'checked' : ''}><span></span></label></div><div><label class="f">Active</label><label class="sw"><input type="checkbox" id="aa" ${a.active === 0 ? '' : 'checked'}><span></span></label></div></div><div class="err inline hide" id="ae"></div><div class="acts"><button class="btn" id="c">Cancel</button><button class="btn pri" id="s">Save</button></div>`);
      $('#c', box).onclick = () => closeModal();
      $('#s', box).onclick = async () => { try { await api('/acc/accounts' + (a.id ? '/' + a.id : ''), a.id ? 'PUT' : 'POST', { code: $('#ac', box).value, name: $('#an2', box).value, type: $('#ay', box).value, is_cash: $('#acs', box).checked, active: $('#aa', box).checked }); invalidateLookup('accounts'); closeModal(); toast('Saved ✔'); load(); } catch (e) { $('#ae', box).textContent = e.message; $('#ae', box).classList.remove('hide'); } };
    };
    $('#aq', el).oninput = e => { q = e.target.value.toLowerCase(); draw(); };
    $('#at', el).onclick = e => { const b = e.target.closest('.tab'); if (!b) return; type = b.dataset.t; $$('#at .tab', el).forEach(x => x.classList.toggle('on', x === b)); draw(); };
    if ($('#an', el)) $('#an', el).onclick = () => form();
    pg.refresh = load; await load();
  },
});

/* ---------- journal entries ---------- */
PAGES.journals = () => ({
  events: [],
  async render(el, pg) {
    const st = { page: 1, q: '', source: '', status: '', range: 'month' }, limit = 30;
    const canEdit = can('accounting', 2);
    el.innerHTML = `<div class="page-h"><div><h1>Journal entries</h1><div class="hint">Every posting in the books. Sales, purchases and payroll are posted for you; add your own for anything else.</div></div><div class="acts">${canEdit ? '<button class="btn pri" id="jn">+ New journal</button>' : ''}</div></div><div class="toolbar"><input class="q" id="jq" placeholder="🔍 Reference or memo"><select id="js"><option value="">All sources</option><option value="manual">Manual</option><option value="auto">Automatic</option><option value="order">Sales</option><option value="purchase">Purchases</option><option value="payroll">Payroll</option></select><select id="jt"><option value="">Any status</option><option>posted</option><option>draft</option><option>reversed</option></select><select id="jr">${ACC_RANGES.map(r => opt(r[0], r[1], r[0] === st.range)).join('')}<option value="all">All time</option></select></div><div id="jb"></div>`;
    const load = async () => {
      const [a, b] = st.range === 'all' ? ['', ''] : accRange(st.range);
      const r = await api('/acc/journals' + qs({ page: st.page, limit, q: st.q, source: st.source, status: st.status, from: a, to: b }));
      $('#jb', el).innerHTML = r.rows.length ? `<div class="tw"><table class="t"><thead><tr><th>Ref</th><th>Date</th><th>Memo</th><th>Source</th><th class="num">Amount</th><th>Status</th><th>By</th></tr></thead><tbody>${r.rows.map(j => `<tr class="click" data-id="${j.id}"><td><b>${esc(j.ref)}</b></td><td>${esc(j.date)}</td><td>${esc(j.memo)}</td><td>${esc(j.source)}</td><td class="num">${money(j.amount)}</td><td>${chip(j.status)}</td><td>${esc(j.by_user)}</td></tr>`).join('')}</tbody></table></div>${pager(st, r.total, limit)}` : '<div class="card empty">No journals for these filters.</div>';
      bindPager($('#jb', el), st, r.total, limit, load);
      $$('#jb tbody tr', el).forEach(tr => tr.onclick = () => view(+tr.dataset.id));
    };
    const view = async id => {
      const j = await api('/acc/journals/' + id);
      const box = modal(`<div style="display:flex;gap:10px;align-items:center"><h2>${esc(j.ref)}</h2>${chip(j.status)}<span class="right muted">${esc(j.date)}</span></div><p>${esc(j.memo)} <small class="muted">· ${esc(j.source)}</small></p><div class="tw"><table class="t"><thead><tr><th>Account</th><th>Memo</th><th class="num">Debit</th><th class="num">Credit</th></tr></thead><tbody>${j.lines.map(l => `<tr><td>${esc(l.code)} · ${esc(l.name)}</td><td>${esc(l.memo)}</td><td class="num">${l.debit ? money(l.debit) : ''}</td><td class="num">${l.credit ? money(l.credit) : ''}</td></tr>`).join('')}</tbody><tfoot><tr><td colspan="2">Total</td><td class="num">${money(j.lines.reduce((x, l) => x + l.debit, 0))}</td><td class="num">${money(j.lines.reduce((x, l) => x + l.credit, 0))}</td></tr></tfoot></table></div>
        <div class="acts">${j.status === 'draft' && canEdit ? '<button class="btn ok" id="jp">Post</button><button class="btn bad" id="jd">Delete draft</button>' : ''}${j.status === 'posted' && can('accounting', 3) ? '<button class="btn bad" id="jr2">Reverse</button>' : ''}<button class="btn" id="jc">Close</button></div>`, { size: 'wide' });
      $('#jc', box).onclick = () => closeModal();
      if ($('#jp', box)) $('#jp', box).onclick = async () => { if (await act(() => api('/acc/journals/' + id + '/post', 'POST', {}), 'Posted ✔')) { closeModal(); load(); } };
      if ($('#jd', box)) $('#jd', box).onclick = async () => { if (await act(() => api('/acc/journals/' + id, 'DELETE'), 'Deleted')) { closeModal(); load(); } };
      if ($('#jr2', box)) $('#jr2', box).onclick = async () => { if (await confirmBox('Post a mirror entry that cancels this journal?', 'Reverse', true) && await act(() => api('/acc/journals/' + id + '/reverse', 'POST', {}), 'Reversed ✔')) { closeModal(); load(); } };
    };
    const form = async () => {
      const accs = await lookup('accounts'); const dims = await lookup('dimensions', { full: true }).catch(() => []);
      const dimVals = dims.flatMap(d => (d.d.values || []).map(v => d.label + ': ' + v.name));
      const lineRow = () => `<div class="ln" style="display:grid;grid-template-columns:2fr 1fr 1fr ${dimVals.length ? '1.2fr' : ''} 1.2fr auto;gap:6px;margin-bottom:6px"><select data-a>${opt('', '— account —')}${accs.map(a => opt(a.id, a.label)).join('')}</select><input data-d type="number" step="0.01" placeholder="Debit"><input data-c type="number" step="0.01" placeholder="Credit">${dimVals.length ? `<select data-dim>${opt('', 'Dimension')}${dimVals.map(v => opt(v, v)).join('')}</select>` : ''}<input data-m placeholder="Line memo"><button type="button" class="btn sm bad" data-x>✕</button></div>`;
      const box = modal(`<h2>New journal entry</h2><div class="fgrid"><div><label class="f">Date</label><input type="date" id="jd" value="${todayStr()}"></div><div><label class="f">Memo</label><input id="jm" placeholder="What is this for?"></div></div><label class="f">Lines (total debits must equal total credits)</label><div id="jl">${lineRow()}${lineRow()}</div><button class="btn sm" id="ja">+ Add line</button><div id="jt2" class="muted" style="margin-top:8px"></div><div class="err inline hide" id="je"></div><div class="acts"><button class="btn" id="c">Cancel</button><button class="btn" id="sd">Save as draft</button><button class="btn pri" id="sp">Post</button></div>`, { size: 'xl' });
      const tot = () => { let d = 0, c = 0; $$('#jl .ln', box).forEach(r => { d += toMinor($('[data-d]', r).value); c += toMinor($('[data-c]', r).value); }); $('#jt2', box).innerHTML = `Debits <b>${money(d)}</b> · Credits <b>${money(c)}</b> · ${d === c && d > 0 ? '<span style="color:var(--ok)">balanced ✔</span>' : `<span style="color:var(--bad)">difference ${money(Math.abs(d - c))}</span>`}`; };
      box.addEventListener('input', tot); tot();
      box.addEventListener('click', e => { if (e.target.dataset.x !== undefined) { e.target.closest('.ln').remove(); tot(); } });
      $('#ja', box).onclick = () => { $('#jl', box).insertAdjacentHTML('beforeend', lineRow()); };
      $('#c', box).onclick = () => closeModal();
      const save = async draft => {
        const lines = $$('#jl .ln', box).map(r => ({ account: +$('[data-a]', r).value, debit: toMinor($('[data-d]', r).value), credit: toMinor($('[data-c]', r).value), memo: $('[data-m]', r).value, dim: $('[data-dim]', r) ? $('[data-dim]', r).value : '' })).filter(l => l.account);
        try { await api('/acc/journals', 'POST', { date: $('#jd', box).value, memo: $('#jm', box).value, draft, lines }); closeModal(); toast(draft ? 'Draft saved' : 'Posted ✔'); load(); } catch (e) { $('#je', box).textContent = e.message; $('#je', box).classList.remove('hide'); }
      };
      $('#sd', box).onclick = () => save(true); $('#sp', box).onclick = () => save(false);
    };
    pg.refresh = load;
    $('#jq', el).oninput = debounce(e => { st.q = e.target.value; st.page = 1; load(); });
    $('#js', el).onchange = e => { st.source = e.target.value; st.page = 1; load(); };
    $('#jt', el).onchange = e => { st.status = e.target.value; st.page = 1; load(); };
    $('#jr', el).onchange = e => { st.range = e.target.value; st.page = 1; load(); };
    if ($('#jn', el)) $('#jn', el).onclick = form;
    await load();
  },
});

PAGES.inv_postings = () => ({ events: [], async render(el, pg) { await PAGES.journals().render(el, pg); const h = $('.page-h h1', el); if (h) h.textContent = 'Inventory postings'; const s = $('#js', el); if (s) { s.value = 'purchase'; s.onchange({ target: s }); } } });
PAGES.posting_log = () => ({ events: [], async render(el, pg) { await PAGES.journals().render(el, pg); const h = $('.page-h h1', el); if (h) h.textContent = 'Posting log'; const s = $('#js', el); if (s) { s.value = 'auto'; s.onchange({ target: s }); } } });

/* ---------- unposted sales ---------- */
PAGES.unposted = () => ({
  events: [],
  async render(el, pg) {
    const load = async () => {
      const rows = await api('/acc/unposted');
      el.innerHTML = `<div class="page-h"><div><h1>Unposted events</h1><div class="hint">Paid sales that have no journal entry yet.</div></div></div>` + (rows.length ? `<div class="tw"><table class="t"><thead><tr><th>Order</th><th>Date</th><th class="num">Total</th><th></th></tr></thead><tbody>${rows.map(r => `<tr><td>${esc(r.no)}</td><td>${esc(fdt(r.created_at))}</td><td class="num">${money(r.total)}</td><td><button class="btn sm pri" data-o="${r.id}">Post now</button></td></tr>`).join('')}</tbody></table></div>` : '<div class="card empty">✔ Every paid sale is posted to the ledger.</div>');
      $$('[data-o]', el).forEach(b => b.onclick = async () => { if (await act(() => api('/acc/retry-post', 'POST', { order_id: +b.dataset.o }), 'Posted ✔')) load(); });
    };
    pg.refresh = load; await load();
  },
});

/* ---------- financial statements ---------- */
function stmtSection(title, rows, total, link) {
  return `<h4 style="margin:12px 0 4px">${esc(title)}</h4>${rows.map(r => `<div class="row"><a href="#/ledger?account=${r.id}" style="color:inherit;text-decoration:none">${esc(r.code)} · ${esc(r.name)}</a><span>${money(r.balance)}</span></div>`).join('') || '<div class="muted">—</div>'}<div class="row" style="font-weight:800"><span>Total ${esc(title.toLowerCase())}</span><span>${money(total)}</span></div>`;
}
PAGES.fin_reports = () => ({
  events: [],
  async render(el, pg) {
    let tab = 'pnl', range = 'year', compare = false, budget = 0;
    el.innerHTML = `<div class="page-h"><div><h1>Financial reports</h1><div class="hint">Profit & loss, balance sheet, cash flow and budget comparison.</div></div><div class="acts"><select id="fr">${ACC_RANGES.map(r => opt(r[0], r[1], r[0] === range)).join('')}</select><label style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="fc"> Compare</label><button class="btn" id="fp">🖨 Print</button></div></div><div class="tabs" id="ft" style="margin-bottom:12px">${[['pnl', 'Profit & loss'], ['bs', 'Balance sheet'], ['cash', 'Cash flow'], ['bud', 'Budget vs actual']].map(t => `<button class="tab ${t[0] === tab ? 'on' : ''}" data-t="${t[0]}">${t[1]}</button>`).join('')}</div><div class="card" id="fb"></div>`;
    const load = async () => {
      const [a, b] = accRange(range), fb = $('#fb', el);
      if (tab === 'pnl') {
        const d = await api('/acc/report/pnl' + qs({ from: a, to: b, compare: compare ? 1 : '' })); const p = d.previous;
        fb.innerHTML = `<h3>Profit & loss</h3><div class="sub">${esc(a)} to ${esc(b)}</div>${stmtSection('Revenue', d.revenue, d.total_revenue)}${stmtSection('Cost of goods sold', d.cogs, d.total_cogs)}<div class="row" style="font-weight:800;font-size:16px"><span>Gross profit</span><span>${money(d.gross_profit)}</span></div>${stmtSection('Expenses', d.expenses, d.total_expenses)}<div class="row" style="font-weight:800;font-size:18px;border-top:2px solid var(--line)"><span>Net income</span><span style="color:${d.net_income < 0 ? 'var(--bad)' : 'var(--ok)'}">${money(d.net_income)}</span></div>${p ? `<div class="card" style="margin-top:12px"><b>Previous period</b> · revenue ${money(p.total_revenue)} (${delta(d.total_revenue, p.total_revenue)}) · net income ${money(p.net_income)} (${delta(d.net_income, p.net_income)})</div>` : ''}`;
      } else if (tab === 'bs') {
        const d = await api('/acc/report/bs' + qs({ to: b }));
        fb.innerHTML = `<h3>Balance sheet</h3><div class="sub">As at ${esc(d.to)}</div>${stmtSection('Assets', d.assets, d.total_assets)}${stmtSection('Liabilities', d.liabilities, d.total_liabilities)}${stmtSection('Equity', d.equity.concat([{ code: '', name: 'Current period earnings', balance: d.earnings, id: 0 }]), d.total_equity)}<div style="margin-top:10px">${d.balanced ? '<span class="chip ok">✔ Assets = Liabilities + Equity</span>' : `<span class="chip failed">Out of balance by ${money(d.difference)}</span>`}</div>`;
      } else if (tab === 'cash') {
        const d = await api('/acc/report/cash' + qs({ from: a, to: b }));
        fb.innerHTML = `<h3>Cash flow</h3><div class="sub">Movement through cash and bank accounts, ${esc(a)} to ${esc(b)}</div><div class="row"><span>Opening cash & bank</span><b>${money(d.opening)}</b></div>${d.rows.map(r => `<div class="row"><span>${esc(r.label)}</span><span><span style="color:var(--ok)">+${money(r.inflow)}</span> &nbsp; <span style="color:var(--bad)">-${money(r.outflow)}</span> &nbsp; <b>${money(r.net)}</b></span></div>`).join('')}<div class="row" style="font-weight:800"><span>Net change</span><span>${money(d.net)}</span></div><div class="row" style="font-weight:800;font-size:16px"><span>Closing cash & bank</span><span>${money(d.closing)}</span></div>`;
      } else {
        const d = await api('/acc/budget-vs-actual' + qs({ budget: budget || '' }));
        if (!budget) { fb.innerHTML = `<h3>Budget vs actual</h3>${d.budgets && d.budgets.length ? `<div class="pill-row">${d.budgets.map(x => `<button class="btn" data-b="${x.id}">${esc(x.name)} ${chip(x.status)}</button>`).join('')}</div>` : '<div class="empty">Create a budget first (Planning & assets → Budgets).</div>'}`; $$('[data-b]', fb).forEach(x => x.onclick = () => { budget = +x.dataset.b; load(); }); return; }
        fb.innerHTML = `<h3>${esc(d.name)}</h3><div class="sub">${esc(d.from)} to ${esc(d.to)} · <a href="#" id="bb">choose another</a></div>${tableHTML([{ key: 'account', label: 'Account' }, { key: 'budget', label: 'Budget', type: 'money' }, { key: 'actual', label: 'Actual', type: 'money' }, { key: 'variance', label: 'Variance', type: 'money' }], d.rows, { budget: d.total_budget, actual: d.total_actual, variance: d.total_actual - d.total_budget })}`;
        $('#bb', fb).onclick = e => { e.preventDefault(); budget = 0; load(); };
      }
    };
    $('#ft', el).onclick = e => { const b = e.target.closest('.tab'); if (!b) return; tab = b.dataset.t; budget = 0; $$('#ft .tab', el).forEach(x => x.classList.toggle('on', x === b)); load(); };
    $('#fr', el).onchange = e => { range = e.target.value; load(); };
    $('#fc', el).onchange = e => { compare = e.target.checked; load(); };
    $('#fp', el).onclick = () => printHTML('<div style="font-family:sans-serif;padding:20px">' + $('#fb', el).innerHTML + '</div>', { paper: 'A4' });
    pg.refresh = load; await load();
  },
});

PAGES.trial_balance = () => ({
  events: [],
  async render(el, pg) {
    let to = todayStr();
    el.innerHTML = `<div class="page-h"><div><h1>Trial balance</h1><div class="hint">Every account's balance. Debits and credits must match.</div></div><div class="acts"><input type="date" id="tt" value="${to}" style="width:auto"><button class="btn" id="tx">⤓ Export</button></div></div><div id="tb"></div>`;
    const load = async () => {
      const d = await api('/acc/report/trial' + qs({ to }));
      $('#tb', el).innerHTML = tableHTML([{ key: 'code', label: 'Code' }, { key: 'name', label: 'Account' }, { key: 'type', label: 'Type', type: 'chip' }, { key: 'debit', label: 'Debit', type: 'money' }, { key: 'credit', label: 'Credit', type: 'money' }], d.rows, { debit: d.total_debit, credit: d.total_credit }) + `<div style="margin-top:10px">${d.balanced ? '<span class="chip ok">✔ Balanced</span>' : '<span class="chip failed">Not balanced</span>'}</div>`;
    };
    $('#tt', el).onchange = e => { to = e.target.value; load(); };
    $('#tx', el).onclick = () => download('/acc/export' + qs({ type: 'trial_balance', to }), 'trial_balance.csv');
    pg.refresh = load; await load();
  },
});

PAGES.ledger = () => ({
  events: [],
  async render(el, pg) {
    const accs = await lookup('accounts');
    let acc = +(pg.params.account || 0) || (accs[0] && accs[0].id), range = 'year';
    el.innerHTML = `<div class="page-h"><div><h1>General ledger</h1><div class="hint">Every line posted to one account, with a running balance.</div></div><div class="acts"><select id="la" style="max-width:260px">${accs.map(a => opt(a.id, a.label, a.id === acc)).join('')}</select><select id="lr">${ACC_RANGES.map(r => opt(r[0], r[1], r[0] === range)).join('')}</select><button class="btn" id="lx">⤓ Export all</button></div></div><div id="lb"></div>`;
    const load = async () => {
      const [a, b] = accRange(range); const d = await api('/acc/report/ledger' + qs({ account: acc, from: a, to: b }));
      $('#lb', el).innerHTML = `<div class="card"><h3>${esc(d.account || '')}</h3><div class="row"><span>Opening balance</span><b>${money(d.opening)}</b></div></div><div class="tw" style="margin-top:10px"><table class="t"><thead><tr><th>Date</th><th>Journal</th><th>Description</th><th class="num">Debit</th><th class="num">Credit</th><th class="num">Balance</th></tr></thead><tbody>${d.rows.map(r => `<tr><td>${esc(r.date)}</td><td>${esc(r.ref)}</td><td>${esc(r.memo || r.jmemo)}</td><td class="num">${r.debit ? money(r.debit) : ''}</td><td class="num">${r.credit ? money(r.credit) : ''}</td><td class="num"><b>${money(r.balance)}</b></td></tr>`).join('')}</tbody><tfoot><tr><td colspan="5">Closing balance</td><td class="num">${money(d.closing)}</td></tr></tfoot></table></div>`;
    };
    $('#la', el).onchange = e => { acc = +e.target.value; load(); };
    $('#lr', el).onchange = e => { range = e.target.value; load(); };
    $('#lx', el).onclick = () => { const [a, b] = accRange(range); download('/acc/export' + qs({ type: 'general_ledger', from: a, to: b }), 'general_ledger.csv'); };
    pg.refresh = load; await load();
  },
});

PAGES.acc_exports_page = () => ({
  events: ['res:acc_exports'],
  async render(el, pg) {
    let range = 'year';
    el.innerHTML = `<div class="page-h"><div><h1>Accounting exports</h1><div class="hint">Download your books as CSV files for your accountant or tax filing.</div></div></div><div class="card" style="max-width:640px"><div class="fgrid"><div><label class="f">Report</label><select id="et">${[['trial_balance', 'Trial balance'], ['general_ledger', 'General ledger (all lines)'], ['profit_loss', 'Profit & loss'], ['balance_sheet', 'Balance sheet']].map(x => opt(x[0], x[1])).join('')}</select></div><div><label class="f">Period</label><select id="er">${ACC_RANGES.map(r => opt(r[0], r[1], r[0] === range)).join('')}</select></div></div><div class="acts" style="display:flex;justify-content:flex-end;margin-top:14px"><button class="btn pri" id="eg">⤓ Download CSV</button></div></div><h3 style="margin:18px 0 8px">Export history</h3><div id="eh"></div>`;
    const hist = async () => { const r = await api('/r/acc_exports?limit=15'); $('#eh', el).innerHTML = r.rows.length ? `<div class="tw"><table class="t"><thead><tr><th>When</th><th>Export</th><th class="num">Rows</th><th>By</th></tr></thead><tbody>${r.rows.map(x => `<tr><td>${esc(fdt(x.created_at))}</td><td>${esc(x.name)}</td><td class="num">${num(x.rows)}</td><td>${esc(x.user)}</td></tr>`).join('')}</tbody></table></div>` : '<div class="card empty">No exports yet.</div>'; };
    $('#er', el).onchange = e => range = e.target.value;
    $('#eg', el).onclick = async () => { const [a, b] = accRange(range); const ty = $('#et', el).value; await download('/acc/export' + qs({ type: ty, from: a, to: b }), ty + '.csv'); setTimeout(hist, 800); };
    pg.refresh = hist; await hist();
  },
});

/* ---------- restaurant accounting reports ---------- */
PAGES.food_cost = () => ({
  events: [],
  async render(el, pg) {
    let range = '30d';
    el.innerHTML = `<div class="page-h"><div><h1>Food cost</h1><div class="hint">What the food cost you compared with what you sold it for.</div></div><div class="acts"><select id="fr">${RANGES.map(r => opt(r[0], r[1], r[0] === range)).join('')}</select></div></div><div id="fb"></div>`;
    const load = async () => {
      const [a, b] = rangeFor(range); const d = await api('/acc/foodcost' + qs({ from: a, to: b }));
      const cols = [{ key: 'name', label: 'Name' }, { key: 'qty', label: 'Sold', type: 'int' }, { key: 'revenue', label: 'Revenue', type: 'money' }, { key: 'cost', label: 'Food cost', type: 'money' }, { key: 'cost_pct', label: 'Cost %', type: 'pct' }, { key: 'margin_pct', label: 'Margin %', type: 'pct' }];
      $('#fb', el).innerHTML = `<div class="grid g4" style="margin-bottom:14px"><div class="card stat">${stat('Revenue', money(d.revenue))}</div><div class="card stat t3">${stat('Food cost', money(d.cost))}</div><div class="card stat t2">${stat('Food cost %', d.cost_pct + '%', d.cost_pct > 35 ? '<span class="chip failed">High</span>' : '<span class="chip ok">Healthy</span>')}</div><div class="card stat t4">${stat('Waste & spoilage', money(d.waste))}</div></div><h3>By category</h3>${tableHTML(cols, d.categories)}<h3 style="margin-top:16px">By product</h3>${tableHTML(cols, d.products)}`;
    };
    $('#fr', el).onchange = e => { range = e.target.value; load(); };
    pg.refresh = load; await load();
  },
});

PAGES.menu_profit = () => ({
  events: [],
  async render(el, pg) {
    let range = '30d';
    el.innerHTML = `<div class="page-h"><div><h1>Menu profitability</h1><div class="hint">Which dishes make money and which only look busy.</div></div><div class="acts"><select id="fr">${RANGES.map(r => opt(r[0], r[1], r[0] === range)).join('')}</select></div></div><div id="fb"></div>`;
    const info = { star: ['⭐ Stars', 'Popular and profitable - promote these.'], plowhorse: ['🐴 Plowhorses', 'Popular but low margin - raise price or cut cost.'], puzzle: ['🧩 Puzzles', 'High margin but rarely ordered - push them.'], dog: ['🐕 Dogs', 'Rare and low margin - consider removing.'] };
    const load = async () => {
      const [a, b] = rangeFor(range); const d = await api('/acc/menu-profit' + qs({ from: a, to: b }));
      $('#fb', el).innerHTML = `<div class="grid g2">${Object.keys(info).map(k => { const l = d.rows.filter(r => r.class === k); return `<div class="card"><h3>${info[k][0]} <span class="chip">${l.length}</span></h3><div class="sub">${info[k][1]}</div>${l.slice(0, 8).map(r => `<div class="row"><span>${esc(r.name)}<br><small class="muted">${num(r.qty)} sold</small></span><span><b>${r.margin_pct}%</b> margin<br><small class="muted">${money(r.margin)}</small></span></div>`).join('') || '<div class="empty">None</div>'}</div>`; }).join('')}</div>`;
    };
    $('#fr', el).onchange = e => { range = e.target.value; load(); };
    pg.refresh = load; await load();
  },
});

PAGES.tips_report = () => ({
  events: [],
  async render(el, pg) {
    let range = '30d';
    el.innerHTML = `<div class="page-h"><div><h1>Tips & service charges</h1><div class="hint">Money collected for staff, and how much is still owed to them.</div></div><div class="acts"><select id="fr">${RANGES.map(r => opt(r[0], r[1], r[0] === range)).join('')}</select></div></div><div id="fb"></div>`;
    const load = async () => {
      const [a, b] = rangeFor(range); const d = await api('/acc/tips' + qs({ from: a, to: b }));
      $('#fb', el).innerHTML = `<div class="grid g4" style="margin-bottom:14px"><div class="card stat">${stat('Tips', money(d.tips))}</div><div class="card stat t2">${stat('Service charge', money(d.service))}</div><div class="card stat t3">${stat('Tips payable (ledger)', money(d.payable), '<span class="muted">still owed to staff</span>')}</div></div><div class="grid g2"><div class="card"><h3>By staff</h3>${hbars(d.by_staff.map(x => ({ label: x.name, value: x.tips })), money)}</div><div class="card"><h3>By day</h3>${barChart(d.by_day.map(x => ({ label: x.day, value: x.tips })))}</div></div>`;
    };
    $('#fr', el).onchange = e => { range = e.target.value; load(); };
    pg.refresh = load; await load();
  },
});

PAGES.supplier_statements = () => ({
  events: ['res:supplier_bills'],
  async render(el, pg) {
    const load = async () => {
      const d = await api('/acc/supplier-statements');
      const cols = [{ key: 'supplier', label: 'Supplier' }, { key: 'billed', label: 'Billed', type: 'money' }, { key: 'paid', label: 'Paid', type: 'money' }, { key: 'balance', label: 'Owed', type: 'money' }, { key: 'current', label: 'Not due', type: 'money' }, { key: 'd1_30', label: '1-30 late', type: 'money' }, { key: 'd31_60', label: '31-60', type: 'money' }, { key: 'd61_90', label: '61-90', type: 'money' }, { key: 'over_90', label: '90+', type: 'money' }];
      const tot = {}; cols.slice(1).forEach(c => tot[c.key] = d.rows.reduce((a, r) => a + r[c.key], 0));
      el.innerHTML = `<div class="page-h"><div><h1>Supplier statements</h1><div class="hint">What you owe each supplier and how overdue it is.</div></div></div>${tableHTML(cols, d.rows, tot)}<div class="card" style="margin-top:12px">Ledger accounts payable balance: <b>${money(d.ledger_ap)}</b> ${d.ledger_ap === tot.balance ? '<span class="chip ok">matches the bills</span>' : '<span class="chip pending">differs from open bills</span>'}</div>`;
    };
    pg.refresh = load; await load();
  },
});

PAGES.inventory_valuation = () => ({
  events: ['res:ingredients', 'order'],
  async render(el, pg) {
    const load = async () => {
      const d = await api('/acc/inventory-valuation');
      el.innerHTML = `<div class="page-h"><div><h1>Inventory valuation</h1><div class="hint">What your stock is worth, checked against the ledger.</div></div></div><div class="grid g4" style="margin-bottom:14px"><div class="card stat">${stat('Stock value', money(d.total))}</div><div class="card stat t2">${stat('Ledger inventory account', money(d.ledger))}</div><div class="card stat ${d.difference ? 't3' : 't2'}">${stat('Difference', money(d.difference), d.difference ? '<span class="muted">Post a count or provision to reconcile</span>' : '<span class="chip ok">Matches</span>')}</div></div>${tableHTML([{ key: 'name', label: 'Ingredient' }, { key: 'category', label: 'Category' }, { key: 'qty', label: 'On hand', type: 'num' }, { key: 'unit', label: 'Unit' }, { key: 'cost', label: 'Unit cost', type: 'money' }, { key: 'value', label: 'Value', type: 'money' }], d.rows, { value: d.total })}`;
    };
    pg.refresh = load; await load();
  },
});

PAGES.consolidation = () => ({
  events: [],
  async render(el, pg) {
    let range = 'year';
    el.innerHTML = `<div class="page-h"><div><h1>Consolidation workspace</h1><div class="hint">All branches added together, with intercompany items eliminated.</div></div><div class="acts"><select id="fr">${ACC_RANGES.map(r => opt(r[0], r[1], r[0] === range)).join('')}</select></div></div><div id="fb"></div>`;
    const load = async () => {
      const [a, b] = accRange(range); const d = await api('/acc/consolidation' + qs({ from: a, to: b }));
      $('#fb', el).innerHTML = tableHTML([{ key: 'entity', label: 'Branch / entity' }, { key: 'revenue', label: 'Revenue', type: 'money' }, { key: 'cogs', label: 'COGS', type: 'money' }, { key: 'expenses', label: 'Expenses', type: 'money' }, { key: 'net_income', label: 'Net income', type: 'money' }], d.rows, { revenue: d.revenue, cogs: d.cogs, expenses: d.expenses, net_income: d.net_income }) + `<div class="card" style="margin-top:12px">Intercompany eliminated in this period: <b>${money(d.eliminated)}</b></div>`;
    };
    $('#fr', el).onchange = e => { range = e.target.value; load(); };
    pg.refresh = load; await load();
  },
});

PAGES.acc_setup = () => ({
  events: [],
  async render(el, pg) {
    const [accs, fy, dash] = await Promise.all([api('/acc/accounts?balances=1'), api('/r/fiscal_years?limit=5'), api('/acc/dash' + qs({ from: dateRangeFor('year')[0], to: todayStr() }))]);
    const steps = [[accs.length > 5, 'Chart of accounts', 'A standard restaurant chart is already loaded. Add your own accounts if needed.', '#/accounts'], [fy.total > 0, 'Fiscal year & periods', 'Create the year and its 12 monthly periods.', '#/fiscal_years'], [dash.cash !== 0, 'Opening balances', 'Enter what you already had in the bank and cash drawers.', null], [true, 'Account mappings', 'Check which accounts sales, tax and payroll post to.', '#/account_maps']];
    el.innerHTML = `<div class="page-h"><div><h1>Initial setup</h1><div class="hint">Get your books ready in four steps.</div></div></div><div class="card" style="max-width:720px">${steps.map((s, i) => `<div class="check ${s[0] ? 'done' : ''}"><i>${s[0] ? '✓' : i + 1}</i><div style="flex:1"><b>${esc(s[1])}</b><br><small class="muted">${esc(s[2])}</small></div>${s[3] ? `<a class="btn sm" href="${s[3]}">Open</a>` : '<button class="btn sm pri" id="ob">Enter balances</button>'}</div>`).join('')}</div>`;
    $('#ob', el).onclick = async () => {
      const list = accs.filter(a => ['asset', 'liability', 'equity'].includes(a.type) && a.code !== '3000');
      const box = modal(`<h2>Opening balances</h2><div class="muted">Type what each account held on the day you start. The difference goes to Owner's equity automatically.</div><label class="f">As at date</label><input type="date" id="od" value="${todayStr()}"><div class="tw" style="margin-top:10px;max-height:46vh;overflow:auto"><table class="t"><thead><tr><th>Account</th><th class="num">Debit</th><th class="num">Credit</th></tr></thead><tbody>${list.map(a => `<tr data-a="${a.id}"><td>${esc(a.code)} · ${esc(a.name)}</td><td><input type="number" step="0.01" data-d></td><td><input type="number" step="0.01" data-c></td></tr>`).join('')}</tbody></table></div><div class="err inline hide" id="oe"></div><div class="acts"><button class="btn" id="c">Cancel</button><button class="btn pri" id="s">Post opening balances</button></div>`, { size: 'wide' });
      $('#c', box).onclick = () => closeModal();
      $('#s', box).onclick = async () => { const lines = $$('tbody tr', box).map(r => ({ account: +r.dataset.a, debit: toMinor($('[data-d]', r).value), credit: toMinor($('[data-c]', r).value) })).filter(l => l.debit || l.credit); try { await api('/acc/opening', 'POST', { date: $('#od', box).value, lines }); closeModal(); toast('Opening balances posted ✔'); route(); } catch (e) { $('#oe', box).textContent = e.message; $('#oe', box).classList.remove('hide'); } };
    };
  },
});
