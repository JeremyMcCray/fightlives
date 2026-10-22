// PeerJS wrapper: host opens a room code, client joins it. One DataConnection.
const PREFIX = 'fightlives-v1-';
const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function peerOptions() {
  const q = new URLSearchParams(location.search);
  const opts = { debug: 1 };
  // ?peer=host:port lets you run your own PeerServer (used for local testing)
  if (q.get('peer')) {
    const [host, port] = q.get('peer').split(':');
    Object.assign(opts, { host, port: +port || 9000, path: '/', secure: location.protocol === 'https:' && host !== 'localhost' && host !== '127.0.0.1' });
  }
  opts.config = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }] };
  return opts;
}

export function makeCode() {
  let s = '';
  for (let i = 0; i < 4; i++) s += ALPHA[Math.floor(Math.random() * ALPHA.length)];
  return s;
}

export class Net {
  constructor(handlers) {
    this.h = handlers; // { onOpen(code), onPeer(), onData(msg), onClose(reason), onError(err) }
    this.peer = null; this.conn = null; this.role = null; this.rtt = 0;
  }
  host(code) {
    this.role = 'host';
    this.peer = new Peer(PREFIX + code, peerOptions());
    this.peer.on('open', () => this.h.onOpen(code));
    this.peer.on('connection', c => {
      if (this.conn) { c.close(); return; }
      this.bind(c);
    });
    this.peer.on('error', e => this.h.onError(e));
    this.peer.on('disconnected', () => { try { this.peer.reconnect(); } catch (_) { } });
  }
  join(code) {
    this.role = 'client';
    this.peer = new Peer(peerOptions());
    this.peer.on('open', () => {
      const c = this.peer.connect(PREFIX + code.toUpperCase(), { reliable: true, serialization: 'json' });
      this.bind(c);
      setTimeout(() => { if (!c.open) this.h.onError({ type: 'timeout', message: 'Could not reach that room. Check the code and try again.' }); }, 12000);
    });
    this.peer.on('error', e => this.h.onError(e));
  }
  bind(c) {
    this.conn = c;
    c.on('open', () => { this.h.onPeer(); this.pingLoop(); });
    c.on('data', d => {
      if (d && d.t === 'ping') { this.send({ t: 'pong', n: d.n }); return; }
      if (d && d.t === 'pong') { this.rtt = performance.now() - d.n; return; }
      this.h.onData(d);
    });
    c.on('close', () => this.h.onClose('Opponent disconnected.'));
    c.on('error', e => this.h.onError(e));
  }
  pingLoop() {
    this.pingTimer = setInterval(() => { if (this.conn?.open) this.send({ t: 'ping', n: performance.now() }); }, 1000);
  }
  send(msg) { if (this.conn && this.conn.open) this.conn.send(msg); }
  get open() { return !!(this.conn && this.conn.open); }
  destroy() { clearInterval(this.pingTimer); try { this.conn?.close(); } catch (_) { } try { this.peer?.destroy(); } catch (_) { } this.conn = null; this.peer = null; }
}
