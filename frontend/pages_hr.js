'use strict';
/* pages_hr.js - HRMS dashboard, attendance, leave, payroll analytics, self-service */

/* ---------- HR dashboard ---------- */
PAGES.hr_dash = () => widgetDash({
  key: 'dash-hr', title: 'HRMS Dashboard', nav: 'hr_dash', hint: 'Workforce, attendance, leave and overtime at a glance', range: 'month', events: ['attendance', 'res:leave_requests', 'res:overtime'],
  ranges: [['today', 'Today'], ['7d', 'Last 7 days'], ['30d', 'Last 30 days'], ['month', 'This month'], ['lastmonth', 'Last month'], ['year', 'This year']],
  load: range => { const [a, b] = dateRangeFor(range); return api('/hr/dash' + qs({ from: a, to: b })); },
  defaultHidden: ['by_dept', 'completion'],
  widgets: [
    { id: 'total', title: 'Total employees', stat: true, render: d => stat('Total employees', num(d.total), '<span class="muted">Employees in scope</span>') },
    { id: 'active', title: 'Active employees', stat: true, tone: 2, render: d => stat('Active employees', num(d.active), '<span class="muted">Currently working here</span>') },
    { id: 'present', title: 'Present today', stat: true, tone: 2, render: d => stat('Present today', num(d.present), '<span class="muted">Checked in</span>') },
    { id: 'absent', title: 'Absent today', stat: true, tone: 3, render: d => stat('Absent today', num(d.absent), '<span class="muted">Marked absent</span>') },
    { id: 'leave', title: 'On leave', stat: true, tone: 4, render: d => stat('On leave today', num(d.on_leave), '<span class="muted">Approved leave</span>') },
    { id: 'late', title: 'Late arrivals', stat: true, tone: 3, render: d => stat('Late arrivals today', num(d.late), '<span class="muted">After shift start + grace</span>') },
    { id: 'pending', title: 'Pending leave', stat: true, tone: 5, render: d => stat('Pending leave requests', num(d.pending_leave), d.pending_leave ? '<a href="#/leave_approvals">Review now →</a>' : '<span class="muted">All reviewed</span>') },
    { id: 'ot', title: 'Overtime hours', stat: true, render: d => stat('Overtime hours', num(d.overtime_hours, 1) + ' h', `<span class="muted">${d.overtime_pending} request(s) waiting</span>`) },
    { id: 'trend', title: 'Attendance trend', w: 4, sub: 'Daily present, absent, late and leave', render: d => lineChart(d.trend.map(x => x.label), [{ name: 'Present', values: d.trend.map(x => x.present), color: '#16a34a', area: true }, { name: 'Absent', values: d.trend.map(x => x.absent), color: '#dc2626' }, { name: 'Late', values: d.trend.map(x => x.late), color: '#d97706' }, { name: 'On leave', values: d.trend.map(x => x.leave), color: '#2563eb' }], num) },
    { id: 'mix', title: 'Attendance status', w: 2, sub: 'Mix for the selected period', render: d => donut(Object.entries(d.status_mix).map(([k, v]) => ({ label: nice(k), value: v }))) },
    { id: 'coverage', title: 'Today shift coverage', w: 2, sub: 'Scheduled employees and live coverage', render: d => d.coverage.length ? d.coverage.map(c => `<div class="hbar" style="grid-template-columns:140px 1fr 90px"><span>${esc(c.shift)}</span><div class="tr"><i style="width:${c.pct}%;background:${c.pct > 70 ? 'var(--ok)' : c.pct > 30 ? 'var(--warn)' : 'var(--bad)'}"></i></div><b>${c.covered}/${c.scheduled} (${c.pct}%)</b></div>`).join('') : '<div class="empty">No shifts assigned</div>' },
    { id: 'exceptions', title: 'Attendance exceptions', w: 2, sub: 'Highest-priority attendance issues', render: d => d.exceptions.length ? `<table class="t"><thead><tr><th>Employee</th><th>Date</th><th>Status</th><th>Severity</th></tr></thead><tbody>${d.exceptions.map(x => `<tr><td>${esc(x.employee)}</td><td>${esc(x.date)}</td><td>${chip(x.status)}</td><td>${chip(x.severity === 'high' ? 'failed' : 'pending').replace(/>[^<]*</, '>' + x.severity + '<')}</td></tr>`).join('')}</tbody></table>` : '<div class="empty">No data available</div>' },
    { id: 'upcoming', title: 'Upcoming leave', w: 2, sub: 'Approved leave starting soon', render: d => d.upcoming_leave.length ? d.upcoming_leave.map(x => `<div class="row"><span><b>${esc(x.employee)}</b><br><small class="muted">${esc(x.type)}</small></span><span>${esc(x.from)} → ${esc(x.to)} <b>${x.days}d</b></span></div>`).join('') : '<div class="empty">No data available</div>' },
    { id: 'leave_types', title: 'Leave type distribution', w: 2, sub: 'Approved days by type', render: d => donut(Object.entries(d.leave_types).map(([k, v]) => ({ label: k, value: v })), n => num(n, 1) + ' d') },
    { id: 'by_dept', title: 'Headcount by department', w: 2, render: d => hbars(Object.entries(d.by_department).map(([k, v]) => ({ label: k || '—', value: v }))) },
  ],
});

