'use strict';
/* =====================================================================
   core.js - state, API, formatting, charts, modals (no framework)
   ===================================================================== */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const S = {
  token: localStorage.token, me: {}, cfg: { currency: { symbol: '₹', position: 'before' }, i18n: {} }, schema: null,
  branch: +(localStorage.branch || 0), lk: {}, page: null, nav: {}, branches: [],
};
if (!S.token && !/^\/(qr|track|display|login)/.test(location.pathname)) location.replace('/login');

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const attr = esc;
// only same-site media paths and http(s) links may be used as a link / image address
const safeUrl = u => /^(\/media\/|https?:\/\/)/i.test(String(u || '')) ? String(u) : '';
const t = (k, d) => (S.cfg.i18n && S.cfg.i18n[k]) || d;
const nice = k => { k = String(k || '').replace(/_id$/, '').replace(/_/g, ' '); return k.charAt(0).toUpperCase() + k.slice(1); };

function num(n, dec = 0) { return (+n || 0).toLocaleString('en-IN', { minimumFractionDigits: dec, maximumFractionDigits: dec }); }
function money(v) {
  const c = S.cfg.currency || {};
  const s = ((+v || 0) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const neg = s.startsWith('-');
  const body = neg ? s.slice(1) : s;
  return (neg ? '-' : '') + (c.position === 'after' ? body + ' ' + (c.symbol || '') : (c.symbol || '₹') + body);
}
const toMinor = s => Math.round(parseFloat(String(s ?? '').replace(/,/g, '')) * 100) || 0;
const fromMinor = v => (+v || 0) / 100;
const pad = n => String(n).padStart(2, '0');
const dstr = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const todayStr = () => dstr(new Date());
const fdate = u => u ? new Date(u * 1000).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '';
const ftime = u => u ? new Date(u * 1000).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '';
const fdt = u => u ? fdate(u) + ' ' + ftime(u) : '';
const ago = u => { const m = Math.floor((Date.now() / 1000 - u) / 60); return m < 1 ? 'just now' : m < 60 ? m + ' min ago' : m < 1440 ? Math.floor(m / 60) + ' h ago' : Math.floor(m / 1440) + ' d ago'; };
const dayStart = (d = new Date()) => Math.floor(new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() / 1000);
const tzMin = () => -new Date().getTimezoneOffset();
const COLORS = ['#f97316', '#2563eb', '#16a34a', '#7c3aed', '#db2777', '#0891b2', '#ca8a04', '#64748b'];
const chip = s => `<span class="chip ${attr(s)}">${esc(String(s || '').replace(/_/g, ' '))}</span>`;

function toast(msg, bad) {
  const d = document.createElement('div');
  d.textContent = msg; if (bad) d.className = 'bad';
  $('#toast').append(d); setTimeout(() => d.remove(), bad ? 5000 : 3000);
}

function logout() { try { localStorage.removeItem('token'); localStorage.removeItem('user'); } catch (e) { } location.replace('/login'); }

/* ---------- API ---------- */
async function api(path, method = 'GET', body, opt = {}) {
  let url = '/api' + path;
  if (method === 'GET' && S.branch && !(S.me.branch_id) && !/[?&]branch=/.test(url) && !opt.noBranch) url += (url.includes('?') ? '&' : '?') + 'branch=' + S.branch;
  const h = { Authorization: 'Bearer ' + S.token };
  if (body !== undefined && !(body instanceof FormData)) h['Content-Type'] = 'application/json';
  const r = await fetch(url, { method, headers: h, body: body === undefined ? undefined : (body instanceof FormData ? body : JSON.stringify(body)) });
  if (r.status === 401) { logout(); throw new Error('Signed out'); }
  if (opt.raw) return r;
  const txt = await r.text();
  let d = null; try { d = txt ? JSON.parse(txt) : null; } catch (e) { d = { error: txt.slice(0, 200) }; }
  if (!r.ok) { const e = new Error((d && d.error) || 'Something went wrong'); e.status = r.status; throw e; }
  return d;
}
const qs = o => { const p = new URLSearchParams(); for (const k in o) if (o[k] !== undefined && o[k] !== null && o[k] !== '') p.set(k, o[k]); const s = p.toString(); return s ? '?' + s : ''; };
async function act(fn, ok) { try { const r = await fn(); if (ok) toast(ok); return r === undefined ? true : r; } catch (e) { toast(e.message, true); return false; } }

async function download(path, filename) {
  const r = await api(path, 'GET', undefined, { raw: true, noBranch: path.includes('branch=') });
  if (!r.ok) { toast('Download failed', true); return; }
  const b = await r.blob(), a = document.createElement('a');
  a.href = URL.createObjectURL(b); a.download = filename; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
async function qrDataURL(data, size = 220) {
  const r = await api('/qrcode' + qs({ data, size }), 'GET', undefined, { raw: true, noBranch: true });
  if (!r.ok) return '';
  return URL.createObjectURL(await r.blob());
}
async function uploadFile(file) {
  const fd = new FormData(); fd.append('file', file);
  return api('/media', 'POST', fd);
}
function csvOf(columns, rows) {
  const q = v => { v = String(v ?? ''); if (/^[=+\-@]/.test(v)) v = "'" + v; return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
  const lines = [columns.map(c => q(c.label)).join(',')];
  for (const r of rows) lines.push(columns.map(c => q(c.type === 'money' ? (+r[c.key] / 100 || 0).toFixed(2) : r[c.key])).join(','));
  return '﻿' + lines.join('\n');
}
function saveText(name, text, mime = 'text/csv') {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: mime })); a.download = name; document.body.append(a); a.click(); a.remove();
}

