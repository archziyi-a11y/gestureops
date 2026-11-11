export function balanceSummary(snapshot) {
  const row = snapshot?.connections?.sales;
  const balance = row?.balances?.find(item => item.currency === 'CNY');
  const valid = balance && String(balance.total).trim() !== '' && Number.isFinite(Number(balance.total));
  if (!valid) return { text: row?.error ? '模型余额查询失败' : '模型余额待查询', warning: !!row?.error, time: row?.checkedAt };
  const amount = `模型余额 ¥${Number(balance.total).toFixed(2)}`;
  return {
    text: `${amount}${row.status === 'low' ? ' · 余额偏低' : ''}${row.error ? ' · 更新失败，保留上次结果' : ''}`,
    warning: row.status === 'low' || !!row.error,
    time: row.checkedAt,
  };
}
