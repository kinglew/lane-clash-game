#!/bin/bash
# click.sh PORT WxH URLQUERY
P=$1; S=$2; Q=$3; D=/tmp/chk$P; rm -rf $D
(nohup google-chrome --headless=new --disable-gpu --no-sandbox --enable-unsafe-swiftshader --window-size=${S/x/,} --remote-debugging-port=$P --user-data-dir=$D about:blank >/dev/null 2>&1 &)
sleep 3; timeout 320 node --experimental-websocket $(dirname "$0")/click-check.mjs $P "http://127.0.0.1:8765/$Q" $4 $5 2>/dev/null; pkill -f "remote-debugging-port=$P"
