'use strict';
/* boot.js - builds the shell (rail, menu, top bar), routes screens, live updates */

function applyBrand() {
  const c = S.cfg;
  if (c.color) document.documentElement.style.setProperty('--pri', c.color);
  document.title = (c.restaurant || 'TableBill');
}
function applyTheme() {
  let th = localStorage.theme || S.cfg.dark || 'auto';
  if (th === 'auto') th = window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  document.documentElement.dataset.theme = th;
}
function allowedTargets() {
  const set = new Set(); const walk = items => items.forEach(i => { if (i.target) set.add(i.target); if (i.children) walk(i.children); });
  (S.schema.rails || []).forEach(r => walk(r.items)); return set;
}
function firstTarget(items) { for (const i of items) { if (i.target) return i.target; if (i.children) { const t = firstTarget(i.children); if (t) return t; } } return null; }
function homeTarget() {
  const homes = { kitchen: 'kds', cashier: 'pos', waiter: 'pos', hr_officer: 'hr_dash', hr_manager: 'hr_dash', accountant: 'acc_dash', accounting_manager: 'acc_dash', accounting_auditor: 'acc_dash' };
  const ok = allowedTargets();
  if (homes[S.me.role] && ok.has(homes[S.me.role])) return homes[S.me.role];
  if (ok.has('dashboard')) return 'dashboard';
  return firstTarget(S.schema.rails[0] ? S.schema.rails[0].items : []) || 'dashboard';
}
function railOf(target) {
  for (const r of S.schema.rails) { let f = false; const walk = items => items.forEach(i => { if (i.target === target) f = true; if (i.children) walk(i.children); }); walk(r.items); if (f) return r; }
  return S.schema.rails[0];
}

function buildRail(active) {
  $('#rail').innerHTML = `<div class="logo" title="${attr(S.cfg.restaurant || '')}">${safeUrl(S.cfg.logo) ? `<img src="${attr(safeUrl(S.cfg.logo))}">` : '🍴'}</div>` + S.schema.rails.map(r => {
    const tg = firstTarget(r.items);
    return `<a href="#/${attr(tg)}" class="${r.key === active.key ? 'on' : ''}" title="${attr(r.title)}"><i>${r.icon}</i>${esc(t('rail.' + r.key, r.title))}</a>`;
  }).join('') + '<div class="sp"></div>';
}

const shut = (() => { try { return new Set(JSON.parse(localStorage.shut || '[]')); } catch (e) { return new Set(); } })();
function buildNav(rail, target) {
  $('#sideTitle').textContent = t('rail.' + rail.key, rail.title);
  const html = items => items.map(i => {
    if (i.kind === 'group') {
      const id = rail.key + ':' + i.title, closed = shut.has(id) && !hasTarget(i, target);
      return `<div class="grp ${closed ? 'shut' : ''}" data-g="${attr(id)}">${esc(i.title)}<b>▼</b></div><div class="kids ${closed ? 'shut' : ''}">${html(i.children)}</div>`;
    }
    return `<a href="#/${attr(i.target)}" class="${i.target === target ? 'on' : ''}">${esc(t('nav.' + i.target, i.title))}</a>`;
  }).join('');
  $('#nav').innerHTML = html(rail.items);
  $$('#nav .grp').forEach(g => g.onclick = () => {
    g.classList.toggle('shut'); g.nextElementSibling.classList.toggle('shut');
    g.classList.contains('shut') ? shut.add(g.dataset.g) : shut.delete(g.dataset.g);
    localStorage.shut = JSON.stringify([...shut]);
  });
}
function hasTarget(item, target) { return (item.children || []).some(c => c.target === target || hasTarget(c, target)); }

