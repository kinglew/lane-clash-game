// usage: node --experimental-websocket browser-check.mjs PORT URL TIMEOUT_MS
const [port, url, tmo] = [process.argv[2], process.argv[3], Number(process.argv[4] || 300000)];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let list;
for (let i = 0; i < 30; i++) { try { list = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); if (list.find((t) => t.type === 'page')) break; } catch {} await sleep(500); }
const page = list.find((t) => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let id = 0; const wait = new Map(); const errors = [];
ws.addEventListener('message', (m) => { const d = JSON.parse(m.data); if (d.id && wait.has(d.id)) { wait.get(d.id)(d); wait.delete(d.id); }
  if (d.method === 'Runtime.exceptionThrown') errors.push(d.params.exceptionDetails.text);
  if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') errors.push(JSON.stringify(d.params.args.map((a) => a.value))); });
const send = (method, params = {}) => new Promise((r) => { const i = ++id; wait.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
await send('Runtime.enable');
await send('Page.navigate', { url });
const shotAt = process.argv[5] ? Number(process.argv[5]) : null; const shotPath = process.argv[6]; let shot = false;
const t0 = Date.now(); let last = null;
while (Date.now() - t0 < tmo) {
  await sleep(shotAt != null && !shot ? 250 : 1500);
  const r = await send('Runtime.evaluate', { expression: 'JSON.stringify(window.__laneRush||null)', returnByValue: true });
  last = r.result && r.result.result && r.result.result.value;
  if (shotAt != null && !shot && last) { const f = JSON.parse(last).front || 0; if (f >= shotAt) { shot = true; const s = await send('Page.captureScreenshot', { format: 'png' }); (await import('fs')).writeFileSync(shotPath, Buffer.from(s.result.data, 'base64')); console.log('SHOT at front', f); } }
  if (last && /"status":"result:/.test(last)) break;
}
console.log('LAST', last);
console.log('ERRORS', JSON.stringify(errors));
process.exit(0);
