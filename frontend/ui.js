'use strict';
/* =====================================================================
   ui.js - generic screens built from the server schema:
   forms, list pages, record viewer, settings forms, widget dashboards
   ===================================================================== */
const PAGES = {};
const debounce = (fn, ms = 300) => { let h; return (...a) => { clearTimeout(h); h = setTimeout(() => fn(...a), ms); }; };
const RES = k => S.schema && S.schema.resources[k];

/* ---------- field inputs ---------- */
function opt(v, label, sel) { return `<option value="${attr(v)}" ${sel ? 'selected' : ''}>${esc(label)}</option>`; }
function dtLocal(v) { return String(v || '').slice(0, 16); }

function inp(f, v, L, sub) {
  const k = sub ? `data-s="${attr(f.key)}"` : `data-k="${attr(f.key)}"`;
  const dis = f.ro ? 'disabled' : '';
  switch (f.type) {
    case 'textarea': return `<textarea ${k} ${dis}>${esc(v)}</textarea>`;
    case 'number': return `<input type="number" step="any" ${k} value="${attr(v ?? '')}" ${dis}>`;
    case 'int': return `<input type="number" step="1" ${k} value="${attr(v ?? '')}" ${dis}>`;
    case 'money': return `<input type="number" step="0.01" ${k} value="${v === null || v === undefined || v === '' ? '' : (+v / 100)}" ${dis}>`;
    case 'bool': return `<label class="sw"><input type="checkbox" ${k} ${v ? 'checked' : ''} ${dis}><span></span></label>`;
    case 'date': return `<input type="date" ${k} value="${attr(v || '')}" ${dis}>`;
    case 'datetime': return `<input type="datetime-local" ${k} value="${attr(dtLocal(v))}" ${dis}>`;
    case 'time': return `<input type="time" ${k} value="${attr(v || '')}" ${dis}>`;
    case 'color': return `<input type="color" ${k} value="${attr(v || '#f97316')}" ${dis}>`;
    case 'password': return `<input type="password" ${k} value="${attr(v || '')}" autocomplete="new-password" ${dis}>`;
    case 'select': return `<select ${k} ${dis}>${f.req && v ? '' : opt('', '— choose —', !v)}${(f.opts || []).map(o => opt(o, nice(o), o === v)).join('')}</select>`;
    case 'ref': return `<select ${k} ${dis}>${opt('', '— choose —', !v)}${((L && L[f.ref]) || []).map(o => opt(o.id, o.label, +v === o.id)).join('')}</select>`;
    case 'multiref': {
      const sel = new Set((v || []).map(Number));
      return `<div class="multi" data-multi="${attr(f.key)}">${((L && L[f.ref]) || []).map(o => `<label><input type="checkbox" value="${o.id}" ${sel.has(o.id) ? 'checked' : ''}> ${esc(o.label)}</label>`).join('') || '<span class="muted">Nothing to choose yet</span>'}</div>`;
    }
    case 'file': return `<div style="display:flex;gap:6px"><input type="text" ${k} value="${attr(v || '')}" placeholder="/media/… or paste a link"><button type="button" class="btn sm fileup">Upload</button></div>${safeUrl(v) && /\.(png|jpe?g|webp|gif)$/i.test(v) ? `<img class="thumb" src="${attr(safeUrl(v))}" style="margin-top:6px">` : ''}`;
    case 'json': return `<textarea ${k} ${dis} spellcheck="false">${esc(v == null ? '' : JSON.stringify(v, null, 1))}</textarea>`;
    case 'lines': {
      const rows = Array.isArray(v) && v.length ? v : (f.req ? [{}] : []);
      return `<div class="lines" data-lines="${attr(f.key)}">${rows.map(r => lineRow(f, r, L)).join('')}<button type="button" class="btn sm addline">+ Add line</button></div>`;
    }
    default: return `<input type="${f.type === 'email' ? 'email' : f.type === 'tel' ? 'tel' : f.type === 'url' ? 'url' : 'text'}" ${k} value="${attr(v ?? '')}" ${dis}>`;
  }
}

