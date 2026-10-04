export function touchLane(partial) {
  const lane = (window.__laneRush = window.__laneRush || { log: [], booted: false, result: null });
  Object.assign(lane, partial);
  return lane;
}

export function setStatus(text) {
  const lane = touchLane({ status: text });
  const el = document.getElementById('status');
  if (el) el.textContent = text;
  return lane;
}