/* ---------- permissions ---------- */
const can = (mod, lv = 1) => (S.me.perms && S.me.perms[mod] || 0) >= lv;
const isSuper = () => S.me.role === 'superadmin';

/* ---------- lookups (dropdown sources) ---------- */
async function lookup(res, opt = {}) {
  const key = res + (opt.full ? ':f' : '') + (opt.status ? ':' + opt.status : '') + ':' + S.branch;
  const c = S.lk[key];
  if (c && Date.now() - c.at < 20000) return c.data;
  const data = await api('/lookup/' + res + qs({ full: opt.full ? 1 : '', status: opt.status || '' }));
  S.lk[key] = { at: Date.now(), data };
  return data;
}
const invalidateLookup = res => { for (const k of Object.keys(S.lk)) if (k === res || k.startsWith(res + ':')) delete S.lk[k]; };
async function labels(res) { const m = {}; for (const x of await lookup(res)) m[x.id] = x.label; return m; }

/* ---------- modal ---------- */
function modal(html, o = {}) {
  const host = $(o.layer === 2 ? '#modal2' : '#modal');
  host.innerHTML = `<div class="modal"><div class="box ${o.size || ''}">${html}</div></div>`;
  const m = host.firstChild;
  if (!o.sticky) m.onclick = e => { if (e.target === m) closeModal(o.layer); };
  const box = m.firstChild;
  o.onMount && o.onMount(box);
  return box;
}
function closeModal(layer) { $(layer === 2 ? '#modal2' : '#modal').innerHTML = ''; }
function confirmBox(msg, okLabel = 'Yes, continue', danger = false) {
  return new Promise(res => {
    const b = modal(`<h2>Please confirm</h2><p>${esc(msg)}</p><div class="acts"><button class="btn" id="cn">Cancel</button><button class="btn ${danger ? 'bad solid' : 'pri'}" id="cy">${esc(okLabel)}</button></div>`, { layer: 2, sticky: true });
    $('#cn', b).onclick = () => { closeModal(2); res(false); };
    $('#cy', b).onclick = () => { closeModal(2); res(true); };
  });
}
function promptBox(title, label = '', val = '', opt = {}) {
  return new Promise(res => {
    const b = modal(`<h2>${esc(title)}</h2>${label ? `<label class="f">${esc(label)}</label>` : ''}${opt.textarea ? `<textarea id="pv">${esc(val)}</textarea>` : `<input id="pv" type="${opt.type || 'text'}" value="${attr(val)}">`}<div class="acts"><button class="btn" id="cn">Cancel</button><button class="btn pri" id="cy">${esc(opt.ok || 'OK')}</button></div>`, { layer: 2, sticky: true });
    const inp = $('#pv', b); inp.focus();
    $('#cn', b).onclick = () => { closeModal(2); res(null); };
    $('#cy', b).onclick = () => { const v = inp.value; closeModal(2); res(v); };
    inp.onkeydown = e => { if (e.key === 'Enter' && !opt.textarea) $('#cy', b).click(); };
  });
}

