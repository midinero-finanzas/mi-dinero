import { db, askPersistence } from './db.js';
import { CURRENCIES, ICONS, COLORS } from './data.js';
import { t, LANGS, lang, setLang, detectLang, locale, monthName, monthShort, weekdays, decSep, parseNum, currencyName, defaultCategories, defaultAccounts, relabel } from './i18n.js';
import { buildXlsx } from './xlsx.js';

const APP_VERSION = '1.3.0';
const PUSH_API = 'https://mi-dinero-push.midinero-finanzas.workers.dev';
const TRIAL_DAYS = 7;
const SUPPORT_WA = ''; // WhatsApp de ventas y soporte, con indicativo (ej. 573001234567)
const VAPID_PUBLIC = 'BFBKViSW9VWqGKNQovZGewy66-bVzdhGpBSwxQdc6dyTyGD3_jYA2RBXXUQPycU1hrfqHe3fXM8w-u0pKQutdOw';

// ---------- utilidades ----------
const tr = t; // donde `t` ya nombra otra cosa (totales, un movimiento)
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = n => String(n).padStart(2, '0');
const isoDate = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => isoDate(new Date());
const thisMonth = () => today().slice(0, 7);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const daysIn = m => { const [y, mo] = m.split('-').map(Number); return new Date(y, mo, 0).getDate(); };
const shiftMonth = (m, k) => { const [y, mo] = m.split('-').map(Number); const d = new Date(y, mo - 1 + k, 1); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; };
const monthLabel = m => { const [y, mo] = m.split('-').map(Number); return `${monthName(mo - 1)} ${y}`; };
const dayLabel = iso => { const [y, m, d] = iso.split('-').map(Number); const s = new Date(y, m - 1, d).toLocaleDateString(locale(), { weekday: 'long', day: 'numeric', month: 'long' }); return s[0].toUpperCase() + s.slice(1); };
const shortDate = iso => { const [y, m, d] = iso.split('-').map(Number); return `${d} ${monthShort(m - 1)} ${y}`; };
const round2 = n => Math.round(n * 100) / 100;

function fmt(n, sign = false) {
  const v = round2(n);
  const dec = Number.isInteger(v) ? 0 : 2;
  let s;
  try { s = new Intl.NumberFormat(locale(), { style: 'currency', currency: S.settings.currency, currencyDisplay: lang() === 'es' ? 'symbol' : 'narrowSymbol', minimumFractionDigits: dec, maximumFractionDigits: dec }).format(Math.abs(v)); }
  catch { s = '$ ' + Math.abs(v).toLocaleString(locale()); }
  return (v < 0 ? '−' : sign && v > 0 ? '+' : '') + s;
}

// ---------- estado ----------
const S = { license: null, settings: null, categories: [], accounts: [], recurring: [], txs: [] };
const V = { tab: 'inicio', month: thisMonth(), day: null, scope: 'todo', bal: 'mes', year: new Date().getFullYear(), kind: 'gasto' };
let CAT = {}, ACC = {};
const reindex = () => { CAT = Object.fromEntries(S.categories.map(c => [c.id, c])); ACC = Object.fromEntries(S.accounts.map(a => [a.id, a])); };
const cat = id => CAT[id] || { name: t('Sin categoría'), icon: '❔', color: '#7a8a99', type: 'gasto' };

const persist = {
  settings: () => db.put('kv', S.settings, 'settings'),
  categories: () => { reindex(); return db.put('kv', S.categories, 'categories'); },
  accounts: () => { reindex(); return db.put('kv', S.accounts, 'accounts'); },
  recurring: () => db.put('kv', S.recurring, 'recurring'),
};

async function load() {
  const prev = await db.get('kv', 'settings');
  // Quien ya usaba la app antes de las licencias queda como fundador: gratis para siempre
  S.license = (await db.get('kv', 'license')) || { deviceId: newDeviceId(), trialStart: Date.now(), founder: !!prev };
  await db.put('kv', S.license, 'license');
  S.settings = prev || { currency: 'COP', lastScope: 'personal', lastAccount: 'a1', lastBackup: null, createdAt: Date.now() };
  S.settings.lang ||= detectLang();
  setLang(S.settings.lang);
  S.categories = (await db.get('kv', 'categories')) || defaultCategories();
  S.accounts = (await db.get('kv', 'accounts')) || defaultAccounts();
  S.recurring = (await db.get('kv', 'recurring')) || [];
  S.txs = await db.all('txs');
  reindex();
  await Promise.all([persist.settings(), persist.categories(), persist.accounts(), persist.recurring()]);
}

// Borra los datos pero conserva la licencia y la prueba gratis de este dispositivo
async function clearData() {
  const lic = S.license;
  await db.clear();
  if (lic) await db.put('kv', lic, 'license');
}

async function saveTx(t) {
  const i = S.txs.findIndex(x => x.id === t.id);
  if (i >= 0) S.txs[i] = t; else S.txs.push(t);
  await db.put('txs', t);
}
async function deleteTx(t) {
  S.txs = S.txs.filter(x => x.id !== t.id);
  await db.del('txs', t.id);
  if (t.photoId) await db.del('photos', t.photoId);
}

// ---------- cálculos ----------
const inScope = t => V.scope === 'todo' || t.scope === V.scope;
const txIn = (pre, scoped = true) => S.txs.filter(t => t.date.startsWith(pre) && (!scoped || inScope(t)));
function totals(list) {
  let inc = 0, exp = 0;
  for (const t of list) t.type === 'ingreso' ? (inc += t.amount) : (exp += t.amount);
  return { inc: round2(inc), exp: round2(exp), bal: round2(inc - exp) };
}
const accumulatedUntil = lastDate => totals(S.txs.filter(t => t.date <= lastDate && inScope(t))).bal;
const byDateDesc = (a, b) => b.date.localeCompare(a.date) || (b.createdAt || 0) - (a.createdAt || 0);
function byCategory(list, kind) {
  const m = {};
  for (const t of list) if (t.type === kind) m[t.catId] = (m[t.catId] || 0) + t.amount;
  return Object.entries(m).map(([id, v]) => ({ id, v: round2(v) })).sort((a, b) => b.v - a.v);
}
function accountBalance(a) {
  return round2((+a.initial || 0) + S.txs.filter(t => t.accountId === a.id).reduce((s, t) => s + (t.type === 'ingreso' ? t.amount : -t.amount), 0));
}
function pendingRecurring(month) {
  return S.recurring.filter(r => r.active !== false && r.startMonth <= month && !S.txs.some(t => t.recurringId === r.id && t.date.startsWith(month)));
}
const backupDue = () => S.txs.length > 0 && (!S.settings.lastBackup || Date.now() - S.settings.lastBackup > 7 * 864e5);

// ---------- piezas de interfaz ----------
const icoHtml = (c, size = '') => `<span class="ico" style="background:${c.color}22;${size}">${esc(c.icon)}</span>`;
function txRow(t) {
  const c = cat(t.catId);
  const acc = t.accountId && ACC[t.accountId];
  return `<button class="tx" data-act="edit-tx" data-id="${t.id}">
    ${icoHtml(c)}
    <span class="mid"><div class="name">${esc(c.name)}${t.scope === 'negocio' ? `<span class="tag biz">${tr('Negocio')}</span>` : ''}${acc ? `<span class="tag acc">${esc(acc.name)}</span>` : ''}${t.photoId ? '<span class="tag cam">📎</span>' : ''}</div>
    ${t.note ? `<div class="note">${esc(t.note)}</div>` : ''}</span>
    <span class="amt num ${t.type === 'ingreso' ? 'inc' : 'exp'}">${t.type === 'ingreso' ? '+' : '−'}${fmt(t.amount)}</span></button>`;
}
function groupedList(list) {
  if (!list.length) return `<div class="empty-state">${t('No hay movimientos aquí todavía.<br>Usa los botones de abajo para registrar uno.')}</div>`;
  const groups = {};
  for (const t of [...list].sort(byDateDesc)) (groups[t.date] ||= []).push(t);
  return Object.entries(groups).map(([d, items]) => {
    const tt = totals(items);
    return `<div class="day-head"><span>${esc(dayLabel(d))}</span><span class="num ${tt.bal >= 0 ? 'inc' : 'exp'}">${fmt(tt.bal, true)}</span></div>${items.map(txRow).join('')}`;
  }).join('');
}
function accPicker(sel, act) {
  const opts = [...S.accounts.map(a => ({ id: a.id, icon: a.icon, name: a.name })), { id: '', icon: '➖', name: t('Sin cuenta') }];
  return `<div class="acc-grid">${opts.map(a => `<button class="acc-btn ${(sel || '') === a.id ? 'on' : ''}" data-act="${act}" data-v="${a.id}"><span class="ai">${esc(a.icon)}</span><span>${esc(a.name)}</span></button>`).join('')}</div>`;
}
const scopeSeg = () => `<div class="seg">${[['todo', 'Todo'], ['personal', '👤 Personal'], ['negocio', '💼 Negocio']].map(([k, l]) => `<button data-act="scope" data-v="${k}" class="${V.scope === k ? 'on' : ''}">${t(l)}</button>`).join('')}</div>`;

