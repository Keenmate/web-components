/**
 * kmwc ports — every repo in components.json that is checked out next to the
 * devkit keeps to its own port block.
 *
 * Doctor checks one repo: its own configs, and siblings inside ITS block. A
 * repo that was never migrated is only seen when the repo it collides with
 * runs doctor; this walks the whole registry at once. Reads kmwc.ports, script
 * flags, vite / playwright configs and Makefiles (the same scan as doctor).
 * Exit 1 on any port outside its block.
 */
import { getPortBlockRange, loadRegistryPortStrays } from '../repo-checks.js';
import { getRegistry } from '../../config.js';

const renderBlock = (portBlock) => getPortBlockRange(portBlock).join('–');

export async function run() {
  const registry = getRegistry();
  const strays = loadRegistryPortStrays(registry);
  if (!strays.length) {
    console.log('✓ every checked-out registry repo keeps to its port block');
    return 0;
  }
  const blockById = Object.fromEntries(registry.components.map((entry) => [entry.id, entry.port]));
  for (const { id, port, file, ownerId } of strays) {
    const collision = ownerId ? ` — inside ${ownerId}'s block ${renderBlock(blockById[ownerId])}` : '';
    console.log(`✗ ${id}: ${file} uses port ${port}, outside its block ${renderBlock(blockById[id])}${collision}`);
  }
  console.log(`\n${strays.length} port(s) outside their block — take them from kmwc.ports (the devkit presets do); a repo not on the devkit yet needs its configs moved to its components.json block`);
  return 1;
}