/* ---------- Attendance records ---------- */
PAGES.attendance = () => ({
  events: ['attendance'],
  async render(el, pg) {
    const emps = await lookup('employees');
    const st = { page: 1, employee: 0, status: '', range: '7d' }, limit = 30;
    const canEdit = can('attendance', 2);
    el.innerHTML = `<div class="page-h"><div><h1>Attendance records</h1><div class="hint">Who came in, when they left, and how long they worked.</div></div><div class="acts">${canEdit ? '<button class="btn" id="ag">⚙ Mark absences</button><button class="btn pri" id="an">+ Manual entry</button>' : ''}<a class="btn" href="#/checkin">⏱ Check in / out</a></div></div>
      <div class="toolbar"><select id="ae"><option value="0">All employees</option>${emps.map(e => opt(e.id, e.label)).join('')}</select><select id="as"><option value="">All statuses</option>${['present', 'late', 'absent', 'leave', 'half_day', 'holiday'].map(s => opt(s, nice(s))).join('')}</select><select id="ar">${RANGES.map(r => opt(r[0], r[1], r[0] === st.range)).join('')}</select></div><div id="ab"></div>`;
    const load = async () => {
      const [a, b] = dateRangeFor(st.range);
      const r = await api('/hr/attendance' + qs({ page: st.page, limit, employee: st.employee, status: st.status, from: a, to: b }));
      $('#ab', el).innerHTML = r.rows.length ? `<div class="tw"><table class="t"><thead><tr><th>Date</th><th>Employee</th><th>In</th><th>Out</th><th>Worked</th><th>Late</th><th>Overtime</th><th>Status</th><th>Source</th>${canEdit ? '<th></th>' : ''}</tr></thead><tbody>${r.rows.map(x => `<tr><td>${esc(x.date)}</td><td><b>${esc(x.employee)}</b></td><td>${x.check_in ? esc(ftime(x.check_in)) : '—'}</td><td>${x.check_out ? esc(ftime(x.check_out)) : '—'}</td><td>${x.worked_min ? Math.floor(x.worked_min / 60) + 'h ' + pad(x.worked_min % 60) + 'm' : '—'}</td><td>${x.late_min ? x.late_min + ' min' : '—'}</td><td>${x.ot_min ? Math.floor(x.ot_min / 60) + 'h ' + pad(x.ot_min % 60) + 'm' : '—'}</td><td>${chip(x.status)}</td><td>${esc(x.source)}</td>${canEdit ? `<td><button class="btn sm" data-e="${x.id}">✎</button> <button class="btn sm bad" data-d="${x.id}">✕</button></td>` : ''}</tr>`).join('')}</tbody></table></div>${pager(st, r.total, limit)}` : '<div class="card empty">No attendance records for these filters.</div>';
      bindPager($('#ab', el), st, r.total, limit, load);
      $$('[data-e]', el).forEach(b => b.onclick = () => entry(r.rows.find(x => x.id === +b.dataset.e)));
      $$('[data-d]', el).forEach(b => b.onclick = async () => { if (await confirmBox('Delete this record?', 'Delete', true) && await act(() => api('/hr/attendance/' + b.dataset.d, 'DELETE'), 'Deleted')) load(); });
    };
    const entry = (x = {}) => {
      const box = modal(`<h2>${x.id ? 'Edit' : 'New'} attendance</h2><div class="fgrid"><div class="full"><label class="f">Employee</label><select id="ee">${emps.map(e => opt(e.id, e.label, e.id === x.employee_id)).join('')}</select></div><div><label class="f">Date</label><input type="date" id="ed" value="${attr(x.date || todayStr())}"></div><div><label class="f">Status</label><select id="es">${['present', 'late', 'absent', 'leave', 'half_day', 'holiday'].map(s => opt(s, nice(s), s === (x.status || 'present'))).join('')}</select></div><div><label class="f">Check in</label><input type="time" id="ei" value="${x.check_in ? ftime(x.check_in) : ''}"></div><div><label class="f">Check out</label><input type="time" id="eo" value="${x.check_out ? ftime(x.check_out) : ''}"></div><div class="full"><label class="f">Note</label><input id="en" value="${attr(x.note || '')}"></div></div><div class="err inline hide" id="ee2"></div><div class="acts"><button class="btn" id="c">Cancel</button><button class="btn pri" id="s">Save</button></div>`);
      $('#c', box).onclick = () => closeModal();
      $('#s', box).onclick = async () => { try { await api('/hr/attendance', 'POST', { employee: +$('#ee', box).value, date: $('#ed', box).value, in: $('#ei', box).value, out: $('#eo', box).value, status: $('#es', box).value, note: $('#en', box).value }); closeModal(); toast('Saved ✔'); load(); } catch (e) { $('#ee2', box).textContent = e.message; $('#ee2', box).classList.remove('hide'); } };
    };
    pg.refresh = load;
    $('#ae', el).onchange = e => { st.employee = +e.target.value; st.page = 1; load(); };
    $('#as', el).onchange = e => { st.status = e.target.value; st.page = 1; load(); };
    $('#ar', el).onchange = e => { st.range = e.target.value; st.page = 1; load(); };
    if ($('#an', el)) $('#an', el).onclick = () => entry();
    if ($('#ag', el)) $('#ag', el).onclick = async () => {
      const [a, b] = dateRangeFor('7d');
      const f = await promptBox('Mark absences', 'From date', a, { type: 'date' }); if (f === null) return;
      const t = await promptBox('Mark absences', 'To date (yesterday at most)', dstr(new Date(Date.now() - 86400000)), { type: 'date' }); if (t === null) return;
      const r = await act(() => api('/hr/attendance/generate', 'POST', { from: f, to: t })); if (r) { toast(`${r.created} absence record(s) created`); load(); }
    };
    await load();
  },
});

