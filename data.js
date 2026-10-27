// Valores por defecto de Mi Dinero
export const DEFAULT_CATEGORIES = [
  { id: 'i1', type: 'ingreso', name: 'Sueldo', icon: '💵', color: '#2e9e5b' },
  { id: 'i2', type: 'ingreso', name: 'Ventas', icon: '💰', color: '#e0a100' },
  { id: 'i3', type: 'ingreso', name: 'Propina', icon: '🤲', color: '#2f80ed' },
  { id: 'i4', type: 'ingreso', name: 'Arriendos', icon: '🏘️', color: '#8e5cd9' },
  { id: 'i5', type: 'ingreso', name: 'Retorno de inversión', icon: '📈', color: '#12a4a4' },
  { id: 'i6', type: 'ingreso', name: 'Otros ingresos', icon: '➕', color: '#7a8a99' },
  { id: 'g1', type: 'gasto', name: 'Hogar', icon: '🏠', color: '#c0682b' },
  { id: 'g2', type: 'gasto', name: 'Facturas', icon: '🧾', color: '#d64545' },
  { id: 'g3', type: 'gasto', name: 'Comida', icon: '🍽️', color: '#e07b00' },
  { id: 'g4', type: 'gasto', name: 'General', icon: '🛒', color: '#8b5a2b' },
  { id: 'g5', type: 'gasto', name: 'Regalos', icon: '🎁', color: '#d63d8c' },
  { id: 'g6', type: 'gasto', name: 'Gasolina', icon: '⛽', color: '#5b6cff' },
  { id: 'g7', type: 'gasto', name: 'Salud', icon: '💊', color: '#3fa34d' },
  { id: 'g8', type: 'gasto', name: 'Acción de gracia', icon: '🙏', color: '#9b59b6' },
  { id: 'g9', type: 'gasto', name: 'Entretenimiento', icon: '🎬', color: '#e74c3c' },
  { id: 'g10', type: 'gasto', name: 'Ropa', icon: '👕', color: '#1abc9c' },
  { id: 'g11', type: 'gasto', name: 'Inversiones', icon: '📊', color: '#2f80ed' },
  { id: 'g12', type: 'gasto', name: 'Compras', icon: '🛍️', color: '#f39c12' },
  { id: 'g13', type: 'gasto', name: 'Barbero Millonario', icon: '💈', color: '#c9a227' },
  { id: 'g14', type: 'gasto', name: 'Transporte', icon: '🚕', color: '#34495e' },
  { id: 'g15', type: 'gasto', name: 'Otros gastos', icon: '📦', color: '#7a8a99' },
];

export const DEFAULT_ACCOUNTS = [
  { id: 'a1', name: 'Efectivo', icon: '💵', initial: 0 },
  { id: 'a2', name: 'Banco', icon: '🏦', initial: 0 },
  { id: 'a3', name: 'Billetera digital', icon: '📱', initial: 0 },
];

// 33 monedas: Américas primero
export const CURRENCIES = [
  ['COP', 'Peso colombiano', '🇨🇴'], ['USD', 'Dólar estadounidense', '🇺🇸'], ['CAD', 'Dólar canadiense', '🇨🇦'],
  ['MXN', 'Peso mexicano', '🇲🇽'], ['GTQ', 'Quetzal guatemalteco', '🇬🇹'], ['HNL', 'Lempira hondureño', '🇭🇳'],
  ['NIO', 'Córdoba nicaragüense', '🇳🇮'], ['CRC', 'Colón costarricense', '🇨🇷'], ['PAB', 'Balboa panameño', '🇵🇦'],
  ['DOP', 'Peso dominicano', '🇩🇴'], ['CUP', 'Peso cubano', '🇨🇺'], ['JMD', 'Dólar jamaiquino', '🇯🇲'],
  ['TTD', 'Dólar de Trinidad y Tobago', '🇹🇹'], ['HTG', 'Gourde haitiano', '🇭🇹'], ['VES', 'Bolívar venezolano', '🇻🇪'],
  ['PEN', 'Sol peruano', '🇵🇪'], ['BOB', 'Boliviano', '🇧🇴'], ['CLP', 'Peso chileno', '🇨🇱'],
  ['ARS', 'Peso argentino', '🇦🇷'], ['UYU', 'Peso uruguayo', '🇺🇾'], ['PYG', 'Guaraní paraguayo', '🇵🇾'],
  ['BRL', 'Real brasileño', '🇧🇷'], ['EUR', 'Euro', '🇪🇺'], ['GBP', 'Libra esterlina', '🇬🇧'],
  ['CHF', 'Franco suizo', '🇨🇭'], ['JPY', 'Yen japonés', '🇯🇵'], ['CNY', 'Yuan chino', '🇨🇳'],
  ['KRW', 'Won surcoreano', '🇰🇷'], ['INR', 'Rupia india', '🇮🇳'], ['AUD', 'Dólar australiano', '🇦🇺'],
  ['NZD', 'Dólar neozelandés', '🇳🇿'], ['AED', 'Dírham de EAU', '🇦🇪'], ['TRY', 'Lira turca', '🇹🇷'],
];

export const ICONS = [
  '💵', '💰', '🪙', '💳', '🏦', '💸', '🤲', '📈', '📊', '📉', '🧾', '💼', '🏘️', '🏠', '🏢', '🔑',
  '🍽️', '🍔', '🍕', '🌮', '🍣', '🥗', '☕', '🍺', '🍷', '🥤', '🍦', '🍰', '🛒', '🥦', '🍎', '🥩',
  '🚗', '🏍️', '🚕', '🚌', '✈️', '⛽', '🅿️', '🔧', '🛠️', '🚲', '💈', '✂️', '🪒', '🧴', '💇', '💅',
  '💊', '🩺', '🏥', '🦷', '🧘', '🏋️', '⚽', '🎬', '🎮', '🎵', '🎧', '📺', '📱', '💻', '📷', '🎥',
  '👕', '👗', '👟', '👜', '💍', '⌚', '🕶️', '🎁', '🎉', '🎂', '🙏', '⛪', '❤️', '👨‍👩‍👧', '👶', '🐶',
  '📚', '🎓', '✏️', '🏫', '💡', '🚿', '🔥', '🌐', '📶', '🔌', '🧹', '🛋️', '🛏️', '🧺', '🌱', '🧳',
  '🏖️', '🎟️', '🧠', '📦', '➕', '➖', '⭐', '🔁', '🪪', '📄', '⚖️', '🏛️', '🤝', '📣', '🛍️', '🏷️',
];

export const COLORS = ['#2e9e5b', '#3fa34d', '#12a4a4', '#1abc9c', '#2f80ed', '#5b6cff', '#8e5cd9', '#9b59b6', '#d63d8c', '#e74c3c', '#d64545', '#e07b00', '#f39c12', '#e0a100', '#c9a227', '#c0682b', '#8b5a2b', '#34495e', '#7a8a99'];

export const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
export const MONTHS_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
export const WEEKDAYS = ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sa', 'Do'];
