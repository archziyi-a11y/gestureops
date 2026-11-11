// 所有时间统一按 Asia/Shanghai 显示，避免同一份记录在不同机器上出现两种时间。
const TZ = 'Asia/Shanghai';

const dFmt = new Intl.DateTimeFormat('sv-SE', {
  timeZone: TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
});
const tFmt = new Intl.DateTimeFormat('sv-SE', {
  timeZone: TZ,
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false
});

export function fmtDate(ms) {
  return dFmt.format(new Date(ms));
}

export function fmtTime(ms) {
  return tFmt.format(new Date(ms));
}

export function fmtDateTime(ms) {
  return `${fmtDate(ms)} ${fmtTime(ms)}`;
}

export function fmtShort(ms) {
  return fmtTime(ms).slice(0, 5);
}

export function iso(ms) {
  return new Date(ms).toISOString();
}
