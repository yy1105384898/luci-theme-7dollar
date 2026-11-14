#!/bin/sh
# Use the same hosts and warm HEAD response timing as Open-Box site latency.
case "$1" in baidu|google|openai|telegram) ;; *) printf '{"status":"invalid"}\n'; exit 1 ;; esac
node=/opt/open-box/node/bin/node
[ -x "$node" ] || { printf '{"status":"missing_runtime"}\n'; exit 0; }
port=$(jsonfilter -i /opt/open-box/etc/config.json -e '@.inbounds[@.tag="panel-in"].listen_port' 2>/dev/null)
case "$port" in ''|*[!0-9]*) printf '{"status":"unavailable"}\n'; exit 0 ;; esac
[ "$port" -ge 1 ] && [ "$port" -le 65535 ] || { printf '{"status":"unavailable"}\n'; exit 0; }
LD_LIBRARY_PATH=/opt/open-box/node/lib OPENSSL_CONF=/dev/null "$node" --input-type=module - "$1" "$port" <<'JS'
import net from 'node:net';
import tls from 'node:tls';
import { once } from 'node:events';
const targets = {
  baidu: 'https://www.baidu.com/favicon.ico',
  google: 'https://www.google.com/generate_204',
  openai: 'https://api.openai.com/v1/models',
  telegram: 'https://telegram.org/favicon.ico'
};
const url = new URL(targets[process.argv[2]]);
let tunnel, secure, ready = false;
function timeout(promise, ms) {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('timeout')), ms);
  })]).finally(() => clearTimeout(timer));
}
function head(socket, request) {
  return new Promise((resolve, reject) => {
    let data = '';
    const started = performance.now();
    const cleanup = () => { socket.off('data', receive); socket.off('error', fail); socket.off('close', closed); };
    const fail = error => { cleanup(); reject(error); };
    const closed = () => fail(new Error('closed'));
    const receive = chunk => {
      data += chunk.toString('latin1');
      const end = data.indexOf('\r\n\r\n');
      if (end < 0) { if (data.length > 65536) fail(new Error('invalid response')); return; }
      const header = data.slice(0, end), status = /^HTTP\/1\.[01] (\d{3})/.exec(header);
      if (!status) return fail(new Error('invalid response'));
      const ms = performance.now() - started;
      cleanup(); resolve({ ms, http: Number(status[1]), keepAlive: !/\r\nconnection:\s*close/i.test(header) });
    };
    socket.on('data', receive); socket.once('error', fail); socket.once('close', closed);
    socket.write(request);
  });
}
async function measure() {
  const opened = performance.now();
  tunnel = net.connect({ host: '127.0.0.1', port: Number(process.argv[3]) });
  tunnel.on('error', () => {});
  await once(tunnel, 'connect');
  ready = true;
  const connect = await head(tunnel, `CONNECT ${url.hostname}:443 HTTP/1.1\r\nHost: ${url.hostname}:443\r\n\r\n`);
  if (connect.http !== 200) throw new Error('proxy rejected connection');
  secure = tls.connect({ socket: tunnel, servername: url.hostname, ALPNProtocols: ['http/1.1'] });
  secure.on('error', () => {});
  await once(secure, 'secureConnect');
  const request = `HEAD ${url.pathname}${url.search} HTTP/1.1\r\nHost: ${url.host}\r\nUser-Agent: open-box-site-latency\r\nAccept: */*\r\nConnection: keep-alive\r\n\r\n`;
  const first = await head(secure, request);
  return { first, request, openMs: Math.round(performance.now() - opened) };
}
let result;
try {
  const { first, request, openMs } = await timeout(measure(), 5000);
  let ms = first.ms;
  if (first.keepAlive && !secure.destroyed) {
    try {
      const second = await timeout(head(secure, request), Math.min(2000, Math.max(300, first.ms * 3)));
      ms = Math.min(ms, second.ms);
    } catch (_) { /* Open-Box also keeps the first result if the warm request fails. */ }
  }
  // All HTTP responses prove connectivity, including the OpenAI API's expected 401.
  result = { status: 'ok', ms: Math.max(1, Math.round(ms)), http: first.http, openMs };
} catch (error) {
  result = { status: !ready ? 'unavailable' : /timeout/i.test(error.message) ? 'timeout' : 'failed' };
} finally {
  if (secure) secure.destroy();
  if (tunnel) tunnel.destroy();
}
console.log(JSON.stringify(result));
JS
