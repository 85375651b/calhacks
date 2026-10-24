import { join } from 'node:path';
import { config, serverDirectory } from './config.js';
import { createCache } from './cache.js';
import { createRentCastClient } from './rentcast.js';
import { createLookup, loadFixtures } from './lookup.js';
import { createApp } from './app.js';

const fixtures = config.useFixtures ? await loadFixtures() : undefined;
const lookup = createLookup({
  request: createRentCastClient({ apiKey: config.apiKey }),
  cache: createCache(join(serverDirectory, '.cache', 'lookups.json')),
  useFixtures: config.useFixtures, fixtures,
});
const server = createApp(lookup).listen(config.port, '127.0.0.1', () => {
  console.log(`Property API: http://127.0.0.1:${config.port} (${config.useFixtures ? 'saved fixtures; no quota used' : 'live RentCast with 24h cache'})`);
});
server.on('error', error => { console.error(error.code === 'EADDRINUSE' ? 'API port is in use. Stop the other server or change PORT.' : 'Could not start the API server.'); process.exitCode = 1; });
