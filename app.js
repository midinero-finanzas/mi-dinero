import { db, askPersistence } from './db.js';
import { DEFAULT_CATEGORIES, DEFAULT_ACCOUNTS, CURRENCIES, ICONS, COLORS, MONTHS, MONTHS_SHORT, WEEKDAYS } from './data.js';
import { buildXlsx } from './xlsx.js';

const APP_VERSION = '1.0.0';

// ---------- utilidades ----------
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = n => String(n).padStart(2, '0');
const isoDate = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => isoDate(new Date());
const thisMonth = () => today().slice(0, 7);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const daysIn = m => { const [y, mo] = m.split('-').map(Number); return new Date(y, mo, 0).getDate(); };
const shiftMonth = (m, k) => { const [y, mo] = m.split('-').map(Number); const d = new Date(y, mo - 1 + k, 1); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; };
const monthLabel = m => { const [y, mo] = m.split('-').map(Number); return `${MONTHS[mo - 1]} ${y}`; };
const dayLabel = iso => { const [y, m, d] = iso.split('-').map(Number); const s = new Date(y, m - 1, d).toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' }); return s[0].toUpperCase() + s.slice(1); };
const shortDate = iso => { const [y, m, d] = iso.split('-').map(Number); return `${d} ${MONTHS_SHORT[m - 1]} ${y}`; };
const round2 = n => Math.round(n * 100) / 100;

function fmt(n, sign = false) {
  const v = round2(n);
  const dec = Number.isInteger(v) ? 0 : 2;
  let s;
  try { s = new Intl.NumberFormat('es-CO', { style: 'currency', currency: S.settings.currency, minimumFractionDigits: dec, maximumFractionDigits: dec }).format(Math.abs(v)); }
  catch { s = '$ ' + Math.abs(v).toLocaleString('es-CO'); }
  return (v < 0 ? '−' : sign && v > 0 ? '+' : '') + s;
}

// ---------- estado ----------
const S = { settings: null, categories: [], accounts: [], recurring: [], txs: [] };
const V = { tab: 'inicio', month: thisMonth(), day: null, scope: 'todo', bal: 'mes', year: new Date().getFullYear(), kind: 'gasto' };
let CAT = {}, ACC = {};
const reindex = () => { CAT = Object.fromEntries(S.categories.map(c => [c.id, c])); ACC = Object.fromEntries(S.accounts.map(a => [a.id, a])); };
const cat = id => CAT[id] || { name: 'Sin categoría', icon: '❔', color: '#7a8a99', type: 'gasto' };

const persist = {
  settings: () => db.put('kv', S.settings, 'settings'),
  categories: () => { reindex(); return db.put('kv', S.categories, 'categories'); },
  accounts: () => { reindex(); return db.put('kv', S.accounts, 'accounts'); },
  recurring: () => db.put('kv', S.recurring, 'recurring'),
};

async function load() {
  S.settings = (await db.get('kv', 'settings')) || { currency: 'COP', lastScope: 'personal', lastAccount: 'a1', lastBackup: null, createdAt: Date.now() };
  S.categories = (await db.get('kv', 'categories')) || structuredClone(DEFAULT_CATEGORIES);
  S.accounts = (await db.get('kv', 'accounts')) || structuredClone(DEFAULT_ACCOUNTS);
  S.recurring = (await db.get('kv', 'recurring')) || [];
  S.txs = await db.all('txs');
  reindex();
  await Promise.all([persist.settings(), persist.categories(), persist.accounts(), persist.recurring()]);
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
    <span class="mid"><div class="name">${esc(c.name)}${t.scope === 'negocio' ? '<span class="tag biz">Negocio</span>' : ''}${acc ? `<span class="tag acc">${esc(acc.name)}</span>` : ''}${t.photoId ? '<span class="tag cam">📎</span>' : ''}</div>
    ${t.note ? `<div class="note">${esc(t.note)}</div>` : ''}</span>
    <span class="amt num ${t.type === 'ingreso' ? 'inc' : 'exp'}">${t.type === 'ingreso' ? '+' : '−'}${fmt(t.amount)}</span></button>`;
}
function groupedList(list) {
  if (!list.length) return '<div class="empty-state">No hay movimientos aquí todavía.<br>Usa los botones de abajo para registrar uno.</div>';
  const groups = {};
  for (const t of [...list].sort(byDateDesc)) (groups[t.date] ||= []).push(t);
  return Object.entries(groups).map(([d, items]) => {
    const tt = totals(items);
    return `<div class="day-head"><span>${esc(dayLabel(d))}</span><span class="num ${tt.bal >= 0 ? 'inc' : 'exp'}">${fmt(tt.bal, true)}</span></div>${items.map(txRow).join('')}`;
  }).join('');
}
function accPicker(sel, act) {
  const opts = [...S.accounts.map(a => ({ id: a.id, icon: a.icon, name: a.name })), { id: '', icon: '➖', name: 'Sin cuenta' }];
  return `<div class="acc-grid">${opts.map(a => `<button class="acc-btn ${(sel || '') === a.id ? 'on' : ''}" data-act="${act}" data-v="${a.id}"><span class="ai">${esc(a.icon)}</span><span>${esc(a.name)}</span></button>`).join('')}</div>`;
}
const scopeSeg = () => `<div class="seg">${[['todo', 'Todo'], ['personal', '👤 Personal'], ['negocio', '💼 Negocio']].map(([k, l]) => `<button data-act="scope" data-v="${k}" class="${V.scope === k ? 'on' : ''}">${l}</button>`).join('')}</div>`;

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
  let cal = WEEKDAYS.map(w => `<div class="wd">${w}</div>`).join('') + '<div class="d empty"></div>'.repeat(offset);
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
    <div class="month-nav"><button data-act="month" data-v="-1" aria-label="Mes anterior">‹</button><div class="title">${monthLabel(m)}</div><button data-act="month" data-v="1" aria-label="Mes siguiente">›</button></div>
    ${scopeSeg()}
  </header>
  <div class="wrap">
    <section class="card">
      <div class="summary">
        <div class="box inc"><div class="lab">Ingresos</div><div class="val num inc">${fmt(t.inc)}</div></div>
        <div class="box exp"><div class="lab">Gastos</div><div class="val num exp">${fmt(t.exp)}</div></div>
      </div>
      <div class="balance-row"><span>Saldo del mes</span><span class="val num ${t.bal >= 0 ? 'inc' : 'exp'}">${fmt(t.bal)}</span></div>
      <div class="balance-row sub"><span class="muted">Acumulado al cierre</span><span class="val num">${fmt(acc)}</span></div>
    </section>
    ${pend.length ? `<button class="banner" data-act="tab" data-v="fijos"><span style="font-size:22px">🔁</span><span><b>${pend.length} pago${pend.length > 1 ? 's' : ''} fijo${pend.length > 1 ? 's' : ''} pendiente${pend.length > 1 ? 's' : ''}</b>${esc(pend.slice(0, 3).map(r => r.name).join(', '))}</span><span class="go">Ver ›</span></button>` : ''}
    ${backupDue() ? `<button class="banner" data-act="backup"><span style="font-size:22px">☁️</span><span><b>Guarda tu copia de seguridad</b>${S.settings.lastBackup ? 'Última: ' + new Date(S.settings.lastBackup).toLocaleDateString('es-CO') : 'Aún no has guardado ninguna'}</span><span class="go">Guardar ›</span></button>` : ''}
    <section class="card"><div class="cal">${cal}</div></section>
    <section class="card">
      <h3>${V.day ? esc(dayLabel(V.day)) : 'Movimientos del mes'} <small>${dayList.length}</small>${V.day ? ' <button class="link" data-act="day" data-v="" style="float:right">Ver todo el mes</button>' : ''}</h3>
      ${groupedList(dayList)}
    </section>
  </div>
  <div class="fab"><button class="b-inc" data-act="new" data-v="ingreso"><span>+</span> Ingreso</button><button class="b-exp" data-act="new" data-v="gasto"><span>−</span> Gasto</button></div>`;
}

function catBars(list, kind, clickable = true) {
  const rows = byCategory(list, kind);
  const total = rows.reduce((a, r) => a + r.v, 0);
  if (!rows.length) return `<div class="empty-state">Sin ${kind === 'gasto' ? 'gastos' : 'ingresos'} en este periodo.</div>`;
  const max = rows[0].v;
  return rows.map(r => {
    const c = cat(r.id);
    return `<button class="bar-row" ${clickable ? `data-act="cat-detail" data-id="${r.id}"` : ''}>${icoHtml(c)}<span class="mid">
      <span class="top-line"><b>${esc(c.name)}</b><span class="num">${fmt(r.v)}</span></span>
      <div class="bar"><i style="width:${Math.max(2, (r.v / max) * 100)}%;background:${c.color}"></i></div>
      <span class="pct">${((r.v / total) * 100).toFixed(1)}%</span></span></button>`;
  }).join('');
}
const kindSeg = () => `<div class="seg light">${[['gasto', 'Gastos'], ['ingreso', 'Ingresos']].map(([k, l]) => `<button data-act="kind" data-v="${k}" class="${V.kind === k ? 'on' : ''}">${l}</button>`).join('')}</div>`;

function viewBalances() {
  const isMes = V.bal === 'mes';
  const nav = isMes
    ? `<div class="month-nav"><button data-act="month" data-v="-1">‹</button><div class="title">${monthLabel(V.month)}</div><button data-act="month" data-v="1">›</button></div>`
    : `<div class="month-nav"><button data-act="year" data-v="-1">‹</button><div class="title">Año ${V.year}</div><button data-act="year" data-v="1">›</button></div>`;
  const head = `<header class="top"><h1>Balances</h1>
    <div class="seg">${[['mes', 'Mes'], ['año', 'Año']].map(([k, l]) => `<button data-act="bal" data-v="${k}" class="${V.bal === k ? 'on' : ''}">${l}</button>`).join('')}</div>
    ${nav}${scopeSeg()}</header>`;
  return head + `<div class="wrap">${isMes ? balMes() : balAnio()}</div>`;
}

function summaryCard(t, extraRows = '') {
  return `<section class="card"><div class="summary">
    <div class="box inc"><div class="lab">Ingresos</div><div class="val num inc">${fmt(t.inc)}</div></div>
    <div class="box exp"><div class="lab">Gastos</div><div class="val num exp">${fmt(t.exp)}</div></div></div>
    <div class="balance-row"><span>Saldo</span><span class="val num ${t.bal >= 0 ? 'inc' : 'exp'}">${fmt(t.bal)}</span></div>${extraRows}</section>`;
}

function scopeSplit(pre) {
  if (V.scope !== 'todo') return '';
  const all = txIn(pre, false);
  const p = totals(all.filter(t => t.scope !== 'negocio')), n = totals(all.filter(t => t.scope === 'negocio'));
  return `<section class="card"><h3>Personal y negocio</h3><table class="table">
    <tr><th></th><th>Ingresos</th><th>Gastos</th><th>Saldo</th></tr>
    <tr><td>👤 Personal</td><td class="num inc">${fmt(p.inc)}</td><td class="num exp">${fmt(p.exp)}</td><td class="num">${fmt(p.bal)}</td></tr>
    <tr><td>💼 Negocio</td><td class="num inc">${fmt(n.inc)}</td><td class="num exp">${fmt(n.exp)}</td><td class="num">${fmt(n.bal)}</td></tr></table></section>`;
}

function balMes() {
  const m = V.month;
  const list = txIn(m);
  const t = totals(list);
  const prev = totals(txIn(shiftMonth(m, -1)));
  const diff = t.exp - prev.exp;
  const extra = `<div class="balance-row sub"><span class="muted">Acumulado al cierre</span><span class="val num">${fmt(accumulatedUntil(`${m}-31`))}</span></div>
    ${prev.exp ? `<div class="balance-row sub"><span class="muted">Gastos vs. mes anterior</span><span class="val num ${diff > 0 ? 'exp' : 'inc'}">${diff > 0 ? '▲' : '▼'} ${fmt(Math.abs(diff))}</span></div>` : ''}`;
  const accs = S.accounts.map(a => `<div class="row"><span class="ico" style="background:var(--card-2)">${esc(a.icon)}</span><span class="mid">${esc(a.name)}</span><span class="end num">${fmt(accountBalance(a))}</span></div>`).join('');
  return summaryCard(t, extra) +
    `<section class="card"><h3>Por categoría</h3>${kindSeg()}<div style="margin-top:8px">${catBars(list, V.kind)}</div></section>` +
    scopeSplit(m) +
    `<section class="card"><h3>Saldo por cuenta <small>(todo lo registrado)</small></h3><div class="list" style="box-shadow:none;margin:0 -14px -14px">${accs}</div></section>`;
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
    return `<rect x="${cx}" y="${H - 18 - hi}" width="${bw}" height="${hi}" rx="2" fill="var(--inc)"/><rect x="${cx + bw + 1}" y="${H - 18 - he}" width="${bw}" height="${he}" rx="2" fill="var(--exp)"/><text x="${cx + bw}" y="${H - 4}" font-size="10" text-anchor="middle" fill="var(--muted)">${MONTHS_SHORT[i].slice(0, 1).toUpperCase()}</text>`;
  }).join('');
  const rows = months.map(x => `<tr class="click" data-act="goto-month" data-v="${x.m}"><td>${MONTHS_SHORT[x.k - 1]}</td><td class="num inc">${x.inc ? fmt(x.inc) : '–'}</td><td class="num exp">${x.exp ? fmt(x.exp) : '–'}</td><td class="num ${x.bal >= 0 ? '' : 'exp'}">${x.inc || x.exp ? fmt(x.bal) : '–'}</td></tr>`).join('');
  const extra = `<div class="balance-row sub"><span class="muted">Promedio de gasto mensual</span><span class="val num">${fmt(avgExp)}</span></div>
    <div class="balance-row sub"><span class="muted">Acumulado total al cierre</span><span class="val num">${fmt(run)}</span></div>`;
  return summaryCard(t, extra) +
    `<section class="card chart"><h3>Mes a mes</h3><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Ingresos y gastos por mes">${bars}</svg><div class="legend"><span><i style="background:var(--inc)"></i>Ingresos</span><span><i style="background:var(--exp)"></i>Gastos</span></div></section>` +
    `<section class="card"><h3>Detalle por mes <small>toca un mes para abrirlo</small></h3><table class="table"><tr><th>Mes</th><th>Ingresos</th><th>Gastos</th><th>Saldo</th></tr>${rows}
      <tr class="total"><td>Total</td><td class="num inc">${fmt(t.inc)}</td><td class="num exp">${fmt(t.exp)}</td><td class="num">${fmt(t.bal)}</td></tr></table></section>` +
    `<section class="card"><h3>Por categoría en ${y}</h3>${kindSeg()}<div style="margin-top:8px">${catBars(list, V.kind, false)}</div></section>` +
    scopeSplit(y);
}

