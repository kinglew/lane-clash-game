// node --experimental-websocket click-check.mjs PORT URL
const [port, url] = process.argv.slice(2);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let list; for (let i = 0; i < 30; i++) { try { list = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); if (list.find((t) => t.type === 'page')) break; } catch {} await sleep(500); }
const ws = new WebSocket(list.find((t) => t.type === 'page').webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let id = 0; const wait = new Map(); const errors = [];
ws.addEventListener('message', (m) => { const d = JSON.parse(m.data); if (d.id && wait.has(d.id)) { wait.get(d.id)(d); wait.delete(d.id); } if (d.method === 'Runtime.exceptionThrown') errors.push(d.params.exceptionDetails.text); });
const send = (method, params = {}) => new Promise((r) => { const i = ++id; wait.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const lane = async () => JSON.parse((await send('Runtime.evaluate', { expression: 'JSON.stringify(window.__laneRush||null)', returnByValue: true })).result.result.value || 'null');
await send('Runtime.enable'); await send('Page.navigate', { url });
let L; const t0 = Date.now();
while (Date.now() - t0 < 280000) { await sleep(1500); L = await lane(); if (L && /^result:/.test(L.status || '')) break; }
if (process.argv[4]) { const [w, h] = process.argv[4].split('x').map(Number); await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: Number(process.argv[5] || 1), mobile: false }); console.log('resized to', w, h); }
await sleep(1500); L = await lane();
const shotB = await send('Page.captureScreenshot', { format: 'png' }); (await import('fs')).writeFileSync('/tmp/overlay-' + port + '.png', Buffer.from(shotB.result.data, 'base64'));
const b = L.buttons.primary; const lvl = L.level;
console.log('result', L.status, 'level', lvl, 'canvas', JSON.stringify(L.canvas), 'button', JSON.stringify(b));
for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x: b.cx, y: b.cy, button: 'left', clickCount: 1 });
await sleep(2500); const after = await lane();
console.log('after click: status', after.status, 'level', after.level, 'mode', after.mode, after.level !== lvl || after.mode === 'run' ? 'CLICK OK' : 'CLICK FAILED');
console.log('ERRORS', JSON.stringify(errors)); process.exit(0);