// ---------- vistas ----------
function viewInicio() {
  const m = V.month;
  const list = txIn(m);
  const t = totals(list);
  const acc = accumulatedUntil(`${m}-31`);
  const [y, mo] = m.split('-').map(Number);
  const offset = (new Date(y, mo - 1, 1).getDay() + 6) % 7;
  const perDay = {};
  for (const x of list) { const d = +x.date.slice(8); (perDay[d] ||= { i: 0, g: 0 })[x.type === 'ingreso' ? 'i' : 'g'] += x.amount; }
  const td = today();
  let cal = weekdays().map(w => `<div class="wd">${w}</div>`).join('') + '<div class="d empty"></div>'.repeat(offset);
  for (let d = 1; d <= daysIn(m); d++) {
    const iso = `${m}-${pad(d)}`;
    const p = perDay[d];
    cal += `<button class="d ${iso === td ? 'today' : ''} ${V.day === iso ? 'sel' : ''}" data-act="day" data-v="${iso}">${d}<span class="dots">${p?.i ? '<i class="i"></i>' : ''}${p?.g ? '<i class="g"></i>' : ''}</span></button>`;
  }
  const pend = m === thisMonth() ? pendingRecurring(m) : [];
  const dayList = V.day ? list.filter(x => x.date === V.day) : list;
  return `
  <header class="top">
    <h1>Mi Dinero</h1>
    <div class="month-nav"><button data-act="month" data-v="-1" aria-label="${tr('Mes anterior')}">‹</button><div class="title">${monthLabel(m)}</div><button data-act="month" data-v="1" aria-label="${tr('Mes siguiente')}">›</button></div>
    ${scopeSeg()}
  </header>
  <div class="wrap">
    <section class="card">
      <div class="summary">
        <div class="box inc"><div class="lab">${tr('Ingresos')}</div><div class="val num inc">${fmt(t.inc)}</div></div>
        <div class="box exp"><div class="lab">${tr('Gastos')}</div><div class="val num exp">${fmt(t.exp)}</div></div>
      </div>
      <div class="balance-row"><span>${tr('Saldo del mes')}</span><span class="val num ${t.bal >= 0 ? 'inc' : 'exp'}">${fmt(t.bal)}</span></div>
      <div class="balance-row sub"><span class="muted">${tr('Acumulado al cierre')}</span><span class="val num">${fmt(acc)}</span></div>
    </section>
    ${licenseBanner()}
    ${pend.length ? `<button class="banner" data-act="tab" data-v="fijos"><span style="font-size:22px">🔁</span><span><b>${pend.length > 1 ? tr('{n} pagos fijos pendientes', { n: pend.length }) : tr('1 pago fijo pendiente')}</b>${esc(pend.slice(0, 3).map(r => r.name).join(', '))}</span><span class="go">${tr('Ver ›')}</span></button>` : ''}
    ${!reminder().on && !S.settings.reminderAsked && pushSupported() && isStandalone() ? `<div class="banner"><span style="font-size:22px">🔔</span><span><b>${tr('¿Te recuerdo registrar el día?')}</b>${tr('Una notificación diaria a las 8:00 p. m.')}</span><span style="display:flex;flex-direction:column;gap:6px;margin-left:auto"><button class="go" data-act="rem-ask">${tr('Activar')}</button><button class="go" style="color:var(--muted);font-weight:600" data-act="rem-skip">${tr('Ahora no')}</button></span></div>` : ''}
    ${backupDue() ? `<button class="banner" data-act="backup"><span style="font-size:22px">☁️</span><span><b>${tr('Guarda tu copia de seguridad')}</b>${S.settings.lastBackup ? tr('Última: {d}', { d: new Date(S.settings.lastBackup).toLocaleDateString(locale()) }) : tr('Aún no has guardado ninguna')}</span><span class="go">${tr('Guardar ›')}</span></button>` : ''}
    <section class="card"><div class="cal">${cal}</div></section>
    <section class="card">
      <h3>${V.day ? esc(dayLabel(V.day)) : tr('Movimientos del mes')} <small>${dayList.length}</small>${V.day ? ` <button class="link" data-act="day" data-v="" style="float:right">${tr('Ver todo el mes')}</button>` : ''}</h3>
      ${groupedList(dayList)}
    </section>
  </div>
  <div class="fab"><button class="b-inc" data-act="new" data-v="ingreso"><span>+</span> ${tr('Ingreso')}</button><button class="b-exp" data-act="new" data-v="gasto"><span>−</span> ${tr('Gasto')}</button></div>`;
}

function catBars(list, kind, clickable = true) {
  const rows = byCategory(list, kind);
  const total = rows.reduce((a, r) => a + r.v, 0);
  if (!rows.length) return `<div class="empty-state">${t(kind === 'gasto' ? 'Sin gastos en este periodo.' : 'Sin ingresos en este periodo.')}</div>`;
  const max = rows[0].v;
  return rows.map(r => {
    const c = cat(r.id);
    return `<button class="bar-row" ${clickable ? `data-act="cat-detail" data-id="${r.id}"` : ''}>${icoHtml(c)}<span class="mid">
      <span class="top-line"><b>${esc(c.name)}</b><span class="num">${fmt(r.v)}</span></span>
      <div class="bar"><i style="width:${Math.max(2, (r.v / max) * 100)}%;background:${c.color}"></i></div>
      <span class="pct">${((r.v / total) * 100).toFixed(1)}%</span></span></button>`;
  }).join('');
}
const kindSeg = () => `<div class="seg light">${[['gasto', 'Gastos'], ['ingreso', 'Ingresos']].map(([k, l]) => `<button data-act="kind" data-v="${k}" class="${V.kind === k ? 'on' : ''}">${t(l)}</button>`).join('')}</div>`;

function viewBalances() {
  const isMes = V.bal === 'mes';
  const nav = isMes
    ? `<div class="month-nav"><button data-act="month" data-v="-1">‹</button><div class="title">${monthLabel(V.month)}</div><button data-act="month" data-v="1">›</button></div>`
    : `<div class="month-nav"><button data-act="year" data-v="-1">‹</button><div class="title">${t('Año {y}', { y: V.year })}</div><button data-act="year" data-v="1">›</button></div>`;
  const head = `<header class="top"><h1>${t('Balances')}</h1>
    <div class="seg">${[['mes', 'Mes'], ['año', 'Año']].map(([k, l]) => `<button data-act="bal" data-v="${k}" class="${V.bal === k ? 'on' : ''}">${t(l)}</button>`).join('')}</div>
    ${nav}${scopeSeg()}</header>`;
  return head + `<div class="wrap">${isMes ? balMes() : balAnio()}</div>`;
}

function summaryCard(t, extraRows = '') {
  return `<section class="card"><div class="summary">
    <div class="box inc"><div class="lab">${tr('Ingresos')}</div><div class="val num inc">${fmt(t.inc)}</div></div>
    <div class="box exp"><div class="lab">${tr('Gastos')}</div><div class="val num exp">${fmt(t.exp)}</div></div></div>
    <div class="balance-row"><span>${tr('Saldo')}</span><span class="val num ${t.bal >= 0 ? 'inc' : 'exp'}">${fmt(t.bal)}</span></div>${extraRows}</section>`;
}

function scopeSplit(pre) {
  if (V.scope !== 'todo') return '';
  const all = txIn(pre, false);
  const p = totals(all.filter(t => t.scope !== 'negocio')), n = totals(all.filter(t => t.scope === 'negocio'));
  return `<section class="card"><h3>${t('Personal y negocio')}</h3><table class="table">
    <tr><th></th><th>${t('Ingresos')}</th><th>${t('Gastos')}</th><th>${t('Saldo')}</th></tr>
    <tr><td>${t('👤 Personal')}</td><td class="num inc">${fmt(p.inc)}</td><td class="num exp">${fmt(p.exp)}</td><td class="num">${fmt(p.bal)}</td></tr>
    <tr><td>${t('💼 Negocio')}</td><td class="num inc">${fmt(n.inc)}</td><td class="num exp">${fmt(n.exp)}</td><td class="num">${fmt(n.bal)}</td></tr></table></section>`;
}

function balMes() {
  const m = V.month;
  const list = txIn(m);
  const t = totals(list);
  const prev = totals(txIn(shiftMonth(m, -1)));
  const diff = t.exp - prev.exp;
  const extra = `<div class="balance-row sub"><span class="muted">${tr('Acumulado al cierre')}</span><span class="val num">${fmt(accumulatedUntil(`${m}-31`))}</span></div>
    ${prev.exp ? `<div class="balance-row sub"><span class="muted">${tr('Gastos vs. mes anterior')}</span><span class="val num ${diff > 0 ? 'exp' : 'inc'}">${diff > 0 ? '▲' : '▼'} ${fmt(Math.abs(diff))}</span></div>` : ''}`;
  const accs = S.accounts.map(a => `<div class="row"><span class="ico" style="background:var(--card-2)">${esc(a.icon)}</span><span class="mid">${esc(a.name)}</span><span class="end num">${fmt(accountBalance(a))}</span></div>`).join('');
  return summaryCard(t, extra) +
    `<section class="card"><h3>${tr('Por categoría')}</h3>${kindSeg()}<div style="margin-top:8px">${catBars(list, V.kind)}</div></section>` +
    scopeSplit(m) +
    `<section class="card"><h3>${tr('Saldo por cuenta')} <small>${tr('(todo lo registrado)')}</small></h3><div class="list" style="box-shadow:none;margin:0 -14px -14px">${accs}</div></section>`;
}

function balAnio() {
  const y = String(V.year);
  const list = txIn(y);
  const t = totals(list);
  let run = accumulatedUntil(`${V.year - 1}-12-31`);
  const months = [];
  for (let k = 1; k <= 12; k++) {
    const m = `${y}-${pad(k)}`;
    const mt = totals(txIn(m));
    run = round2(run + mt.bal);
    months.push({ m, k, ...mt, acc: run });
  }
  const used = months.filter(x => x.inc || x.exp);
  const avgExp = used.length ? Math.round(t.exp / used.length) : 0;
  const max = Math.max(1, ...months.map(x => Math.max(x.inc, x.exp)));
  const W = 340, H = 150, bw = 10;
  const bars = months.map((x, i) => {
    const cx = 14 + i * ((W - 20) / 12);
    const hi = (x.inc / max) * (H - 26), he = (x.exp / max) * (H - 26);
    return `<rect x="${cx}" y="${H - 18 - hi}" width="${bw}" height="${hi}" rx="2" fill="var(--inc)"/><rect x="${cx + bw + 1}" y="${H - 18 - he}" width="${bw}" height="${he}" rx="2" fill="var(--exp)"/><text x="${cx + bw}" y="${H - 4}" font-size="10" text-anchor="middle" fill="var(--muted)">${monthShort(i).slice(0, 1).toUpperCase()}</text>`;
  }).join('');
  const rows = months.map(x => `<tr class="click" data-act="goto-month" data-v="${x.m}"><td>${monthShort(x.k - 1)}</td><td class="num inc">${x.inc ? fmt(x.inc) : '–'}</td><td class="num exp">${x.exp ? fmt(x.exp) : '–'}</td><td class="num ${x.bal >= 0 ? '' : 'exp'}">${x.inc || x.exp ? fmt(x.bal) : '–'}</td></tr>`).join('');
  const extra = `<div class="balance-row sub"><span class="muted">${tr('Promedio de gasto mensual')}</span><span class="val num">${fmt(avgExp)}</span></div>
    <div class="balance-row sub"><span class="muted">${tr('Acumulado total al cierre')}</span><span class="val num">${fmt(run)}</span></div>`;
  return summaryCard(t, extra) +
    `<section class="card chart"><h3>${tr('Mes a mes')}</h3><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${tr('Ingresos y gastos por mes')}">${bars}</svg><div class="legend"><span><i style="background:var(--inc)"></i>${tr('Ingresos')}</span><span><i style="background:var(--exp)"></i>${tr('Gastos')}</span></div></section>` +
    `<section class="card"><h3>${tr('Detalle por mes')} <small>${tr('toca un mes para abrirlo')}</small></h3><table class="table"><tr><th>${tr('Mes')}</th><th>${tr('Ingresos')}</th><th>${tr('Gastos')}</th><th>${tr('Saldo')}</th></tr>${rows}
      <tr class="total"><td>${tr('Total')}</td><td class="num inc">${fmt(t.inc)}</td><td class="num exp">${fmt(t.exp)}</td><td class="num">${fmt(t.bal)}</td></tr></table></section>` +
    `<section class="card"><h3>${tr('Por categoría en {y}', { y })}</h3>${kindSeg()}<div style="margin-top:8px">${catBars(list, V.kind, false)}</div></section>` +
    scopeSplit(y);
}