function viewFijos() {
  const m = thisMonth();
  const pend = pendingRecurring(m);
  const row = (r, pending) => {
    const c = cat(r.catId);
    return `<div class="row">${icoHtml(c)}<button class="mid" data-act="edit-rec" data-id="${r.id}" style="text-align:left">${esc(r.name)}${r.active === false ? ' <span class="tag acc">Pausado</span>' : ''}${r.scope === 'negocio' ? '<span class="tag biz">Negocio</span>' : ''}<small>Día ${r.day} · ${esc(c.name)} · <span class="${r.type === 'ingreso' ? 'inc' : 'exp'}">${fmt(r.amount)}</span></small></button>
      ${pending ? `<button class="chip on" data-act="pay-rec" data-id="${r.id}">Registrar</button>` : '<span class="chev">›</span>'}</div>`;
  };
  return `<div class="page-top"><h2>Pagos fijos</h2><p>Arriendo, celular, internet… Los anotas una vez y cada mes te recuerdo registrarlos con un toque.</p></div>
  <div class="page">
    ${pend.length ? `<div class="list-title">Pendientes de ${MONTHS[+m.slice(5) - 1].toLowerCase()}</div><div class="list">${pend.sort((a, b) => a.day - b.day).map(r => row(r, true)).join('')}</div>` : S.recurring.length ? '<div class="banner" style="background:var(--inc-soft)"><span style="font-size:22px">✅</span><span><b>Todo al día</b>Ya registraste los pagos fijos de este mes.</span></div>' : ''}
    <div class="list-title">Todos los pagos fijos</div>
    <div class="list">${S.recurring.length ? [...S.recurring].sort((a, b) => a.day - b.day).map(r => row(r, false)).join('') : '<div class="empty-state">Aún no tienes pagos fijos.</div>'}</div>
    <button class="btn" data-act="new-rec">+ Nuevo pago fijo</button>
  </div>`;
}

