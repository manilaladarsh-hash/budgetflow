// Copy the production build from dist/ to the repository root, where GitHub
// Pages serves it from the `main` branch.
import { cpSync, existsSync, readdirSync } from 'node:fs';

const dist = new URL('../dist/', import.meta.url);
const root = new URL('../', import.meta.url);
if (!existsSync(dist)) throw new Error('dist/ is missing — run vite build first.');
for (const entry of readdirSync(dist)) {
  cpSync(new URL(entry, dist), new URL(entry, root), { recursive: true });
}
console.log(`Published ${readdirSync(dist).join(', ')} to the repository root.`);