function viewFijos() {
  const m = thisMonth();
  const pend = pendingRecurring(m);
  const row = (r, pending) => {
    const c = cat(r.catId);
    return `<div class="row">${icoHtml(c)}<button class="mid" data-act="edit-rec" data-id="${r.id}" style="text-align:left">${esc(r.name)}${r.active === false ? ` <span class="tag acc">${t('Pausado')}</span>` : ''}${r.scope === 'negocio' ? `<span class="tag biz">${t('Negocio')}</span>` : ''}<small>${t('Día {d}', { d: r.day })} · ${esc(c.name)} · <span class="${r.type === 'ingreso' ? 'inc' : 'exp'}">${fmt(r.amount)}</span></small></button>
      ${pending ? `<button class="chip on" data-act="pay-rec" data-id="${r.id}">${t('Registrar')}</button>` : '<span class="chev">›</span>'}</div>`;
  };
  return `<div class="page-top"><h2>${t('Pagos fijos')}</h2><p>${t('Arriendo, celular, internet… Los anotas una vez y cada mes te recuerdo registrarlos con un toque.')}</p></div>
  <div class="page">
    ${pend.length ? `<div class="list-title">${t('Pendientes de {m}', { m: monthName(+m.slice(5) - 1).toLowerCase() })}</div><div class="list">${pend.sort((a, b) => a.day - b.day).map(r => row(r, true)).join('')}</div>` : S.recurring.length ? `<div class="banner" style="background:var(--inc-soft)"><span style="font-size:22px">✅</span><span><b>${t('Todo al día')}</b>${t('Ya registraste los pagos fijos de este mes.')}</span></div>` : ''}
    <div class="list-title">${t('Todos los pagos fijos')}</div>
    <div class="list">${S.recurring.length ? [...S.recurring].sort((a, b) => a.day - b.day).map(r => row(r, false)).join('') : `<div class="empty-state">${t('Aún no tienes pagos fijos.')}</div>`}</div>
    <button class="btn" data-act="new-rec">${t('+ Nuevo pago fijo')}</button>
  </div>`;
}

// ---------- recordatorio diario (notificaciones) ----------
const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
const timeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;
const hourLabel = h => new Date(2000, 0, 1, h).toLocaleTimeString(locale(), { hour: 'numeric', minute: '2-digit' });
const b64ToBytes = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4)), c => c.charCodeAt(0));
const reminder = () => S.settings.reminder || { on: false, hour: 20 };

async function pushApi(path, body) {
  const r = await fetch(PUSH_API + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok) { const e = new Error((await r.json().catch(() => ({}))).error || 'sin conexión'); e.status = r.status; throw e; }
  return r.json();
}
async function pushSubscription(create) {
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub && create) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(VAPID_PUBLIC) });
  return sub;
}
async function saveReminder(on, hour, endpoint) {
  S.settings.reminder = { on, hour, endpoint: endpoint || null, tz: on ? timeZone() : null };
  await persist.settings();
  render();
}
async function enableReminder(hour = reminder().hour) {
  if (!pushSupported()) return toast(t('Este navegador no permite notificaciones'));
  if (platform() === 'ios' && !isStandalone()) return toast(t('Primero instala la app en tu pantalla de inicio'));
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') return toast(t('Permite las notificaciones de Mi Dinero en los ajustes del teléfono'));
  try {
    const sub = await pushSubscription(true);
    await pushApi('/subscribe', { endpoint: sub.endpoint, tz: timeZone(), hour });
    await saveReminder(true, hour, sub.endpoint);
    toast(t('Listo: te recordaré todos los días a las {h}', { h: hourLabel(hour) }));
  } catch { toast(t('No se pudo activar. Revisa tu conexión')); }
}
async function disableReminder() {
  try { const sub = await pushSubscription(false); if (sub) { await pushApi('/unsubscribe', { endpoint: sub.endpoint }).catch(() => {}); await sub.unsubscribe(); } } catch { /* sin conexión */ }
  await saveReminder(false, reminder().hour);
  toast(t('Recordatorio desactivado'));
}
async function testReminder() {
  try { const sub = await pushSubscription(false); if (!sub) return enableReminder(); await pushApi('/test', { endpoint: sub.endpoint }); toast(t('Enviada: llega en unos segundos')); }
  catch (e) { toast(t(e.status === 429 ? 'Espera un minuto para otra prueba' : 'No se pudo enviar. Revisa tu conexión')); }
}
// Si viajas o el teléfono renueva su dirección de avisos, se actualiza sola al abrir la app
async function syncReminder() {
  const r = reminder();
  if (!r.on || !pushSupported() || Notification.permission !== 'granted') return;
  try {
    const sub = await pushSubscription(true);
    if (sub.endpoint !== r.endpoint || timeZone() !== r.tz) { await pushApi('/subscribe', { endpoint: sub.endpoint, tz: timeZone(), hour: r.hour }); S.settings.reminder = { ...r, endpoint: sub.endpoint, tz: timeZone() }; await persist.settings(); }
  } catch { /* se intenta de nuevo la próxima vez */ }
}
function reminderSection() {
  const r = reminder();
  if (!pushSupported() && !(platform() === 'ios' && !isStandalone())) return '';
  const opts = Array.from({ length: 24 }, (_, h) => `<option value="${h}" ${h === r.hour ? 'selected' : ''}>${hourLabel(h)}</option>`).join('');
  return `<div class="list-title">${t('Recordatorio diario')}</div>
    <div class="list">
      <button class="row" data-act="${r.on ? 'rem-off' : 'rem-on'}"><span class="ico" style="background:#c9a22722">🔔</span><span class="mid">${t('Recordarme registrar el día')}<small>${r.on ? t('Activado · todos los días a las {h}', { h: hourLabel(r.hour) }) : t('Una notificación diaria a la hora que elijas')}</small></span><span class="switch ${r.on ? 'on' : ''}"><i></i></span></button>
      ${r.on ? `<div class="row"><span class="ico" style="background:var(--card-2)">⏰</span><span class="mid">${t('Hora')}</span><select name="rem-hour" class="hour-select">${opts}</select></div>
      <button class="row" data-act="rem-test"><span class="ico" style="background:var(--card-2)">📨</span><span class="mid">${t('Enviar notificación de prueba')}</span><span class="chev">›</span></button>` : ''}
    </div>
    <p class="hint" style="margin:0 4px">${t('Llega a la hora del país donde estés, aunque la app esté cerrada.')} ${platform() === 'ios' ? t('En iPhone funciona con la app instalada en la pantalla de inicio.') : ''}</p>`;
}

// ---------- licencia ----------
function newDeviceId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return [...crypto.getRandomValues(new Uint8Array(16))].map(b => b.toString(16).padStart(2, '0')).join('');
}
function licState() {
  const L = S.license;
  if (L.founder) return { st: 'fundador' };
  if (L.code) return { st: 'activa' };
  const left = TRIAL_DAYS - Math.floor((Date.now() - L.trialStart) / 864e5);
  return left > 0 ? { st: 'prueba', left } : { st: 'vencida' };
}
const canRegister = () => licState().st !== 'vencida';
const deviceLabel = () => { const ua = navigator.userAgent; return /ipad/i.test(ua) || (platform() === 'ios' && !/iphone/i.test(ua)) ? 'iPad' : platform() === 'ios' ? 'iPhone' : platform() === 'android' ? 'Android' : /mac/i.test(ua) ? 'Mac' : /windows/i.test(ua) ? 'Windows' : 'Computador'; };
const buyLink = () => SUPPORT_WA ? `https://wa.me/${SUPPORT_WA}?text=${encodeURIComponent(t('Hola, quiero comprar mi licencia de MI DINERO'))}` : '';
const PLAN_NAMES = { personal: 'Personal', barberia: 'Barbería' };
const planName = L => t(PLAN_NAMES[L.plan] || 'Licencia');
const LIC_ERRORS = { 400: 'Revisa el código: son 8 letras y números', 404: 'Ese código no existe. Revisa que esté bien escrito', 403: 'Este código fue desactivado. Escríbele a quien te lo vendió', 409: 'Este código ya está activado en el máximo de dispositivos de su plan. Escríbele a quien te lo vendió para liberar uno' };
async function saveLicense(changes) { Object.assign(S.license, changes); await db.put('kv', S.license, 'license'); render(); }
async function activateLicense(code) {
  const r = await pushApi('/license/activate', { code, device: S.license.deviceId, label: deviceLabel() });
  await saveLicense({ code: r.code, plan: r.plan, planName: r.planName, activatedAt: Date.now(), checkedAt: Date.now() });
}
// Cada pocos días, con internet, confirma que el código siga vigente (por si se desactivó o se liberó este dispositivo)
async function checkLicense() {
  const L = S.license;
  if (!L.code || (L.checkedAt && Date.now() - L.checkedAt < 3 * 864e5)) return;
  try {
    const r = await pushApi('/license/check', { code: L.code, device: L.deviceId });
    if (r.ok) await saveLicense({ checkedAt: Date.now() });
    else { await saveLicense({ code: null, plan: null, planName: null, removedAt: Date.now() }); toast(t('Tu licencia ya no está activa en este dispositivo')); }
  } catch { /* sin internet: se revisa la próxima vez */ }
}
function licenseBanner() {
  const l = licState();
  if (l.st === 'prueba') return `<button class="banner" data-act="license"><span style="font-size:22px">🎁</span><span><b>${l.left === 1 ? t('Prueba gratis: último día') : t('Prueba gratis: te quedan {n} días', { n: l.left })}</b>${t('Activa tu licencia cuando quieras')}</span><span class="go">${t('Activar ›')}</span></button>`;
  if (l.st === 'vencida') return `<button class="banner warn" data-act="license"><span style="font-size:22px">🔑</span><span><b>${t('Tu prueba gratis terminó')}</b>${t('Tus datos siguen aquí: puedes verlos y exportarlos. Activa tu licencia para registrar movimientos nuevos.')}</span><span class="go">${t('Activar ›')}</span></button>`;
  return '';
}
function licenseRow() {
  const l = licState(), L = S.license;
  const sub = { fundador: t('Usuario fundador · gratis para siempre'), activa: t('{p} · activada en este dispositivo', { p: planName(L) }), prueba: l.left === 1 ? t('Prueba gratis · último día') : t('Prueba gratis · quedan {n} días', { n: l.left }), vencida: t('Prueba terminada · toca para activar') }[l.st];
  return `<div class="list-title">${t('Licencia')}</div>
    <div class="list"><button class="row" data-act="license"><span class="ico" style="background:#c9a22722">${l.st === 'fundador' || l.st === 'activa' ? '✅' : '🔑'}</span><span class="mid">${t(l.st === 'fundador' || l.st === 'activa' ? 'MI DINERO activada' : 'Activar licencia')}<small>${sub}</small></span><span class="chev">›</span></button></div>`;
}
function openLicense() {
  const st = { code: '', busy: false };
  const l = licState(), L = S.license;
  const done = l.st === 'fundador' || l.st === 'activa';
  openSheet({
    render: () => `<div class="sheet-head"><button></button><h3>${t('Licencia')}</h3><button data-act="close">${t('Cerrar')}</button></div>
      <div class="sheet-body">
        ${done ? `<div class="card" style="text-align:center"><div style="font-size:44px">✅</div>
          <div style="font-size:20px;font-weight:800;margin-top:4px">${t('MI DINERO activada')}</div>
          <div class="muted" style="font-size:14px;margin-top:4px">${l.st === 'fundador' ? t('Eres usuario fundador: la app es gratis para siempre en este dispositivo. ¡Gracias por estar desde el principio!') : `${t('{p} · código {c}', { p: planName(L), c: esc(L.code) })}<br>${t('Activada el {d}', { d: new Date(L.activatedAt).toLocaleDateString(locale(), { dateStyle: 'long' }) })}`}</div></div>`
        : `<div class="card" style="text-align:center"><div style="font-size:44px">🔑</div>
          <div style="font-size:18px;font-weight:800;margin-top:4px">${l.st === 'prueba' ? (l.left === 1 ? t('Prueba gratis: último día') : t('Prueba gratis: quedan {n} días', { n: l.left })) : t('Tu prueba gratis terminó')}</div>
          <div class="muted" style="font-size:14px;margin-top:4px">${t('Escribe el código que recibiste al comprar. Se activa una sola vez y después funciona sin internet.')}</div></div>
        <div class="field"><label>${t('Código')}</label><input type="text" name="code" value="${esc(st.code)}" placeholder="MD-XXXX-XXXX" autocapitalize="characters" autocomplete="off" autocorrect="off" spellcheck="false" maxlength="14" style="font-family:ui-monospace,Menlo,monospace;letter-spacing:.05em;text-transform:uppercase"></div>
        <button class="btn" data-act="activate" ${st.busy ? 'disabled' : ''}>${t(st.busy ? 'Activando…' : 'Activar')}</button>
        ${buyLink() ? `<a class="btn sec" href="${buyLink()}" target="_blank" rel="noopener">${t('¿No tienes código? Cómpralo por WhatsApp')}</a>` : ''}
        <div class="card"><h3>${t('Planes de pago único')}</h3><p class="hint" style="margin:0">${t('<b>Personal:</b> 1 persona en 2 dispositivos (por ejemplo celular y computador).<br><b>Barbería:</b> hasta 5 personas, 2 dispositivos cada una. Cada barbero lleva sus propios datos en su celular.')}</p></div>
        <p class="hint" style="text-align:center;margin:0">${t('🔒 Aunque no actives, tus datos nunca se bloquean: siempre puedes verlos, exportarlos a Excel y guardar tu copia de seguridad.')}</p>`}
      </div>`,
    onInput: e => { if (e.target.name === 'code') st.code = e.target.value; },
    onMount: s => s.el.querySelector('input[name=code]')?.addEventListener('keydown', e => { if (e.key === 'Enter') s.el.querySelector('[data-act=activate]').click(); }),
    actions: {
      close: (b, s) => s.close(),
      activate: async (b, s) => {
        if (st.busy) return;
        if (st.code.replace(/[^a-z0-9]/gi, '').replace(/^md/i, '').length !== 8) { toast(t('El código tiene 8 letras y números, como MD-7K4P-Q2XW')); return; }
        st.busy = true; s.refresh();
        try { await activateLicense(st.code); s.close(); toast(t('¡Listo! MI DINERO quedó activada')); }
        catch (e) { st.busy = false; s.refresh(); toast(t(e.status ? LIC_ERRORS[e.status] || 'No se pudo activar' : 'Necesitas internet para activar')); }
      },
    },
  });
}