/* ---------- check in / out ---------- */
PAGES.checkin = () => ({
  events: ['attendance'],
  async render(el, pg) {
    const emps = await lookup('employees');
    const manage = can('attendance', 2);
    el.innerHTML = `<div class="page-h"><div><h1>Check in / out</h1><div class="hint">Record arrival and departure. ${S.cfg.hr_geo ? 'Your location is checked against the allowed area.' : ''}</div></div></div><div class="card" style="max-width:520px;text-align:center"><div class="big" id="clk"></div><div class="muted" id="cdt"></div>
      ${manage ? `<label class="f">Employee</label><select id="ce"><option value="0">Me (my linked employee)</option>${emps.map(e => opt(e.id, e.label)).join('')}</select>` : ''}
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:16px"><button class="btn ok lg" id="ci">⏱ Check in</button><button class="btn bad lg" id="co">🏁 Check out</button></div><div id="cm" style="margin-top:12px"></div></div>`;
    const tick = () => { const d = new Date(); $('#clk', el).textContent = d.toLocaleTimeString(); $('#cdt', el).textContent = d.toDateString(); };
    tick(); const iv = setInterval(() => { if (S.page === pg) tick(); else clearInterval(iv); }, 1000);
    const pos = () => new Promise(res => { if (!navigator.geolocation) return res({}); navigator.geolocation.getCurrentPosition(p => res({ lat: p.coords.latitude, lng: p.coords.longitude }), () => res({}), { timeout: 8000, maximumAge: 60000 }); });
    const go = async path => {
      const body = { employee: manage ? +$('#ce', el).value : 0 };
      if (path === 'checkin') Object.assign(body, await pos());
      try { const r = await api('/hr/' + path, 'POST', body); $('#cm', el).innerHTML = `<div class="okmsg">${esc(r.message)}</div>`; } catch (e) { $('#cm', el).innerHTML = `<div class="err">${esc(e.message)}</div>`; }
    };
    $('#ci', el).onclick = () => go('checkin'); $('#co', el).onclick = () => go('checkout');
  },
});