function lineRow(f, r, L) {
  const subs = f.sub || [];
  const cols = subs.map(s => (s.type === 'bool' ? 'auto' : '1fr')).join(' ') + ' auto';
  return `<div class="ln" style="grid-template-columns:${cols}">${subs.map(s => `<div><label>${esc(s.label)}${s.req ? ' *' : ''}</label>${inp(s, r[s.key] ?? s.def, L, true)}</div>`).join('')}<button type="button" class="btn sm bad rmline" title="Remove">✕</button></div>`;
}

function readFields(root, fields, sub) {
  const out = {};
  for (const f of fields) {
    if (f.ro) continue;
    if (f.type === 'lines') {
      const box = root.querySelector(`[data-lines="${f.key}"]`);
      out[f.key] = box ? $$('.ln', box).map(ln => readFields(ln, f.sub, true)) : [];
      continue;
    }
    if (f.type === 'multiref') {
      const box = root.querySelector(`[data-multi="${f.key}"]`);
      out[f.key] = box ? $$('input:checked', box).map(i => +i.value) : [];
      continue;
    }
    const el = root.querySelector(sub ? `[data-s="${f.key}"]` : `[data-k="${f.key}"]`);
    if (!el) continue;
    const v = el.type === 'checkbox' ? el.checked : el.value;
    switch (f.type) {
      case 'bool': out[f.key] = !!v; break;
      case 'number': case 'int': out[f.key] = v === '' ? null : +v; break;
      case 'money': out[f.key] = v === '' ? null : toMinor(v); break;
      case 'ref': out[f.key] = v === '' ? 0 : +v; break;
      case 'json': try { out[f.key] = v.trim() ? JSON.parse(v) : null; } catch (e) { throw new Error(f.label + ' is not valid JSON'); } break;
      default: out[f.key] = v;
    }
  }
  return out;
}

function bindFormEvents(box, fields, L) {
  box.addEventListener('click', async e => {
    const add = e.target.closest('.addline');
    if (add) {
      const f = fields.find(x => x.key === add.parentElement.dataset.lines);
      if (f) add.insertAdjacentHTML('beforebegin', lineRow(f, {}, L));
      return;
    }
    const rm = e.target.closest('.rmline');
    if (rm) { rm.closest('.ln').remove(); return; }
    const up = e.target.closest('.fileup');
    if (up) {
      const fi = document.createElement('input'); fi.type = 'file';
      fi.onchange = async () => {
        if (!fi.files[0]) return;
        up.disabled = true; up.textContent = '…';
        try { const r = await uploadFile(fi.files[0]); up.parentElement.querySelector('input').value = r.url; toast('Uploaded'); } catch (x) { toast(x.message, true); }
        up.disabled = false; up.textContent = 'Upload';
      };
      fi.click();
    }
  });
}

async function refsFor(fields, extra) {
  const need = new Set();
  const walk = fs => fs.forEach(f => { if ((f.type === 'ref' || f.type === 'multiref') && f.ref) need.add(f.ref); if (f.sub) walk(f.sub); });
  walk(fields);
  (extra || []).forEach(x => need.add(x));
  const L = {};
  await Promise.all([...need].map(async r => { try { L[r] = await lookup(r); } catch (e) { L[r] = []; } }));
  return L;
}