function viewAjustes() {
  const cur = CURRENCIES.find(c => c[0] === S.settings.currency);
  const catRows = type => S.categories.filter(c => c.type === type).map((c, i) => `<button class="row" data-act="edit-cat" data-id="${c.id}"><span class="slot">${i + 1}</span>${icoHtml(c)}<span class="mid">${esc(c.name)}</span><span class="chev">›</span></button>`).join('');
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  return `<div class="page-top"><h2>Ajustes</h2></div>
  <div class="page">
    ${standalone ? '' : `<div class="banner"><span style="font-size:22px">📲</span><span><b>Instálala en tu iPhone</b>En Safari toca Compartir <b style="display:inline">⎋</b> y luego “Agregar a pantalla de inicio”.</span></div>`}
    <div class="list-title">Exportar y respaldo</div>
    <div class="list">
      <button class="row" data-act="export"><span class="ico" style="background:#1f7a4522">📊</span><span class="mid">Exportar a Excel / CSV<small>Para tu contabilidad, por mes, año o rango</small></span><span class="chev">›</span></button>
      <button class="row" data-act="backup"><span class="ico" style="background:#2f80ed22">☁️</span><span class="mid">Copia de seguridad<small>${S.settings.lastBackup ? 'Última: ' + new Date(S.settings.lastBackup).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' }) : 'Nunca'} · guárdala en iCloud Drive</small></span><span class="chev">›</span></button>
      <button class="row" data-act="import"><span class="ico" style="background:#8e5cd922">📥</span><span class="mid">Restaurar o importar<small>Copia de seguridad o historial</small></span><span class="chev">›</span></button>
    </div>
    <div class="list-title">Categorías de ingreso (6)</div><div class="list">${catRows('ingreso')}</div>
    <div class="list-title">Categorías de gasto (15)</div><div class="list">${catRows('gasto')}</div>
    <div class="list-title">Cuentas</div>
    <div class="list">${S.accounts.map(a => `<button class="row" data-act="edit-acc" data-id="${a.id}"><span class="ico" style="background:var(--card-2)">${esc(a.icon)}</span><span class="mid">${esc(a.name)}</span><span class="end num">${fmt(accountBalance(a))}</span><span class="chev">›</span></button>`).join('')}
      <button class="row" data-act="new-acc"><span class="ico" style="background:var(--card-2)">＋</span><span class="mid link">Agregar cuenta</span></button></div>
    <p class="hint" style="margin:0 4px">Las cuentas son solo etiquetas (Efectivo, Banco, Nequi…). La app nunca se conecta a tus bancos.</p>
    <div class="list-title">General</div>
    <div class="list">
      <button class="row" data-act="currency"><span class="ico" style="background:var(--card-2)">${cur ? cur[2] : '💱'}</span><span class="mid">Moneda</span><span class="end">${esc(S.settings.currency)}</span><span class="chev">›</span></button>
      <button class="row danger" data-act="wipe"><span class="ico" style="background:var(--exp-soft)">🗑️</span><span class="mid">Borrar todos los datos</span></button>
    </div>
    <p class="hint" style="text-align:center">Mi Dinero ${APP_VERSION} · ${S.txs.length} movimientos guardados solo en este dispositivo.</p>
  </div>`;
}

