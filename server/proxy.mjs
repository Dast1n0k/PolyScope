import { createServer } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decisionBody, interpretDecision, sliceMarket } from './jev.mjs';

const root = dirname(fileURLToPath(import.meta.url));
loadEnv(join(root, '.env'));

const port = Number(process.env.JEV_PROXY_PORT || 8787);
const endpoint = 'https://jev-ai.pro/api/v1/systemone';
const batchLimit = 25;
const concurrency = 4;

const server = createServer(async (request, response) => {
  setCors(response);
  if (request.method === 'OPTIONS') {
    response.writeHead(204);
    response.end();
    return;
  }
  if (request.method !== 'POST' || (request.url !== '/api/jev' && request.url !== '/api/jev/batch')) {
    send(response, 404, { error: 'Невідомий маршрут проксі.' });
    return;
  }

  const key = process.env.JEV_API_KEY;
  if (!key) {
    send(response, 503, { error: 'Немає JEV_API_KEY. Додайте ключ у server/.env і перезапустіть проксі.' });
    return;
  }

  try {
    const body = await readJson(request);
    if (request.url === '/api/jev') {
      const insight = await ask(key, sliceMarket(body.market));
      send(response, 200, { insight });
      return;
    }
    const markets = Array.isArray(body.markets) ? body.markets : null;
    if (!markets || markets.length === 0 || markets.length > batchLimit) {
      send(response, 400, { error: `Пакет має містити від 1 до ${batchLimit} ринків.` });
      return;
    }
    const insights = await mapPool(markets, concurrency, (market) => ask(key, sliceMarket(market)));
    send(response, 200, { insights });
  } catch (error) {
    const status = error.status && error.status >= 400 && error.status < 600 ? error.status : 502;
    send(response, status, { error: error.message || 'Jev AI зараз недоступний.' });
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Jev proxy on http://127.0.0.1:${port}`);
});

async function ask(key, slice) {
  const upstream = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(decisionBody(slice)),
    signal: AbortSignal.timeout(60_000),
  });
  const payload = await upstream.json().catch(() => ({}));
  if (!upstream.ok) {
    const apiMessage = typeof payload?.message === 'string' ? payload.message : payload?.error?.message;
    const message =
      upstream.status === 402
        ? 'На рахунку Jev AI немає кредитів. Поповніть баланс на jev-ai.pro і натисніть кнопку ще раз.'
        : apiMessage || `Jev AI відповів статусом ${upstream.status}.`;
    const error = new Error(message);
    error.status = upstream.status === 401 || upstream.status === 402 ? upstream.status : 502;
    throw error;
  }
  return interpretDecision(payload, slice);
}

async function mapPool(items, limit, worker) {
  const results = new Array(items.length);
  let next = 0;
  async function run() {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await worker(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => run()));
  return results;
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    request.on('data', (chunk) => {
      size += chunk.length;
      if (size > 2_000_000) {
        reject(Object.assign(new Error('Запит завеликий.'), { status: 413 }));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
      } catch {
        reject(Object.assign(new Error('Тіло запиту не є JSON.'), { status: 400 }));
      }
    });
    request.on('error', reject);
  });
}

function send(response, status, payload) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(payload));
}

function setCors(response) {
  response.setHeader('Access-Control-Allow-Origin', 'http://127.0.0.1:4200');
  response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function loadEnv(file) {
  if (!existsSync(file)) {
    return;
  }
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }
    const eq = trimmed.indexOf('=');
    if (eq < 1) {
      continue;
    }
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}
