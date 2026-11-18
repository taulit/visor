// Copies what the site shares with the repository, so there is one source:
// the screenshots of docs/screenshots (taken by scripts/shots.sh) and the
// module contract docs/api-v1.md, with its relative links pointed at GitHub.
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, posix } from 'node:path';
import { fileURLToPath } from 'node:url';

const site = join(dirname(fileURLToPath(import.meta.url)), '..');
const repo = join(site, '..');
const github = 'https://github.com/taulit/visor/blob/main/';

const shots = [
  'open-real-dark',
  'open-real-light',
  'peek-dark',
  'hint-dark',
  'search-dark',
  'search-convert-dark',
  'search-date-dark',
  't3-dark',
  'now-dark',
  'ahead-dark',
  'modules-view-dark',
  'prefs-general-dark',
  'prefs-modules-dark',
];
const shotDir = join(site, 'src/assets/screenshots');
mkdirSync(shotDir, { recursive: true });
for (const name of shots)
  copyFileSync(join(repo, 'docs/screenshots', `${name}.png`), join(shotDir, `${name}.png`));

const api = readFileSync(join(repo, 'docs/api-v1.md'), 'utf8')
  // The page title comes from the front matter.
  .replace(/^# .*\n+/, '')
  // Links relative to docs/ go to the file on GitHub.
  .replace(/\]\((?!https?:|#|mailto:)([^)\s]+)\)/g, (_, target) => {
    const [path, hash] = target.split('#');
    const resolved = posix.normalize(posix.join('docs', path));
    return `](${github}${resolved}${hash ? `#${hash}` : ''})`;
  });
const front = `---
title: Module API reference (v1)
description: "The frozen contract of version 1 of the Visor module API for GNOME Shell extensions, with slots, the module context, rows, sections, dock views, search and commands."
editUrl: ${github.replace('/blob/', '/edit/')}docs/api-v1.md
---

:::note
This page is generated from [docs/api-v1.md](${github}docs/api-v1.md). The types in \`src/api.ts\` are authoritative.
:::

`;
writeFileSync(join(site, 'src/content/docs/modules/api-v1.md'), front + api);
console.log(`synced ${shots.length} screenshots and the API reference`);
