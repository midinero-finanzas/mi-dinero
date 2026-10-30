// Idiomas de Mi Dinero. El texto fuente está en español; aquí van sus traducciones.
import { DEFAULT_CATEGORIES, DEFAULT_ACCOUNTS, MONTHS, MONTHS_SHORT, WEEKDAYS } from './data.js';

export const LANGS = [['es', 'Español', 'Spanish'], ['en', 'English', 'Inglés'], ['pt', 'Português (Brasil)', 'Portugués']];
const LOCALES = { es: 'es-CO', en: 'en-US', pt: 'pt-BR' };
let LANG = 'es';

export const lang = () => LANG;
export const locale = () => LOCALES[LANG];
export function setLang(l) {
  LANG = LOCALES[l] ? l : 'es';
  document.documentElement.lang = LANG;
}
export function detectLang() {
  const n = (navigator.languages?.[0] || navigator.language || 'es').toLowerCase();
  return n.startsWith('pt') ? 'pt' : n.startsWith('en') ? 'en' : 'es';
}

// t('Te quedan {n} días', { n: 3 })
export function t(s, vars) {
  let r = LANG === 'es' ? s : DICT[LANG][s] ?? s;
  if (vars) for (const [k, v] of Object.entries(vars)) r = r.split(`{${k}}`).join(v);
  return r;
}

// ---------- fechas y números ----------
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
export const monthName = i => (LANG === 'es' ? MONTHS[i] : cap(new Date(2000, i, 1).toLocaleDateString(locale(), { month: 'long' })));
export const monthShort = i => (LANG === 'es' ? MONTHS_SHORT[i] : new Date(2000, i, 1).toLocaleDateString(locale(), { month: 'short' }).replace('.', '').toLowerCase());
// semana desde el lunes (3 de enero de 2000 fue lunes)
export const weekdays = () => (LANG === 'es' ? WEEKDAYS : Array.from({ length: 7 }, (_, i) => cap(new Date(2000, 0, 3 + i).toLocaleDateString(locale(), { weekday: 'short' }).replace('.', '').slice(0, 3))));
export const decSep = () => (LANG === 'en' ? '.' : ',');
// Montos escritos en campos de texto: 1.500,50 (es, pt) o 1,500.50 (en)
export function parseNum(s) {
  s = String(s ?? '').trim();
  s = LANG === 'en' ? s.replace(/,/g, '') : s.replace(/\./g, '').replace(',', '.');
  return parseFloat(s) || 0;
}
export function currencyName(code, fallback) {
  if (LANG === 'es') return fallback;
  try { const n = new Intl.DisplayNames([locale()], { type: 'currency' }).of(code); return n && n !== code ? cap(n) : fallback; } catch { return fallback; }
}

// ---------- nombres por defecto de categorías y cuentas ----------
const NAMES = {
  es: Object.fromEntries([...DEFAULT_CATEGORIES, ...DEFAULT_ACCOUNTS].map(x => [x.id, x.name])),
  en: {
    i1: 'Salary', i2: 'Sales', i3: 'Tips', i4: 'Rental income', i5: 'Investment returns', i6: 'Other income',
    g1: 'Home', g2: 'Bills', g3: 'Food', g4: 'General', g5: 'Gifts', g6: 'Gas', g7: 'Health', g8: 'Offerings',
    g9: 'Entertainment', g10: 'Clothing', g11: 'Investments', g12: 'Shopping', g13: 'Barbero Millonario', g14: 'Transportation', g15: 'Other expenses',
    a1: 'Cash', a2: 'Bank', a3: 'Digital wallet',
  },
  pt: {
    i1: 'Salário', i2: 'Vendas', i3: 'Gorjetas', i4: 'Aluguéis', i5: 'Retorno de investimento', i6: 'Outras receitas',
    g1: 'Casa', g2: 'Contas', g3: 'Alimentação', g4: 'Geral', g5: 'Presentes', g6: 'Combustível', g7: 'Saúde', g8: 'Ofertas',
    g9: 'Entretenimento', g10: 'Roupas', g11: 'Investimentos', g12: 'Compras', g13: 'Barbero Millonario', g14: 'Transporte', g15: 'Outras despesas',
    a1: 'Dinheiro', a2: 'Banco', a3: 'Carteira digital',
  },
};
const named = list => list.map(x => ({ ...x, name: NAMES[LANG][x.id] || x.name }));
export const defaultCategories = () => named(structuredClone(DEFAULT_CATEGORIES));
export const defaultAccounts = () => named(structuredClone(DEFAULT_ACCOUNTS));
// Al cambiar de idioma solo se traducen los nombres que el usuario no ha cambiado
export function relabel(items) {
  let changed = false;
  for (const x of items) {
    const isDefault = Object.values(NAMES).some(n => n[x.id] === x.name);
    const name = NAMES[LANG][x.id];
    if (isDefault && name && x.name !== name) { x.name = name; changed = true; }
  }
  return changed;
}

