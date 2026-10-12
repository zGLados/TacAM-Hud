// Shared settings for the screenshot scripts. Expects a test server:
//   TACAM_DATA_DIR=./.data HUD_PORT=13490 GSI_PORT=23490 npx tsx apps/server/src/main.ts
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-core');

const ROOT = path.resolve(__dirname, '../..');
const HUD_PORT = process.env.HUD_PORT ?? '13490';
const GSI_PORT = process.env.GSI_PORT ?? '23490';
const BASE = `http://localhost:${HUD_PORT}`;
const API = `${BASE}/api`;
const DATA_DIR = path.resolve(ROOT, process.env.TACAM_DATA_DIR ?? '.data');
const OUT = path.join(__dirname, 'out');
fs.mkdirSync(OUT, { recursive: true });

const req = (url, body, method = 'POST') => fetch(url, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
const get = async (p) => (await fetch(API + p)).json();
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const scene = (active, countdownTo = null) => req(API + '/scene', { active, auto: false, message: '', countdownTo }, 'PUT');
const config = async (patch) => req(API + '/hud/config', { ...(await get('/hud/config')), ...patch }, 'PUT');
const phase = async () => (await get('/live')).summary?.roundPhase;

/** Replays a recorded GSI state (fixtures/) with the server's GSI token. */
function feed(name) {
  const token = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'db.json'), 'utf8')).settings.gsiToken;
  const raw = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', `${name}.json`), 'utf8'));
  raw.auth = { token };
  return req(`http://127.0.0.1:${GSI_PORT}/`, raw);
}

/** Chromium from `npx playwright install chromium-headless-shell`, or CHROMIUM_PATH. */
const launch = () => chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});

/** HUD screenshot on gray (the HUD itself is transparent). */
async function shotHud(page, name) {
  await page.goto(`${BASE}/hud/`);
  await page.addStyleTag({ content: 'body{background:#3a4048}' });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(OUT, `${name}.png`) });
}

module.exports = { ROOT, BASE, API, OUT, req, get, wait, scene, config, phase, feed, launch, shotHud };
