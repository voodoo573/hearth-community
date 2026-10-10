#!/usr/bin/env node
// Hearth community content: validator + index.json generator.
// Node 18+, no dependencies.
//
//   node scripts/build-index.mjs           validate everything, then (re)write index.json
//   node scripts/build-index.mjs --check   validate only; never writes (used on pull requests)
//
// Exit code 1 if any item fails validation.

import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname, basename, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SCHEMA_DIR = join(ROOT, 'schema');
const CHECK_ONLY = process.argv.includes('--check');

// Folder -> item type. The folder an item lives in decides its type.
const FOLDERS = {
  races: 'race',
  subclasses: 'subclass',
  spells: 'spell',
  feats: 'feat',
  backgrounds: 'background',
  monsters: 'monster',
  maps: 'map',
  weapons: 'weapon',
  'magic-items': 'magic-item',
};
const TOP_LEVEL_KEYS = new Set(['$schema', 'id', 'name', 'type', 'version', 'author', 'source', 'edition',
  'description', 'summary', 'tags', 'license', 'example', 'credits', 'data']);
const MAX_MAP_BYTES = 5 * 1024 * 1024;      // 5 MB
const MAX_THUMB_BYTES = 200 * 1024;         // 200 KB
const MAX_ITEM_BYTES = 100 * 1024;          // 100 KB per JSON file
const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp']);

const errors = [];
const warnings = [];
const err = (file, msg) => errors.push(`${file}: ${msg}`);
const warn = (file, msg) => warnings.push(`${file}: ${msg}`);

// ---------------------------------------------------------------------------
// Minimal JSON Schema validator (the subset used in schema/*.json):
// $ref (relative file and #/$defs/...), allOf, anyOf, type, const, enum,
// required, properties, patternProperties, additionalProperties, items,
// minItems, maxItems, uniqueItems, minLength, maxLength, pattern, minimum, maximum.
// ---------------------------------------------------------------------------
const schemaCache = new Map();
function loadSchema(file) {
  if (!schemaCache.has(file)) schemaCache.set(file, JSON.parse(readFileSync(join(SCHEMA_DIR, file), 'utf8')));
  return schemaCache.get(file);
}
function resolveRef(ref, baseFile) {
  const [filePart, frag] = ref.split('#');
  const file = filePart || baseFile;
  let node = loadSchema(file);
  if (frag) for (const seg of frag.split('/').filter(Boolean)) node = node[seg];
  if (node === undefined) throw new Error(`Unresolvable $ref ${ref} in ${baseFile}`);
  return { node, file };
}
const typeOf = (v) => v === null ? 'null' : Array.isArray(v) ? 'array'
  : (typeof v === 'number' && Number.isInteger(v)) ? 'integer' : typeof v;
const typeMatches = (v, t) => t === 'number' ? typeof v === 'number' : typeOf(v) === t;