/* ---------- charts (inline SVG / CSS, theme aware) ---------- */
function hbars(items, fmt = num, color) {
  const max = Math.max(1, ...items.map(i => +i.value || 0));
  return items.length ? items.map((i, n) => `<div class="hbar"><span title="${attr(i.label)}" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(i.label)}</span><div class="tr"><i style="width:${Math.max(2, (+i.value || 0) / max * 100)}%;background:${color || COLORS[n % COLORS.length]}"></i></div><b>${fmt(i.value)}</b></div>`).join('') : '<div class="empty">No data for this period</div>';
}
function barChart(items, fmt = money, color) {
  if (!items.length) return '<div class="empty">No data for this period</div>';
  const max = Math.max(1, ...items.map(i => +i.value || 0));
  return `<div class="bars" style="margin-bottom:22px">${items.map(i => `<div style="height:${Math.max(1.5, (+i.value || 0) / max * 100)}%;${color ? 'background:' + color : ''}" title="${attr(i.label)}: ${attr(fmt(i.value))}"><span>${esc(String(i.label).slice(-5))}</span></div>`).join('')}</div>`;
}
function lineChart(labelsArr, series, fmt = money) {
  if (!labelsArr.length) return '<div class="empty">No data for this period</div>';
  const W = 640, H = 220, L = 46, B = 24, T = 10, R = 8;
  let max = 0, min = 0;
  series.forEach(s => s.values.forEach(v => { max = Math.max(max, +v || 0); min = Math.min(min, +v || 0); }));
  if (max === min) max = min + 1;
  const x = i => L + (labelsArr.length === 1 ? (W - L - R) / 2 : i * (W - L - R) / (labelsArr.length - 1));
  const y = v => T + (H - T - B) * (1 - ((+v || 0) - min) / (max - min));
  let g = '';
  for (let i = 0; i <= 4; i++) {
    const v = min + (max - min) * i / 4, yy = y(v);
    g += `<line x1="${L}" x2="${W - R}" y1="${yy}" y2="${yy}"></line><text x="${L - 4}" y="${yy + 3}" text-anchor="end">${esc(compact(v, fmt))}</text>`;
  }
  const step = Math.ceil(labelsArr.length / 8);
  labelsArr.forEach((l, i) => { if (i % step === 0) g += `<text x="${x(i)}" y="${H - 6}" text-anchor="middle">${esc(String(l).slice(-5))}</text>`; });
  const lines = series.map((s, n) => {
    const c = s.color || COLORS[n % COLORS.length];
    const pts = s.values.map((v, i) => `${x(i)},${y(v)}`).join(' ');
    const area = s.area ? `<polygon points="${L},${y(0)} ${pts} ${x(s.values.length - 1)},${y(0)}" fill="${c}" opacity=".12"></polygon>` : '';
    const dots = labelsArr.length < 40 ? s.values.map((v, i) => `<circle cx="${x(i)}" cy="${y(v)}" r="3" fill="${c}"><title>${esc(labelsArr[i])} · ${esc(s.name)}: ${esc(fmt(v))}</title></circle>`).join('') : '';
    return `${area}<polyline fill="none" stroke="${c}" stroke-width="2.2" stroke-dasharray="${s.dash ? '5 4' : ''}" points="${pts}"></polyline>${dots}`;
  }).join('');
  const legend = series.length > 1 ? `<div class="legend">${series.map((s, n) => `<span><i style="background:${s.color || COLORS[n % COLORS.length]}"></i>${esc(s.name)}</span>`).join('')}</div>` : '';
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><g class="grid">${g}</g>${lines}</svg>${legend}`;
}
function compact(v, fmt) {
  if (fmt === money) { const a = Math.abs(v) / 100; const s = a >= 1e7 ? (a / 1e7).toFixed(1) + 'Cr' : a >= 1e5 ? (a / 1e5).toFixed(1) + 'L' : a >= 1e3 ? (a / 1e3).toFixed(1) + 'k' : a.toFixed(0); return (v < 0 ? '-' : '') + s; }
  const a = Math.abs(v); return (v < 0 ? '-' : '') + (a >= 1e5 ? (a / 1e5).toFixed(1) + 'L' : a >= 1e3 ? (a / 1e3).toFixed(1) + 'k' : String(Math.round(a * 10) / 10));
}
function donut(items, fmt = num, size = 150) {
  const tot = items.reduce((a, i) => a + (+i.value || 0), 0);
  if (!tot) return '<div class="empty">No data for this period</div>';
  let acc = 0; const r = 50, c = 2 * Math.PI * r;
  const arcs = items.map((i, n) => { const f = (+i.value || 0) / tot; const d = `<circle r="${r}" cx="60" cy="60" fill="none" stroke="${COLORS[n % COLORS.length]}" stroke-width="22" stroke-dasharray="${f * c} ${c}" stroke-dashoffset="${-acc * c}" transform="rotate(-90 60 60)"><title>${esc(i.label)}: ${esc(fmt(i.value))}</title></circle>`; acc += f; return d; }).join('');
  return `<div class="donutw"><svg width="${size}" height="${size}" viewBox="0 0 120 120">${arcs}<text x="60" y="64" text-anchor="middle" style="fill:var(--ink);font-size:13px;font-weight:800">${esc(fmt(tot))}</text></svg><div class="legend" style="flex-direction:column;gap:5px;font-size:12.5px">${items.map((i, n) => `<span><i style="background:${COLORS[n % COLORS.length]}"></i>${esc(i.label)} · <b style="color:var(--ink)">${esc(fmt(i.value))}</b></span>`).join('')}</div></div>`;
}
function delta(cur, prev, inverse = false) {
  if (!prev) return `<span class="delta flat">—</span>`;
  const p = (cur - prev) / Math.abs(prev) * 100, good = inverse ? p <= 0 : p >= 0;
  return `<span class="delta ${Math.abs(p) < .05 ? 'flat' : good ? 'up' : 'down'}">${p >= 0 ? '▲' : '▼'} ${Math.abs(p).toFixed(1)}%</span> <small class="muted">vs previous</small>`;
}

/* ---------- print ---------- */
const PRINT_CSS = `html,body{margin:0;padding:0;background:#fff;color:#000}
.receipt{font-family:ui-monospace,Consolas,"Courier New",monospace;font-size:12px;line-height:1.35;width:100%;margin:0;padding:0;color:#000;background:#fff}
.receipt .c{text-align:center}.receipt hr{border:0;border-top:1px dashed #000;margin:5px 0}.receipt .r{display:flex;justify-content:space-between;gap:6px}
.receipt b{font-weight:700}.receipt small{font-size:10px}`;

// Prints in a hidden frame so ONLY the slip is printed, on a page exactly as wide
// (and as tall) as the slip - like a real till receipt, never a full A4 sheet.
/* ---------- Code 128 barcode (type B) as inline SVG - no library, works offline ---------- */
const C128 = '212222,222122,222221,121223,121322,131222,122213,122312,132212,221213,221312,231212,112232,122132,122231,113222,123122,123221,223211,221132,221231,213212,223112,312131,311222,321122,321221,312212,322112,322211,212123,212321,232121,111323,131123,131321,112313,132113,132311,211313,231113,231311,112133,112331,132131,113123,113321,133121,313121,211331,231131,213113,213311,213131,311123,311321,331121,312113,312311,332111,314111,221411,431111,111224,111422,121124,121421,141122,141221,112214,112412,122114,122411,142112,142211,241211,221114,413111,241112,134111,111242,121142,121241,114212,124112,124211,411212,421112,421211,212141,214121,412121,111143,111341,131141,114113,114311,411113,411311,113141,114131,311141,411131,211412,211214,211232,2331112'.split(',');
function barcodeSVG(text, h = 34) {
  const t = String(text).replace(/[^ -~]/g, '');
  if (!t) return '';
  const codes = [104]; let sum = 104;
  [...t].forEach((ch, i) => { const v = ch.charCodeAt(0) - 32; codes.push(v); sum += v * (i + 1); });
  codes.push(sum % 103, 106);
  let x = 10, bars = '', bar = true; // 10 modules of quiet zone
  for (const k of codes) { for (const w of C128[k]) { if (bar) bars += `<rect x="${x}" y="0" width="${w}" height="${h}"/>`; x += +w; bar = !bar; } bar = true; }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${x + 10} ${h}" preserveAspectRatio="none" style="width:100%;height:${h}px;display:block" shape-rendering="crispEdges" fill="#000">${bars}</svg>`;
}
// turns <img data-qr="..."> placeholders into real QR images before printing
async function inlineQRs(html) {
  const re = /<img data-qr="([^"]*)"[^>]*>/g, found = [...html.matchAll(re)];
  for (const m of found) {
    try {
      const url = await qrDataURL(decodeURIComponent(m[1]), 240);
      html = html.replace(m[0], url ? `<img src="${url}" style="width:30mm;height:30mm;display:block;margin:4px auto">` : '');
    } catch (e) { html = html.replace(m[0], ''); }
  }
  return html;
}
async function printHTML(html, opt = {}) {
  if (!opt.paper && !can('printing', 2)) { toast('Your role is not allowed to print', true); return; }
  if (html.includes('data-qr=')) html = await inlineQRs(html);
  const paper = opt.paper || (S.cfg.pdf && S.cfg.pdf.paper) || '80mm';
  const roll = paper === '80mm' || paper === '58mm';
  const width = paper === '58mm' ? 58 : 80, pad = 2.5;
  const parts = String(html).split('<!--pagebreak-->').filter(x => x.trim());
  const old = document.getElementById('printFrame'); if (old) old.remove();
  const fr = document.createElement('iframe');
  fr.id = 'printFrame'; fr.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
  document.body.append(fr);
  const doc = fr.contentWindow.document;
  const body = parts.map(p => `<div class="slip">${p}</div>`).join('');
  doc.open();
  doc.write(`<!doctype html><html><head><meta charset="utf-8"><title>${attr(S.cfg.restaurant || 'Print')}</title>
    ${roll ? '' : '<link rel="stylesheet" href="/style.css"><link rel="stylesheet" href="/theme.css">'}
    <style id="ps">@page{size:${roll ? width + 'mm 200mm' : paper};margin:${roll ? '0' : (opt.margin || '12mm')}}${PRINT_CSS}
    body{${roll ? `width:${width - pad * 2}mm;padding:${pad}mm` : 'padding:0'};box-sizing:content-box}
    .slip{${roll ? '' : ''}page-break-after:always;break-after:page}.slip:last-child{page-break-after:auto;break-after:auto}
    ${roll ? '.receipt{font-size:' + (paper === '58mm' ? '11px' : '12px') + '}' : ''}</style></head><body>${body}</body></html>`);
  doc.close();
  const go = () => {
    try {
      if (roll) { // make the page exactly as tall as the tallest slip
        const px = Math.max(...[...doc.querySelectorAll('.slip')].map(s => s.getBoundingClientRect().height));
        const mm = Math.ceil(px * 25.4 / 96 + pad * 2 + 3);
        doc.getElementById('ps').textContent = doc.getElementById('ps').textContent.replace(/size:[^;]+;/, `size:${width}mm ${Math.max(mm, 40)}mm;`);
      }
      fr.contentWindow.focus(); fr.contentWindow.print();
    } catch (e) { toast('Could not open the print window: ' + e.message, true); }
    setTimeout(() => fr.remove(), 120000);
  };
  const imgs = [...doc.images];
  Promise.all(imgs.map(im => im.complete ? 1 : new Promise(r => { im.onload = im.onerror = r; }))).then(() => setTimeout(go, roll ? 120 : 500));
}

/* ---------- date-range presets ---------- */
function rangeFor(key) {
  const now = new Date(), d0 = new Date(now.getFullYear(), now.getMonth(), now.getDate()), day = 86400000;
  const u = x => Math.floor(x / 1000);
  switch (key) {
    case 'today': return [u(d0), u(Date.now()) + 1];
    case 'yesterday': return [u(d0 - day), u(d0)];
    case '7d': return [u(d0 - 6 * day), u(Date.now()) + 1];
    case '30d': return [u(d0 - 29 * day), u(Date.now()) + 1];
    case 'month': return [u(new Date(now.getFullYear(), now.getMonth(), 1)), u(Date.now()) + 1];
    case 'lastmonth': return [u(new Date(now.getFullYear(), now.getMonth() - 1, 1)), u(new Date(now.getFullYear(), now.getMonth(), 1))];
    case 'year': return [u(new Date(now.getFullYear(), 0, 1)), u(Date.now()) + 1];
  }
  return [u(d0 - 29 * day), u(Date.now()) + 1];
}
function dateRangeFor(key) { // YYYY-MM-DD strings
  const [a, b] = rangeFor(key);
  return [dstr(new Date(a * 1000)), dstr(new Date((b - 1) * 1000))];
}
const RANGES = [['today', 'Today'], ['yesterday', 'Yesterday'], ['7d', 'Last 7 days'], ['30d', 'Last 30 days'], ['month', 'This month'], ['lastmonth', 'Last month'], ['year', 'This year']];