// ---------- instalación (iPhone, Android, computador) ----------
let installPrompt = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installPrompt = e; if (V.tab === 'ajustes') render(); });
window.addEventListener('appinstalled', () => { installPrompt = null; toast(t('Mi Dinero quedó instalada')); render(); });
const cloud = () => (platform() === 'android' ? 'Google Drive' : 'iCloud Drive');
const platform = () => { const ua = navigator.userAgent; if (/android/i.test(ua)) return 'android'; if (/iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1)) return 'ios'; return 'pc'; };
function installBanner() {
  const p = platform();
  if (installPrompt) return `<button class="banner" data-act="install"><span style="font-size:22px">📲</span><span><b>${t('Instalar Mi Dinero')}</b>${t(p === 'pc' ? 'Queda como una app más en tu computador, con su ícono.' : 'Queda como una app más en tu celular, con su ícono.')}</span><span class="go">${t('Instalar ›')}</span></button>`;
  const how = {
    ios: 'En Safari toca Compartir <b style="display:inline">⎋</b> y luego “Agregar a pantalla de inicio”.',
    android: 'En Chrome toca el menú <b style="display:inline">⋮</b> y luego “Instalar aplicación” o “Agregar a la pantalla principal”.',
    pc: 'En Chrome o Edge toca el ícono de instalar en la barra de direcciones. En Safari (Mac): Archivo → “Agregar al Dock”.',
  }[p];
  return `<div class="banner"><span style="font-size:22px">📲</span><span><b>${t('Instala la app')}</b>${t(how)}</span></div>`;
}

function viewAjustes() {
  const cur = CURRENCIES.find(c => c[0] === S.settings.currency);
  const lg = LANGS.find(x => x[0] === lang());
  const catRows = type => S.categories.filter(c => c.type === type).map((c, i) => `<button class="row" data-act="edit-cat" data-id="${c.id}"><span class="slot">${i + 1}</span>${icoHtml(c)}<span class="mid">${esc(c.name)}</span><span class="chev">›</span></button>`).join('');
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  return `<div class="page-top"><h2>${t('Ajustes')}</h2></div>
  <div class="page">
    ${standalone ? '' : installBanner()}
    ${licenseRow()}
    ${reminderSection()}
    <div class="list-title">${t('Exportar y respaldo')}</div>
    <div class="list">
      <button class="row" data-act="export"><span class="ico" style="background:#1f7a4522">📊</span><span class="mid">${t('Exportar a Excel / CSV')}<small>${t('Para tu contabilidad, por mes, año o rango')}</small></span><span class="chev">›</span></button>
      <button class="row" data-act="backup"><span class="ico" style="background:#2f80ed22">☁️</span><span class="mid">${t('Copia de seguridad')}<small>${S.settings.lastBackup ? t('Última: {d}', { d: new Date(S.settings.lastBackup).toLocaleString(locale(), { dateStyle: 'medium', timeStyle: 'short' }) }) : t('Nunca')} · ${t('guárdala en {c}', { c: cloud() })}</small></span><span class="chev">›</span></button>
      <button class="row" data-act="import"><span class="ico" style="background:#8e5cd922">📥</span><span class="mid">${t('Restaurar o importar')}<small>${t('Copia de seguridad o historial')}</small></span><span class="chev">›</span></button>
    </div>
    <div class="list-title">${t('Categorías de ingreso (6)')}</div><div class="list">${catRows('ingreso')}</div>
    <div class="list-title">${t('Categorías de gasto (15)')}</div><div class="list">${catRows('gasto')}</div>
    <div class="list-title">${t('Cuentas')}</div>
    <div class="list">${S.accounts.map(a => `<button class="row" data-act="edit-acc" data-id="${a.id}"><span class="ico" style="background:var(--card-2)">${esc(a.icon)}</span><span class="mid">${esc(a.name)}</span><span class="end num">${fmt(accountBalance(a))}</span><span class="chev">›</span></button>`).join('')}
      <button class="row" data-act="new-acc"><span class="ico" style="background:var(--card-2)">＋</span><span class="mid link">${t('Agregar cuenta')}</span></button></div>
    <p class="hint" style="margin:0 4px">${t('Las cuentas son solo etiquetas (Efectivo, Banco, Nequi…). La app nunca se conecta a tus bancos.')}</p>
    <div class="list-title">${t('General')}</div>
    <div class="list">
      <button class="row" data-act="language"><span class="ico" style="background:var(--card-2)">🌐</span><span class="mid">${t('Idioma')}</span><span class="end">${esc(lg[1])}</span><span class="chev">›</span></button>
      <button class="row" data-act="currency"><span class="ico" style="background:var(--card-2)">${cur ? cur[2] : '💱'}</span><span class="mid">${t('Moneda')}</span><span class="end">${esc(S.settings.currency)}</span><span class="chev">›</span></button>
      <button class="row danger" data-act="wipe"><span class="ico" style="background:var(--exp-soft)">🗑️</span><span class="mid">${t('Borrar todos los datos')}</span></button>
    </div>
    <p class="hint" style="text-align:center">${t('Mi Dinero {v} · {n} movimientos guardados solo en este dispositivo.', { v: APP_VERSION, n: S.txs.length.toLocaleString(locale()) })}</p>
  </div>`;
}

const TAB_NAMES = { inicio: 'Inicio', balances: 'Balances', fijos: 'Pagos fijos', ajustes: 'Ajustes' };
const VIEWS = { inicio: viewInicio, balances: viewBalances, fijos: viewFijos, ajustes: viewAjustes };
function render() {
  document.getElementById('view').innerHTML = VIEWS[V.tab]();
  document.querySelectorAll('#tabs button').forEach(b => { b.classList.toggle('on', b.dataset.tab === V.tab); b.querySelector('span').textContent = t(TAB_NAMES[b.dataset.tab]); });
}

// ---------- hojas, diálogos y avisos ----------
function openSheet({ render: r, actions = {}, full = false, onInput, onMount }) {
  const wrap = document.createElement('div');
  wrap.className = 'sheet-wrap';
  wrap.innerHTML = `<div class="sheet-backdrop"></div><div class="sheet ${full ? 'full' : ''}"></div>`;
  document.body.appendChild(wrap);
  const el = wrap.querySelector('.sheet');
  const api = {
    el,
    refresh() { const st = el.querySelector('.entry-scroll')?.scrollTop; el.innerHTML = r(); onMount?.(api); if (st) el.querySelector('.entry-scroll').scrollTop = st; },
    close() { wrap.classList.remove('open'); setTimeout(() => wrap.remove(), 260); },
  };
  wrap.querySelector('.sheet-backdrop').onclick = () => api.close();
  el.addEventListener('click', e => { const b = e.target.closest('[data-act]'); if (b && el.contains(b)) { const f = actions[b.dataset.act]; if (f) { e.preventDefault(); f(b, api); } } });
  if (onInput) { el.addEventListener('input', e => onInput(e, api)); el.addEventListener('change', e => onInput(e, api)); }
  api.refresh();
  requestAnimationFrame(() => requestAnimationFrame(() => wrap.classList.add('open')));
  return api;
}

function ask(title, msg, buttons) {
  return new Promise(resolve => {
    const d = document.createElement('div');
    d.className = 'dialog';
    d.innerHTML = `<div class="box"><h4>${esc(title)}</h4>${msg ? `<p>${msg}</p>` : ''}<div class="btns">${buttons.map((b, i) => `<button class="btn ${b.style || ''}" data-i="${i}">${esc(b.label)}</button>`).join('')}</div></div>`;
    d.onclick = e => { const b = e.target.closest('[data-i]'); if (b) { d.remove(); resolve(buttons[+b.dataset.i].value); } else if (e.target === d) { d.remove(); resolve(null); } };
    document.body.appendChild(d);
  });
}
const confirmDelete = (what) => ask(t('¿Eliminar {x}?', { x: t(what) }), t('Esta acción no se puede deshacer.'), [{ label: t('Eliminar'), style: 'danger', value: true }, { label: t('Cancelar'), style: 'sec', value: false }]);

let toastTimer;
function toast(msg) {
  document.querySelector('.toast')?.remove();
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.remove(), 2600);
}

function pickFile(input) {
  return new Promise(resolve => {
    input.value = '';
    input.onchange = () => resolve(input.files[0] || null);
    input.click();
  });
}

async function shareFile(blob, name) {
  const file = new File([blob], name, { type: blob.type });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: name }); return true; }
    catch (e) { if (e.name === 'AbortError') return false; }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
  return true;
}