/* ---------- leave approvals ---------- */
PAGES.leave_approvals = () => ({
  events: ['res:leave_requests'],
  async render(el, pg) {
    const load = async () => {
      const r = await api('/r/leave_requests' + qs({ status: 'pending', limit: 100, sort: 'asc' }));
      const [emp, lt] = await Promise.all([labels('employees'), labels('leave_types')]);
      el.innerHTML = `<div class="page-h"><div><h1>Leave approvals</h1><div class="hint">Requests waiting for a decision. Approving deducts the balance and marks attendance.</div></div></div>` + (r.rows.length ? `<div class="ogrid">${r.rows.map(l => `<div class="card ord"><div class="hd"><b>${esc(emp[l.employee] || '#' + l.employee)}</b>${chip(l.status)}</div><div>${esc(lt[l.leave_type] || '')} · <b>${l.days} day${l.days === 1 ? '' : 's'}</b></div><div class="muted">${esc(l.from)} → ${esc(l.to)}${l.half_day ? ' (half day)' : ''}</div>${l.reason ? `<div style="font-size:13px">“${esc(l.reason)}”</div>` : ''}<div class="acts">${can('attendance', 3) ? `<button class="btn sm ok" data-a="${l.id}">Approve</button><button class="btn sm bad" data-r="${l.id}">Reject</button>` : '<span class="muted">Needs an approver</span>'}</div></div>`).join('')}</div>` : '<div class="card empty">🎉 Nothing is waiting for approval.</div>');
      $$('[data-a]', el).forEach(b => b.onclick = async () => { if (await act(() => api('/r/leave_requests/' + b.dataset.a + '/approve', 'POST', {}), 'Approved ✔')) load(); });
      $$('[data-r]', el).forEach(b => b.onclick = async () => { const v = await promptBox('Reject leave', 'Reason (optional)', ''); if (v === null) return; if (await act(() => api('/r/leave_requests/' + b.dataset.r + '/reject', 'POST', { text: v }), 'Rejected')) load(); });
    };
    pg.refresh = load; await load();
  },
});

PAGES.leave_balances = () => ({
  events: ['res:leave_requests'],
  async render(el, pg) {
    let year = new Date().getFullYear(), q = '';
    el.innerHTML = `<div class="page-h"><div><h1>Leave balances</h1><div class="hint">Days each person is entitled to, has used and has left.</div></div></div><div class="toolbar"><input class="q" id="lq" placeholder="🔍 Employee"><select id="ly">${[year + 1, year, year - 1].map(y => opt(y, y, y === year)).join('')}</select></div><div id="lb"></div>`;
    const load = async () => {
      const rows = await api('/hr/leave-balances' + qs({ year }));
      const by = {}; rows.forEach(r => { (by[r.employee] = by[r.employee] || { code: r.code, items: [] }).items.push(r); });
      const types = [...new Set(rows.map(r => r.leave_type))];
      const names = Object.keys(by).filter(n => !q || n.toLowerCase().includes(q));
      $('#lb', el).innerHTML = names.length ? `<div class="tw"><table class="t"><thead><tr><th>Employee</th>${types.map(t => `<th class="num">${esc(t)}<br><small>used / total</small></th>`).join('')}</tr></thead><tbody>${names.map(n => `<tr><td><b>${esc(n)}</b><br><small class="muted">${esc(by[n].code)}</small></td>${types.map(t => { const x = by[n].items.find(i => i.leave_type === t); return x ? `<td class="num"><b style="color:${x.remaining <= 0 ? 'var(--bad)' : 'inherit'}">${num(x.used, 1)} / ${num(x.entitled, 1)}</b><br><small class="muted">${num(x.remaining, 1)} left</small></td>` : '<td class="num">—</td>'; }).join('')}</tr>`).join('')}</tbody></table></div>` : '<div class="card empty">No employees.</div>';
    };
    $('#lq', el).oninput = debounce(e => { q = e.target.value.toLowerCase(); load(); });
    $('#ly', el).onchange = e => { year = +e.target.value; load(); };
    pg.refresh = load; await load();
  },
});

