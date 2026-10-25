import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {serverDirectory} from '../config.js';
import {exactAddress} from '../../src/lib/search/address.js';
import {visibleListings} from './status.js';
// Read the existing persisted search cache; no duplicate database or stale index.
export async function recentListings(candidate) {
  try {
    const entries=JSON.parse(await readFile(join(serverDirectory,'.cache','search-sale-v1.json'),'utf8'));
    return visibleListings(Object.values(entries).filter(e=>e.until>Date.now()&&!e.value?.usingFixtures).flatMap(e=>e.value?.listings||[]))
      .filter(p=>Date.parse(p.checkedAt)>Date.now()-3600000&&exactAddress(candidate,p));
  } catch {return [];}
}