async function compressPhoto(file) {
  const img = await createImageBitmap(file).catch(() => null);
  if (!img) return file;
  const k = Math.min(1, 1400 / Math.max(img.width, img.height));
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return new Promise(r => c.toBlob(b => r(b || file), 'image/jpeg', 0.72));
}

// ---------- calculadora ----------
function evalExpr(expr) {
  const toks = expr.replace(/[+−×÷]$/, '').match(/\d+(?:,\d*)?|,\d+|[+−×÷]/g);
  if (!toks) return 0;
  const nums = [], ops = [];
  const n = s => parseFloat(s.replace(',', '.')) || 0;
  let cur = n(toks[0]);
  for (let i = 1; i < toks.length; i += 2) {
    const op = toks[i], v = n(toks[i + 1] ?? '0');
    if (op === '×') cur *= v; else if (op === '÷') cur = v ? cur / v : 0; else { nums.push(cur); ops.push(op); cur = v; }
  }
  nums.push(cur);
  let r = nums[0];
  ops.forEach((op, i) => { r = op === '+' ? r + nums[i + 1] : r - nums[i + 1]; });
  return round2(r);
}
// La expresión se guarda con coma decimal; se muestra con el formato del idioma
const prettyExpr = e => e.replace(/(\d+)(?:,(\d*))?/g, (m, i, d) => (+i).toLocaleString(locale()) + (d !== undefined ? decSep() + d : ''));
function amountToExpr(a) { const [i, d] = String(round2(a)).split('.'); return d ? `${i},${d}` : i; }
const amountToField = a => (lang() === 'en' ? String(round2(a)) : amountToExpr(a));

// ---------- registrar / editar movimiento ----------
function openEntry({ type = 'gasto', tx = null, prefill = null } = {}) {
  const base = tx || prefill;
  const E = {
    type: base?.type || type,
    catId: base?.catId || null,
    expr: base?.amount ? amountToExpr(base.amount) : '',
    date: base?.date || V.day || today(),
    note: base?.note || '',
    scope: base?.scope || S.settings.lastScope || 'personal',
    accountId: base ? (base.accountId ?? null) : (S.settings.lastAccount && ACC[S.settings.lastAccount] ? S.settings.lastAccount : null),
    photoId: tx?.photoId || null,
    photoUrl: null,
    newPhoto: null,
    removePhoto: false,
    recurringId: base?.recurringId || null,
    step: base?.catId ? 'detail' : 'cat',
  };
  if (E.photoId) db.get('photos', E.photoId).then(b => { if (b) { E.photoUrl = URL.createObjectURL(b); sheet.refresh(); } });

  const catsOf = t => S.categories.filter(c => c.type === t);
  const renderCats = () => `
    <div class="sheet-head"><button data-act="close">${t('Cancelar')}</button><h3>${t(tx ? 'Cambiar categoría' : E.type === 'gasto' ? 'Nuevo gasto' : 'Nuevo ingreso')}</h3><button data-act="${E.catId ? 'to-detail' : 'close'}" style="visibility:${E.catId ? 'visible' : 'hidden'}">${t('Listo')}</button></div>
    <div class="sheet-body">
      <div class="type-seg"><button class="g ${E.type === 'gasto' ? 'on' : ''}" data-act="type" data-v="gasto">${t('− Gasto')}</button><button class="i ${E.type === 'ingreso' ? 'on' : ''}" data-act="type" data-v="ingreso">${t('+ Ingreso')}</button></div>
      <div class="cat-grid">${catsOf(E.type).map(c => `<button class="cat-btn ${E.catId === c.id ? 'on' : ''}" data-act="pick-cat" data-id="${c.id}">${icoHtml(c)}<span>${esc(c.name)}</span></button>`).join('')}</div>
    </div>`;
  const renderDetail = () => {
    const c = cat(E.catId);
    const hasOp = /[+−×÷]/.test(E.expr);
    const val = evalExpr(E.expr);
    const keys = [['7', '8', '9', '÷'], ['4', '5', '6', '×'], ['1', '2', '3', '−'], [',', '0', '000', '+']];
    return `
    <div class="sheet-head"><button data-act="close">${t('Cancelar')}</button><h3>${t(tx ? 'Editar' : E.type === 'gasto' ? 'Nuevo gasto' : 'Nuevo ingreso')}</h3>${tx ? `<button data-act="delete" style="color:var(--exp)">${t('Eliminar')}</button>` : '<button></button>'}</div>
    <div class="entry">
      <div class="entry-scroll">
        <button class="chosen" data-act="to-cats">${icoHtml(c)}<span class="mid">${esc(c.name)}<small>${t(E.type === 'gasto' ? 'Gasto' : 'Ingreso')} · ${t('toca para cambiar')}</small></span><span class="chev">›</span></button>
        <div class="amount ${E.type === 'gasto' ? 'g' : 'i'}"><div class="expr num">${hasOp ? esc(prettyExpr(E.expr)) + ' =' : '&nbsp;'}</div><div class="big num">${fmt(val)}</div></div>
        <div class="pick-label">${t('¿Es personal o del negocio?')}</div>
        <div class="scope2"><button class="p ${E.scope === 'personal' ? 'on' : ''}" data-act="scope-e" data-v="personal">${t('👤 Personal')}</button><button class="n ${E.scope === 'negocio' ? 'on' : ''}" data-act="scope-e" data-v="negocio">${t('💼 Negocio')}</button></div>
        <div class="pick-label">${t(E.type === 'gasto' ? '¿Con qué pagaste?' : '¿Dónde lo recibiste?')}</div>
        ${accPicker(E.accountId, 'acc-e')}
        <div class="field"><label>${t('Fecha')}</label><input type="date" name="date" value="${E.date}" required></div>
        <div class="field"><label>${t('Nota')}</label><input type="text" name="note" value="${esc(E.note)}" placeholder="${t('Ej: mercado en el D1')}" enterkeyhint="done" autocomplete="off"></div>
        <div class="photo-row">${E.photoUrl && !E.removePhoto ? `<img class="thumb" src="${E.photoUrl}" data-act="view-photo" alt="${t('Recibo')}"><button class="chip" data-act="photo">${t('Cambiar foto')}</button><button class="chip" data-act="rm-photo">${t('Quitar')}</button>` : `<button class="chip" data-act="photo">${t('📷 Foto del recibo')}</button>`}</div>
      </div>
      <div class="keypad">
        ${keys.map(r => r.map(k => `<button class="${/[+−×÷]/.test(k) ? 'op' : ''}" data-act="key" data-v="${k}">${k === ',' ? decSep() : k}</button>`).join('')).join('')}
        <button class="op" data-act="key" data-v="C">C</button><button class="op" data-act="key" data-v="⌫">⌫</button>
        <button class="save" data-act="save">${hasOp ? '=' : t('Guardar')}</button>
      </div>
    </div>`;
  };

  const actions = {
    close: (b, s) => s.close(),
    type: (b, s) => { if (E.type !== b.dataset.v) { E.type = b.dataset.v; E.catId = null; } s.refresh(); },
    'pick-cat': (b, s) => { E.catId = b.dataset.id; E.step = 'detail'; s.refresh(); },
    'to-cats': (b, s) => { E.step = 'cat'; s.refresh(); },
    'to-detail': (b, s) => { E.step = 'detail'; s.refresh(); },
    'scope-e': (b, s) => { E.scope = b.dataset.v; s.refresh(); },
    'acc-e': (b, s) => { E.accountId = b.dataset.v || null; s.refresh(); },
    key: (b, s) => {
      const k = b.dataset.v;
      if (k === 'C') E.expr = '';
      else if (k === '⌫') E.expr = E.expr.slice(0, -1);
      else if (/[+−×÷]/.test(k)) { if (!E.expr) return; E.expr = E.expr.replace(/[+−×÷]$/, '') + k; }
      else if (k === ',') { const last = E.expr.split(/[+−×÷]/).pop(); if (last.includes(',')) return; E.expr += last ? ',' : '0,'; }
      else { const last = E.expr.split(/[+−×÷]/).pop(); if (last.replace(',', '').length >= 12) return; if (last === '0' && k !== ',') E.expr = E.expr.slice(0, -1); if (!last && k === '000') return; E.expr += k; }
      s.refresh();
    },
    photo: async (b, s) => {
      const f = await pickFile(document.getElementById('file-photo'));
      if (!f) return;
      E.newPhoto = await compressPhoto(f);
      E.removePhoto = false;
      E.photoUrl = URL.createObjectURL(E.newPhoto);
      s.refresh();
    },
    'rm-photo': (b, s) => { E.removePhoto = true; E.newPhoto = null; s.refresh(); },
    'view-photo': () => openPhoto(E.photoUrl),
    delete: async (b, s) => {
      if (!(await confirmDelete('este movimiento'))) return;
      await deleteTx(tx);
      s.close(); render(); toast(t('Movimiento eliminado'));
    },
    save: async (b, s) => {
      if (/[+−×÷]/.test(E.expr)) { E.expr = amountToExpr(evalExpr(E.expr)); s.refresh(); return; }
      const amount = evalExpr(E.expr);
      if (!(amount > 0)) { toast(t('Escribe un monto mayor a cero')); return; }
      if (!E.catId) { E.step = 'cat'; s.refresh(); return; }
      if (!/^\d{4}-\d\d-\d\d$/.test(E.date)) { toast(t('Elige una fecha')); return; }
      let photoId = E.photoId;
      if ((E.removePhoto || E.newPhoto) && photoId) { await db.del('photos', photoId); photoId = null; }
      if (E.newPhoto) { photoId = uid(); await db.put('photos', E.newPhoto, photoId); }
      const t = { id: tx?.id || uid(), type: E.type, catId: E.catId, amount, date: E.date, note: E.note.trim(), scope: E.scope, accountId: E.accountId, photoId, recurringId: E.recurringId, createdAt: tx?.createdAt || Date.now(), updatedAt: Date.now() };
      await saveTx(t);
      S.settings.lastScope = E.scope;
      S.settings.lastAccount = E.accountId;
      await persist.settings();
      s.close();
      if (!tx) { V.month = t.date.slice(0, 7); }
      render();
      toast(tr(tx ? 'Cambios guardados' : E.type === 'gasto' ? 'Gasto de {a} guardado' : 'Ingreso de {a} guardado', { a: fmt(amount) }));
    },
  };
  const sheet = openSheet({
    full: true,
    render: () => (E.step === 'cat' ? renderCats() : renderDetail()),
    actions,
    onInput: e => { if (e.target.name === 'date') E.date = e.target.value; if (e.target.name === 'note') E.note = e.target.value; },
  });
  sheet.el.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.name === 'note') e.target.blur(); });
}

function openPhoto(url) {
  openSheet({ render: () => `<div class="sheet-head"><button></button><h3>${t('Recibo')}</h3><button data-act="close">${t('Cerrar')}</button></div><div class="sheet-body"><img class="big-photo" src="${url}" alt="${t('Recibo')}"></div>`, actions: { close: (b, s) => s.close() } });
}