PAGES.leave_reports = () => ({
  events: [],
  async render(el, pg) {
    let range = 'year';
    el.innerHTML = `<div class="page-h"><div><h1>Leave reports</h1><div class="hint">Where leave is going.</div></div><div class="acts"><select id="lr">${[['year', 'This year'], ['month', 'This month'], ['lastmonth', 'Last month'], ['30d', 'Last 30 days']].map(r => opt(r[0], r[1])).join('')}</select></div></div><div id="lb"></div>`;
    const load = async () => {
      const [a, b] = dateRangeFor(range); const d = await api('/hr/reports/leave' + qs({ from: a, to: b }));
      $('#lb', el).innerHTML = `<div class="grid g4" style="margin-bottom:14px">${['pending', 'approved', 'rejected', 'cancelled'].map((s, i) => `<div class="card stat t${i + 1}">${stat(nice(s) + ' requests', num(d.counts[s] || 0))}</div>`).join('')}</div><div class="grid g2"><div class="card"><h3>Days by leave type</h3>${hbars(Object.entries(d.by_type).map(([k, v]) => ({ label: k, value: v })), n => num(n, 1) + ' d')}</div><div class="card"><h3>Days by employee</h3>${hbars(Object.entries(d.by_employee).sort((x, y) => y[1] - x[1]).slice(0, 10).map(([k, v]) => ({ label: k, value: v })), n => num(n, 1) + ' d')}</div></div>`;
    };
    $('#lr', el).onchange = e => { range = e.target.value; load(); };
    pg.refresh = load; await load();
  },
});

PAGES.attendance_reports = () => ({
  events: [],
  async render(el, pg) {
    let range = '30d', last = [];
    el.innerHTML = `<div class="page-h"><div><h1>Attendance reports</h1><div class="hint">One line per employee for the chosen period.</div></div><div class="acts"><select id="rr">${RANGES.filter(r => !['today', 'yesterday'].includes(r[0])).map(r => opt(r[0], r[1], r[0] === range)).join('')}</select><button class="btn" id="rx">⤓ Export CSV</button></div></div><div id="rb"></div>`;
    const cols = [{ key: 'employee', label: 'Employee', type: 'text' }, { key: 'present', label: 'Present', type: 'int' }, { key: 'late', label: 'Late', type: 'int' }, { key: 'absent', label: 'Absent', type: 'int' }, { key: 'leave', label: 'Leave', type: 'int' }, { key: 'half', label: 'Half days', type: 'int' }, { key: 'hours', label: 'Hours worked', type: 'num' }, { key: 'ot_hours', label: 'Overtime hours', type: 'num' }, { key: 'late_min', label: 'Late minutes', type: 'int' }];
    const load = async () => {
      const [a, b] = dateRangeFor(range);
      last = (await api('/hr/attendance/summary' + qs({ from: a, to: b }))).map(r => ({ ...r, hours: Math.round(r.worked / 6) / 10, ot_hours: Math.round(r.ot / 6) / 10 }));
      const tot = {}; ['present', 'late', 'absent', 'leave', 'half', 'late_min'].forEach(k => tot[k] = last.reduce((x, r) => x + (+r[k] || 0), 0));
      $('#rb', el).innerHTML = tableHTML(cols, last, tot);
    };
    $('#rr', el).onchange = e => { range = e.target.value; load(); };
    $('#rx', el).onclick = () => saveText('attendance-report.csv', csvOf(cols, last));
    pg.refresh = load; await load();
  },
});

/* ---------- payroll analytics ---------- */
PAGES.payroll_analytics = () => ({
  events: ['res:payroll_runs'],
  async render(el, pg) {
    const load = async () => {
      const d = await api('/hr/payroll-analytics');
      el.innerHTML = `<div class="page-h"><div><h1>Payroll analytics</h1><div class="hint">What salaries cost and where the money goes.</div></div></div>
        <div class="grid g4" style="margin-bottom:14px"><div class="card stat">${stat('Latest gross pay', money(d.latest_gross))}</div><div class="card stat t2">${stat('Latest net pay', money(d.latest_net))}</div><div class="card stat t3">${stat('Employer cost', money(d.latest_cost))}</div><div class="card stat t4">${stat('Payroll runs', num(d.runs))}</div></div>
        <div class="grid g2"><div class="card"><h3>Payroll cost over time</h3>${lineChart(d.trend.map(x => x.label), [{ name: 'Gross', values: d.trend.map(x => x.gross), area: true }, { name: 'Net', values: d.trend.map(x => x.net), color: '#16a34a' }, { name: 'Employer cost', values: d.trend.map(x => x.cost), color: '#7c3aed' }])}</div>
        <div class="card"><h3>Net pay by department</h3>${hbars(Object.entries(d.by_department).map(([k, v]) => ({ label: k || '—', value: v })), money)}</div></div>`;
    };
    pg.refresh = load; await load();
  },
});

