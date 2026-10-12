import { useEffect, useState } from 'react';
import { PUSH_EVENTS } from '../shared/push';
import { useStore } from './store';

/** v7 PWA client: service-worker registration with a safe update prompt, install prompt (+ iOS instructions), push opt-in. */
const BASE = import.meta.env.BASE_URL;
export const isStandalone = () => typeof window !== 'undefined' && (window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true);
export const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
type BIP = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
let deferred: BIP | null = null; let waiting: ServiceWorker | null = null; const subs = new Set<() => void>();
const ping = () => subs.forEach((f) => f());
function useTick() { const [, set] = useState(0); useEffect(() => { const f = () => set((n) => n + 1); subs.add(f); return () => { subs.delete(f); }; }, []); }

export function registerPwa() {
  if (typeof window === 'undefined') return;
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e as BIP; ping(); });
  window.addEventListener('appinstalled', () => { deferred = null; ping(); });
  if (!('serviceWorker' in navigator) || !import.meta.env.PROD) return;
  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register(`${BASE}sw.js`, { scope: BASE });
      const watch = (w: ServiceWorker | null) => w?.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) { waiting = w; ping(); } });
      if (reg.waiting && navigator.serviceWorker.controller) { waiting = reg.waiting; ping(); }
      reg.addEventListener('updatefound', () => watch(reg.installing));
      let reloading = false; navigator.serviceWorker.addEventListener('controllerchange', () => { if (reloading) return; reloading = true; location.reload(); });
      setInterval(() => reg.update().catch(() => undefined), 60 * 60e3);
    } catch { /* no SW: the site still works, just not offline */ }
  });
}

/** Never reloads under the user: the new version waits until they tap Update (unsaved check-in text stays safe). */
export function UpdateToast() {
  useTick(); if (!waiting) return null;
  return <div className="pwatoast" role="status"><span>A new version of Baller Connection is ready.</span><button className="btn sm" onClick={() => waiting?.postMessage('SKIP_WAITING')}>Update</button><button className="btn ghost sm" onClick={() => { waiting = null; ping(); }}>Later</button></div>;
}

const DISMISS = 'bc-install-dismissed';
export function InstallPrompt({ compact }: { compact?: boolean }) {
  useTick(); const [hidden, setHidden] = useState(() => localStorage.getItem(DISMISS) === '1');
  if (isStandalone() || (compact && hidden)) return null;
  const ios = isIOS(); if (!deferred && !ios && compact) return null;
  return <section className="panel install" id="install" aria-label="Install the app">
    <img src={`${BASE}icons/icon-192.png`} alt="" width={44} height={44} />
    <div><h3 className="display">Install the app</h3>
      {deferred ? <p className="small dim">Open Baller Connection from your home screen like any app: full screen, camera ready for clips, and (if you want) phone notifications when your coach replies.</p>
        : ios ? <ol className="small iosteps"><li>Tap <b>Share</b> <span aria-hidden>⎋</span> in Safari’s toolbar.</li><li>Choose <b>Add to Home Screen</b>.</li><li>Open Baller Connection from the new icon. Phone notifications can be turned on in Account after that (iOS 16.4+).</li></ol>
        : <p className="small dim">In Chrome or Edge, use the install icon in the address bar (or menu → <b>Install app</b>). Safari on iPhone: Share → <b>Add to Home Screen</b>.</p>}
      <div className="row gap">{deferred && <button className="btn sm" onClick={async () => { const d = deferred!; await d.prompt(); await d.userChoice.catch(() => undefined); deferred = null; ping(); }}>Install</button>}
        {compact && <button className="btn ghost sm" onClick={() => { localStorage.setItem(DISMISS, '1'); setHidden(true); }}>Not now</button>}</div>
    </div></section>;
}

const keyBytes = (b64: string) => { const s = atob(b64.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (b64.length % 4)) % 4)); return Uint8Array.from(s, (c) => c.charCodeAt(0)); };
/** Push opt-in: only after install (that's also the only way iOS allows it), per device, mapped to the email categories + quiet hours above. */
export function PushSettings() {
  const { mode, api } = useStore(); const [on, setOn] = useState<boolean | null>(null); const [msg, setMsg] = useState(''); const [busy, setBusy] = useState(false);
  const supported = typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  const installed = isStandalone();
  useEffect(() => { if (!supported || !installed) return; navigator.serviceWorker.getRegistration(BASE).then((r) => r?.pushManager.getSubscription()).then((s) => setOn(!!s)).catch(() => setOn(false)); }, [supported, installed]);
  const enable = async () => {
    setBusy(true); setMsg('');
    try {
      const k = await api.get<{ mode: string; publicKey: string | null }>('/api/push/key'); if (!k.publicKey) throw new Error('This server has no push keys yet (VAPID not configured).');
      if ((await Notification.requestPermission()) !== 'granted') throw new Error('Notifications are blocked for this app in your phone’s settings.');
      const reg = await navigator.serviceWorker.ready; const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(k.publicKey) });
      await api.post('/api/push/subscribe', sub.toJSON()); setOn(true); setMsg('Phone notifications are on for this device.');
    } catch (e) { setMsg((e as Error).message); } finally { setBusy(false); }
  };
  const disable = async () => { setBusy(true); try { const reg = await navigator.serviceWorker.ready; const sub = await reg.pushManager.getSubscription(); if (sub) { await api.post('/api/push/unsubscribe', { endpoint: sub.endpoint }).catch(() => undefined); await sub.unsubscribe(); } setOn(false); setMsg('Off for this device.'); } finally { setBusy(false); } };
  return <section className="panel" id="push"><h3 className="display">Phone notifications</h3>
    <p className="small dim">Optional, per device, off until you turn it on. They follow your email settings and quiet hours above: a switched-off category or a push during quiet hours is skipped (it still waits in the app).</p>
    <ul className="small pushlist">{Object.values(PUSH_EVENTS).map((e) => <li key={e.label}>{e.label} <span className="dim">· {e.category === 'coaching' ? 'Coaching emails' : 'Update roundups'} setting</span></li>)}</ul>
    {mode === 'demo' ? <p className="note small">Demo build: no push is sent. On the live app, install it first, then turn this on here.</p>
      : !supported ? <p className="note small">This browser can’t receive web push.</p>
      : !installed ? <p className="note small">Install the app first (see below), then open it from your home screen and turn notifications on here.</p>
      : <div className="row gap">{on ? <button className="btn outline sm" disabled={busy} onClick={disable}>Turn off on this device</button> : <button className="btn sm" disabled={busy || on === null} onClick={enable}>Turn on phone notifications</button>}</div>}
    {msg && <p className="small" role="status">{msg}</p>}
  </section>;
}