function openCatDetail(catId) {
  const m = V.month;
  const c = cat(catId);
  const list = txIn(m).filter(t => t.catId === catId).sort(byDateDesc);
  openSheet({
    render: () => `<div class="sheet-head"><button></button><h3>${esc(c.icon)} ${esc(c.name)}</h3><button data-act="close">${t('Cerrar')}</button></div>
      <div class="sheet-body"><div class="card"><div class="balance-row" style="padding-top:0"><span>${monthLabel(m)}</span><span class="val num">${fmt(list.reduce((a, t) => a + t.amount, 0))}</span></div></div>
      <div class="card">${groupedList(list)}</div></div>`,
    actions: { close: (b, s) => s.close(), 'edit-tx': (b, s) => { s.close(); openEntry({ tx: S.txs.find(t => t.id === b.dataset.id) }); } },
  });
}

// ---------- categorías y cuentas ----------
function openCatEditor(id) {
  const c = S.categories.find(x => x.id === id);
  const st = { name: c.name, icon: c.icon, color: c.color };
  const used = S.txs.filter(t => t.catId === id).length;
  openSheet({
    render: () => `<div class="sheet-head"><button data-act="close">${t('Cancelar')}</button><h3>${t('Categoría')}</h3><button data-act="save">${t('Guardar')}</button></div>
      <div class="sheet-body">
        <div class="preview"><span class="ico" style="background:${st.color}22">${esc(st.icon)}</span><span class="muted" style="font-size:13px">${t(c.type === 'gasto' ? 'Gasto' : 'Ingreso')} · ${t('{n} movimientos', { n: used })}</span></div>
        <div class="field"><label>${t('Nombre')}</label><input type="text" name="name" value="${esc(st.name)}" maxlength="28" autocomplete="off"></div>
        <div class="list-title">${t('Color')}</div>
        <div class="colors">${COLORS.map(k => `<button data-act="color" data-v="${k}" class="${st.color === k ? 'on' : ''}" style="background:${k}" aria-label="Color ${k}"></button>`).join('')}</div>
        <div class="list-title">${t('Ícono')}</div>
        <div class="icon-grid">${ICONS.map(i => `<button data-act="icon" data-v="${i}" class="${st.icon === i ? 'on' : ''}">${i}</button>`).join('')}</div>
        <p class="hint">${t('Si cambias el nombre, los movimientos que ya tienes en esta categoría se quedan en ella con el nombre nuevo.')}</p>
      </div>`,
    onInput: e => { if (e.target.name === 'name') st.name = e.target.value; },
    actions: {
      close: (b, s) => s.close(),
      color: (b, s) => { st.color = b.dataset.v; s.refresh(); },
      icon: (b, s) => { st.icon = b.dataset.v; s.refresh(); },
      save: async (b, s) => {
        if (!st.name.trim()) { toast(t('Escribe un nombre')); return; }
        Object.assign(c, { name: st.name.trim(), icon: st.icon, color: st.color });
        await persist.categories();
        s.close(); render(); toast(t('Categoría actualizada'));
      },
    },
  });
}

function openAccEditor(id) {
  const a = id ? S.accounts.find(x => x.id === id) : null;
  const st = { name: a?.name || '', icon: a?.icon || '💳', initial: a?.initial ? amountToField(a.initial) : '' };
  const ACC_ICONS = ['💵', '🏦', '📱', '💳', '🪙', '💰', '👛', '🐷', '💼', '🏧', '🌎', '📈'];
  openSheet({
    render: () => `<div class="sheet-head"><button data-act="close">${t('Cancelar')}</button><h3>${t(a ? 'Cuenta' : 'Nueva cuenta')}</h3><button data-act="save">${t('Guardar')}</button></div>
      <div class="sheet-body">
        <div class="field"><label>${t('Nombre')}</label><input type="text" name="name" value="${esc(st.name)}" placeholder="${t('Ej: Nequi')}" maxlength="24" autocomplete="off"></div>
        <div class="field"><label>${t('Saldo inicial')}</label><input type="text" inputmode="decimal" name="initial" value="${esc(st.initial)}" placeholder="0"></div>
        <div class="icon-grid">${ACC_ICONS.map(i => `<button data-act="icon" data-v="${i}" class="${st.icon === i ? 'on' : ''}">${i}</button>`).join('')}</div>
        <p class="hint">${t('El saldo de la cuenta es el saldo inicial más los ingresos y menos los gastos que registres con esta cuenta. No se conecta a ningún banco.')}</p>
        ${a ? `<button class="btn danger" data-act="delete">${t('Eliminar cuenta')}</button>` : ''}
      </div>`,
    onInput: e => { if (e.target.name in st) st[e.target.name] = e.target.value; },
    actions: {
      close: (b, s) => s.close(),
      icon: (b, s) => { st.icon = b.dataset.v; s.refresh(); },
      save: async (b, s) => {
        if (!st.name.trim()) { toast(t('Escribe un nombre')); return; }
        const initial = parseNum(st.initial);
        if (a) Object.assign(a, { name: st.name.trim(), icon: st.icon, initial });
        else S.accounts.push({ id: uid(), name: st.name.trim(), icon: st.icon, initial });
        await persist.accounts();
        s.close(); render(); toast(t('Cuenta guardada'));
      },
      delete: async (b, s) => {
        const n = S.txs.filter(t => t.accountId === a.id).length;
        if (!(await ask(t('¿Eliminar esta cuenta?'), n ? t('Tiene {n} movimientos. Los movimientos no se borran, solo quedan “sin cuenta”.', { n }) : '', [{ label: t('Eliminar'), style: 'danger', value: true }, { label: t('Cancelar'), style: 'sec', value: false }]))) return;
        S.accounts = S.accounts.filter(x => x.id !== a.id);
        const changed = S.txs.filter(t => t.accountId === a.id).map(t => ({ ...t, accountId: null }));
        changed.forEach(t => { S.txs[S.txs.findIndex(x => x.id === t.id)] = t; });
        await db.putMany('txs', changed);
        await persist.accounts();
        s.close(); render(); toast(t('Cuenta eliminada'));
      },
    },
  });
}

function openCurrency() {
  openSheet({
    render: () => `<div class="sheet-head"><button></button><h3>${t('Moneda')}</h3><button data-act="close">${t('Listo')}</button></div>
      <div class="sheet-body"><div class="list">${CURRENCIES.map(([code, name, flag]) => `<button class="row" data-act="pick" data-v="${code}"><span style="font-size:24px">${flag}</span><span class="mid">${esc(currencyName(code, name))}<small>${code}</small></span>${S.settings.currency === code ? '<span class="link">✓</span>' : ''}</button>`).join('')}</div>
      <p class="hint">${t('Cambia el símbolo y el formato con que se muestran los montos. No convierte los valores ya registrados.')}</p></div>`,
    actions: {
      close: (b, s) => s.close(),
      pick: async (b, s) => { S.settings.currency = b.dataset.v; await persist.settings(); s.refresh(); render(); },
    },
  });
}

function openLanguage() {
  openSheet({
    render: () => `<div class="sheet-head"><button></button><h3>${t('Idioma')}</h3><button data-act="close">${t('Listo')}</button></div>
      <div class="sheet-body"><div class="list">${LANGS.map(([code, name]) => `<button class="row" data-act="pick" data-v="${code}"><span class="mid">${esc(name)}</span>${lang() === code ? '<span class="link">✓</span>' : ''}</button>`).join('')}</div>
      <p class="hint">${t('Los nombres de categorías y cuentas que no hayas cambiado también se traducen.')}</p></div>`,
    actions: {
      close: (b, s) => s.close(),
      pick: async (b, s) => {
        if (b.dataset.v === lang()) return s.close();
        S.settings.lang = b.dataset.v;
        setLang(S.settings.lang);
        await persist.settings();
        if (relabel(S.categories)) await persist.categories();
        if (relabel(S.accounts)) await persist.accounts();
        s.refresh(); render(); toast(t('Idioma cambiado'));
      },
    },
  });
}

// ---------- pagos fijos ----------
function openRecEditor(id) {
  const r = id ? S.recurring.find(x => x.id === id) : null;
  const st = r ? { ...r, amountTxt: amountToField(r.amount) } : { name: '', type: 'gasto', catId: null, amountTxt: '', day: new Date().getDate(), scope: S.settings.lastScope || 'personal', accountId: null, active: true };
  openSheet({
    render: () => `<div class="sheet-head"><button data-act="close">${t('Cancelar')}</button><h3>${t(r ? 'Pago fijo' : 'Nuevo pago fijo')}</h3><button data-act="save">${t('Guardar')}</button></div>
      <div class="sheet-body">
        <div class="type-seg"><button class="g ${st.type === 'gasto' ? 'on' : ''}" data-act="type" data-v="gasto">${t('− Gasto')}</button><button class="i ${st.type === 'ingreso' ? 'on' : ''}" data-act="type" data-v="ingreso">${t('+ Ingreso')}</button></div>
        <div class="field"><label>${t('Nombre')}</label><input type="text" name="name" value="${esc(st.name)}" placeholder="${t('Ej: Arriendo')}" maxlength="40" autocomplete="off"></div>
        <div class="field"><label>${t('Monto')}</label><input type="text" inputmode="decimal" name="amountTxt" value="${esc(st.amountTxt)}" placeholder="0"></div>
        <div class="field"><label>${t('Día del mes')}</label><select name="day">${Array.from({ length: 31 }, (_, i) => `<option ${+st.day === i + 1 ? 'selected' : ''}>${i + 1}</option>`).join('')}</select></div>
        <div class="list-title">${t('Categoría')}</div>
        <div class="chips" style="flex-wrap:wrap">${S.categories.filter(c => c.type === st.type).map(c => `<button class="chip ${st.catId === c.id ? 'on' : ''}" data-act="cat" data-v="${c.id}">${esc(c.icon)} ${esc(c.name)}</button>`).join('')}</div>
        <div class="pick-label">${t('¿Es personal o del negocio?')}</div>
        <div class="scope2"><button class="p ${st.scope === 'personal' ? 'on' : ''}" data-act="scope-r" data-v="personal">${t('👤 Personal')}</button><button class="n ${st.scope === 'negocio' ? 'on' : ''}" data-act="scope-r" data-v="negocio">${t('💼 Negocio')}</button></div>
        <div class="pick-label">${t('¿Con qué se paga?')}</div>
        ${accPicker(st.accountId, 'acc-r')}
        ${r ? `<button class="btn sec" data-act="toggle">${t(st.active === false ? '▶︎ Reactivar' : '⏸ Pausar')}</button><button class="btn danger" data-act="delete">${t('Eliminar pago fijo')}</button>` : ''}
      </div>`,
    onInput: e => { if (e.target.name in st) st[e.target.name] = e.target.value; },
    actions: {
      close: (b, s) => s.close(),
      type: (b, s) => { if (st.type !== b.dataset.v) { st.type = b.dataset.v; st.catId = null; } s.refresh(); },
      cat: (b, s) => { st.catId = b.dataset.v; s.refresh(); },
      'scope-r': (b, s) => { st.scope = b.dataset.v; s.refresh(); },
      'acc-r': (b, s) => { st.accountId = b.dataset.v || null; s.refresh(); },
      toggle: (b, s) => { st.active = st.active === false; s.refresh(); },
      save: async (b, s) => {
        const amount = parseNum(st.amountTxt);
        if (!st.name.trim()) return toast(t('Escribe un nombre'));
        if (!(amount > 0)) return toast(t('Escribe el monto'));
        if (!st.catId) return toast(t('Elige una categoría'));
        const rec = { id: r?.id || uid(), name: st.name.trim(), type: st.type, catId: st.catId, amount, day: +st.day, scope: st.scope, accountId: st.accountId, active: st.active !== false, startMonth: r?.startMonth || thisMonth() };
        if (r) Object.assign(r, rec); else S.recurring.push(rec);
        await persist.recurring();
        s.close(); render(); toast(t('Pago fijo guardado'));
      },
      delete: async (b, s) => {
        if (!(await confirmDelete('este pago fijo'))) return;
        S.recurring = S.recurring.filter(x => x.id !== r.id);
        await persist.recurring();
        s.close(); render(); toast(t('Pago fijo eliminado'));
      },
    },
  });
}