function validate(value, schema, baseFile, path, out) {
  if (schema.$ref) {
    const { node, file } = resolveRef(schema.$ref, baseFile);
    validate(value, node, file, path, out);
  }
  if (schema.allOf) schema.allOf.forEach(s => validate(value, s, baseFile, path, out));
  if (schema.anyOf) {
    const ok = schema.anyOf.some(s => { const o = []; validate(value, s, baseFile, path, o); return o.length === 0; });
    if (!ok) out.push(`${path || '(root)'} does not match any allowed form`);
  }
  if ('const' in schema && JSON.stringify(value) !== JSON.stringify(schema.const)) {
    out.push(`${path || '(root)'} must be ${JSON.stringify(schema.const)}`); return;
  }
  if (schema.enum && !schema.enum.some(e => JSON.stringify(e) === JSON.stringify(value))) {
    out.push(`${path || '(root)'} must be one of: ${schema.enum.join(', ')}`); return;
  }
  if (schema.type) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.some(t => typeMatches(value, t))) { out.push(`${path || '(root)'} must be ${types.join(' or ')}`); return; }
  }
  if (typeof value === 'string') {
    if (schema.minLength != null && value.length < schema.minLength) out.push(`${path} is too short (min ${schema.minLength} characters)`);
    if (schema.maxLength != null && value.length > schema.maxLength) out.push(`${path} is too long (max ${schema.maxLength} characters)`);
    if (schema.pattern && !new RegExp(schema.pattern, 'u').test(value)) out.push(`${path} has an invalid format ("${value.slice(0, 60)}")`);
  }
  if (typeof value === 'number') {
    if (schema.minimum != null && value < schema.minimum) out.push(`${path} must be >= ${schema.minimum}`);
    if (schema.maximum != null && value > schema.maximum) out.push(`${path} must be <= ${schema.maximum}`);
  }
  if (Array.isArray(value)) {
    if (schema.minItems != null && value.length < schema.minItems) out.push(`${path} needs at least ${schema.minItems} entries`);
    if (schema.maxItems != null && value.length > schema.maxItems) out.push(`${path} allows at most ${schema.maxItems} entries`);
    if (schema.uniqueItems && new Set(value.map(v => JSON.stringify(v))).size !== value.length) out.push(`${path} has duplicate entries`);
    if (schema.items) value.forEach((v, i) => validate(v, schema.items, baseFile, `${path}[${i}]`, out));
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const r of schema.required || []) if (!(r in value)) out.push(`${path ? path + '.' : ''}${r} is required`);
    const props = schema.properties || {};
    const pats = Object.entries(schema.patternProperties || {}).map(([p, s]) => [new RegExp(p, 'u'), s]);
    for (const [k, v] of Object.entries(value)) {
      const p = path ? `${path}.${k}` : k;
      let matched = false;
      if (props[k]) { matched = true; validate(v, props[k], baseFile, p, out); }
      for (const [re, s] of pats) if (re.test(k)) { matched = true; validate(v, s, baseFile, p, out); }
      if (!matched && schema.additionalProperties === false) out.push(`${p} is not an allowed field`);
      else if (!matched && typeof schema.additionalProperties === 'object') validate(v, schema.additionalProperties, baseFile, p, out);
    }
  }
}

