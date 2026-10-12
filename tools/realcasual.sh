#!/bin/bash
S=$1; P=$2; Q=${3:-}; D=/tmp/chc$S
rm -rf $D; (nohup google-chrome --headless=new --disable-gpu --no-sandbox --enable-unsafe-swiftshader --window-size=1280,800 --remote-debugging-port=$P --user-data-dir=$D about:blank >/dev/null 2>&1 &)
sleep 3
timeout 330 node --experimental-websocket $(dirname "$0")/browser-check.mjs $P "http://127.0.0.1:8765/?casual=$S$Q" 300000 2>/dev/null > /tmp/real$S.txt
pkill -f "remote-debugging-port=$P"
python3 - "$S" << 'PY'
import json,sys,re
s=sys.argv[1]; txt=open('/tmp/real%s.txt'%s).read()
m=re.search(r'LAST (.*)',txt); e=re.search(r'ERRORS (.*)',txt)
d=json.loads(m.group(1))
print('seed',s,d.get('status'),'count',d.get('count'),'slots',d.get('slots'),'equipped',d.get('equipped'))
for x in d['log']:
  if x["type"] in ("weapon","floater","fork"): print('  ',x)
print('  console errors:', e.group(1) if e else '?')
PY