function payRecurring(id) {
  const r = S.recurring.find(x => x.id === id);
  const m = thisMonth();
  const day = Math.min(r.day, daysIn(m));
  openEntry({ prefill: { type: r.type, catId: r.catId, amount: r.amount, note: r.name, scope: r.scope, accountId: r.accountId, date: `${m}-${pad(day)}`, recurringId: r.id } });
}

// ---------- exportar ----------
function openExport() {
  const y = new Date().getFullYear();
  const st = { period: 'año', month: V.month, year: String(V.year || y), from: `${y}-01-01`, to: today(), scope: 'todo' };
  const years = [...new Set(S.txs.map(t => t.date.slice(0, 4)).concat(String(y)))].sort().reverse();
  const range = () => {
    if (st.period === 'mes') return [`${st.month}-01`, `${st.month}-31`, monthLabel(st.month)];
    if (st.period === 'año') return [`${st.year}-01-01`, `${st.year}-12-31`, t('Año {y}', { y: st.year })];
    if (st.period === 'rango') return [st.from, st.to, t('{a} a {b}', { a: shortDate(st.from), b: shortDate(st.to) })];
    return ['0000-01-01', '9999-12-31', t('Todo el historial')];
  };
  const selected = () => { const [a, b] = range(); return S.txs.filter(t => t.date >= a && t.date <= b && (st.scope === 'todo' || t.scope === st.scope)).sort((p, q) => p.date.localeCompare(q.date)); };
  const monthOpts = () => { const set = new Set(S.txs.map(t => t.date.slice(0, 7)).concat(thisMonth())); return [...set].sort().reverse().map(m => `<option value="${m}" ${st.month === m ? 'selected' : ''}>${monthLabel(m)}</option>`).join(''); };
  openSheet({
    render: () => `<div class="sheet-head"><button></button><h3>${t('Exportar')}</h3><button data-act="close">${t('Cerrar')}</button></div>
      <div class="sheet-body">
        <div class="list-title">${t('Periodo')}</div>
        <div class="chips">${[['mes', 'Un mes'], ['año', 'Un año'], ['rango', 'Rango de fechas'], ['todo', 'Todo']].map(([k, l]) => `<button class="chip ${st.period === k ? 'on' : ''}" data-act="period" data-v="${k}">${t(l)}</button>`).join('')}</div>
        ${st.period === 'mes' ? `<div class="field"><label>${t('Mes')}</label><select name="month">${monthOpts()}</select></div>` : ''}
        ${st.period === 'año' ? `<div class="field"><label>${t('Año')}</label><select name="year">${years.map(v => `<option ${st.year === v ? 'selected' : ''}>${v}</option>`).join('')}</select></div>` : ''}
        ${st.period === 'rango' ? `<div class="field"><label>${t('Desde')}</label><input type="date" name="from" value="${st.from}"></div><div class="field"><label>${t('Hasta')}</label><input type="date" name="to" value="${st.to}"></div>` : ''}
        <div class="list-title">${t('Qué incluir')}</div>
        <div class="chips">${[['todo', 'Todo'], ['personal', '👤 Personal'], ['negocio', '💼 Negocio']].map(([k, l]) => `<button class="chip ${st.scope === k ? 'on' : ''}" data-act="scope-x" data-v="${k}">${t(l)}</button>`).join('')}</div>
        <div class="card"><b>${selected().length}</b> ${t('movimientos')} · ${esc(range()[2])}</div>
        <button class="btn" data-act="xlsx">${t('📊 Exportar a Excel (.xlsx)')}</button>
        <button class="btn sec" data-act="csv">${t('📄 Exportar a CSV')}</button>
        <p class="hint">${t('El Excel trae 4 hojas: <b>Movimientos</b> (cada registro con fecha, tipo, categoría, personal/negocio, cuenta y nota), <b>Resumen mensual</b>, <b>Por categoría</b> y <b>Personal y negocio</b>. Luego puedes guardarlo en Archivos, enviarlo por WhatsApp o correo a tu contador.')}</p>
      </div>`,
    onInput: (e, s) => { if (e.target.name in st) { st[e.target.name] = e.target.value; if (e.type === 'change') s.refresh(); } },
    actions: {
      close: (b, s) => s.close(),
      period: (b, s) => { st.period = b.dataset.v; s.refresh(); },
      'scope-x': (b, s) => { st.scope = b.dataset.v; s.refresh(); },
      xlsx: async () => {
        const list = selected();
        if (!list.length) return toast(t('No hay movimientos en ese periodo'));
        const [, , label] = range();
        const blob = buildXlsx(excelSheets(list, label, st.scope));
        await shareFile(blob, `MiDinero ${label.replace(/[\/\\:]/g, '-')}.xlsx`);
      },
      csv: async () => {
        const list = selected();
        if (!list.length) return toast(t('No hay movimientos en ese periodo'));
        const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
        const lines = [['Fecha', 'Tipo', 'Categoría', 'Personal/Negocio', 'Cuenta', 'Nota', 'Ingreso', 'Gasto'].map(h => q(t(h))).join(';')];
        const num = v => (lang() === 'en' ? String(v) : String(v).replace('.', ','));
        for (const x of list) lines.push([x.date.split('-').reverse().join('/'), t(x.type === 'ingreso' ? 'Ingreso' : 'Gasto'), cat(x.catId).name, t(x.scope === 'negocio' ? 'Negocio' : 'Personal'), ACC[x.accountId]?.name || '', x.note, x.type === 'ingreso' ? num(x.amount) : '', x.type === 'gasto' ? num(x.amount) : ''].map(q).join(';'));
        const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
        await shareFile(blob, `MiDinero ${range()[2].replace(/[\/\\:]/g, '-')}.csv`);
      },
    },
  });
}

function excelSheets(list, label, scope) {
  const scopeTxt = t({ todo: 'Personal y negocio', personal: 'Solo personal', negocio: 'Solo negocio' }[scope]);
  const sub = t('{l} · {s} · Moneda: {c} · Generado el {d}', { l: label, s: scopeTxt, c: S.settings.currency, d: new Date().toLocaleDateString(locale()) });
  const H = list => list.map(v => ({ v: t(v), s: 'h' }));
  const tot = totals(list);
  // Movimientos
  const mov = [
    [{ v: t('Mi Dinero — Movimientos'), s: 't' }], [sub], [],
    H(['Fecha', 'Tipo', 'Categoría', 'Personal / Negocio', 'Cuenta', 'Nota', 'Ingreso', 'Gasto']),
    ...list.map(x => [{ v: x.date, s: 'd' }, t(x.type === 'ingreso' ? 'Ingreso' : 'Gasto'), cat(x.catId).name, t(x.scope === 'negocio' ? 'Negocio' : 'Personal'), ACC[x.accountId]?.name || '', x.note || '',
      x.type === 'ingreso' ? { v: x.amount, s: 'mi' } : null, x.type === 'gasto' ? { v: x.amount, s: 'mg' } : null]),
    [{ v: t('TOTAL'), s: 'b' }, { v: '', s: 'b' }, { v: '', s: 'b' }, { v: '', s: 'b' }, { v: '', s: 'b' }, { v: t('Saldo: {b}', { b: fmt(tot.bal) }), s: 'b' }, { v: tot.inc, s: 'mb' }, { v: tot.exp, s: 'mb' }],
  ];
  // Resumen mensual
  const months = [...new Set(list.map(t => t.date.slice(0, 7)))].sort();
  let acc = 0;
  const res = [[{ v: t('Resumen mensual'), s: 't' }], [sub], [], H(['Mes', 'Ingresos', 'Gastos', 'Saldo del mes', 'Saldo acumulado'])];
  for (const m of months) { const mt = totals(list.filter(x => x.date.startsWith(m))); acc = round2(acc + mt.bal); res.push([monthLabel(m), { v: mt.inc, s: 'mi' }, { v: mt.exp, s: 'mg' }, { v: mt.bal, s: 'm' }, { v: acc, s: 'm' }]); }
  res.push([{ v: t('TOTAL'), s: 'b' }, { v: tot.inc, s: 'mb' }, { v: tot.exp, s: 'mb' }, { v: tot.bal, s: 'mb' }, { v: '', s: 'b' }]);
  // Por categoría (filas = categorías, columnas = meses)
  const head = [t('Categoría'), ...months.map(m => { const [y, mo] = m.split('-'); return `${monthShort(+mo - 1)} ${y}`; }), t('Total')].map(v => ({ v, s: 'h' }));
  const catRows = kind => S.categories.filter(c => c.type === kind).map(c => {
    const vals = months.map(m => round2(list.filter(t => t.catId === c.id && t.date.startsWith(m)).reduce((a, t) => a + t.amount, 0)));
    const total = round2(vals.reduce((a, b) => a + b, 0));
    return total ? [c.name, ...vals.map(v => (v ? { v, s: 'm' } : null)), { v: total, s: 'mb' }] : null;
  }).filter(Boolean);
  const sumRow = (name, kind) => [{ v: name, s: 'b' }, ...months.map(m => ({ v: totals(list.filter(t => t.date.startsWith(m) && t.type === kind))[kind === 'ingreso' ? 'inc' : 'exp'], s: 'mb' })), { v: kind === 'ingreso' ? tot.inc : tot.exp, s: 'mb' }];
  const porCat = [[{ v: t('Por categoría'), s: 't' }], [sub], [], [{ v: t('INGRESOS'), s: 'b' }], head, ...catRows('ingreso'), sumRow(t('Total ingresos'), 'ingreso'), [], [{ v: t('GASTOS'), s: 'b' }], head, ...catRows('gasto'), sumRow(t('Total gastos'), 'gasto')];
  // Personal y negocio
  const pn = [[{ v: t('Personal y negocio'), s: 't' }], [sub], [], H(['Mes', 'Ingresos personal', 'Gastos personal', 'Saldo personal', 'Ingresos negocio', 'Gastos negocio', 'Saldo negocio'])];
  const pnRow = (name, l, bold) => { const p = totals(l.filter(t => t.scope !== 'negocio')), n = totals(l.filter(t => t.scope === 'negocio')); const s = bold ? 'mb' : 'm'; return [bold ? { v: name, s: 'b' } : name, { v: p.inc, s }, { v: p.exp, s }, { v: p.bal, s }, { v: n.inc, s }, { v: n.exp, s }, { v: n.bal, s }]; };
  for (const m of months) pn.push(pnRow(monthLabel(m), list.filter(t => t.date.startsWith(m))));
  pn.push(pnRow(t('TOTAL'), list, true));
  return [
    { name: t('Movimientos'), rows: mov, cols: [12, 9, 20, 17, 14, 44, 15, 15], freeze: 4, filter: true, title: true },
    { name: t('Resumen mensual'), rows: res, cols: [18, 16, 16, 16, 18], freeze: 4, title: true },
    { name: t('Por categoría'), rows: porCat, cols: [22, ...months.map(() => 13), 15], freeze: 0, title: true },
    { name: t('Personal y negocio'), rows: pn, cols: [18, 17, 17, 17, 17, 17, 17], freeze: 4, title: true },
  ];
}

