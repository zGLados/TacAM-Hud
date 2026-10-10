import { createHmac, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import type { NextFunction, Request, Response } from 'express';
import type { Store } from './store.js';

const COOKIE = 'tacam_token';

export function isLocalAddress(address: string | undefined) {
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1';
}

/** Token derived from the PIN, so changing the PIN invalidates all sessions. */
export function tokenForPin(store: Store) {
  const { accessPin, gsiToken } = store.doc('settings');
  return createHmac('sha256', gsiToken).update(`pin:${accessPin}`).digest('hex');
}

function readCookie(header: string | undefined, name: string) {
  if (!header) return null;
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return null;
}

function safeEqual(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** Local requests are always trusted; remote ones need LAN access enabled and a valid token. */
export function isAuthorized(store: Store, req: IncomingMessage, explicitToken?: unknown) {
  if (isLocalAddress(req.socket.remoteAddress)) return true;
  const { lanAccess, accessPin } = store.doc('settings');
  if (!lanAccess || !accessPin) return false;
  const url = new URL(req.url ?? '/', 'http://localhost');
  const token =
    (typeof explicitToken === 'string' && explicitToken) ||
    (req.headers['x-tacam-token'] as string | undefined) ||
    url.searchParams.get('token') ||
    readCookie(req.headers.cookie, COOKIE);
  return !!token && safeEqual(token, tokenForPin(store));
}

export function authMiddleware(store: Store) {
  return (req: Request, res: Response, next: NextFunction) => {
    // The login endpoint and the login page assets must stay reachable.
    if (req.path === '/api/auth/login' || req.path === '/api/auth/status') return next();
    // Trigger URLs carry their own key (see actions.ts), also from other devices.
    if (req.path.startsWith('/api/trigger/')) return next();
    if (isAuthorized(store, req)) return next();
    if (req.path.startsWith('/api/') || req.path.startsWith('/socket.io')) {
      return res.status(401).json({ error: 'unauthorized' });
    }
    // Pages (control/hud) load and show their own login screen.
    return next();
  };
}

export function loginHandler(store: Store) {
  return (req: Request, res: Response) => {
    const { lanAccess, accessPin } = store.doc('settings');
    const pin = typeof req.body?.pin === 'string' ? req.body.pin : '';
    if (!lanAccess || !accessPin || !safeEqual(pin, accessPin)) {
      return res.status(401).json({ error: 'invalid pin' });
    }
    const token = tokenForPin(store);
    res.cookie(COOKIE, token, { httpOnly: true, sameSite: 'strict', maxAge: 30 * 24 * 3600 * 1000 });
    return res.json({ ok: true, token });
  };
}

export function statusHandler(store: Store) {
  return (req: Request, res: Response) => {
    res.json({
      authorized: isAuthorized(store, req),
      local: isLocalAddress(req.socket.remoteAddress),
    });
  };
}
