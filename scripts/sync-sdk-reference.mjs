#!/usr/bin/env node
// The SDK API reference page is generated from the SDK repo (P1.8):
// flutter_dectog/doc/api-reference.md is the one source, which the package
// also turns into its llms.txt. This copies it into the site with the page's
// frontmatter, without the source's comment and H1, and with links to this
// site made relative so the link validator checks them.
//
//   npm run sync:sdk-reference              write the page (needs ../flutter_dectog)
//   npm run sync:sdk-reference -- --check   exit 1 when the page is out of date
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = join(ROOT, '..', 'flutter_dectog', 'doc', 'api-reference.md');
const PAGE = join(ROOT, 'src', 'content', 'docs', 'sdk', 'api-reference.md');

const FRONTMATTER = `---
title: API reference
description: Every public class, method, field, stream and enum of flutter_dectog with its type, default and HTTP endpoint.
sidebar:
  order: 10
---

<!-- Generated from flutter_dectog/doc/api-reference.md by npm run sync:sdk-reference. Edit it there. -->
`;

export function pageFrom(source) {
  const body = source
    .replace(/^<!--[\s\S]*?-->\s*/, '')
    .replace(/^# .+\n+/, '')
    .replaceAll('](https://docs.dectog.com/', '](/');
  return `${FRONTMATTER}\n${body.trimEnd()}\n`;
}

if (!existsSync(SOURCE)) {
  console.error(`No ${SOURCE}: clone DecTog/flutter_dectog next to this repo.`);
  process.exit(2);
}
const expected = pageFrom(readFileSync(SOURCE, 'utf8'));
const current = existsSync(PAGE) ? readFileSync(PAGE, 'utf8') : null;
if (process.argv.includes('--check')) {
  if (current !== expected) {
    console.error('sdk/api-reference.md is out of date: run npm run sync:sdk-reference');
    process.exit(1);
  }
  console.log('sdk/api-reference.md matches flutter_dectog.');
} else if (current === expected) {
  console.log('sdk/api-reference.md already matches flutter_dectog.');
} else {
  writeFileSync(PAGE, expected);
  console.log('Wrote src/content/docs/sdk/api-reference.md');
}