/* ---------- create / edit form ---------- */
async function openForm(resKey, rec, done, prefill) {
  const def = RES(resKey);
  if (!def) return toast('Unknown screen', true);
  const editing = !!(rec && rec.id);
  const fields = def.fields.filter(f => editing || !f.ro);
  const L = await refsFor(fields);
  if (def.scoped && !S.me.branch_id) L.__branches = S.branches;
  const data = Object.assign({}, prefill || {}, rec || {});
  const html = fields.map(f => {
    const full = ['textarea', 'lines', 'multiref', 'json'].includes(f.type) ? 'full' : '';
    let v = data[f.key];
    if (v === undefined && !editing) v = f.def;
    if (f.key === 'date' && !editing && !v) v = todayStr();
    return `<div class="${full}"><label class="f">${esc(f.label)}${f.req ? ' <span class="req">*</span>' : ''}</label>${inp(f, v, L)}${f.help ? `<div class="help">${esc(f.help)}</div>` : ''}</div>`;
  }).join('');
  const branchSel = def.scoped && !S.me.branch_id ? `<div class="full"><label class="f">Branch</label><select data-bk="1">${opt(0, 'All branches (shared)', !data.branch_id)}${S.branches.map(b => opt(b.id, b.label, data.branch_id === b.id)).join('')}</select></div>` : '';
  const box = modal(`<h2>${editing ? 'Edit' : 'New'} ${esc(def.title.replace(/s$/, ''))}</h2>${def.hint ? `<div class="muted" style="font-size:12.5px">${esc(def.hint)}</div>` : ''}<div class="fgrid">${branchSel}${html}</div><div class="err inline hide" id="ferr"></div><div class="acts"><button class="btn" id="fc">Cancel</button><button class="btn pri" id="fs">Save</button></div>`, { size: (fields.some(f => f.type === 'lines') ? 'wide' : '') });
  bindFormEvents(box, fields, L);
  $('#fc', box).onclick = () => closeModal();
  $('#fs', box).onclick = async () => {
    const err = $('#ferr', box); err.classList.add('hide');
    let body;
    try { body = readFields(box, fields); } catch (e) { err.textContent = e.message; err.classList.remove('hide'); return; }
    const bsel = $('[data-bk]', box); if (bsel) body.branch_id = +bsel.value;
    $('#fs', box).disabled = true;
    try {
      const r = await api('/r/' + resKey + (editing ? '/' + rec.id : ''), editing ? 'PUT' : 'POST', body);
      invalidateLookup(resKey); closeModal(); toast('Saved ✔'); done && done(r);
    } catch (e) { err.textContent = e.message; err.classList.remove('hide'); $('#fs', box).disabled = false; }
  };
  const first = $('input:not([type=checkbox]):not([disabled]),select', box); first && first.focus();
}

/* ---------- value formatting ---------- */
function cellHTML(f, row, L) {
  const v = f.key === 'status' ? row.status : row[f.key];
  if (v === undefined || v === null || v === '') return '<span class="muted">—</span>';
  switch (f.type) {
    case 'money': return money(v);
    case 'number': return num(v, Number.isInteger(+v) ? 0 : 2);
    case 'int': return num(v);
    case 'bool': return v ? '✓' : '<span class="muted">—</span>';
    case 'select': return chip(v);
    case 'ref': return esc((L && L[f.ref] && L[f.ref][+v]) || '#' + v);
    case 'multiref': return (v || []).length ? esc((v || []).slice(0, 2).map(i => (L && L[f.ref] && L[f.ref][i]) || '#' + i).join(', ') + ((v || []).length > 2 ? ' +' + ((v || []).length - 2) : '')) : '—';
    case 'lines': return (v || []).length + ' line' + ((v || []).length === 1 ? '' : 's');
    case 'color': return `<span class="swatch" style="background:${attr(v)}"></span> ${esc(v)}`;
    case 'file': return !safeUrl(v) ? '<span class="muted">—</span>' : /\.(png|jpe?g|webp|gif)$/i.test(v) ? `<img class="thumb" src="${attr(safeUrl(v))}">` : `<a href="${attr(safeUrl(v))}" target="_blank" rel="noopener noreferrer">file</a>`;
    case 'datetime': return esc(String(v).replace('T', ' '));
    case 'password': return '••••';
    case 'json': return '…';
    default: { const s = String(v); return esc(s.length > 60 ? s.slice(0, 58) + '…' : s); }
  }
}
async function labelMaps(fields) {
  const M = {};
  await Promise.all([...new Set(fields.filter(f => f.type === 'ref' || f.type === 'multiref').map(f => f.ref))].map(async r => { try { M[r] = await labels(r); } catch (e) { M[r] = {}; } }));
  return M;
}

