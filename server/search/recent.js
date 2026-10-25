import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { serverDirectory } from "../config.js";
import { matchesAddressQuery } from "../../src/lib/search/address.js";
import { visibleListings } from "./status.js";
// Read persisted search and address caches; never extend their status lifetime.
export async function recentListings(candidate) {
  const groups = await Promise.all(
    ["search-sale-v1.json", "address-sale-v2.json", "address-sale-v3.json"].map(async (file) => {
      try {
        return Object.values(
          JSON.parse(
            await readFile(join(serverDirectory, ".cache", file), "utf8"),
          ),
        );
      } catch {
        return [];
      }
    }),
  );
  return visibleListings(
    groups
      .flat()
      .filter((e) => e.until > Date.now() && !e.value?.usingFixtures)
      .flatMap((e) => e.value?.listings || []),
  ).filter(
    (p) =>
      Date.parse(p.checkedAt) > Date.now() - 3600000 &&
      matchesAddressQuery(candidate, p),
  );
}
