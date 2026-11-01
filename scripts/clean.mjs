// Remove the previous production build before writing a new one.
import { rmSync } from 'node:fs';
rmSync(new URL('../assets', import.meta.url), { recursive: true, force: true });