/* ---------- my attendance & leave ---------- */
PAGES.my_hr = () => ({
  events: ['attendance', 'res:leave_requests'],
  async render(el, pg) {
    const load = async () => {
      const d = await api('/hr/my');
      if (!d.linked) { el.innerHTML = '<div class="page-h"><h1>My attendance & leave</h1></div><div class="card empty">Your login is not linked to an employee record yet. Ask HR to open your employee profile and choose your login under "Linked login".</div>'; return; }
      const t = d.today;
      el.innerHTML = `<div class="page-h"><div><h1>My attendance & leave</h1><div class="hint">Hello ${esc(d.employee.name)} 👋</div></div></div>
        <div class="grid g2"><div class="card"><h3>Today</h3><div class="sub">${new Date().toDateString()}</div>${t ? `<p>${t.check_in ? 'Checked in at <b>' + esc(ftime(t.check_in)) + '</b>' : ''}${t.check_out ? ' · out at <b>' + esc(ftime(t.check_out)) + '</b>' : ''} ${chip(t.status)}</p>` : '<p class="muted">Not checked in yet.</p>'}<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px"><button class="btn ok" id="mi" ${t && t.check_in ? 'disabled' : ''}>⏱ Check in</button><button class="btn bad" id="mo" ${!t || !t.check_in || t.check_out ? 'disabled' : ''}>🏁 Check out</button></div><div id="mm" style="margin-top:8px"></div></div>
        <div class="card"><h3>My leave balance</h3>${d.balances.map(b => `<div class="row"><span>${esc(b.name)}</span><span><b>${num(b.remaining, 1)}</b> left <small class="muted">of ${num(b.entitled, 1)}</small></span></div>`).join('')}<button class="btn pri" id="ml" style="margin-top:10px">+ Request leave</button></div>
        <div class="card"><h3>My last 14 days</h3>${d.history.length ? `<table class="t"><thead><tr><th>Date</th><th>In</th><th>Out</th><th>Status</th></tr></thead><tbody>${d.history.map(h => `<tr><td>${esc(h.date)}</td><td>${h.check_in ? esc(ftime(h.check_in)) : '—'}</td><td>${h.check_out ? esc(ftime(h.check_out)) : '—'}</td><td>${chip(h.status)}</td></tr>`).join('')}</tbody></table>` : '<div class="empty">No records yet</div>'}</div>
        <div class="card"><h3>My leave requests</h3>${d.leaves.length ? d.leaves.map(l => `<div class="row"><span>${esc(l.from)} → ${esc(l.to)} <small class="muted">(${l.days} d)</small></span>${chip(l.status)}</div>`).join('') : '<div class="empty">None yet</div>'}</div></div>`;
      const pos = () => new Promise(res => { if (!navigator.geolocation) return res({}); navigator.geolocation.getCurrentPosition(p => res({ lat: p.coords.latitude, lng: p.coords.longitude }), () => res({}), { timeout: 8000 }); });
      $('#mi', el).onclick = async () => { try { const r = await api('/hr/checkin', 'POST', { employee: 0, ...(await pos()) }); toast(r.message); load(); } catch (e) { $('#mm', el).innerHTML = `<div class="err">${esc(e.message)}</div>`; } };
      $('#mo', el).onclick = async () => { try { const r = await api('/hr/checkout', 'POST', { employee: 0 }); toast(r.message); load(); } catch (e) { $('#mm', el).innerHTML = `<div class="err">${esc(e.message)}</div>`; } };
      $('#ml', el).onclick = async () => {
        const lts = await lookup('leave_types');
        const box = modal(`<h2>Request leave</h2><div class="fgrid"><div class="full"><label class="f">Type</label><select id="lt">${lts.map(x => opt(x.id, x.label)).join('')}</select></div><div><label class="f">From</label><input type="date" id="lf" value="${todayStr()}"></div><div><label class="f">To</label><input type="date" id="ltt" value="${todayStr()}"></div><div class="full"><label class="f"><input type="checkbox" id="lh"> Half day</label></div><div class="full"><label class="f">Reason</label><textarea id="lr"></textarea></div></div><div class="err inline hide" id="le"></div><div class="acts"><button class="btn" id="c">Cancel</button><button class="btn pri" id="s">Submit</button></div>`);
        $('#c', box).onclick = () => closeModal();
        $('#s', box).onclick = async () => { try { await api('/hr/my/leave', 'POST', { leave_type: +$('#lt', box).value, from: $('#lf', box).value, to: $('#ltt', box).value, half_day: $('#lh', box).checked, reason: $('#lr', box).value }); closeModal(); toast('Request sent ✔'); load(); } catch (e) { $('#le', box).textContent = e.message; $('#le', box).classList.remove('hide'); } };
      };
    };
    pg.refresh = load; await load();
  },
});
