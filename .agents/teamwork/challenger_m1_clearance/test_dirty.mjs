import fs from 'fs';
const db = JSON.parse(fs.readFileSync('data/database.json', 'utf8'));
const BRAZIL_DATE_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
});
function getTodayStr() { return BRAZIL_DATE_FORMATTER.format(new Date()); }
function isFlatDirty(flatId, flatNumber, dateStr = getTodayStr()) {
  const fId = Number(flatId);
  const fNum = String(flatNumber || '');
  const dirtyReq = (db.cleaningRequests || []).find(c =>
    (Number(c.flatId) === fId || (fNum && String(c.flatNumber) === fNum)) &&
    !c.completedAt &&
    !c.isInstructionOnly &&
    c.source !== 'manual_instruction' &&
    (c.status === 'dirty' || c.status === 'in_progress' || c.status === 'cleaning_now' || (c.source === 'checkout' && c.status !== 'clean'))
  );
  if (dirtyReq) { console.log('Match dirtyReq:', dirtyReq); return true; }
  const checkoutToday = (db.reservations || []).find(r =>
    (Number(r.flatId) === fId || (fNum && String(r.flatNumber) === fNum)) &&
    r.checkoutDate === dateStr &&
    r.status !== 'cancelada' &&
    r.status !== 'cancelado'
  );
  if (checkoutToday) { console.log('Match checkoutToday:', checkoutToday); return true; }
  return false;
}
console.log('Today:', getTodayStr());
console.log('isFlatDirty(18, 907):', isFlatDirty(18, '907'));
