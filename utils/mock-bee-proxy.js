#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */
/* eslint-disable no-console */

/**
 * Dev helper to manually test postage stamp error handling in the dashboard.
 *
 * Proxies all requests to a real Bee node, optionally overriding selected endpoints:
 *
 *   STATUS=400 MESSAGE='out of funds' pnpm mock:bee   # POST /stamps/* fails with that error
 *   POOR_WALLET=1 pnpm mock:bee                       # GET /wallet reports ~0 balances
 *   POOR_WALLET=1 BZZ=999999999999999999 DAI=0 pnpm mock:bee
 *
 * Then point the dashboard's Bee API endpoint (Settings page) to http://localhost:11633.
 * Real node messages to simulate (bee pkg/api/postage.go): "out of funds", "invalid depth",
 * "insufficient amount for 24h minimum validity", "no chain backend", "cannot create batch".
 */
const http = require('http')

const { STATUS, MESSAGE, POOR_WALLET, BZZ = '100', DAI = '0' } = process.env
const BEE_API = { host: 'localhost', port: 1633 }
const PORT = 11633

http
  .createServer((req, res) => {
    const json = (code, body) => {
      res.writeHead(code, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' })
      res.end(JSON.stringify(body))
    }

    if (STATUS && req.method === 'POST' && req.url.startsWith('/stamps/')) {
      return json(Number(STATUS), { code: Number(STATUS), message: MESSAGE })
    }

    if (POOR_WALLET && req.method === 'GET' && req.url === '/wallet') {
      return json(200, {
        bzzBalance: BZZ,
        nativeTokenBalance: DAI,
        chainID: 100,
        chequebookContractAddress: '0x0',
        walletAddress: '0x0',
      })
    }

    const forward = http.request({ ...BEE_API, path: req.url, method: req.method, headers: req.headers }, upstream => {
      res.writeHead(upstream.statusCode, upstream.headers)
      upstream.pipe(res)
    })
    forward.on('error', () => json(502, { code: 502, message: 'mock proxy: bee node unreachable' }))
    req.pipe(forward)
  })
  .listen(PORT, () => {
    console.log(`Mock bee proxy on http://localhost:${PORT} -> http://${BEE_API.host}:${BEE_API.port}`, {
      STATUS,
      MESSAGE,
      POOR_WALLET,
    })
  })
