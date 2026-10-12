// node --experimental-websocket drag-check.mjs PORT W H : start level 1 by keyboard, then
// press at bottom-centre and drag sideways; the crowd must steer and no slot may switch.
const [port, W, H] = process.argv.slice(2).map((v, i) => (i ? Number(v) : v));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let list; for (let i = 0; i < 30; i++) { try { list = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); if (list.find((t) => t.type === 'page')) break; } catch {} await sleep(500); }
const ws = new WebSocket(list.find((t) => t.type === 'page').webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let id = 0; const wait = new Map(); const errors = [];
ws.addEventListener('message', (m) => { const d = JSON.parse(m.data); if (d.id && wait.has(d.id)) { wait.get(d.id)(d); wait.delete(d.id); } if (d.method === 'Runtime.exceptionThrown') errors.push(d.params.exceptionDetails.text); });
const send = (method, params = {}) => new Promise((r) => { const i = ++id; wait.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const lane = async () => JSON.parse((await send('Runtime.evaluate', { expression: 'JSON.stringify(window.__laneRush||null)', returnByValue: true })).result.result.value || 'null');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: 'http://127.0.0.1:8765/' });
await sleep(6000);
await send('Input.dispatchKeyEvent', { type: 'keyDown', key: ' ', code: 'Space', windowsVirtualKeyCode: 32 });
await send('Input.dispatchKeyEvent', { type: 'keyUp', key: ' ', code: 'Space', windowsVirtualKeyCode: 32 });
let L; for (let i = 0; i < 40; i++) { await sleep(500); L = await lane(); if (L && L.mode === 'run' && L.front > 300) break; }
const before = { lane: L.lane, eq: L.equipped };
const x0 = W / 2; const y0 = H - 30; // bottom centre, where the old slot rack sat
await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x0, y: y0 });
await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: x0, y: y0, button: 'left', clickCount: 1 });
for (let k = 1; k <= 10; k++) { await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x0 - (W * 0.3 * k) / 10, y: y0 - k * 4, button: 'left', buttons: 1 }); await sleep(60); }
await sleep(1200);
const mid = await lane();
await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: x0 - W * 0.3, y: y0 - 40, button: 'left', clickCount: 1 });
console.log('before', JSON.stringify(before), 'after drag lane', mid.lane, 'equipped', mid.equipped, 'mode', mid.mode);
console.log(mid.lane < before.lane - 0.2 && mid.equipped === before.eq ? 'DRAG STEERS OK' : 'DRAG FAILED');
console.log('ERRORS', JSON.stringify(errors)); process.exit(0);