const VIEWS = { inicio: viewInicio, balances: viewBalances, fijos: viewFijos, ajustes: viewAjustes };
function render() {
  document.getElementById('view').innerHTML = VIEWS[V.tab]();
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === V.tab));
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
const confirmDelete = (what) => ask(`¿Eliminar ${what}?`, 'Esta acción no se puede deshacer.', [{ label: 'Eliminar', style: 'danger', value: true }, { label: 'Cancelar', style: 'sec', value: false }]);

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
const prettyExpr = e => e.replace(/\d+/g, (d, off, s) => (s[off - 1] === ',' ? d : (+d).toLocaleString('es-CO')));
function amountToExpr(a) { const [i, d] = String(round2(a)).split('.'); return d ? `${i},${d}` : i; }

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
    <div class="sheet-head"><button data-act="close">Cancelar</button><h3>${tx ? 'Cambiar categoría' : E.type === 'gasto' ? 'Nuevo gasto' : 'Nuevo ingreso'}</h3><button data-act="${E.catId ? 'to-detail' : 'close'}" style="visibility:${E.catId ? 'visible' : 'hidden'}">Listo</button></div>
    <div class="sheet-body">
      <div class="type-seg"><button class="g ${E.type === 'gasto' ? 'on' : ''}" data-act="type" data-v="gasto">− Gasto</button><button class="i ${E.type === 'ingreso' ? 'on' : ''}" data-act="type" data-v="ingreso">+ Ingreso</button></div>
      <div class="cat-grid">${catsOf(E.type).map(c => `<button class="cat-btn ${E.catId === c.id ? 'on' : ''}" data-act="pick-cat" data-id="${c.id}">${icoHtml(c)}<span>${esc(c.name)}</span></button>`).join('')}</div>
    </div>`;
  const renderDetail = () => {
    const c = cat(E.catId);
    const hasOp = /[+−×÷]/.test(E.expr);
    const val = evalExpr(E.expr);
    const keys = [['7', '8', '9', '÷'], ['4', '5', '6', '×'], ['1', '2', '3', '−'], [',', '0', '000', '+']];
    return `
    <div class="sheet-head"><button data-act="close">Cancelar</button><h3>${tx ? 'Editar' : E.type === 'gasto' ? 'Nuevo gasto' : 'Nuevo ingreso'}</h3>${tx ? '<button data-act="delete" style="color:var(--exp)">Eliminar</button>' : '<button></button>'}</div>
    <div class="entry">
      <div class="entry-scroll">
        <button class="chosen" data-act="to-cats">${icoHtml(c)}<span class="mid">${esc(c.name)}<small>${E.type === 'gasto' ? 'Gasto' : 'Ingreso'} · toca para cambiar</small></span><span class="chev">›</span></button>
        <div class="amount ${E.type === 'gasto' ? 'g' : 'i'}"><div class="expr num">${hasOp ? esc(prettyExpr(E.expr)) + ' =' : '&nbsp;'}</div><div class="big num">${fmt(val)}</div></div>
        <div class="pick-label">¿Es personal o del negocio?</div>
        <div class="scope2"><button class="p ${E.scope === 'personal' ? 'on' : ''}" data-act="scope-e" data-v="personal">👤 Personal</button><button class="n ${E.scope === 'negocio' ? 'on' : ''}" data-act="scope-e" data-v="negocio">💼 Negocio</button></div>
        <div class="pick-label">${E.type === 'gasto' ? '¿Con qué pagaste?' : '¿Dónde lo recibiste?'}</div>
        ${accPicker(E.accountId, 'acc-e')}
        <div class="field"><label>Fecha</label><input type="date" name="date" value="${E.date}" required></div>
        <div class="field"><label>Nota</label><input type="text" name="note" value="${esc(E.note)}" placeholder="Ej: mercado en el D1" enterkeyhint="done" autocomplete="off"></div>
        <div class="photo-row">${E.photoUrl && !E.removePhoto ? `<img class="thumb" src="${E.photoUrl}" data-act="view-photo" alt="Recibo"><button class="chip" data-act="photo">Cambiar foto</button><button class="chip" data-act="rm-photo">Quitar</button>` : '<button class="chip" data-act="photo">📷 Foto del recibo</button>'}</div>
      </div>
      <div class="keypad">
        ${keys.map(r => r.map(k => `<button class="${/[+−×÷]/.test(k) ? 'op' : ''}" data-act="key" data-v="${k}">${k}</button>`).join('')).join('')}
        <button class="op" data-act="key" data-v="C">C</button><button class="op" data-act="key" data-v="⌫">⌫</button>
        <button class="save" data-act="save">${hasOp ? '=' : 'Guardar'}</button>
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
      s.close(); render(); toast('Movimiento eliminado');
    },
    save: async (b, s) => {
      if (/[+−×÷]/.test(E.expr)) { E.expr = amountToExpr(evalExpr(E.expr)); s.refresh(); return; }
      const amount = evalExpr(E.expr);
      if (!(amount > 0)) { toast('Escribe un monto mayor a cero'); return; }
      if (!E.catId) { E.step = 'cat'; s.refresh(); return; }
      if (!/^\d{4}-\d\d-\d\d$/.test(E.date)) { toast('Elige una fecha'); return; }
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
      toast(tx ? 'Cambios guardados' : `${E.type === 'gasto' ? 'Gasto' : 'Ingreso'} de ${fmt(amount)} guardado`);
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
  openSheet({ render: () => `<div class="sheet-head"><button></button><h3>Recibo</h3><button data-act="close">Cerrar</button></div><div class="sheet-body"><img class="big-photo" src="${url}" alt="Recibo"></div>`, actions: { close: (b, s) => s.close() } });
}