function parseHash() {
  const h = location.hash.replace(/^#\/?/, ''); const [path, query] = h.split('?');
  return { target: decodeURIComponent(path || ''), params: Object.fromEntries(new URLSearchParams(query || '')) };
}
function handlerFor(target) {
  if (PAGES[target]) return typeof PAGES[target] === 'function' ? PAGES[target]() : PAGES[target];
  if (target.startsWith('set:')) return settingsPage(target.slice(4));
  if (RES(target)) return resPage(target);
  return null;
}
async function route() {
  let { target, params } = parseHash();
  const ok = allowedTargets();
  if (S.me.role === 'pos_operator') { document.body.classList.add('kiosk'); if (target !== 'pos') { target = 'pos'; history.replaceState(null, '', '#/pos'); } }
  if (!target || !ok.has(target)) { if (target && target !== homeTarget()) toast('That screen is not available for your role', true); target = homeTarget(); history.replaceState(null, '', '#/' + target); params = {}; }
  const h = handlerFor(target);
  const rail = railOf(target);
  buildRail(rail); buildNav(rail, target);
  $('#side').classList.remove('open');
  const el = $('#view'); el.className = ''; el.innerHTML = '<div class="empty">Loading…</div>';
  S.page = { target, params, refresh: null, events: (h && h.events) || [] };
  S.page.cleanup && S.page.cleanup();
  document.title = t('nav.' + target, target) + ' | ' + (S.cfg.restaurant || 'TableBill');
  if (!h) { el.innerHTML = `<div class="card empty">This screen (<b>${esc(target)}</b>) is not available.</div>`; return; }
  const pg = S.page;
  try { await h.render(el, pg); } catch (e) { if (S.page === pg) el.innerHTML = `<div class="err">${esc(e.message)}</div>`; console.error(e); }
}

/* ---------- top bar ---------- */
function setupTop() {
  const bs = $('#branchSel');
  if (!S.me.branch_id && S.branches.length > 1) {
    bs.classList.remove('hide');
    bs.innerHTML = opt(0, '🏪 All branches', !S.branch) + S.branches.map(b => opt(b.id, b.label, b.id === S.branch)).join('');
    bs.onchange = () => { S.branch = +bs.value; localStorage.branch = S.branch; S.lk = {}; route(); };
  } else if (S.me.branch_id) {
    bs.classList.remove('hide'); bs.innerHTML = opt(S.me.branch_id, '🏪 ' + S.branchName(S.me.branch_id), true); bs.disabled = true;
  }
  $('#avatar').textContent = (S.me.name || '?').slice(0, 1).toUpperCase();
  if (S.me.role === 'pos_operator') { document.body.classList.add('kiosk'); $('.top').insertAdjacentHTML('afterbegin', `<span class="brand"><span class="logo">${safeUrl(S.cfg.logo) ? `<img src="${attr(safeUrl(S.cfg.logo))}">` : '🍴'}</span>${esc(S.cfg.restaurant || '')}</span>`); }
  $('#supBtn').onclick = () => openSupport();
  if (localStorage.navHidden === '1') document.body.classList.add('nav-hidden');
  $('#burger').onclick = () => {
    if (window.innerWidth > 900) { const h = document.body.classList.toggle('nav-hidden'); localStorage.navHidden = h ? '1' : '0'; }
    else $('#side').classList.toggle('open');
  };
  $('#themeBtn').onclick = () => { const cur = localStorage.theme || 'auto'; const n = { auto: 'light', light: 'dark', dark: 'auto' }[cur]; localStorage.theme = n; applyTheme(); toast('Theme: ' + n); };
  $('#fsBtn').onclick = () => document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen().catch(() => { });
  $('#avatar').onclick = e => { e.stopPropagation(); togglePop('userPop', userMenu); };
  $('#bell').onclick = e => { e.stopPropagation(); togglePop('bellPop', bellList); };
  document.addEventListener('click', e => { if (!e.target.closest('.pop')) $$('.pop').forEach(p => p.classList.add('hide')); });
  window.addEventListener('hashchange', route);
}
function togglePop(id, fill) {
  const p = $('#' + id); const was = !p.classList.contains('hide');
  $$('.pop').forEach(x => x.classList.add('hide'));
  if (!was) { fill(p); p.classList.remove('hide'); }
}
function userMenu(p) {
  const rl = S.me.role_label || S.me.role;
  p.innerHTML = `<div class="umenu"><div class="uhead"><div class="avatar big">${esc((S.me.name || '?').slice(0, 1).toUpperCase())}</div><div><b>${esc(S.me.name)}</b><small>${esc(rl)}${S.me.branch_id ? ' · ' + esc(S.branchName(S.me.branch_id)) : ''}</small><small>@${esc(S.me.username)}</small></div></div>
    <a id="u1"><i>🔑</i> Change password</a><a id="u2"><i>🛡</i> Two-factor authentication</a><a id="u4"><i>🛟</i> Help & support</a>
    <button class="btn bad block signout" id="u3">⎋ Sign out</button></div>`;
  $('#u1', p).onclick = () => { p.classList.add('hide'); changePasswordBox(); };
  $('#u2', p).onclick = () => { p.classList.add('hide'); location.hash = '#/set:two_factor'; };
  $('#u4', p).onclick = () => { p.classList.add('hide'); openSupport(); };
  $('#u3', p).onclick = logout;
}
function changePasswordBox() {
  const b = modal(`<h2>Change password</h2><label class="f">Current password</label><input type="password" id="o" autocomplete="current-password"><label class="f">New password (6+ characters)</label><input type="password" id="n" autocomplete="new-password"><div class="err inline hide" id="e"></div><div class="acts"><button class="btn" id="c">Cancel</button><button class="btn pri" id="s">Change</button></div>`);
  $('#c', b).onclick = () => closeModal();
  $('#s', b).onclick = async () => { try { await api('/me/password', 'POST', { old: $('#o', b).value, new: $('#n', b).value }); closeModal(); toast('Password changed ✔'); } catch (e) { $('#e', b).textContent = e.message; $('#e', b).classList.remove('hide'); } };
}

/* ---------- notifications ---------- */
let notes = [];
async function loadNotes() {
  try { notes = await api('/notifications', 'GET', undefined, { noBranch: true }); } catch (e) { return; }
  const seen = +(localStorage.noteSeen || 0), n = notes.filter(x => x.id > seen).length;
  const badge = $('#bellN'); badge.textContent = n > 99 ? '99+' : n; badge.classList.toggle('hide', !n);
}
function bellList(p) {
  const seen = +(localStorage.noteSeen || 0);
  p.innerHTML = `<div class="it" style="display:flex"><b>Notifications</b><a class="right" id="bm" style="cursor:pointer">Mark all read</a></div>` + (notes.length ? notes.map(x => `<div class="it ${x.id > seen ? 'new' : ''}" data-l="${attr(x.link || '')}" style="cursor:pointer"><b>${x.level === 'warn' ? '⚠️ ' : ''}${esc(x.title)}</b><span class="muted">${esc(x.body || '')}</span><div class="muted" style="font-size:11px">${esc(ago(x.ts))}</div></div>`).join('') : '<div class="empty">You are all caught up 🎉</div>');
  $('#bm', p) && ($('#bm', p).onclick = e => { e.stopPropagation(); if (notes.length) localStorage.noteSeen = notes[0].id; loadNotes(); bellList(p); });
  $$('.it[data-l]', p).forEach(i => i.onclick = () => { if (i.dataset.l) location.hash = i.dataset.l.replace(/^#?\/?/, '#/'); p.classList.add('hide'); if (notes.length) localStorage.noteSeen = notes[0].id; loadNotes(); });
}

/* ---------- live updates ---------- */
let es = null, evTimer = null;
function live() {
  if (es) es.close();
  es = new EventSource('/api/events?token=' + encodeURIComponent(S.token));
  es.onopen = () => $('#live').classList.remove('off');
  es.onerror = () => $('#live').classList.add('off');
  es.onmessage = e => {
    const ev = e.data;
    if (ev.startsWith('ready|')) { readyAlert(ev.split('|')); return; }
    if (ev.startsWith('res:')) invalidateLookup(ev.slice(4));
    if (ev === 'notify') loadNotes();
    if (ev === 'settings') fetch('/api/config').then(r => r.json()).then(c => { S.cfg = c; applyBrand(); });
    const p = S.page;
    if (p && p.refresh && (p.events || []).some(x => ev === x || (x.endsWith('*') && ev.startsWith(x.slice(0, -1))))) {
      clearTimeout(evTimer); evTimer = setTimeout(() => { if (S.page === p && !document.querySelector('#modal .modal')) p.refresh(); }, 200 + Math.random() * 700); // jitter spreads the reload load
    }
  };
}

/* ---------- start ---------- */
(async function boot() {
  if (/^\/(qr|track|display)/.test(location.pathname) || !S.token) return;
  try {
    [S.cfg, S.me, S.schema] = await Promise.all([fetch('/api/config').then(r => r.json()), api('/me'), api('/schema')]);
    try { S.branches = await lookup('branches'); } catch (e) { S.branches = []; }
    S.branchName = id => { const b = S.branches.find(x => x.id === id); return b ? b.label : '#' + id; };
    if (S.me.branch_id) { S.branch = S.me.branch_id; }
    applyBrand(); applyTheme(); setupTop();
    document.body.classList.toggle('noprint', !can('printing', 2));
    await route(); live(); loadNotes(); setInterval(loadNotes, 90000);
    if ('serviceWorker' in navigator && S.cfg.pwa && S.cfg.pwa.installable !== false) navigator.serviceWorker.register('/sw.js').catch(() => { });
  } catch (e) { if (e.message !== 'Signed out') $('#view').innerHTML = `<div class="err">${esc(e.message)}</div>`; }
})();


/* ---------- "order ready" alert for waiters ---------- */
function readyAlert([, no, where, creator, waiter]) {
  const mine = [+creator, +waiter].includes(S.me.id) || S.me.role === 'waiter';
  if (!mine || !can('pos', 1)) return;
  let host = document.getElementById('readyHost');
  if (!host) { host = document.createElement('div'); host.id = 'readyHost'; document.body.append(host); }
  const d = document.createElement('div');
  d.className = 'ready-card';
  d.innerHTML = `<div class="ic">✅</div><div class="tx"><b>Order #${esc(no)} is ready</b><span>${esc(where)}</span></div><button class="btn sm ok">Got it</button>`;
  d.querySelector('button').onclick = () => d.remove();
  host.prepend(d);
  setTimeout(() => d.remove(), 120000);
  try { const a = new (window.AudioContext || window.webkitAudioContext)(); [880, 1175].forEach((f, i) => { const o = a.createOscillator(), g = a.createGain(); o.connect(g); g.connect(a.destination); o.frequency.value = f; g.gain.value = .18; o.start(a.currentTime + i * .18); o.stop(a.currentTime + i * .18 + .16); }); setTimeout(() => a.close(), 900); } catch (e) { }
  if (S.page && S.page.refresh && ['pos', 'orders'].includes(S.page.target)) S.page.refresh();
}


/* ---------- keyboard shortcuts (press ? or F1 to see them) ---------- */
const SHORTCUTS = [
  ['Go to', [['Alt + P', 'POS / new order'], ['Alt + K', 'Kitchen screen'], ['Alt + O', 'Orders'], ['Alt + T', 'Tables'], ['Alt + D', 'Dashboard']]],
  ['POS', [['/  or  F2', 'Search items / scan barcode'], ['F4  or  Alt + S', 'Send to kitchen'], ['F8', 'Pay & fire (or send & print bill)'], ['Esc', 'Close pop-up']]],
  ['Payment pop-up', [['Alt + 1 / 2 / 3', 'Cash / Card / UPI'], ['F9', 'Exact amount'], ['Ctrl + Enter  or  F8', 'Confirm payment']]],
  ['Anywhere', [['Ctrl + K', 'Focus the search box'], ['?  or  F1', 'Show this list']]],
];
function showShortcuts() {
  const box = modal(`<h2>⌨ Keyboard shortcuts</h2><div class="grid g2">${SHORTCUTS.map(([t, rows]) => `<div class="card"><h3>${t}</h3>${rows.map(([k, d]) => `<div class="row"><span>${esc(d)}</span><kbd>${esc(k)}</kbd></div>`).join('')}</div>`).join('')}</div><div class="acts"><button class="btn pri" id="c">Close</button></div>`, { size: 'wide' });
  $('#c', box).onclick = () => closeModal();
}
document.addEventListener('keydown', e => {
  if (typeof S === "undefined" || !S.me || e.isComposing) return;
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable;
  const k = e.key, go = h => { e.preventDefault(); location.hash = '#/' + h; };
  const click = sel => { const el = document.querySelector(sel); if (el && !el.disabled) { e.preventDefault(); el.click(); return true; } return false; };
  if (k === 'Escape') {
    if ($('#modal2').firstChild) closeModal(2); else if ($('#modal').firstChild) closeModal(); else if (typing) e.target.blur();
    return;
  }
  const payOpen = !!document.querySelector('#pm');
  if (payOpen) {
    if (e.altKey && ['1', '2', '3'].includes(k)) { click(`[data-m="${['cash', 'card', 'upi'][+k - 1]}"]`); return; }
    if (k === 'F9') { click('#ex'); return; }
    if (k === 'F8' || (e.ctrlKey && k === 'Enter')) { click('#pp'); return; }
  }
  if (k === 'F1' || (k === '?' && !typing)) { e.preventDefault(); showShortcuts(); return; }
  if ((e.ctrlKey || e.metaKey) && k.toLowerCase() === 'k' || k === 'F2' || (k === '/' && !typing)) {
    const s = document.querySelector('#ps, #view input[type=search], #view input[placeholder*="earch"]');
    if (s) { e.preventDefault(); s.focus(); s.select(); }
    return;
  }
  if (e.altKey && !e.ctrlKey && !e.metaKey) {
    const m = { p: 'pos', k: 'kds', o: 'orders', t: 'tables', d: 'dashboard' }[k.toLowerCase()];
    if (m) { go(m); return; }
    if (k.toLowerCase() === 's') { click('#send'); return; }
  }
  if (k === 'F4') { click('#send'); return; }
  if (k === 'F8' && !payOpen) { click('#fire') || click('#sendbill'); return; }
});