/* ---------- record viewer ---------- */
async function viewRecord(resKey, id, changed) {
  const def = RES(resKey);
  let rec;
  try { rec = await api('/r/' + resKey + '/' + id); } catch (e) { return toast(e.message, true); }
  const M = await labelMaps(def.fields);
  const main = def.fields.filter(f => f.type !== 'lines' && f.type !== 'json');
  const rows = [];
  if (def.fields.every(f => f.key !== 'status') && rec.status) rows.push(['Status', chip(rec.status)]);
  if (def.scoped && rec.branch_id) rows.push(['Branch', esc(S.branchName(rec.branch_id))]);
  main.forEach(f => rows.push([f.label, cellHTML(f, rec, M)]));
  rows.push(['Created', esc(fdt(rec.created_at))], ['Updated', esc(fdt(rec.updated_at))]);
  const linesHTML = def.fields.filter(f => f.type === 'lines' && (rec[f.key] || []).length).map(f => `<h4 style="margin:14px 0 6px">${esc(f.label)}</h4><div class="tw"><table class="t"><thead><tr>${f.sub.map(s => `<th class="${['money', 'number', 'int'].includes(s.type) ? 'num' : ''}">${esc(s.label)}</th>`).join('')}</tr></thead><tbody>${rec[f.key].map(r => `<tr>${f.sub.map(s => `<td class="${['money', 'number', 'int'].includes(s.type) ? 'num' : ''}">${cellHTML(s, r, M)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`).join('');
  const acts = (def.actions || []).filter(a => !a.from || a.from.length === 0 || a.from.includes(rec.status));
  const box = modal(`<div style="display:flex;gap:10px;align-items:center"><h2>${esc(def.title.replace(/s$/, ''))} #${rec.id}</h2><span class="right"></span>${rec.status && def.statuses && def.statuses.length ? chip(rec.status) : ''}</div>
    <dl class="kv" style="margin-top:12px">${rows.map(r => `<dt>${esc(r[0])}</dt><dd>${r[1]}</dd>`).join('')}</dl>${linesHTML}
    <div class="acts">${acts.map(a => `<button class="btn ${a.style || ''}" data-act="${attr(a.key)}">${esc(a.label)}</button>`).join('')}${def.can_edit ? '<button class="btn" id="ve">Edit</button>' : ''}${def.can_delete ? '<button class="btn bad" id="vd">Delete</button>' : ''}<button class="btn" id="vc">Close</button></div>`, { size: linesHTML ? 'wide' : '' });
  $('#vc', box).onclick = () => closeModal();
  if ($('#ve', box)) $('#ve', box).onclick = () => { closeModal(); openForm(resKey, rec, changed); };
  if ($('#vd', box)) $('#vd', box).onclick = async () => { if (await confirmBox('Delete this record? This cannot be undone.', 'Delete', true)) { if (await act(() => api('/r/' + resKey + '/' + id, 'DELETE'), 'Deleted')) { invalidateLookup(resKey); closeModal(); changed && changed(); } } };
  $$('[data-act]', box).forEach(b => b.onclick = () => runAction(resKey, rec, def.actions.find(a => a.key === b.dataset.act), () => { closeModal(); changed && changed(); }));
}

async function runAction(resKey, rec, a, done) {
  let params;
  if (a.confirm && !(await confirmBox(a.confirm, a.label))) return;
  if (a.prompt) { const v = await promptBox(a.label, a.prompt, ''); if (v === null) return; params = { text: v }; }
  if (resKey === 'payroll_runs' && a.key === 'pay') {
    const m = await promptBox('Pay salaries', 'Pay from: type "bank" or "cash"', 'bank'); if (m === null) return; params = { method: m.trim().toLowerCase() };
  }
  if (resKey === 'allocations' && a.key === 'run') {
    const f = await promptBox('Run allocation', 'From date (YYYY-MM-DD)', dateRangeFor('month')[0]); if (f === null) return;
    const t = await promptBox('Run allocation', 'To date (YYYY-MM-DD)', todayStr()); if (t === null) return; params = { from: f, to: t };
  }
  if (await act(() => api('/r/' + resKey + '/' + rec.id + '/' + a.key, 'POST', params || {}), a.label + ' ✔')) { invalidateLookup(resKey); done && done(); }
}

/* ---------- generic resource list page ---------- */
function pager(st, total, limit, onPage) {
  const pages = Math.max(1, Math.ceil(total / limit));
  return `<div class="pager"><button class="btn sm" data-pg="prev" ${st.page <= 1 ? 'disabled' : ''}>‹ Prev</button><span>Page ${st.page} of ${pages} · ${num(total)} record${total === 1 ? '' : 's'}</span><button class="btn sm" data-pg="next" ${st.page >= pages ? 'disabled' : ''}>Next ›</button></div>`;
}
function bindPager(root, st, total, limit, reload) {
  $$('[data-pg]', root).forEach(b => b.onclick = () => { st.page += b.dataset.pg === 'next' ? 1 : -1; reload(); });
}

function listFields(def) {
  let fs = def.fields.filter(f => f.list && f.type !== 'lines' && f.key !== 'status');
  if (!fs.length) fs = def.fields.filter(f => !['lines', 'json', 'textarea', 'password'].includes(f.type) && f.key !== 'status').slice(0, 5);
  return fs.slice(0, 8);
}

function resPage(key) {
  return {
    events: ['res:' + key],
    async render(el, pg) {
      const def = RES(key);
      if (!def || !def.can_read) { el.innerHTML = '<div class="empty">You do not have access to this screen.</div>'; return; }
      const st = { page: 1, q: '', status: (pg.params.status || ''), rows: [], total: 0 };
      const fields = listFields(def);
      const showStatus = (def.statuses || []).length > 0;
      const showBranch = def.scoped && !S.me.branch_id;
      const limit = 25;
      el.innerHTML = `<div class="page-h"><div><h1>${esc(t('nav.' + key, def.title))}</h1>${def.hint ? `<div class="hint">${esc(def.hint)}</div>` : ''}</div><div class="acts">
        <button class="btn" id="rx">⤓ Export CSV</button>${def.can_create ? '<button class="btn pri" id="rn">+ New</button>' : ''}</div></div>
        <div class="toolbar"><input type="search" class="q" id="rq" placeholder="🔍 Search…">${showStatus ? `<div class="tabs" id="rs"><button class="tab ${!st.status ? 'on' : ''}" data-s="">All</button>${def.statuses.map(s => `<button class="tab ${st.status === s ? 'on' : ''}" data-s="${attr(s)}">${esc(nice(s))}</button>`).join('')}</div>` : ''}<button class="btn sm right" id="rr" title="Refresh">⟳</button></div>
        <div id="rt"></div>`;
      const load = async () => {
        const q = { page: st.page, limit, q: st.q, status: st.status };
        let r;
        try { r = await api('/r/' + key + qs(q)); } catch (e) { $('#rt', el).innerHTML = `<div class="err">${esc(e.message)}</div>`; return; }
        st.rows = r.rows; st.total = r.total;
        const M = await labelMaps(def.fields);
        const heads = fields.map(f => `<th class="${['money', 'number', 'int'].includes(f.type) ? 'num' : ''}">${esc(f.label)}</th>`);
        if (showStatus) heads.push('<th>Status</th>');
        if (showBranch) heads.push('<th>Branch</th>');
        heads.push('<th></th>');
        const body = st.rows.map(row => {
          const acts = (def.actions || []).filter(a => !a.from || !a.from.length || a.from.includes(row.status)).slice(0, 3);
          return `<tr class="click" data-id="${row.id}">${fields.map(f => `<td class="${['money', 'number', 'int'].includes(f.type) ? 'num' : ''}">${cellHTML(f, row, M)}</td>`).join('')}${showStatus ? `<td>${chip(row.status)}</td>` : ''}${showBranch ? `<td>${esc(row.branch_id ? S.branchName(row.branch_id) : 'All')}</td>` : ''}
            <td><div class="acts">${acts.map(a => `<button class="btn sm ${a.style || ''}" data-a="${attr(a.key)}">${esc(a.label)}</button>`).join('')}${def.can_edit ? '<button class="btn sm" data-e="1" title="Edit">✎</button>' : ''}</div></td></tr>`;
        }).join('');
        $('#rt', el).innerHTML = st.rows.length ? `<div class="tw"><table class="t"><thead><tr>${heads.join('')}</tr></thead><tbody>${body}</tbody></table></div>${pager(st, st.total, limit)}` : `<div class="card empty">Nothing here yet.${def.can_create ? ' Click <b>+ New</b> to add the first one.' : ''}</div>`;
        bindPager($('#rt', el), st, st.total, limit, load);
        $$('#rt tbody tr', el).forEach(tr => {
          const row = st.rows.find(r => r.id === +tr.dataset.id);
          tr.onclick = e => {
            const b = e.target.closest('button');
            if (b && b.dataset.e) return openForm(key, row, load);
            if (b && b.dataset.a) return runAction(key, row, def.actions.find(a => a.key === b.dataset.a), load);
            viewRecord(key, row.id, load);
          };
        });
      };
      pg.refresh = load;
      $('#rq', el).oninput = debounce(e => { st.q = e.target.value; st.page = 1; load(); });
      if ($('#rs', el)) $('#rs', el).onclick = e => { const b = e.target.closest('.tab'); if (!b) return; st.status = b.dataset.s; st.page = 1; $$('#rs .tab', el).forEach(x => x.classList.toggle('on', x === b)); load(); };
      $('#rr', el).onclick = load;
      if ($('#rn', el)) $('#rn', el).onclick = () => openForm(key, null, load);
      $('#rx', el).onclick = () => download('/r/' + key + qs({ format: 'csv', q: st.q, status: st.status }), key + '.csv');
      await load();
    },
  };
}

/* ---------- settings forms ---------- */
function settingsPage(group) {
  return {
    events: ['settings'],
    async render(el, pg) {
      const g = S.schema.settings[group];
      if (!g) { el.innerHTML = '<div class="empty">You do not have access to this screen.</div>'; return; }
      const [vals, L] = await Promise.all([api('/settings/' + group), refsFor(g.fields)]);
      el.innerHTML = `<div class="page-h"><div><h1>${esc(g.title)}</h1><div class="hint">${esc(g.hint || '')}</div></div></div>
        <div class="card" style="max-width:760px"><div class="fgrid" id="sf">${g.fields.map(f => `<div class="${['textarea', 'lines'].includes(f.type) ? 'full' : ''}"><label class="f">${esc(f.label)}</label>${inp(f, vals[f.key] ?? f.def, L)}</div>`).join('')}</div>
        <div class="err inline hide" id="se"></div>${g.can_edit ? '<div class="acts" style="display:flex;justify-content:flex-end;margin-top:14px"><button class="btn pri" id="ss">Save changes</button></div>' : '<div class="muted" style="margin-top:12px">You can view these settings but not change them.</div>'}</div>
        <div id="extra"></div>`;
      bindFormEvents(el, g.fields, L);
      if (!g.can_edit) $$('#sf input,#sf select,#sf textarea', el).forEach(i => i.disabled = true);
      if ($('#ss', el)) $('#ss', el).onclick = async () => {
        const err = $('#se', el); err.classList.add('hide');
        try { await api('/settings/' + group, 'PUT', readFields(el, g.fields)); toast('Settings saved ✔'); if (group === 'currency' || group === 'application' || group === 'appearance' || group === 'pos') { S.cfg = await (await fetch('/api/config')).json(); applyBrand(); } }
        catch (e) { err.textContent = e.message; err.classList.remove('hide'); }
      };
      if (group === 'two_factor') twoFactorPanel($('#extra', el));
      if (group === 'email') $('#extra', el).innerHTML = '<div class="card hint muted" style="max-width:760px;margin-top:14px">Tip: for Gmail use host <b>smtp.gmail.com</b>, port <b>587</b>, STARTTLS and an <b>app password</b>.</div>';
    },
  };
}

async function twoFactorPanel(el) {
  const draw = () => {
    el.innerHTML = `<div class="card" style="max-width:760px;margin-top:14px"><h3>Your own account</h3><div class="sub">${S.me.totp_on ? '✅ Two-factor is <b>on</b> for your login.' : 'Two-factor is <b>off</b> for your login.'}</div>
      ${S.me.totp_on ? '<button class="btn bad" id="t2off">Turn off</button>' : '<button class="btn pri" id="t2on">Set up with an authenticator app</button>'}<div id="t2box"></div></div>`;
    if ($('#t2on', el)) $('#t2on', el).onclick = async () => {
      const r = await act(() => api('/me/2fa/setup', 'POST', {})); if (!r) return;
      const img = await qrDataURL(r.uri, 200);
      $('#t2box', el).innerHTML = `<div style="margin-top:14px;display:flex;gap:16px;flex-wrap:wrap;align-items:center"><img src="${img}" width="160" height="160" alt="QR"><div><p>1. Scan this code with Google Authenticator, Authy or Microsoft Authenticator.<br>2. Or type this key: <b style="font-family:monospace">${esc(r.secret)}</b><br>3. Enter the 6-digit code below.</p><div style="display:flex;gap:8px"><input id="t2c" maxlength="6" placeholder="123456" style="width:140px"><button class="btn pri" id="t2v">Turn on</button></div></div></div>`;
      $('#t2v', el).onclick = async () => { if (await act(() => api('/me/2fa/enable', 'POST', { code: $('#t2c', el).value }), 'Two-factor is on ✔')) { S.me.totp_on = true; draw(); } };
    };
    if ($('#t2off', el)) $('#t2off', el).onclick = async () => {
      const p = await promptBox('Turn off two-factor', 'Type your password to confirm', '', { type: 'password' }); if (p === null) return;
      if (await act(() => api('/me/2fa/disable', 'POST', { password: p }), 'Two-factor is off')) { S.me.totp_on = false; draw(); }
    };
  };
  draw();
}

/* ---------- widget dashboards ---------- */
function widgetDash(cfg) {
  return {
    events: cfg.events || ['order'],
    async render(el, pg) {
      let range = cfg.range || '30d';
      const pref = (await api('/me/prefs/' + cfg.key).catch(() => null)) || {};
      let order = pref.order || cfg.widgets.map(w => w.id), hidden = new Set(pref.hidden || cfg.defaultHidden || []);
      cfg.widgets.forEach(w => { if (!order.includes(w.id)) order.push(w.id); });
      order = order.filter(id => cfg.widgets.some(w => w.id === id));
      let data = null;
      el.innerHTML = `<div class="page-h"><div><h1>${esc(t('nav.' + (cfg.nav || cfg.key), cfg.title))}</h1><div class="hint">${esc(cfg.hint || '')}</div></div><div class="acts">
        <select id="dr" style="width:auto">${(cfg.ranges || RANGES).map(r => opt(r[0], r[1], r[0] === range)).join('')}</select>${(cfg.extra && cfg.extra.html) || ''}
        <button class="btn" id="dref">⟳ Refresh</button><button class="btn pri" id="dcus">⚙ Customize</button></div></div><div class="wgrid" id="wg"><div class="empty">Loading…</div></div>`;
      const draw = () => {
        if (!data) return;
        $('#wg', el).innerHTML = order.filter(id => !hidden.has(id)).map(id => {
          const w = cfg.widgets.find(x => x.id === id);
          let body = '';
          try { body = w.render(data); } catch (e) { body = `<div class="muted">–</div>`; }
          return w.stat ? `<div class="card stat t${w.tone || 1} w${w.w || 1}">${body}</div>` : `<div class="card w${w.w || 2}"><h3>${esc(w.title)}</h3>${w.sub ? `<div class="sub">${esc(w.sub)}</div>` : ''}${body}</div>`;
        }).join('') || '<div class="empty">All widgets are hidden - use Customize to bring them back.</div>';
      };
      const load = async () => {
        try { data = await cfg.load(range, el); draw(); } catch (e) { $('#wg', el).innerHTML = `<div class="err">${esc(e.message)}</div>`; }
      };
      pg.refresh = load;
      $('#dr', el).onchange = e => { range = e.target.value; load(); };
      $('#dref', el).onclick = load;
      if (cfg.extra && cfg.extra.bind) cfg.extra.bind(el, load);
      $('#dcus', el).onclick = () => {
        const draw2 = () => {
          const box = modal(`<h2>Customize ${esc(cfg.title)}</h2><div class="muted" style="font-size:12.5px">Show, hide and re-order widgets. Drag the ☰ handle or use the arrows.</div><div id="cl" style="margin-top:10px">${order.map((id, i) => {
            const w = cfg.widgets.find(x => x.id === id);
            return `<div class="row" draggable="true" data-id="${attr(id)}"><span>☰ &nbsp;<label style="cursor:pointer"><input type="checkbox" ${hidden.has(id) ? '' : 'checked'} data-v="${attr(id)}"> ${esc(w.title || w.label)}</label></span><span><button class="btn sm" data-u="${i}">↑</button> <button class="btn sm" data-d="${i}">↓</button></span></div>`;
          }).join('')}</div><div class="acts"><button class="btn" id="rs">Reset to default</button><button class="btn pri" id="dn">Done</button></div>`, { onMount: b => { } });
          $$('[data-v]', box).forEach(c => c.onchange = () => { c.checked ? hidden.delete(c.dataset.v) : hidden.add(c.dataset.v); });
          $$('[data-u]', box).forEach(b => b.onclick = () => { const i = +b.dataset.u; if (i > 0) { [order[i - 1], order[i]] = [order[i], order[i - 1]]; draw2(); } });
          $$('[data-d]', box).forEach(b => b.onclick = () => { const i = +b.dataset.d; if (i < order.length - 1) { [order[i + 1], order[i]] = [order[i], order[i + 1]]; draw2(); } });
          let dragId = null;
          $$('.row[draggable]', box).forEach(r => {
            r.ondragstart = () => dragId = r.dataset.id;
            r.ondragover = e => e.preventDefault();
            r.ondrop = e => { e.preventDefault(); const to = r.dataset.id; if (dragId && dragId !== to) { order.splice(order.indexOf(dragId), 1); order.splice(order.indexOf(to), 0, dragId); draw2(); } };
          });
          $('#rs', box).onclick = () => { order = cfg.widgets.map(w => w.id); hidden = new Set(cfg.defaultHidden || []); draw2(); };
          $('#dn', box).onclick = async () => { closeModal(); draw(); api('/me/prefs/' + cfg.key, 'PUT', { order, hidden: [...hidden] }).catch(() => { }); };
        };
        draw2();
      };
      await load();
    },
  };
}

/* ---------- generic report table ---------- */
function fmtCell(c, v) {
  if (v === null || v === undefined || v === '') return '<span class="muted">—</span>';
  switch (c.type) {
    case 'money': return money(v);
    case 'int': return num(v);
    case 'num': return num(v, Number.isInteger(+v) ? 0 : 2);
    case 'pct': return (+v).toFixed(1) + '%';
    case 'chip': return chip(v);
    default: return esc(v);
  }
}
function tableHTML(columns, rows, totals, opts = {}) {
  const numCol = c => ['money', 'int', 'num', 'pct'].includes(c.type);
  if (!rows.length) return '<div class="empty">No data for this period</div>';
  return `<div class="tw"><table class="t"><thead><tr>${columns.map(c => `<th class="${numCol(c) ? 'num' : ''}">${esc(c.label)}</th>`).join('')}</tr></thead><tbody>${rows.map((r, i) => `<tr ${opts.click ? `class="click" data-i="${i}"` : ''}>${columns.map(c => `<td class="${numCol(c) ? 'num' : ''}">${fmtCell(c, r[c.key])}</td>`).join('')}</tr>`).join('')}</tbody>${totals && Object.keys(totals).length ? `<tfoot><tr>${columns.map((c, i) => `<td class="${numCol(c) ? 'num' : ''}">${i === 0 ? 'Total' : (totals[c.key] !== undefined ? fmtCell(c, totals[c.key]) : '')}</td>`).join('')}</tr></tfoot>` : ''}</table></div>`;
}

/* a simple "range + table + export" page used by many report screens */
function tablePage(o) {
  return {
    events: o.events || [],
    async render(el, pg) {
      let range = o.range || '30d', extra = {};
      el.innerHTML = `<div class="page-h"><div><h1>${esc(o.title)}</h1><div class="hint">${esc(o.hint || '')}</div></div><div class="acts">
        ${o.noRange ? '' : `<select id="tr" style="width:auto">${RANGES.map(r => opt(r[0], r[1], r[0] === range)).join('')}</select>`}${o.filters ? o.filters.html : ''}<button class="btn" id="tx">⤓ Export CSV</button></div></div>
        ${o.top ? '<div id="tt"></div>' : ''}<div id="tb"><div class="empty">Loading…</div></div>`;
      let last = null;
      const load = async () => {
        try {
          const [f, to] = rangeFor(range);
          const d = await o.load({ from: f, to, tz: tzMin(), range, ...(o.filters ? o.filters.read(el) : {}) });
          last = d;
          if (o.top) $('#tt', el).innerHTML = o.top(d);
          $('#tb', el).innerHTML = tableHTML(d.columns, d.rows, d.totals, o.tableOpts);
          o.after && o.after(el, d);
        } catch (e) { $('#tb', el).innerHTML = `<div class="err">${esc(e.message)}</div>`; }
      };
      pg.refresh = load;
      if ($('#tr', el)) $('#tr', el).onchange = e => { range = e.target.value; load(); };
      if (o.filters) o.filters.bind(el, load);
      $('#tx', el).onclick = () => { if (last) saveText((o.file || o.title).replace(/\W+/g, '_') + '.csv', csvOf(last.columns, last.rows)); };
      await load();
    },
  };
}
