#!/usr/bin/env node
// The SDK API reference pages are generated from the SDK repos (P1.8, P5.1):
// each SDK's doc/api-reference.md is the one source, which the package also
// turns into its llms.txt. This copies each into the site with the page's
// frontmatter, without the source's comment and H1, and with links to this
// site made relative so the link validator checks them.
//
//   npm run sync:sdk-reference              write the pages (needs ../flutter_dectog, ../react-native-dectog)
//   npm run sync:sdk-reference -- --check   exit 1 when a page is out of date
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const PAGES = [
  {
    repo: 'flutter_dectog',
    page: 'sdk/api-reference.md',
    frontmatter: `---
title: API reference
description: Every public class, method, field, stream and enum of flutter_dectog with its type, default and HTTP endpoint.
sidebar:
  order: 10
---`,
  },
  {
    repo: 'react-native-dectog',
    page: 'react-native/api-reference.md',
    frontmatter: `---
title: API reference
description: Every export, method, option and type of react-native-dectog, the React Native and Expo SDK.
sidebar:
  order: 10
---`,
  },
];

export function pageFrom(source, { repo, frontmatter }) {
  const body = source
    .replace(/^<!--[\s\S]*?-->\s*/, '')
    .replace(/^# .+\n+/, '')
    .replaceAll('](https://docs.dectog.com/', '](/');
  return `${frontmatter}\n\n<!-- Generated from ${repo}/doc/api-reference.md by npm run sync:sdk-reference. Edit it there. -->\n\n${body.trimEnd()}\n`;
}

let failed = false;
for (const p of PAGES) {
  const source = join(ROOT, '..', p.repo, 'doc', 'api-reference.md');
  const page = join(ROOT, 'src', 'content', 'docs', p.page);
  if (!existsSync(source)) {
    console.error(`No ${source}: clone DecTog/${p.repo} next to this repo.`);
    process.exit(2);
  }
  const expected = pageFrom(readFileSync(source, 'utf8'), p);
  const current = existsSync(page) ? readFileSync(page, 'utf8') : null;
  if (process.argv.includes('--check')) {
    if (current !== expected) {
      console.error(`${p.page} is out of date: run npm run sync:sdk-reference`);
      failed = true;
    } else {
      console.log(`${p.page} matches ${p.repo}.`);
    }
  } else if (current === expected) {
    console.log(`${p.page} already matches ${p.repo}.`);
  } else {
    writeFileSync(page, expected);
    console.log(`Wrote src/content/docs/${p.page}`);
  }
}
if (failed) process.exit(1);