// ---------- traducciones ----------
const DICT = {
  en: {
    // general
    'Inicio': 'Home', 'Balances': 'Reports', 'Pagos fijos': 'Recurring', 'Ajustes': 'Settings',
    'Ingresos': 'Income', 'Gastos': 'Expenses', 'Ingreso': 'Income', 'Gasto': 'Expense', 'Saldo': 'Balance',
    'Todo': 'All', '👤 Personal': '👤 Personal', '💼 Negocio': '💼 Business', 'Personal': 'Personal', 'Negocio': 'Business',
    'Sin categoría': 'No category', 'Sin cuenta': 'No account', 'Cancelar': 'Cancel', 'Guardar': 'Save', 'Cerrar': 'Close',
    'Listo': 'Done', 'Eliminar': 'Delete', 'Nombre': 'Name', 'Activar': 'Turn on', 'Ahora no': 'Not now', 'Ver ›': 'View ›',
    'Guardar ›': 'Save ›', 'Activar ›': 'Activate ›', 'Instalar ›': 'Install ›', 'Mes': 'Month', 'Año': 'Year', 'Total': 'Total',
    'Esta acción no se puede deshacer.': 'This can’t be undone.', '¿Eliminar {x}?': 'Delete {x}?',
    // inicio
    'Mes anterior': 'Previous month', 'Mes siguiente': 'Next month', 'Saldo del mes': 'Month balance', 'Acumulado al cierre': 'Running balance at month end',
    '1 pago fijo pendiente': '1 recurring payment due', '{n} pagos fijos pendientes': '{n} recurring payments due',
    '¿Te recuerdo registrar el día?': 'Want a daily reminder?', 'Una notificación diaria a las 8:00 p. m.': 'One notification a day at 8:00 p.m.',
    'Guarda tu copia de seguridad': 'Save your backup', 'Última: {d}': 'Last: {d}', 'Aún no has guardado ninguna': 'You haven’t saved one yet',
    'Movimientos del mes': 'This month’s entries', 'Ver todo el mes': 'Show whole month',
    'No hay movimientos aquí todavía.<br>Usa los botones de abajo para registrar uno.': 'No entries here yet.<br>Use the buttons below to add one.',
    // balances
    'Sin gastos en este periodo.': 'No expenses in this period.', 'Sin ingresos en este periodo.': 'No income in this period.',
    'Año {y}': 'Year {y}', 'Personal y negocio': 'Personal and business', 'Gastos vs. mes anterior': 'Expenses vs. last month',
    'Por categoría': 'By category', 'Saldo por cuenta': 'Balance by account', '(todo lo registrado)': '(all entries)',
    'Promedio de gasto mensual': 'Average monthly expenses', 'Acumulado total al cierre': 'Running balance at year end', 'Mes a mes': 'Month by month',
    'Ingresos y gastos por mes': 'Income and expenses by month', 'Detalle por mes': 'Monthly detail', 'toca un mes para abrirlo': 'tap a month to open it',
    'Por categoría en {y}': 'By category in {y}',
    // pagos fijos
    'Pausado': 'Paused', 'Día {d}': 'Day {d}', 'Registrar': 'Add',
    'Arriendo, celular, internet… Los anotas una vez y cada mes te recuerdo registrarlos con un toque.': 'Rent, phone, internet… Add them once and every month I’ll remind you to record them with one tap.',
    'Pendientes de {m}': 'Due in {m}', 'Todo al día': 'All caught up', 'Ya registraste los pagos fijos de este mes.': 'You’ve recorded this month’s recurring payments.',
    'Todos los pagos fijos': 'All recurring payments', 'Aún no tienes pagos fijos.': 'You don’t have recurring payments yet.', '+ Nuevo pago fijo': '+ New recurring payment',
    // recordatorio
    'Este navegador no permite notificaciones': 'This browser doesn’t support notifications', 'Primero instala la app en tu pantalla de inicio': 'First install the app on your home screen',
    'Permite las notificaciones de Mi Dinero en los ajustes del teléfono': 'Allow Mi Dinero notifications in your phone settings',
    'Listo: te recordaré todos los días a las {h}': 'Done: I’ll remind you every day at {h}', 'No se pudo activar. Revisa tu conexión': 'Couldn’t turn it on. Check your connection',
    'Recordatorio desactivado': 'Reminder turned off', 'Enviada: llega en unos segundos': 'Sent: it will arrive in a few seconds',
    'Espera un minuto para otra prueba': 'Wait a minute before another test', 'No se pudo enviar. Revisa tu conexión': 'Couldn’t send it. Check your connection',
    'Recordatorio diario': 'Daily reminder', 'Recordarme registrar el día': 'Remind me to log my day', 'Activado · todos los días a las {h}': 'On · every day at {h}',
    'Una notificación diaria a la hora que elijas': 'One notification a day at the time you choose', 'Hora': 'Time', 'Enviar notificación de prueba': 'Send test notification',
    'Llega a la hora del país donde estés, aunque la app esté cerrada.': 'It arrives at local time wherever you are, even if the app is closed.',
    'En iPhone funciona con la app instalada en la pantalla de inicio.': 'On iPhone it works with the app installed on the home screen.',
    // licencia
    'Personal': 'Personal', 'Barbería': 'Barbershop', 'Licencia': 'License', 'Hola, quiero comprar mi licencia de MI DINERO': 'Hi, I want to buy my MI DINERO license',
    'Tu licencia ya no está activa en este dispositivo': 'Your license is no longer active on this device',
    'Prueba gratis: último día': 'Free trial: last day', 'Prueba gratis: te quedan {n} días': 'Free trial: {n} days left', 'Activa tu licencia cuando quieras': 'Activate your license whenever you like',
    'Tu prueba gratis terminó': 'Your free trial has ended',
    'Tus datos siguen aquí: puedes verlos y exportarlos. Activa tu licencia para registrar movimientos nuevos.': 'Your data is still here: you can view and export it. Activate your license to add new entries.',
    'Usuario fundador · gratis para siempre': 'Founding user · free forever', '{p} · activada en este dispositivo': '{p} · active on this device',
    'Prueba gratis · último día': 'Free trial · last day', 'Prueba gratis · quedan {n} días': 'Free trial · {n} days left', 'Prueba terminada · toca para activar': 'Trial ended · tap to activate',
    'MI DINERO activada': 'MI DINERO activated', 'Activar licencia': 'Activate license',
    'Eres usuario fundador: la app es gratis para siempre en este dispositivo. ¡Gracias por estar desde el principio!': 'You’re a founding user: the app is free forever on this device. Thanks for being here from the start!',
    '{p} · código {c}': '{p} · code {c}', 'Activada el {d}': 'Activated on {d}',
    'Prueba gratis: quedan {n} días': 'Free trial: {n} days left',
    'Escribe el código que recibiste al comprar. Se activa una sola vez y después funciona sin internet.': 'Enter the code you got when you bought it. You activate it once and then it works offline.',
    'Código': 'Code', 'Activando…': 'Activating…', '¿No tienes código? Cómpralo por WhatsApp': 'No code? Buy it on WhatsApp',
    'Planes de pago único': 'One-time payment plans',
    '<b>Personal:</b> 1 persona en 2 dispositivos (por ejemplo celular y computador).<br><b>Barbería:</b> hasta 5 personas, 2 dispositivos cada una. Cada barbero lleva sus propios datos en su celular.': '<b>Personal:</b> 1 person on 2 devices (for example phone and computer).<br><b>Barbershop:</b> up to 5 people, 2 devices each. Each barber keeps their own data on their phone.',
    '🔒 Aunque no actives, tus datos nunca se bloquean: siempre puedes verlos, exportarlos a Excel y guardar tu copia de seguridad.': '🔒 Even without activating, your data is never locked: you can always view it, export it to Excel and save your backup.',
    'El código tiene 8 letras y números, como MD-7K4P-Q2XW': 'The code has 8 letters and numbers, like MD-7K4P-Q2XW', '¡Listo! MI DINERO quedó activada': 'Done! MI DINERO is activated',
    'Necesitas internet para activar': 'You need internet to activate', 'No se pudo activar': 'Couldn’t activate',
    'Revisa el código: son 8 letras y números': 'Check the code: it’s 8 letters and numbers', 'Ese código no existe. Revisa que esté bien escrito': 'That code doesn’t exist. Check that it’s typed correctly',
    'Este código fue desactivado. Escríbele a quien te lo vendió': 'This code was deactivated. Contact whoever sold it to you',
    'Este código ya está activado en el máximo de dispositivos de su plan. Escríbele a quien te lo vendió para liberar uno': 'This code is already active on the maximum number of devices for its plan. Contact whoever sold it to you to free one up',
    // instalación
    'Mi Dinero quedó instalada': 'Mi Dinero is installed', 'Instalar Mi Dinero': 'Install Mi Dinero',
    'Queda como una app más en tu computador, con su ícono.': 'It stays on your computer like any other app, with its icon.', 'Queda como una app más en tu celular, con su ícono.': 'It stays on your phone like any other app, with its icon.',
    'En Safari toca Compartir <b style="display:inline">⎋</b> y luego “Agregar a pantalla de inicio”.': 'In Safari tap Share <b style="display:inline">⎋</b> and then “Add to Home Screen”.',
    'En Chrome toca el menú <b style="display:inline">⋮</b> y luego “Instalar aplicación” o “Agregar a la pantalla principal”.': 'In Chrome tap the menu <b style="display:inline">⋮</b> and then “Install app” or “Add to Home screen”.',
    'En Chrome o Edge toca el ícono de instalar en la barra de direcciones. En Safari (Mac): Archivo → “Agregar al Dock”.': 'In Chrome or Edge click the install icon in the address bar. In Safari (Mac): File → “Add to Dock”.',
    'Instala la app': 'Install the app',
    // ajustes
    'Exportar y respaldo': 'Export and backup', 'Exportar a Excel / CSV': 'Export to Excel / CSV', 'Para tu contabilidad, por mes, año o rango': 'For your accounting, by month, year or range',
    'Copia de seguridad': 'Backup', 'Nunca': 'Never', 'guárdala en {c}': 'save it to {c}', 'Restaurar o importar': 'Restore or import', 'Copia de seguridad o historial': 'Backup or history',
    'Categorías de ingreso (6)': 'Income categories (6)', 'Categorías de gasto (15)': 'Expense categories (15)', 'Cuentas': 'Accounts', 'Agregar cuenta': 'Add account',
    'Las cuentas son solo etiquetas (Efectivo, Banco, Nequi…). La app nunca se conecta a tus bancos.': 'Accounts are just labels (Cash, Bank, PayPal…). The app never connects to your banks.',
    'General': 'General', 'Moneda': 'Currency', 'Idioma': 'Language', 'Borrar todos los datos': 'Delete all data',
    'Mi Dinero {v} · {n} movimientos guardados solo en este dispositivo.': 'Mi Dinero {v} · {n} entries saved only on this device.',
    'Los nombres de categorías y cuentas que no hayas cambiado también se traducen.': 'Category and account names you haven’t changed are translated too.',
    'Idioma cambiado': 'Language changed',
    // registrar
    'Cambiar categoría': 'Change category', 'Nuevo gasto': 'New expense', 'Nuevo ingreso': 'New income', '− Gasto': '− Expense', '+ Ingreso': '+ Income',
    'Editar': 'Edit', 'toca para cambiar': 'tap to change', '¿Es personal o del negocio?': 'Personal or business?', '¿Con qué pagaste?': 'How did you pay?',
    '¿Dónde lo recibiste?': 'Where did you receive it?', 'Fecha': 'Date', 'Nota': 'Note', 'Ej: mercado en el D1': 'E.g.: groceries', 'Recibo': 'Receipt',
    'Cambiar foto': 'Change photo', 'Quitar': 'Remove', '📷 Foto del recibo': '📷 Receipt photo', 'este movimiento': 'this entry', 'Movimiento eliminado': 'Entry deleted',
    'Escribe un monto mayor a cero': 'Enter an amount greater than zero', 'Elige una fecha': 'Pick a date', 'Cambios guardados': 'Changes saved',
    'Gasto de {a} guardado': 'Expense of {a} saved', 'Ingreso de {a} guardado': 'Income of {a} saved',
    // categorías y cuentas
    'Categoría': 'Category', '{n} movimientos': '{n} entries', 'Color': 'Color', 'Ícono': 'Icon',
    'Si cambias el nombre, los movimientos que ya tienes en esta categoría se quedan en ella con el nombre nuevo.': 'If you rename it, the entries already in this category stay in it with the new name.',
    'Escribe un nombre': 'Enter a name', 'Categoría actualizada': 'Category updated', 'Cuenta': 'Account', 'Nueva cuenta': 'New account', 'Ej: Nequi': 'E.g.: PayPal',
    'Saldo inicial': 'Starting balance',
    'El saldo de la cuenta es el saldo inicial más los ingresos y menos los gastos que registres con esta cuenta. No se conecta a ningún banco.': 'The account balance is the starting balance plus the income and minus the expenses you record with this account. It doesn’t connect to any bank.',
    'Eliminar cuenta': 'Delete account', 'Cuenta guardada': 'Account saved', '¿Eliminar esta cuenta?': 'Delete this account?',
    'Tiene {n} movimientos. Los movimientos no se borran, solo quedan “sin cuenta”.': 'It has {n} entries. They won’t be deleted, just left with “no account”.',
    'Cuenta eliminada': 'Account deleted',
    'Cambia el símbolo y el formato con que se muestran los montos. No convierte los valores ya registrados.': 'Changes the symbol and format of amounts. It doesn’t convert amounts already recorded.',
    // pagos fijos (editor)
    'Pago fijo': 'Recurring payment', 'Nuevo pago fijo': 'New recurring payment', 'Ej: Arriendo': 'E.g.: Rent', 'Monto': 'Amount', 'Día del mes': 'Day of month',
    '¿Con qué se paga?': 'How is it paid?', '▶︎ Reactivar': '▶︎ Resume', '⏸ Pausar': '⏸ Pause', 'Eliminar pago fijo': 'Delete recurring payment',
    'Escribe el monto': 'Enter the amount', 'Elige una categoría': 'Pick a category', 'Pago fijo guardado': 'Recurring payment saved', 'este pago fijo': 'this recurring payment',
    'Pago fijo eliminado': 'Recurring payment deleted',
    // exportar
    'Exportar': 'Export', 'Periodo': 'Period', 'Un mes': 'One month', 'Un año': 'One year', 'Rango de fechas': 'Date range', 'Desde': 'From', 'Hasta': 'To',
    'Qué incluir': 'What to include', '{a} a {b}': '{a} to {b}', 'Todo el historial': 'All history', 'movimientos': 'entries',
    '📊 Exportar a Excel (.xlsx)': '📊 Export to Excel (.xlsx)', '📄 Exportar a CSV': '📄 Export to CSV',
    'El Excel trae 4 hojas: <b>Movimientos</b> (cada registro con fecha, tipo, categoría, personal/negocio, cuenta y nota), <b>Resumen mensual</b>, <b>Por categoría</b> y <b>Personal y negocio</b>. Luego puedes guardarlo en Archivos, enviarlo por WhatsApp o correo a tu contador.': 'The Excel file has 4 sheets: <b>Entries</b> (each record with date, type, category, personal/business, account and note), <b>Monthly summary</b>, <b>By category</b> and <b>Personal and business</b>. Then you can save it to Files or send it to your accountant by WhatsApp or email.',
    'No hay movimientos en ese periodo': 'No entries in that period', 'Tipo': 'Type', 'Personal/Negocio': 'Personal/Business', 'Personal / Negocio': 'Personal / Business',
    'Solo personal': 'Personal only', 'Solo negocio': 'Business only', '{l} · {s} · Moneda: {c} · Generado el {d}': '{l} · {s} · Currency: {c} · Generated on {d}',
    'Movimientos': 'Entries', 'Mi Dinero — Movimientos': 'Mi Dinero — Entries', 'TOTAL': 'TOTAL', 'Saldo: {b}': 'Balance: {b}', 'Resumen mensual': 'Monthly summary',
    'Saldo acumulado': 'Running balance', 'INGRESOS': 'INCOME', 'GASTOS': 'EXPENSES', 'Total ingresos': 'Total income', 'Total gastos': 'Total expenses',
    'Ingresos personal': 'Personal income', 'Gastos personal': 'Personal expenses', 'Saldo personal': 'Personal balance',
    'Ingresos negocio': 'Business income', 'Gastos negocio': 'Business expenses', 'Saldo negocio': 'Business balance',
    // respaldo
    'fotos de recibos': 'receipt photos', 'pagos fijos': 'recurring payments', 'tus categorías y cuentas': 'your categories and accounts',
    'Última copia: {d}': 'Last backup: {d}', 'Aún no has guardado ninguna copia': 'You haven’t saved a backup yet', 'Guardar copia': 'Save backup',
    '¿Cómo se guarda?': 'How do I save it?', '<b>Guardar en Archivos</b> → ': '<b>Save to Files</b> → ',
    'Toca <b>Guardar copia</b> → {files}elige <b>{c}</b> → <b>Guardar</b>. Para recuperar todo en otro celular: Ajustes → Restaurar o importar.': 'Tap <b>Save backup</b> → {files}choose <b>{c}</b> → <b>Save</b>. To recover everything on another phone: Settings → Restore or import.',
    '¿Por qué el archivo se ve como código?': 'Why does the file look like code?',
    'La copia es un archivo hecho para que <b>Mi Dinero</b> lo lea, no para leerlo tú. Si lo abres verás texto técnico: es normal, así guarda todo sin perder nada. Para ver tus números de forma clara usa <b>Exportar a Excel</b>.': 'The backup is a file made for <b>Mi Dinero</b> to read, not for you. If you open it you’ll see technical text: that’s normal, it’s how it saves everything without losing anything. To see your numbers clearly use <b>Export to Excel</b>.',
    '🔒 Tus datos solo están en este dispositivo y en tu propia nube ({c}).': '🔒 Your data is only on this device and in your own cloud ({c}).',
    'Preparando copia…': 'Preparing backup…', 'Copia lista. Guárdala en {c}.': 'Backup ready. Save it to {c}.',
    'Ese archivo no es una copia de Mi Dinero': 'That file isn’t a Mi Dinero backup', 'Restaurar copia': 'Restore backup',
    'Copia del {d} con {n} movimientos.': 'Backup from {d} with {n} entries.', 'Agregar a mis datos': 'Add to my data', 'Reemplazar todo': 'Replace everything',
    'Importar historial': 'Import history', '{n} movimientos en el archivo, {k} son nuevos. Los que ya tienes no se duplican.': '{n} entries in the file, {k} are new. The ones you already have won’t be duplicated.',
    'Importar {n}': 'Import {n}', 'Copia restaurada: {n} movimientos': 'Backup restored: {n} entries', '{n} movimientos importados': '{n} entries imported',
    '¿Borrar todos los datos?': 'Delete all data?', 'Se eliminan todos tus movimientos, pagos fijos y fotos de este dispositivo. Guarda antes una copia de seguridad.': 'All your entries, recurring payments and photos on this device will be deleted. Save a backup first.',
    'Guardar copia primero': 'Save backup first', 'Borrar todo': 'Delete everything', '¿Seguro?': 'Are you sure?', 'Esta es la última confirmación.': 'This is the last confirmation.',
    'Sí, borrar todo': 'Yes, delete everything', 'Datos borrados': 'Data deleted',
  },
  pt: {
    // general
    'Inicio': 'Início', 'Balances': 'Relatórios', 'Pagos fijos': 'Fixos', 'Ajustes': 'Ajustes',
    'Ingresos': 'Receitas', 'Gastos': 'Despesas', 'Ingreso': 'Receita', 'Gasto': 'Despesa', 'Saldo': 'Saldo',
    'Todo': 'Tudo', '👤 Personal': '👤 Pessoal', '💼 Negocio': '💼 Negócio', 'Personal': 'Pessoal', 'Negocio': 'Negócio',
    'Sin categoría': 'Sem categoria', 'Sin cuenta': 'Sem conta', 'Cancelar': 'Cancelar', 'Guardar': 'Salvar', 'Cerrar': 'Fechar',
    'Listo': 'OK', 'Eliminar': 'Excluir', 'Nombre': 'Nome', 'Activar': 'Ativar', 'Ahora no': 'Agora não', 'Ver ›': 'Ver ›',
    'Guardar ›': 'Salvar ›', 'Activar ›': 'Ativar ›', 'Instalar ›': 'Instalar ›', 'Mes': 'Mês', 'Año': 'Ano', 'Total': 'Total',
    'Esta acción no se puede deshacer.': 'Esta ação não pode ser desfeita.', '¿Eliminar {x}?': 'Excluir {x}?',
    // inicio
    'Mes anterior': 'Mês anterior', 'Mes siguiente': 'Próximo mês', 'Saldo del mes': 'Saldo do mês', 'Acumulado al cierre': 'Acumulado no fechamento',
    '1 pago fijo pendiente': '1 pagamento fixo pendente', '{n} pagos fijos pendientes': '{n} pagamentos fixos pendentes',
    '¿Te recuerdo registrar el día?': 'Quer um lembrete diário?', 'Una notificación diaria a las 8:00 p. m.': 'Uma notificação por dia às 20:00.',
    'Guarda tu copia de seguridad': 'Salve seu backup', 'Última: {d}': 'Último: {d}', 'Aún no has guardado ninguna': 'Você ainda não salvou nenhum',
    'Movimientos del mes': 'Lançamentos do mês', 'Ver todo el mes': 'Ver o mês todo',
    'No hay movimientos aquí todavía.<br>Usa los botones de abajo para registrar uno.': 'Ainda não há lançamentos aqui.<br>Use os botões abaixo para registrar um.',
    // balances
    'Sin gastos en este periodo.': 'Sem despesas neste período.', 'Sin ingresos en este periodo.': 'Sem receitas neste período.',
    'Año {y}': 'Ano {y}', 'Personal y negocio': 'Pessoal e negócio', 'Gastos vs. mes anterior': 'Despesas vs. mês anterior',
    'Por categoría': 'Por categoria', 'Saldo por cuenta': 'Saldo por conta', '(todo lo registrado)': '(todos os lançamentos)',
    'Promedio de gasto mensual': 'Média de despesas por mês', 'Acumulado total al cierre': 'Acumulado total no fechamento', 'Mes a mes': 'Mês a mês',
    'Ingresos y gastos por mes': 'Receitas e despesas por mês', 'Detalle por mes': 'Detalhe por mês', 'toca un mes para abrirlo': 'toque em um mês para abrir',
    'Por categoría en {y}': 'Por categoria em {y}',
    // pagos fijos
    'Pausado': 'Pausado', 'Día {d}': 'Dia {d}', 'Registrar': 'Registrar',
    'Arriendo, celular, internet… Los anotas una vez y cada mes te recuerdo registrarlos con un toque.': 'Aluguel, celular, internet… Você anota uma vez e todo mês eu lembro de registrá-los com um toque.',
    'Pendientes de {m}': 'Pendentes de {m}', 'Todo al día': 'Tudo em dia', 'Ya registraste los pagos fijos de este mes.': 'Você já registrou os pagamentos fixos deste mês.',
    'Todos los pagos fijos': 'Todos os pagamentos fixos', 'Aún no tienes pagos fijos.': 'Você ainda não tem pagamentos fixos.', '+ Nuevo pago fijo': '+ Novo pagamento fixo',
    // recordatorio
    'Este navegador no permite notificaciones': 'Este navegador não permite notificações', 'Primero instala la app en tu pantalla de inicio': 'Primeiro instale o app na tela de início',
    'Permite las notificaciones de Mi Dinero en los ajustes del teléfono': 'Permita as notificações do Mi Dinero nos ajustes do celular',
    'Listo: te recordaré todos los días a las {h}': 'Pronto: vou lembrar você todos os dias às {h}', 'No se pudo activar. Revisa tu conexión': 'Não foi possível ativar. Verifique sua conexão',
    'Recordatorio desactivado': 'Lembrete desativado', 'Enviada: llega en unos segundos': 'Enviada: chega em alguns segundos',
    'Espera un minuto para otra prueba': 'Espere um minuto para outro teste', 'No se pudo enviar. Revisa tu conexión': 'Não foi possível enviar. Verifique sua conexão',
    'Recordatorio diario': 'Lembrete diário', 'Recordarme registrar el día': 'Lembrar de registrar o dia', 'Activado · todos los días a las {h}': 'Ativado · todos os dias às {h}',
    'Una notificación diaria a la hora que elijas': 'Uma notificação por dia no horário que você escolher', 'Hora': 'Horário', 'Enviar notificación de prueba': 'Enviar notificação de teste',
    'Llega a la hora del país donde estés, aunque la app esté cerrada.': 'Chega no horário do país onde você estiver, mesmo com o app fechado.',
    'En iPhone funciona con la app instalada en la pantalla de inicio.': 'No iPhone funciona com o app instalado na tela de início.',
    // licencia
    'Barbería': 'Barbearia', 'Licencia': 'Licença', 'Hola, quiero comprar mi licencia de MI DINERO': 'Olá, quero comprar minha licença do MI DINERO',
    'Tu licencia ya no está activa en este dispositivo': 'Sua licença não está mais ativa neste dispositivo',
    'Prueba gratis: último día': 'Teste grátis: último dia', 'Prueba gratis: te quedan {n} días': 'Teste grátis: faltam {n} dias', 'Activa tu licencia cuando quieras': 'Ative sua licença quando quiser',
    'Tu prueba gratis terminó': 'Seu teste grátis terminou',
    'Tus datos siguen aquí: puedes verlos y exportarlos. Activa tu licencia para registrar movimientos nuevos.': 'Seus dados continuam aqui: você pode vê-los e exportá-los. Ative sua licença para registrar novos lançamentos.',
    'Usuario fundador · gratis para siempre': 'Usuário fundador · grátis para sempre', '{p} · activada en este dispositivo': '{p} · ativada neste dispositivo',
    'Prueba gratis · último día': 'Teste grátis · último dia', 'Prueba gratis · quedan {n} días': 'Teste grátis · faltam {n} dias', 'Prueba terminada · toca para activar': 'Teste encerrado · toque para ativar',
    'MI DINERO activada': 'MI DINERO ativado', 'Activar licencia': 'Ativar licença',
    'Eres usuario fundador: la app es gratis para siempre en este dispositivo. ¡Gracias por estar desde el principio!': 'Você é usuário fundador: o app é grátis para sempre neste dispositivo. Obrigado por estar aqui desde o início!',
    '{p} · código {c}': '{p} · código {c}', 'Activada el {d}': 'Ativada em {d}',
    'Prueba gratis: quedan {n} días': 'Teste grátis: faltam {n} dias',
    'Escribe el código que recibiste al comprar. Se activa una sola vez y después funciona sin internet.': 'Digite o código que você recebeu ao comprar. Ativa uma única vez e depois funciona sem internet.',
    'Código': 'Código', 'Activando…': 'Ativando…', '¿No tienes código? Cómpralo por WhatsApp': 'Não tem código? Compre pelo WhatsApp',
    'Planes de pago único': 'Planos de pagamento único',
    '<b>Personal:</b> 1 persona en 2 dispositivos (por ejemplo celular y computador).<br><b>Barbería:</b> hasta 5 personas, 2 dispositivos cada una. Cada barbero lleva sus propios datos en su celular.': '<b>Pessoal:</b> 1 pessoa em 2 dispositivos (por exemplo celular e computador).<br><b>Barbearia:</b> até 5 pessoas, 2 dispositivos cada uma. Cada barbeiro mantém seus próprios dados no celular.',
    '🔒 Aunque no actives, tus datos nunca se bloquean: siempre puedes verlos, exportarlos a Excel y guardar tu copia de seguridad.': '🔒 Mesmo sem ativar, seus dados nunca são bloqueados: você sempre pode vê-los, exportá-los para o Excel e salvar seu backup.',
    'El código tiene 8 letras y números, como MD-7K4P-Q2XW': 'O código tem 8 letras e números, como MD-7K4P-Q2XW', '¡Listo! MI DINERO quedó activada': 'Pronto! MI DINERO foi ativado',
    'Necesitas internet para activar': 'Você precisa de internet para ativar', 'No se pudo activar': 'Não foi possível ativar',
    'Revisa el código: son 8 letras y números': 'Confira o código: são 8 letras e números', 'Ese código no existe. Revisa que esté bien escrito': 'Esse código não existe. Confira se está escrito corretamente',
    'Este código fue desactivado. Escríbele a quien te lo vendió': 'Este código foi desativado. Fale com quem vendeu para você',
    'Este código ya está activado en el máximo de dispositivos de su plan. Escríbele a quien te lo vendió para liberar uno': 'Este código já está ativado no máximo de dispositivos do plano. Fale com quem vendeu para você para liberar um',
    // instalación
    'Mi Dinero quedó instalada': 'Mi Dinero foi instalado', 'Instalar Mi Dinero': 'Instalar Mi Dinero',
    'Queda como una app más en tu computador, con su ícono.': 'Fica como mais um app no seu computador, com seu ícone.', 'Queda como una app más en tu celular, con su ícono.': 'Fica como mais um app no seu celular, com seu ícone.',
    'En Safari toca Compartir <b style="display:inline">⎋</b> y luego “Agregar a pantalla de inicio”.': 'No Safari toque em Compartilhar <b style="display:inline">⎋</b> e depois em “Adicionar à Tela de Início”.',
    'En Chrome toca el menú <b style="display:inline">⋮</b> y luego “Instalar aplicación” o “Agregar a la pantalla principal”.': 'No Chrome toque no menu <b style="display:inline">⋮</b> e depois em “Instalar app” ou “Adicionar à tela inicial”.',
    'En Chrome o Edge toca el ícono de instalar en la barra de direcciones. En Safari (Mac): Archivo → “Agregar al Dock”.': 'No Chrome ou Edge clique no ícone de instalar na barra de endereços. No Safari (Mac): Arquivo → “Adicionar ao Dock”.',
    'Instala la app': 'Instale o app',
    // ajustes
    'Exportar y respaldo': 'Exportar e backup', 'Exportar a Excel / CSV': 'Exportar para Excel / CSV', 'Para tu contabilidad, por mes, año o rango': 'Para sua contabilidade, por mês, ano ou período',
    'Copia de seguridad': 'Backup', 'Nunca': 'Nunca', 'guárdala en {c}': 'salve no {c}', 'Restaurar o importar': 'Restaurar ou importar', 'Copia de seguridad o historial': 'Backup ou histórico',
    'Categorías de ingreso (6)': 'Categorias de receita (6)', 'Categorías de gasto (15)': 'Categorias de despesa (15)', 'Cuentas': 'Contas', 'Agregar cuenta': 'Adicionar conta',
    'Las cuentas son solo etiquetas (Efectivo, Banco, Nequi…). La app nunca se conecta a tus bancos.': 'As contas são só etiquetas (Dinheiro, Banco, Pix…). O app nunca se conecta aos seus bancos.',
    'General': 'Geral', 'Moneda': 'Moeda', 'Idioma': 'Idioma', 'Borrar todos los datos': 'Apagar todos os dados',
    'Mi Dinero {v} · {n} movimientos guardados solo en este dispositivo.': 'Mi Dinero {v} · {n} lançamentos salvos só neste dispositivo.',
    'Los nombres de categorías y cuentas que no hayas cambiado también se traducen.': 'Os nomes de categorias e contas que você não alterou também são traduzidos.',
    'Idioma cambiado': 'Idioma alterado',
    // registrar
    'Cambiar categoría': 'Mudar categoria', 'Nuevo gasto': 'Nova despesa', 'Nuevo ingreso': 'Nova receita', '− Gasto': '− Despesa', '+ Ingreso': '+ Receita',
    'Editar': 'Editar', 'toca para cambiar': 'toque para mudar', '¿Es personal o del negocio?': 'É pessoal ou do negócio?', '¿Con qué pagaste?': 'Como você pagou?',
    '¿Dónde lo recibiste?': 'Onde você recebeu?', 'Fecha': 'Data', 'Nota': 'Nota', 'Ej: mercado en el D1': 'Ex.: supermercado', 'Recibo': 'Recibo',
    'Cambiar foto': 'Trocar foto', 'Quitar': 'Remover', '📷 Foto del recibo': '📷 Foto do recibo', 'este movimiento': 'este lançamento', 'Movimiento eliminado': 'Lançamento excluído',
    'Escribe un monto mayor a cero': 'Digite um valor maior que zero', 'Elige una fecha': 'Escolha uma data', 'Cambios guardados': 'Alterações salvas',
    'Gasto de {a} guardado': 'Despesa de {a} salva', 'Ingreso de {a} guardado': 'Receita de {a} salva',
    // categorías y cuentas
    'Categoría': 'Categoria', '{n} movimientos': '{n} lançamentos', 'Color': 'Cor', 'Ícono': 'Ícone',
    'Si cambias el nombre, los movimientos que ya tienes en esta categoría se quedan en ella con el nombre nuevo.': 'Se você mudar o nome, os lançamentos que já estão nesta categoria continuam nela com o novo nome.',
    'Escribe un nombre': 'Digite um nome', 'Categoría actualizada': 'Categoria atualizada', 'Cuenta': 'Conta', 'Nueva cuenta': 'Nova conta', 'Ej: Nequi': 'Ex.: Nubank',
    'Saldo inicial': 'Saldo inicial',
    'El saldo de la cuenta es el saldo inicial más los ingresos y menos los gastos que registres con esta cuenta. No se conecta a ningún banco.': 'O saldo da conta é o saldo inicial mais as receitas e menos as despesas que você registrar com esta conta. Não se conecta a nenhum banco.',
    'Eliminar cuenta': 'Excluir conta', 'Cuenta guardada': 'Conta salva', '¿Eliminar esta cuenta?': 'Excluir esta conta?',
    'Tiene {n} movimientos. Los movimientos no se borran, solo quedan “sin cuenta”.': 'Ela tem {n} lançamentos. Eles não serão apagados, só ficarão “sem conta”.',
    'Cuenta eliminada': 'Conta excluída',
    'Cambia el símbolo y el formato con que se muestran los montos. No convierte los valores ya registrados.': 'Muda o símbolo e o formato dos valores. Não converte os valores já registrados.',
    // pagos fijos (editor)
    'Pago fijo': 'Pagamento fixo', 'Nuevo pago fijo': 'Novo pagamento fixo', 'Ej: Arriendo': 'Ex.: Aluguel', 'Monto': 'Valor', 'Día del mes': 'Dia do mês',
    '¿Con qué se paga?': 'Como é pago?', '▶︎ Reactivar': '▶︎ Retomar', '⏸ Pausar': '⏸ Pausar', 'Eliminar pago fijo': 'Excluir pagamento fixo',
    'Escribe el monto': 'Digite o valor', 'Elige una categoría': 'Escolha uma categoria', 'Pago fijo guardado': 'Pagamento fixo salvo', 'este pago fijo': 'este pagamento fixo',
    'Pago fijo eliminado': 'Pagamento fixo excluído',
    // exportar
    'Exportar': 'Exportar', 'Periodo': 'Período', 'Un mes': 'Um mês', 'Un año': 'Um ano', 'Rango de fechas': 'Intervalo de datas', 'Desde': 'De', 'Hasta': 'Até',
    'Qué incluir': 'O que incluir', '{a} a {b}': '{a} a {b}', 'Todo el historial': 'Todo o histórico', 'movimientos': 'lançamentos',
    '📊 Exportar a Excel (.xlsx)': '📊 Exportar para Excel (.xlsx)', '📄 Exportar a CSV': '📄 Exportar para CSV',
    'El Excel trae 4 hojas: <b>Movimientos</b> (cada registro con fecha, tipo, categoría, personal/negocio, cuenta y nota), <b>Resumen mensual</b>, <b>Por categoría</b> y <b>Personal y negocio</b>. Luego puedes guardarlo en Archivos, enviarlo por WhatsApp o correo a tu contador.': 'O Excel tem 4 abas: <b>Lançamentos</b> (cada registro com data, tipo, categoria, pessoal/negócio, conta e nota), <b>Resumo mensal</b>, <b>Por categoria</b> e <b>Pessoal e negócio</b>. Depois você pode salvar em Arquivos ou enviar ao seu contador por WhatsApp ou e-mail.',
    'No hay movimientos en ese periodo': 'Não há lançamentos nesse período', 'Tipo': 'Tipo', 'Personal/Negocio': 'Pessoal/Negócio', 'Personal / Negocio': 'Pessoal / Negócio',
    'Solo personal': 'Só pessoal', 'Solo negocio': 'Só negócio', '{l} · {s} · Moneda: {c} · Generado el {d}': '{l} · {s} · Moeda: {c} · Gerado em {d}',
    'Movimientos': 'Lançamentos', 'Mi Dinero — Movimientos': 'Mi Dinero — Lançamentos', 'TOTAL': 'TOTAL', 'Saldo: {b}': 'Saldo: {b}', 'Resumen mensual': 'Resumo mensal',
    'Saldo acumulado': 'Saldo acumulado', 'INGRESOS': 'RECEITAS', 'GASTOS': 'DESPESAS', 'Total ingresos': 'Total de receitas', 'Total gastos': 'Total de despesas',
    'Ingresos personal': 'Receitas pessoais', 'Gastos personal': 'Despesas pessoais', 'Saldo personal': 'Saldo pessoal',
    'Ingresos negocio': 'Receitas do negócio', 'Gastos negocio': 'Despesas do negócio', 'Saldo negocio': 'Saldo do negócio',
    // respaldo
    'fotos de recibos': 'fotos de recibos', 'pagos fijos': 'pagamentos fixos', 'tus categorías y cuentas': 'suas categorias e contas',
    'Última copia: {d}': 'Último backup: {d}', 'Aún no has guardado ninguna copia': 'Você ainda não salvou nenhum backup', 'Guardar copia': 'Salvar backup',
    '¿Cómo se guarda?': 'Como salvar?', '<b>Guardar en Archivos</b> → ': '<b>Salvar em Arquivos</b> → ',
    'Toca <b>Guardar copia</b> → {files}elige <b>{c}</b> → <b>Guardar</b>. Para recuperar todo en otro celular: Ajustes → Restaurar o importar.': 'Toque em <b>Salvar backup</b> → {files}escolha <b>{c}</b> → <b>Salvar</b>. Para recuperar tudo em outro celular: Ajustes → Restaurar ou importar.',
    '¿Por qué el archivo se ve como código?': 'Por que o arquivo parece código?',
    'La copia es un archivo hecho para que <b>Mi Dinero</b> lo lea, no para leerlo tú. Si lo abres verás texto técnico: es normal, así guarda todo sin perder nada. Para ver tus números de forma clara usa <b>Exportar a Excel</b>.': 'O backup é um arquivo feito para o <b>Mi Dinero</b> ler, não para você. Se abrir, verá texto técnico: é normal, é assim que ele salva tudo sem perder nada. Para ver seus números com clareza use <b>Exportar para Excel</b>.',
    '🔒 Tus datos solo están en este dispositivo y en tu propia nube ({c}).': '🔒 Seus dados estão só neste dispositivo e na sua própria nuvem ({c}).',
    'Preparando copia…': 'Preparando backup…', 'Copia lista. Guárdala en {c}.': 'Backup pronto. Salve no {c}.',
    'Ese archivo no es una copia de Mi Dinero': 'Esse arquivo não é um backup do Mi Dinero', 'Restaurar copia': 'Restaurar backup',
    'Copia del {d} con {n} movimientos.': 'Backup de {d} com {n} lançamentos.', 'Agregar a mis datos': 'Adicionar aos meus dados', 'Reemplazar todo': 'Substituir tudo',
    'Importar historial': 'Importar histórico', '{n} movimientos en el archivo, {k} son nuevos. Los que ya tienes no se duplican.': '{n} lançamentos no arquivo, {k} são novos. Os que você já tem não serão duplicados.',
    'Importar {n}': 'Importar {n}', 'Copia restaurada: {n} movimientos': 'Backup restaurado: {n} lançamentos', '{n} movimientos importados': '{n} lançamentos importados',
    '¿Borrar todos los datos?': 'Apagar todos os dados?', 'Se eliminan todos tus movimientos, pagos fijos y fotos de este dispositivo. Guarda antes una copia de seguridad.': 'Todos os seus lançamentos, pagamentos fixos e fotos deste dispositivo serão apagados. Salve um backup antes.',
    'Guardar copia primero': 'Salvar backup primeiro', 'Borrar todo': 'Apagar tudo', '¿Seguro?': 'Tem certeza?', 'Esta es la última confirmación.': 'Esta é a última confirmação.',
    'Sí, borrar todo': 'Sim, apagar tudo', 'Datos borrados': 'Dados apagados',
  },
};