// ---------- respaldo ----------
const blobToDataUrl = b => new Promise(r => { const f = new FileReader(); f.onload = () => r(f.result); f.readAsDataURL(b); });

async function openBackup() {
  const nPhotos = (await db.keys('photos')).length;
  openSheet({
    render: () => `<div class="sheet-head"><button></button><h3>${t('Copia de seguridad')}</h3><button data-act="close">${t('Cerrar')}</button></div>
      <div class="sheet-body">
        <div class="card" style="text-align:center"><div style="font-size:44px">☁️</div>
          <div style="font-size:20px;font-weight:800;margin-top:4px">${t('{n} movimientos', { n: S.txs.length.toLocaleString(locale()) })}</div>
          <div class="muted" style="font-size:14px">${nPhotos} ${t('fotos de recibos')} · ${S.recurring.length} ${t('pagos fijos')} · ${t('tus categorías y cuentas')}</div>
          <div class="muted" style="font-size:13px;margin-top:8px">${S.settings.lastBackup ? t('Última copia: {d}', { d: new Date(S.settings.lastBackup).toLocaleString(locale(), { dateStyle: 'long', timeStyle: 'short' }) }) : t('Aún no has guardado ninguna copia')}</div></div>
        <button class="btn" data-act="go">${t('Guardar copia')}</button>
        <div class="card"><h3>${t('¿Cómo se guarda?')}</h3><p class="hint" style="margin:0">${t('Toca <b>Guardar copia</b> → {files}elige <b>{c}</b> → <b>Guardar</b>. Para recuperar todo en otro celular: Ajustes → Restaurar o importar.', { files: platform() === 'ios' ? t('<b>Guardar en Archivos</b> → ') : '', c: cloud() })}</p></div>
        <div class="card"><h3>${t('¿Por qué el archivo se ve como código?')}</h3><p class="hint" style="margin:0">${t('La copia es un archivo hecho para que <b>Mi Dinero</b> lo lea, no para leerlo tú. Si lo abres verás texto técnico: es normal, así guarda todo sin perder nada. Para ver tus números de forma clara usa <b>Exportar a Excel</b>.')}</p></div>
        <p class="hint" style="text-align:center;margin:0">${t('🔒 Tus datos solo están en este dispositivo y en tu propia nube ({c}).', { c: cloud() })}</p>
      </div>`,
    actions: { close: (b, s) => s.close(), go: async (b, s) => { s.close(); await doBackup(); } },
  });
}

async function doBackup() {
  toast(t('Preparando copia…'));
  const photos = {};
  for (const k of await db.keys('photos')) { const b = await db.get('photos', k); if (b) photos[k] = await blobToDataUrl(b); }
  const data = { app: 'mi-dinero', kind: 'respaldo', version: 1, exportedAt: new Date().toISOString(), settings: S.settings, categories: S.categories, accounts: S.accounts, recurring: S.recurring, txs: S.txs, photos };
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
  const ok = await shareFile(blob, `MiDinero-respaldo-${today()}.json`);
  if (ok) { S.settings.lastBackup = Date.now(); await persist.settings(); render(); toast(t('Copia lista. Guárdala en {c}.', { c: cloud() })); }
}

async function doImport() {
  const f = await pickFile(document.getElementById('file-import'));
  if (!f) return;
  let data;
  try { data = JSON.parse(await f.text()); } catch { return toast(t('Ese archivo no es una copia de Mi Dinero')); }
  if (data?.app !== 'mi-dinero' || !Array.isArray(data.txs)) return toast(t('Ese archivo no es una copia de Mi Dinero'));
  const existing = new Set(S.txs.map(t => t.id));
  const nuevos = data.txs.filter(t => !existing.has(t.id));
  let mode = 'merge';
  if (data.kind === 'respaldo') {
    mode = await ask(t('Restaurar copia'), t('Copia del {d} con {n} movimientos.', { d: new Date(data.exportedAt).toLocaleString(locale()), n: data.txs.length }), [
      { label: t('Agregar a mis datos'), value: 'merge' }, { label: t('Reemplazar todo'), style: 'danger', value: 'replace' }, { label: t('Cancelar'), style: 'sec', value: null }]);
    if (!mode) return;
  } else {
    const ok = await ask(t('Importar historial'), t('{n} movimientos en el archivo, {k} son nuevos. Los que ya tienes no se duplican.', { n: data.txs.length, k: nuevos.length }), [{ label: t('Importar {n}', { n: nuevos.length }), value: true }, { label: t('Cancelar'), style: 'sec', value: false }]);
    if (!ok) return;
  }
  if (mode === 'replace') {
    await clearData();
    S.settings = { ...data.settings, lastBackup: data.settings?.lastBackup || null };
    S.settings.lang = lang();
    S.categories = data.categories || defaultCategories();
    S.accounts = data.accounts || defaultAccounts();
    S.recurring = data.recurring || [];
    S.txs = data.txs;
    await db.putMany('txs', S.txs);
    await Promise.all([persist.settings(), persist.categories(), persist.accounts(), persist.recurring()]);
  } else {
    S.txs = S.txs.concat(nuevos);
    await db.putMany('txs', nuevos);
    if (data.kind === 'respaldo') {
      for (const r of data.recurring || []) if (!S.recurring.some(x => x.id === r.id)) S.recurring.push(r);
      for (const a of data.accounts || []) if (!S.accounts.some(x => x.id === a.id)) S.accounts.push(a);
      await Promise.all([persist.recurring(), persist.accounts()]);
    }
  }
  for (const [k, url] of Object.entries(data.photos || {})) { const b = await (await fetch(url)).blob(); await db.put('photos', b, k); }
  reindex(); render();
  toast(mode === 'replace' ? t('Copia restaurada: {n} movimientos', { n: S.txs.length }) : t('{n} movimientos importados', { n: nuevos.length }));
}

async function wipe() {
  const a = await ask(t('¿Borrar todos los datos?'), t('Se eliminan todos tus movimientos, pagos fijos y fotos de este dispositivo. Guarda antes una copia de seguridad.'), [{ label: t('Guardar copia primero'), value: 'backup' }, { label: t('Borrar todo'), style: 'danger', value: 'wipe' }, { label: t('Cancelar'), style: 'sec', value: null }]);
  if (a === 'backup') return openBackup();
  if (a !== 'wipe') return;
  if (!(await ask(t('¿Seguro?'), t('Esta es la última confirmación.'), [{ label: t('Sí, borrar todo'), style: 'danger', value: true }, { label: t('Cancelar'), style: 'sec', value: false }]))) return;
  const keepLang = lang();
  await clearData();
  await db.put('kv', { currency: S.settings.currency, lastScope: 'personal', lastAccount: 'a1', lastBackup: null, createdAt: Date.now(), lang: keepLang }, 'settings');
  await load();
  render(); toast(t('Datos borrados'));
}

// ---------- eventos de la vista principal ----------
const MAIN = {
  tab: b => { V.tab = b.dataset.v; render(); scrollTo(0, 0); },
  scope: b => { V.scope = b.dataset.v; render(); },
  month: b => { V.month = shiftMonth(V.month, +b.dataset.v); V.day = null; V.year = +V.month.slice(0, 4); render(); },
  year: b => { V.year += +b.dataset.v; render(); },
  day: b => { V.day = b.dataset.v && V.day !== b.dataset.v ? b.dataset.v : null; render(); },
  bal: b => { V.bal = b.dataset.v; V.year = +V.month.slice(0, 4); render(); },
  kind: b => { V.kind = b.dataset.v; render(); },
  'goto-month': b => { V.month = b.dataset.v; V.bal = 'mes'; render(); scrollTo(0, 0); },
  new: b => (canRegister() ? openEntry({ type: b.dataset.v }) : openLicense()),
  'edit-tx': b => openEntry({ tx: S.txs.find(t => t.id === b.dataset.id) }),
  'cat-detail': b => openCatDetail(b.dataset.id),
  'edit-cat': b => openCatEditor(b.dataset.id),
  'edit-acc': b => openAccEditor(b.dataset.id),
  'new-acc': () => openAccEditor(null),
  'new-rec': () => openRecEditor(null),
  'edit-rec': b => openRecEditor(b.dataset.id),
  'pay-rec': b => (canRegister() ? payRecurring(b.dataset.id) : openLicense()),
  license: () => openLicense(),
  currency: () => openCurrency(),
  language: () => openLanguage(),
  export: () => openExport(),
  backup: () => openBackup(),
  import: () => doImport(),
  wipe: () => wipe(),
  'rem-on': () => enableReminder(),
  'rem-off': () => disableReminder(),
  'rem-test': () => testReminder(),
  'rem-ask': () => enableReminder(20),
  'rem-skip': async () => { S.settings.reminderAsked = true; await persist.settings(); render(); },
  install: async () => { if (!installPrompt) return; installPrompt.prompt(); await installPrompt.userChoice; installPrompt = null; render(); },
};
document.getElementById('view').addEventListener('click', e => { const b = e.target.closest('[data-act]'); if (b) MAIN[b.dataset.act]?.(b); });
document.getElementById('view').addEventListener('change', e => { if (e.target.name === 'rem-hour') enableReminder(+e.target.value); });
document.getElementById('tabs').addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if (b) { V.tab = b.dataset.tab; render(); scrollTo(0, 0); } });

// ---------- efecto al tocar ----------
const TOUCHABLE = 'button, [data-act], [data-tab]';
const LIGHT_RIPPLE = '.fab button, .btn:not(.sec):not(.danger), .chip.on, .acc-btn.on, .scope2 .on, .type-seg .on, .keypad .save, .cal .sel, .seg button:not(.on), .month-nav button';
document.addEventListener('touchstart', () => {}, { passive: true }); // activa :active en iOS
document.addEventListener('pointerdown', e => {
  const b = e.target.closest(TOUCHABLE);
  if (!b || b.tagName === 'TR' || b.tagName === 'IMG') return;
  const r = b.getBoundingClientRect();
  const host = document.createElement('div');
  host.className = 'ripple-host';
  host.style.cssText = `left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px;border-radius:${getComputedStyle(b).borderRadius}`;
  const d = Math.hypot(r.width, r.height) * 2;
  const dot = document.createElement('span');
  dot.className = 'ripple' + (b.matches(LIGHT_RIPPLE) ? ' light' : '');
  dot.style.cssText = `width:${d}px;height:${d}px;left:${e.clientX - r.left - d / 2}px;top:${e.clientY - r.top - d / 2}px`;
  host.appendChild(dot);
  document.body.appendChild(host);
  setTimeout(() => host.remove(), 600);
}, { passive: true });

// ---------- arranque ----------
(async () => {
  await load();
  render();
  askPersistence();
  syncReminder();
  checkLicense();
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('./sw.js').catch(() => {});
})();