function openCatDetail(catId) {
  const m = V.month;
  const c = cat(catId);
  const list = txIn(m).filter(t => t.catId === catId).sort(byDateDesc);
  openSheet({
    render: () => `<div class="sheet-head"><button></button><h3>${esc(c.icon)} ${esc(c.name)}</h3><button data-act="close">Cerrar</button></div>
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
    render: () => `<div class="sheet-head"><button data-act="close">Cancelar</button><h3>Categoría</h3><button data-act="save">Guardar</button></div>
      <div class="sheet-body">
        <div class="preview"><span class="ico" style="background:${st.color}22">${esc(st.icon)}</span><span class="muted" style="font-size:13px">${c.type === 'gasto' ? 'Gasto' : 'Ingreso'} · ${used} movimientos</span></div>
        <div class="field"><label>Nombre</label><input type="text" name="name" value="${esc(st.name)}" maxlength="28" autocomplete="off"></div>
        <div class="list-title">Color</div>
        <div class="colors">${COLORS.map(k => `<button data-act="color" data-v="${k}" class="${st.color === k ? 'on' : ''}" style="background:${k}" aria-label="Color ${k}"></button>`).join('')}</div>
        <div class="list-title">Ícono</div>
        <div class="icon-grid">${ICONS.map(i => `<button data-act="icon" data-v="${i}" class="${st.icon === i ? 'on' : ''}">${i}</button>`).join('')}</div>
        <p class="hint">Si cambias el nombre, los movimientos que ya tienes en esta categoría se quedan en ella con el nombre nuevo.</p>
      </div>`,
    onInput: e => { if (e.target.name === 'name') st.name = e.target.value; },
    actions: {
      close: (b, s) => s.close(),
      color: (b, s) => { st.color = b.dataset.v; s.refresh(); },
      icon: (b, s) => { st.icon = b.dataset.v; s.refresh(); },
      save: async (b, s) => {
        if (!st.name.trim()) { toast('Escribe un nombre'); return; }
        Object.assign(c, { name: st.name.trim(), icon: st.icon, color: st.color });
        await persist.categories();
        s.close(); render(); toast('Categoría actualizada');
      },
    },
  });
}

function openAccEditor(id) {
  const a = id ? S.accounts.find(x => x.id === id) : null;
  const st = { name: a?.name || '', icon: a?.icon || '💳', initial: a?.initial ? amountToExpr(a.initial) : '' };
  const ACC_ICONS = ['💵', '🏦', '📱', '💳', '🪙', '💰', '👛', '🐷', '💼', '🏧', '🌎', '📈'];
  openSheet({
    render: () => `<div class="sheet-head"><button data-act="close">Cancelar</button><h3>${a ? 'Cuenta' : 'Nueva cuenta'}</h3><button data-act="save">Guardar</button></div>
      <div class="sheet-body">
        <div class="field"><label>Nombre</label><input type="text" name="name" value="${esc(st.name)}" placeholder="Ej: Nequi" maxlength="24" autocomplete="off"></div>
        <div class="field"><label>Saldo inicial</label><input type="text" inputmode="decimal" name="initial" value="${esc(st.initial)}" placeholder="0"></div>
        <div class="icon-grid">${ACC_ICONS.map(i => `<button data-act="icon" data-v="${i}" class="${st.icon === i ? 'on' : ''}">${i}</button>`).join('')}</div>
        <p class="hint">El saldo de la cuenta es el saldo inicial más los ingresos y menos los gastos que registres con esta cuenta. No se conecta a ningún banco.</p>
        ${a ? '<button class="btn danger" data-act="delete">Eliminar cuenta</button>' : ''}
      </div>`,
    onInput: e => { if (e.target.name in st) st[e.target.name] = e.target.value; },
    actions: {
      close: (b, s) => s.close(),
      icon: (b, s) => { st.icon = b.dataset.v; s.refresh(); },
      save: async (b, s) => {
        if (!st.name.trim()) { toast('Escribe un nombre'); return; }
        const initial = parseFloat(String(st.initial).replace(/\./g, '').replace(',', '.')) || 0;
        if (a) Object.assign(a, { name: st.name.trim(), icon: st.icon, initial });
        else S.accounts.push({ id: uid(), name: st.name.trim(), icon: st.icon, initial });
        await persist.accounts();
        s.close(); render(); toast('Cuenta guardada');
      },
      delete: async (b, s) => {
        const n = S.txs.filter(t => t.accountId === a.id).length;
        if (!(await ask('¿Eliminar esta cuenta?', n ? `Tiene ${n} movimientos. Los movimientos no se borran, solo quedan “sin cuenta”.` : '', [{ label: 'Eliminar', style: 'danger', value: true }, { label: 'Cancelar', style: 'sec', value: false }]))) return;
        S.accounts = S.accounts.filter(x => x.id !== a.id);
        const changed = S.txs.filter(t => t.accountId === a.id).map(t => ({ ...t, accountId: null }));
        changed.forEach(t => { S.txs[S.txs.findIndex(x => x.id === t.id)] = t; });
        await db.putMany('txs', changed);
        await persist.accounts();
        s.close(); render(); toast('Cuenta eliminada');
      },
    },
  });
}

function openCurrency() {
  openSheet({
    render: () => `<div class="sheet-head"><button></button><h3>Moneda</h3><button data-act="close">Listo</button></div>
      <div class="sheet-body"><div class="list">${CURRENCIES.map(([code, name, flag]) => `<button class="row" data-act="pick" data-v="${code}"><span style="font-size:24px">${flag}</span><span class="mid">${esc(name)}<small>${code}</small></span>${S.settings.currency === code ? '<span class="link">✓</span>' : ''}</button>`).join('')}</div>
      <p class="hint">Cambia el símbolo y el formato con que se muestran los montos. No convierte los valores ya registrados.</p></div>`,
    actions: {
      close: (b, s) => s.close(),
      pick: async (b, s) => { S.settings.currency = b.dataset.v; await persist.settings(); s.refresh(); render(); },
    },
  });
}

// ---------- pagos fijos ----------
function openRecEditor(id) {
  const r = id ? S.recurring.find(x => x.id === id) : null;
  const st = r ? { ...r, amountTxt: amountToExpr(r.amount) } : { name: '', type: 'gasto', catId: null, amountTxt: '', day: new Date().getDate(), scope: S.settings.lastScope || 'personal', accountId: null, active: true };
  openSheet({
    render: () => `<div class="sheet-head"><button data-act="close">Cancelar</button><h3>${r ? 'Pago fijo' : 'Nuevo pago fijo'}</h3><button data-act="save">Guardar</button></div>
      <div class="sheet-body">
        <div class="type-seg"><button class="g ${st.type === 'gasto' ? 'on' : ''}" data-act="type" data-v="gasto">− Gasto</button><button class="i ${st.type === 'ingreso' ? 'on' : ''}" data-act="type" data-v="ingreso">+ Ingreso</button></div>
        <div class="field"><label>Nombre</label><input type="text" name="name" value="${esc(st.name)}" placeholder="Ej: Arriendo" maxlength="40" autocomplete="off"></div>
        <div class="field"><label>Monto</label><input type="text" inputmode="decimal" name="amountTxt" value="${esc(st.amountTxt)}" placeholder="0"></div>
        <div class="field"><label>Día del mes</label><select name="day">${Array.from({ length: 31 }, (_, i) => `<option ${+st.day === i + 1 ? 'selected' : ''}>${i + 1}</option>`).join('')}</select></div>
        <div class="list-title">Categoría</div>
        <div class="chips" style="flex-wrap:wrap">${S.categories.filter(c => c.type === st.type).map(c => `<button class="chip ${st.catId === c.id ? 'on' : ''}" data-act="cat" data-v="${c.id}">${esc(c.icon)} ${esc(c.name)}</button>`).join('')}</div>
        <div class="pick-label">¿Es personal o del negocio?</div>
        <div class="scope2"><button class="p ${st.scope === 'personal' ? 'on' : ''}" data-act="scope-r" data-v="personal">👤 Personal</button><button class="n ${st.scope === 'negocio' ? 'on' : ''}" data-act="scope-r" data-v="negocio">💼 Negocio</button></div>
        <div class="pick-label">¿Con qué se paga?</div>
        ${accPicker(st.accountId, 'acc-r')}
        ${r ? `<button class="btn sec" data-act="toggle">${st.active === false ? '▶︎ Reactivar' : '⏸ Pausar'}</button><button class="btn danger" data-act="delete">Eliminar pago fijo</button>` : ''}
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
        const amount = parseFloat(String(st.amountTxt).replace(/\./g, '').replace(',', '.')) || 0;
        if (!st.name.trim()) return toast('Escribe un nombre');
        if (!(amount > 0)) return toast('Escribe el monto');
        if (!st.catId) return toast('Elige una categoría');
        const rec = { id: r?.id || uid(), name: st.name.trim(), type: st.type, catId: st.catId, amount, day: +st.day, scope: st.scope, accountId: st.accountId, active: st.active !== false, startMonth: r?.startMonth || thisMonth() };
        if (r) Object.assign(r, rec); else S.recurring.push(rec);
        await persist.recurring();
        s.close(); render(); toast('Pago fijo guardado');
      },
      delete: async (b, s) => {
        if (!(await confirmDelete('este pago fijo'))) return;
        S.recurring = S.recurring.filter(x => x.id !== r.id);
        await persist.recurring();
        s.close(); render(); toast('Pago fijo eliminado');
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
    if (st.period === 'año') return [`${st.year}-01-01`, `${st.year}-12-31`, `Año ${st.year}`];
    if (st.period === 'rango') return [st.from, st.to, `${shortDate(st.from)} a ${shortDate(st.to)}`];
    return ['0000-01-01', '9999-12-31', 'Todo el historial'];
  };
  const selected = () => { const [a, b] = range(); return S.txs.filter(t => t.date >= a && t.date <= b && (st.scope === 'todo' || t.scope === st.scope)).sort((p, q) => p.date.localeCompare(q.date)); };
  const monthOpts = () => { const set = new Set(S.txs.map(t => t.date.slice(0, 7)).concat(thisMonth())); return [...set].sort().reverse().map(m => `<option value="${m}" ${st.month === m ? 'selected' : ''}>${monthLabel(m)}</option>`).join(''); };
  openSheet({
    render: () => `<div class="sheet-head"><button></button><h3>Exportar</h3><button data-act="close">Cerrar</button></div>
      <div class="sheet-body">
        <div class="list-title">Periodo</div>
        <div class="chips">${[['mes', 'Un mes'], ['año', 'Un año'], ['rango', 'Rango de fechas'], ['todo', 'Todo']].map(([k, l]) => `<button class="chip ${st.period === k ? 'on' : ''}" data-act="period" data-v="${k}">${l}</button>`).join('')}</div>
        ${st.period === 'mes' ? `<div class="field"><label>Mes</label><select name="month">${monthOpts()}</select></div>` : ''}
        ${st.period === 'año' ? `<div class="field"><label>Año</label><select name="year">${years.map(v => `<option ${st.year === v ? 'selected' : ''}>${v}</option>`).join('')}</select></div>` : ''}
        ${st.period === 'rango' ? `<div class="field"><label>Desde</label><input type="date" name="from" value="${st.from}"></div><div class="field"><label>Hasta</label><input type="date" name="to" value="${st.to}"></div>` : ''}
        <div class="list-title">Qué incluir</div>
        <div class="chips">${[['todo', 'Todo'], ['personal', '👤 Personal'], ['negocio', '💼 Negocio']].map(([k, l]) => `<button class="chip ${st.scope === k ? 'on' : ''}" data-act="scope-x" data-v="${k}">${l}</button>`).join('')}</div>
        <div class="card"><b>${selected().length}</b> movimientos · ${esc(range()[2])}</div>
        <button class="btn" data-act="xlsx">📊 Exportar a Excel (.xlsx)</button>
        <button class="btn sec" data-act="csv">📄 Exportar a CSV</button>
        <p class="hint">El Excel trae 4 hojas: <b>Movimientos</b> (cada registro con fecha, tipo, categoría, personal/negocio, cuenta y nota), <b>Resumen mensual</b>, <b>Por categoría</b> y <b>Personal y negocio</b>. Luego puedes guardarlo en Archivos, enviarlo por WhatsApp o correo a tu contador.</p>
      </div>`,
    onInput: (e, s) => { if (e.target.name in st) { st[e.target.name] = e.target.value; if (e.type === 'change') s.refresh(); } },
    actions: {
      close: (b, s) => s.close(),
      period: (b, s) => { st.period = b.dataset.v; s.refresh(); },
      'scope-x': (b, s) => { st.scope = b.dataset.v; s.refresh(); },
      xlsx: async () => {
        const list = selected();
        if (!list.length) return toast('No hay movimientos en ese periodo');
        const [, , label] = range();
        const blob = buildXlsx(excelSheets(list, label, st.scope));
        await shareFile(blob, `MiDinero ${label.replace(/[\/\\:]/g, '-')}.xlsx`);
      },
      csv: async () => {
        const list = selected();
        if (!list.length) return toast('No hay movimientos en ese periodo');
        const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
        const lines = [['Fecha', 'Tipo', 'Categoría', 'Personal/Negocio', 'Cuenta', 'Nota', 'Ingreso', 'Gasto'].map(q).join(';')];
        for (const t of list) lines.push([t.date.split('-').reverse().join('/'), t.type === 'ingreso' ? 'Ingreso' : 'Gasto', cat(t.catId).name, t.scope === 'negocio' ? 'Negocio' : 'Personal', ACC[t.accountId]?.name || '', t.note, t.type === 'ingreso' ? String(t.amount).replace('.', ',') : '', t.type === 'gasto' ? String(t.amount).replace('.', ',') : ''].map(q).join(';'));
        const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
        await shareFile(blob, `MiDinero ${range()[2].replace(/[\/\\:]/g, '-')}.csv`);
      },
    },
  });
}

function excelSheets(list, label, scope) {
  const scopeTxt = { todo: 'Personal y negocio', personal: 'Solo personal', negocio: 'Solo negocio' }[scope];
  const sub = `${label} · ${scopeTxt} · Moneda: ${S.settings.currency} · Generado el ${new Date().toLocaleDateString('es-CO')}`;
  const tot = totals(list);
  // Movimientos
  const mov = [
    [{ v: 'Mi Dinero — Movimientos', s: 't' }], [sub], [],
    ['Fecha', 'Tipo', 'Categoría', 'Personal / Negocio', 'Cuenta', 'Nota', 'Ingreso', 'Gasto'].map(v => ({ v, s: 'h' })),
    ...list.map(t => [{ v: t.date, s: 'd' }, t.type === 'ingreso' ? 'Ingreso' : 'Gasto', cat(t.catId).name, t.scope === 'negocio' ? 'Negocio' : 'Personal', ACC[t.accountId]?.name || '', t.note || '',
      t.type === 'ingreso' ? { v: t.amount, s: 'mi' } : null, t.type === 'gasto' ? { v: t.amount, s: 'mg' } : null]),
    [{ v: 'TOTAL', s: 'b' }, { v: '', s: 'b' }, { v: '', s: 'b' }, { v: '', s: 'b' }, { v: '', s: 'b' }, { v: `Saldo: ${fmt(tot.bal)}`, s: 'b' }, { v: tot.inc, s: 'mb' }, { v: tot.exp, s: 'mb' }],
  ];
  // Resumen mensual
  const months = [...new Set(list.map(t => t.date.slice(0, 7)))].sort();
  let acc = 0;
  const res = [[{ v: 'Resumen mensual', s: 't' }], [sub], [], ['Mes', 'Ingresos', 'Gastos', 'Saldo del mes', 'Saldo acumulado'].map(v => ({ v, s: 'h' }))];
  for (const m of months) { const t = totals(list.filter(x => x.date.startsWith(m))); acc = round2(acc + t.bal); res.push([monthLabel(m), { v: t.inc, s: 'mi' }, { v: t.exp, s: 'mg' }, { v: t.bal, s: 'm' }, { v: acc, s: 'm' }]); }
  res.push([{ v: 'TOTAL', s: 'b' }, { v: tot.inc, s: 'mb' }, { v: tot.exp, s: 'mb' }, { v: tot.bal, s: 'mb' }, { v: '', s: 'b' }]);
  // Por categoría (filas = categorías, columnas = meses)
  const head = ['Categoría', ...months.map(m => { const [y, mo] = m.split('-'); return `${MONTHS_SHORT[+mo - 1]} ${y}`; }), 'Total'].map(v => ({ v, s: 'h' }));
  const catRows = kind => S.categories.filter(c => c.type === kind).map(c => {
    const vals = months.map(m => round2(list.filter(t => t.catId === c.id && t.date.startsWith(m)).reduce((a, t) => a + t.amount, 0)));
    const total = round2(vals.reduce((a, b) => a + b, 0));
    return total ? [c.name, ...vals.map(v => (v ? { v, s: 'm' } : null)), { v: total, s: 'mb' }] : null;
  }).filter(Boolean);
  const sumRow = (name, kind) => [{ v: name, s: 'b' }, ...months.map(m => ({ v: totals(list.filter(t => t.date.startsWith(m) && t.type === kind))[kind === 'ingreso' ? 'inc' : 'exp'], s: 'mb' })), { v: kind === 'ingreso' ? tot.inc : tot.exp, s: 'mb' }];
  const porCat = [[{ v: 'Por categoría', s: 't' }], [sub], [], [{ v: 'INGRESOS', s: 'b' }], head, ...catRows('ingreso'), sumRow('Total ingresos', 'ingreso'), [], [{ v: 'GASTOS', s: 'b' }], head, ...catRows('gasto'), sumRow('Total gastos', 'gasto')];
  // Personal y negocio
  const pn = [[{ v: 'Personal y negocio', s: 't' }], [sub], [], ['Mes', 'Ingresos personal', 'Gastos personal', 'Saldo personal', 'Ingresos negocio', 'Gastos negocio', 'Saldo negocio'].map(v => ({ v, s: 'h' }))];
  const pnRow = (name, l, bold) => { const p = totals(l.filter(t => t.scope !== 'negocio')), n = totals(l.filter(t => t.scope === 'negocio')); const s = bold ? 'mb' : 'm'; return [bold ? { v: name, s: 'b' } : name, { v: p.inc, s }, { v: p.exp, s }, { v: p.bal, s }, { v: n.inc, s }, { v: n.exp, s }, { v: n.bal, s }]; };
  for (const m of months) pn.push(pnRow(monthLabel(m), list.filter(t => t.date.startsWith(m))));
  pn.push(pnRow('TOTAL', list, true));
  return [
    { name: 'Movimientos', rows: mov, cols: [12, 9, 20, 17, 14, 44, 15, 15], freeze: 4, filter: true, title: true },
    { name: 'Resumen mensual', rows: res, cols: [18, 16, 16, 16, 18], freeze: 4, title: true },
    { name: 'Por categoría', rows: porCat, cols: [22, ...months.map(() => 13), 15], freeze: 0, title: true },
    { name: 'Personal y negocio', rows: pn, cols: [18, 17, 17, 17, 17, 17, 17], freeze: 4, title: true },
  ];
}

// ---------- respaldo ----------
const blobToDataUrl = b => new Promise(r => { const f = new FileReader(); f.onload = () => r(f.result); f.readAsDataURL(b); });

async function openBackup() {
  const nPhotos = (await db.keys('photos')).length;
  openSheet({
    render: () => `<div class="sheet-head"><button></button><h3>Copia de seguridad</h3><button data-act="close">Cerrar</button></div>
      <div class="sheet-body">
        <div class="card" style="text-align:center"><div style="font-size:44px">☁️</div>
          <div style="font-size:20px;font-weight:800;margin-top:4px">${S.txs.length} movimientos</div>
          <div class="muted" style="font-size:14px">${nPhotos} fotos de recibos · ${S.recurring.length} pagos fijos · tus categorías y cuentas</div>
          <div class="muted" style="font-size:13px;margin-top:8px">${S.settings.lastBackup ? 'Última copia: ' + new Date(S.settings.lastBackup).toLocaleString('es-CO', { dateStyle: 'long', timeStyle: 'short' }) : 'Aún no has guardado ninguna copia'}</div></div>
        <button class="btn" data-act="go">Guardar copia</button>
        <div class="card"><h3>¿Cómo se guarda?</h3><p class="hint" style="margin:0">Toca <b>Guardar copia</b> → <b>Guardar en Archivos</b> → elige <b>iCloud Drive</b> → <b>Guardar</b>. Para recuperar todo en otro iPhone: Ajustes → Restaurar o importar.</p></div>
        <div class="card"><h3>¿Por qué el archivo se ve como código?</h3><p class="hint" style="margin:0">La copia es un archivo hecho para que <b>Mi Dinero</b> lo lea, no para leerlo tú. Si lo abres verás texto técnico: es normal, así guarda todo sin perder nada. Para ver tus números de forma clara usa <b>Exportar a Excel</b>.</p></div>
        <p class="hint" style="text-align:center;margin:0">🔒 Tus datos solo están en este iPhone y en tu propia cuenta de iCloud.</p>
      </div>`,
    actions: { close: (b, s) => s.close(), go: async (b, s) => { s.close(); await doBackup(); } },
  });
}

async function doBackup() {
  toast('Preparando copia…');
  const photos = {};
  for (const k of await db.keys('photos')) { const b = await db.get('photos', k); if (b) photos[k] = await blobToDataUrl(b); }
  const data = { app: 'mi-dinero', kind: 'respaldo', version: 1, exportedAt: new Date().toISOString(), settings: S.settings, categories: S.categories, accounts: S.accounts, recurring: S.recurring, txs: S.txs, photos };
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
  const ok = await shareFile(blob, `MiDinero-respaldo-${today()}.json`);
  if (ok) { S.settings.lastBackup = Date.now(); await persist.settings(); render(); toast('Copia lista. Guárdala en iCloud Drive.'); }
}

async function doImport() {
  const f = await pickFile(document.getElementById('file-import'));
  if (!f) return;
  let data;
  try { data = JSON.parse(await f.text()); } catch { return toast('Ese archivo no es una copia de Mi Dinero'); }
  if (data?.app !== 'mi-dinero' || !Array.isArray(data.txs)) return toast('Ese archivo no es una copia de Mi Dinero');
  const existing = new Set(S.txs.map(t => t.id));
  const nuevos = data.txs.filter(t => !existing.has(t.id));
  let mode = 'merge';
  if (data.kind === 'respaldo') {
    mode = await ask('Restaurar copia', `Copia del ${new Date(data.exportedAt).toLocaleString('es-CO')} con ${data.txs.length} movimientos.`, [
      { label: 'Agregar a mis datos', value: 'merge' }, { label: 'Reemplazar todo', style: 'danger', value: 'replace' }, { label: 'Cancelar', style: 'sec', value: null }]);
    if (!mode) return;
  } else {
    const ok = await ask('Importar historial', `${data.txs.length} movimientos en el archivo, ${nuevos.length} son nuevos. Los que ya tienes no se duplican.`, [{ label: `Importar ${nuevos.length}`, value: true }, { label: 'Cancelar', style: 'sec', value: false }]);
    if (!ok) return;
  }
  if (mode === 'replace') {
    await db.clear();
    S.settings = { ...data.settings, lastBackup: data.settings?.lastBackup || null };
    S.categories = data.categories || structuredClone(DEFAULT_CATEGORIES);
    S.accounts = data.accounts || structuredClone(DEFAULT_ACCOUNTS);
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
  toast(mode === 'replace' ? `Copia restaurada: ${S.txs.length} movimientos` : `${nuevos.length} movimientos importados`);
}

async function wipe() {
  const a = await ask('¿Borrar todos los datos?', 'Se eliminan todos tus movimientos, pagos fijos y fotos de este dispositivo. Guarda antes una copia de seguridad.', [{ label: 'Guardar copia primero', value: 'backup' }, { label: 'Borrar todo', style: 'danger', value: 'wipe' }, { label: 'Cancelar', style: 'sec', value: null }]);
  if (a === 'backup') return openBackup();
  if (a !== 'wipe') return;
  if (!(await ask('¿Seguro?', 'Esta es la última confirmación.', [{ label: 'Sí, borrar todo', style: 'danger', value: true }, { label: 'Cancelar', style: 'sec', value: false }]))) return;
  await db.clear();
  await load();
  render(); toast('Datos borrados');
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
  new: b => openEntry({ type: b.dataset.v }),
  'edit-tx': b => openEntry({ tx: S.txs.find(t => t.id === b.dataset.id) }),
  'cat-detail': b => openCatDetail(b.dataset.id),
  'edit-cat': b => openCatEditor(b.dataset.id),
  'edit-acc': b => openAccEditor(b.dataset.id),
  'new-acc': () => openAccEditor(null),
  'new-rec': () => openRecEditor(null),
  'edit-rec': b => openRecEditor(b.dataset.id),
  'pay-rec': b => payRecurring(b.dataset.id),
  currency: () => openCurrency(),
  export: () => openExport(),
  backup: () => openBackup(),
  import: () => doImport(),
  wipe: () => wipe(),
};
document.getElementById('view').addEventListener('click', e => { const b = e.target.closest('[data-act]'); if (b) MAIN[b.dataset.act]?.(b); });
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
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('./sw.js').catch(() => {});
})();