// ---------------------------------------------------------------------------
// "added" dates: the day each file was first committed (from git history).
// Files that aren't committed yet, or a checkout without history (a shallow
// clone, or no git at all), fall back to today. CI checks out with
// fetch-depth: 0 so the real dates are available there.
// ---------------------------------------------------------------------------
const TODAY = new Date().toISOString().slice(0, 10);
const firstAdded = new Map();
try {
  // Newest first; keep overwriting so the oldest "added" commit wins.
  const log = execFileSync('git', ['log', '--diff-filter=A', '--no-renames', '--format=@@%as', '--name-only', '--', ...Object.keys(FOLDERS)],
    { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
  let day = null;
  for (const line of log.split('\n')) {
    if (line.startsWith('@@')) day = line.slice(2).trim();
    else if (line.trim() && day) firstAdded.set(line.trim(), day);
  }
} catch {
  warnings.push('git history unavailable; every item gets today\'s date as "added"');
}
const addedDate = (rel) => firstAdded.get(rel) || TODAY;

// ---------------------------------------------------------------------------
// Walk content folders
// ---------------------------------------------------------------------------
const items = [];
const seenIds = new Map();
const referencedImages = new Set();

for (const [folder, type] of Object.entries(FOLDERS)) {
  const dir = join(ROOT, folder);
  if (!existsSync(dir)) { warn(folder + '/', 'folder is missing'); continue; }
  for (const name of readdirSync(dir).sort()) {
    const rel = `${folder}/${name}`;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) { err(rel, 'sub-folders are not allowed; put files directly in ' + folder + '/'); continue; }
    if (name.startsWith('.') || name.toLowerCase() === 'readme.md') continue;
    const ext = extname(name).toLowerCase();
    if (ext !== '.json') {
      if (folder === 'maps' && IMAGE_EXTS.has(ext)) continue; // checked via its metadata file below
      err(rel, 'unexpected file; only .json items' + (folder === 'maps' ? ' and map images (.png/.jpg/.webp)' : '') + ' belong here');
      continue;
    }
    if (statSync(full).size > MAX_ITEM_BYTES) err(rel, `JSON file is over ${MAX_ITEM_BYTES / 1024} KB`);
    let item;
    try { item = JSON.parse(readFileSync(full, 'utf8')); }
    catch (e) { err(rel, 'is not valid JSON: ' + e.message); continue; }

    const problems = [];
    validate(item, { $ref: `${type}.schema.json` }, `${type}.schema.json`, '', problems);
    problems.forEach(p => err(rel, p));
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;

    for (const k of Object.keys(item)) if (!TOP_LEVEL_KEYS.has(k)) err(rel, `unknown top-level field "${k}" (type-specific fields go inside "data")`);
    if (item.type !== type) err(rel, `type is "${item.type}" but files in ${folder}/ must have type "${type}"`);
    if (typeof item.id === 'string') {
      if (basename(name, '.json') !== item.id) err(rel, `file name must match id: rename to ${folder}/${item.id}.json`);
      if (seenIds.has(item.id)) err(rel, `id "${item.id}" is already used by ${seenIds.get(item.id)}`);
      else seenIds.set(item.id, rel);
    }
    const d = item.data || {};
    if (d && typeof d === 'object' && 'name' in d && d.name !== item.name) err(rel, `data.name ("${d.name}") must equal name ("${item.name}")`);
    if (type === 'subclass' && typeof item.id === 'string' && d.id && d.id !== item.id.replace(/-/g, '_'))
      warn(rel, `data.id is usually the id with "-" replaced by "_" ("${item.id.replace(/-/g, '_')}")`);
    if (type === 'feat' && typeof item.id === 'string' && d.id && d.id !== item.id.replace(/-/g, '_'))
      warn(rel, `data.id is usually the id with "-" replaced by "_" ("${item.id.replace(/-/g, '_')}")`);
    if (type === 'spell' && d.kind === 'save' && !d.save) err(rel, 'data.save is required when data.kind is "save"');
    if (type === 'spell' && (d.kind === 'attack' || d.kind === 'heal' || d.kind === 'auto') && !d.dice) err(rel, `data.dice is required when data.kind is "${d.kind}"`);
    if (type === 'spell' && d.scaleAt && !d.scaleType) err(rel, 'data.scaleType is required when data.scaleAt is set');
    if (type === 'magic-item' && typeof item.id === 'string' && d.id && d.id !== item.id.replace(/-/g, '_'))
      warn(rel, `data.id is usually the id with "-" replaced by "_" ("${item.id.replace(/-/g, '_')}")`);
    if (type === 'weapon' && Array.isArray(d.props)) {
      if (d.props.includes('light') && d.props.includes('heavy')) err(rel, 'a weapon cannot be both light and heavy');
      if ((d.props.includes('ammunition') || d.props.includes('loading')) && d.kind !== 'ranged') warn(rel, 'ammunition/loading weapons are usually kind "ranged"');
    }
    if (type === 'spell' && d.level === 0 && d.scaleType === 'slot') err(rel, 'cantrips (level 0) scale with scaleType "cantrip", not "slot"');

    let thumbnail;
    if (type === 'map' && d && typeof d.image === 'string') {
      const checkImage = (file, max, label) => {
        const p = join(dir, file);
        if (!existsSync(p)) { err(rel, `${label} "${file}" not found in maps/`); return false; }
        const size = statSync(p).size;
        if (size > max) err(rel, `${label} "${file}" is ${(size / 1048576).toFixed(2)} MB; the limit is ${(max / 1048576).toFixed(2)} MB`);
        if (size === 0) err(rel, `${label} "${file}" is empty`);
        referencedImages.add(file);
        return true;
      };
      if (!d.image.startsWith(item.id + '.') ) warn(rel, `image is usually named after the id, e.g. ${item.id}.png`);
      checkImage(d.image, MAX_MAP_BYTES, 'image');
      if (d.thumbnail) { if (checkImage(d.thumbnail, MAX_THUMB_BYTES, 'thumbnail')) thumbnail = `maps/${d.thumbnail}`; }
      else thumbnail = `maps/${d.image}`;
      const dims = readImageSize(join(dir, d.image));
      if (dims && (dims.width !== d.widthPx || dims.height !== d.heightPx))
        err(rel, `widthPx/heightPx (${d.widthPx}x${d.heightPx}) do not match the image (${dims.width}x${dims.height})`);
    }

    if (problems.length === 0) {
      const summary = item.summary || truncate(item.description, 140);
      const entry = {
        id: item.id, type: item.type, name: item.name, author: item.author, summary,
        path: rel, version: item.version, tags: item.tags, added: addedDate(rel),
      };
      if (item.example === true) entry.example = true;
      if (thumbnail) entry.thumbnail = thumbnail;
      items.push(entry);
    }
  }
}

// Orphaned map images
if (existsSync(join(ROOT, 'maps'))) {
  for (const name of readdirSync(join(ROOT, 'maps'))) {
    if (IMAGE_EXTS.has(extname(name).toLowerCase()) && !referencedImages.has(name))
      err(`maps/${name}`, 'image is not referenced by any map .json file');
  }
}

function truncate(s, n) {
  s = String(s || '').replace(/\s+/g, ' ').trim();
  if (s.length <= n) return s;
  const cut = s.slice(0, n - 1);
  const sp = cut.lastIndexOf(' ');
  return (sp > n * 0.6 ? cut.slice(0, sp) : cut).replace(/[\s.,;:]+$/, '') + '\u2026';
}

// PNG / JPEG / WebP dimension reader (header only, no dependencies).
function readImageSize(p) {
  if (!existsSync(p)) return null;
  const b = readFileSync(p);
  if (b.length > 24 && b.readUInt32BE(0) === 0x89504e47) return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
  if (b.length > 4 && b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i < b.length - 9) {
      if (b[i] !== 0xff) { i++; continue; }
      const m = b[i + 1];
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { height: b.readUInt16BE(i + 5), width: b.readUInt16BE(i + 7) };
      i += 2 + b.readUInt16BE(i + 2);
    }
    return null;
  }
  if (b.length > 30 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') {
    const fmt = b.toString('ascii', 12, 16);
    if (fmt === 'VP8 ') return { width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff };
    if (fmt === 'VP8L') { const n = b.readUInt32LE(21); return { width: (n & 0x3fff) + 1, height: ((n >> 14) & 0x3fff) + 1 }; }
    if (fmt === 'VP8X') return { width: 1 + b.readUIntLE(24, 3), height: 1 + b.readUIntLE(27, 3) };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Report + write
// ---------------------------------------------------------------------------
const order = Object.values(FOLDERS);
items.sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));

