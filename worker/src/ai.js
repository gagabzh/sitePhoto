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
              const errorMsg = parsed.error || `Ollama HTTP error ${res.statusCode}`;
              const err = new Error(errorMsg);
              err.statusCode = res.statusCode;
              err.response = parsed;
              reject(err);
            } else if (!parsed || typeof parsed !== 'object') {
              reject(new Error('Ollama: invalid response structure - expected object'));
            } else if (!parsed.response && parsed.error) {
              // Ollama returned an error in the response field
              const err = new Error(parsed.error);
              err.statusCode = res.statusCode;
              err.response = parsed;
              reject(err);
            } else {
              resolve(parsed);
            }
          } catch (parseErr) {
            const err = new Error(`Ollama: invalid JSON in response: ${parseErr.message}`);
            err.originalError = parseErr;
            err.rawResponse = raw.substring(0, 200);
            reject(err);
          }
        });
      }
    );
    req.setTimeout(TIMEOUT_MS, () => {
      req.destroy();
      reject(new Error(`Ollama: request timed out after ${TIMEOUT_MS / 1000} s`));
    });
    req.on('error', (err) => reject(new Error(`Ollama unreachable: ${err.message}`)));
    req.write(payload);
    req.end();
  });
}

module.exports = { generate };
