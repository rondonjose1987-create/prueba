import express from 'express';
import https from 'node:https';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BCV_PRIMARY_URL =
  'https://www.bcv.org.ve/notas-de-prensa/bcv-y-banca-articulan-acciones-de-politica-monetaria-para-consolidar-la-estabilidad';
const BCV_HOME_URL = 'https://www.bcv.org.ve/';

// Scoped TLS agent only for bcv.org.ve (missing intermediate cert chain on BCV server)
const bcvHttpsAgent = new https.Agent({
  rejectUnauthorized: false,
});

export interface BcvRateResponse {
  rate: number;
  exactRate: number;
  fechaValorIso: string;
  fechaValorText: string;
  sourceUrl: string;
  fetchedAt: string;
}

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
let cachedBcv: { data: BcvRateResponse; expiresAt: number } | null = null;

function fetchHtml(url: string, redirectsLeft = 3): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      {
        agent: bcvHttpsAgent,
        timeout: 15000,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml',
          'Accept-Language': 'es-VE,es;q=0.9',
        },
      },
      (res) => {
        if (
          res.statusCode &&
          res.statusCode >= 300 &&
          res.statusCode < 400 &&
          res.headers.location &&
          redirectsLeft > 0
        ) {
          const nextUrl = new URL(res.headers.location, url).toString();
          res.resume();
          fetchHtml(nextUrl, redirectsLeft - 1).then(resolve, reject);
          return;
        }

        if (res.statusCode && res.statusCode >= 400) {
          res.resume();
          reject(new Error(`BCV HTTP ${res.statusCode}`));
          return;
        }

        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      }
    );

    req.on('timeout', () => {
      req.destroy(new Error('Timeout conectando con BCV'));
    });
    req.on('error', reject);
  });
}

function parseBcvHtml(html: string, sourceUrl: string): BcvRateResponse {
  // Match <div id="dolar" ...>...<strong>917,77510000</strong>
  const dolarSectionMatch = html.match(
    /<div\s+id=["']dolar["'][\s\S]*?<strong[^>]*>\s*([0-9.,]+)\s*<\/strong>/i
  );

  if (!dolarSectionMatch || !dolarSectionMatch[1]) {
    throw new Error('No se encontró la tasa USD ($) en el HTML del BCV.');
  }

  const rawNumber = dolarSectionMatch[1].trim();
  // Venezuelan format: thousands '.' (if any) and decimal ','
  const normalized = rawNumber.replace(/\./g, '').replace(',', '.');
  const exactRate = Number.parseFloat(normalized);

  if (!Number.isFinite(exactRate) || exactRate <= 0) {
    throw new Error(`Valor de tasa BCV inválido: ${rawNumber}`);
  }

  const rate = Math.round((exactRate + Number.EPSILON) * 100) / 100;

  // Extract Fecha Valor near the tasas block
  const fechaBlockMatch = html.match(
    /Fecha\s+Valor:\s*<span[^>]*content=["'](\d{4}-\d{2}-\d{2})[^"']*["'][^>]*class=["'][^"']*date-display-single[^"']*["'][^>]*>([^<]+)<\/span>/i
  );
  const altFechaMatch = html.match(
    /class=["'][^"']*date-display-single[^"']*["'][^>]*>([^<]+)<\/span>/i
  );

  const todayIso = new Date().toISOString().slice(0, 10);
  const fechaValorIso = fechaBlockMatch?.[1] || todayIso;
  const fechaValorText = (
    fechaBlockMatch?.[2] ||
    altFechaMatch?.[1] ||
    fechaValorIso
  )
    .replace(/\s+/g, ' ')
    .trim();

  return {
    rate,
    exactRate,
    fechaValorIso,
    fechaValorText,
    sourceUrl,
    fetchedAt: new Date().toISOString(),
  };
}

async function getLatestBcvRate(forceRefresh = false): Promise<BcvRateResponse> {
  if (!forceRefresh && cachedBcv && Date.now() < cachedBcv.expiresAt) {
    return cachedBcv.data;
  }

  let lastError: unknown = null;
  for (const url of [BCV_PRIMARY_URL, BCV_HOME_URL]) {
    try {
      const html = await fetchHtml(url);
      const parsed = parseBcvHtml(html, url);
      cachedBcv = {
        data: parsed,
        expiresAt: Date.now() + CACHE_TTL_MS,
      };
      return parsed;
    } catch (err) {
      lastError = err;
    }
  }

  if (cachedBcv) {
    return cachedBcv.data;
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('No se pudo obtener la tasa del BCV.');
}

async function startServer(): Promise<void> {
  const app = express();
  const port = Number(process.env.PORT) || 3000;

  app.get('/api/bcv-rate', async (req, res) => {
    const force = req.query.refresh === '1' || req.query.refresh === 'true';
    try {
      const data = await getLatestBcvRate(force);
      res.json(data);
    } catch (err) {
      res.status(502).json({
        error:
          err instanceof Error
            ? err.message
            : 'Error al consultar la página oficial del BCV.',
      });
    }
  });

  app.get('/.well-known/assetlinks.json', (_req, res) => {
    const pkg = process.env.TWA_PACKAGE_NAME?.trim();
    const fingerprints = (process.env.TWA_SHA256_FINGERPRINTS || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Access-Control-Allow-Origin', '*');

    if (pkg && fingerprints.length > 0) {
      res.json([
        {
          relation: ['delegate_permission/common.handle_all_urls'],
          target: {
            namespace: 'android_app',
            package_name: pkg,
            sha256_cert_fingerprints: fingerprints,
          },
        },
      ]);
      return;
    }

    res.json([]);
  });

  if (process.env.NODE_ENV === 'production') {
    const distDir = path.resolve(__dirname, 'dist');

    // Alias /manifest.json -> /manifest.webmanifest for validators checking either path
    app.get(['/manifest.webmanifest', '/manifest.json'], (_req, res) => {
      res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.sendFile(path.join(distDir, 'manifest.webmanifest'));
    });

    app.get('/sw.js', (_req, res) => {
      res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Service-Worker-Allowed', '/');
      res.sendFile(path.join(distDir, 'sw.js'));
    });

    app.use(
      express.static(distDir, {
        setHeaders: (res, filePath) => {
          if (filePath.endsWith('.png') || filePath.endsWith('.svg') || filePath.endsWith('.ico')) {
            res.setHeader('Access-Control-Allow-Origin', '*');
          }
          if (filePath.endsWith('registerSW.js')) {
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
          }
        },
      })
    );

    app.get('/{*splat}', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use((req, res, next) => {
      if (
        req.path === '/manifest.webmanifest' ||
        req.path === '/manifest.json' ||
        req.path.endsWith('.png') ||
        req.path.endsWith('.svg')
      ) {
        res.setHeader('Access-Control-Allow-Origin', '*');
      }
      next();
    });
    app.use(vite.middlewares);
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${port}`);
    // Pre-warm daily BCV cache and refresh every 6 hours
    void getLatestBcvRate(true).catch((err) => {
      console.warn('Initial BCV prefetch warning:', err instanceof Error ? err.message : err);
    });
    setInterval(() => {
      void getLatestBcvRate(true).catch(() => {});
    }, 6 * 60 * 60 * 1000);
  });
}

void startServer();