warnings.forEach(w => console.log(`::warning::${w}`));
if (errors.length) {
  errors.forEach(e => console.log(`::error::${e}`));
  console.log(`\n${errors.length} error(s), ${warnings.length} warning(s). index.json was not written.`);
  process.exit(1);
}

const indexPath = join(ROOT, 'index.json');
let previous = null;
try { previous = JSON.parse(readFileSync(indexPath, 'utf8')); } catch {}
const unchanged = previous && JSON.stringify(previous.items) === JSON.stringify(items);
const index = {
  schemaVersion: 1,
  // Keep the old timestamp when nothing changed, so rebuilding is a no-op.
  updated: unchanged && previous.updated ? previous.updated : new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
  items,
};
const idxProblems = [];
validate(index, { $ref: 'index.schema.json' }, 'index.schema.json', '', idxProblems);
if (idxProblems.length) { idxProblems.forEach(p => console.log(`::error::index.json: ${p}`)); process.exit(1); }

const counts = order.map(t => `${items.filter(i => i.type === t).length} ${t}`).join(', ');
console.log(`OK: ${items.length} item(s) valid (${counts}). ${warnings.length} warning(s).`);
if (CHECK_ONLY) {
  console.log(unchanged ? 'index.json is up to date.' : 'index.json will be regenerated automatically after merge.');
} else if (unchanged) {
  console.log('index.json unchanged.');
} else {
  writeFileSync(indexPath, JSON.stringify(index, null, 2) + '\n');
  console.log('Wrote index.json.');
}
