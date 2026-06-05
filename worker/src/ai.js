'use strict';

const http = require('http');

const TIMEOUT_MS = 300_000;
const HOST  = process.env.OLLAMA_HOST  || '127.0.0.1';
const PORT  = parseInt(process.env.OLLAMA_PORT  || '11434', 10);
const MODEL = process.env.OLLAMA_MODEL || 'llava';

async function generate({ model = MODEL, prompt, images = [] }) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({ model, prompt, images, stream: false });
    const req = http.request(
      {
        hostname: HOST,
        port: PORT,
        path: '/api/generate',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
      },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => { raw += chunk; });
        res.on('end', () => {
          try {
            const parsed = JSON.parse(raw);
            if (res.statusCode >= 400) {
              reject(new Error(parsed.error || `Ollama error ${res.statusCode}`));
            } else {
              resolve(parsed);
            }
          } catch { reject(new Error('Ollama: invalid JSON in response')); }
        });
      }
    );
    req.setTimeout(TIMEOUT_MS, () => {
      req.destroy();
      reject(new Error('Ollama: request timed out after 120 s'));
    });
    req.on('error', (err) => reject(new Error(`Ollama unreachable: ${err.message}`)));
    req.write(payload);
    req.end();
  });
}

module.exports = { generate };
