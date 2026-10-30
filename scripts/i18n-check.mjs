// Vérification des traductions anglaises (voir src/core/i18n.js).
// Usage : node scripts/i18n-check.mjs [fichiers…]   (sans argument : tout src/)
//   - clés t('…') / T`…` sans traduction anglaise, ou dont les {0}, {1}… ne correspondent pas ;
//   - textes en français probables restés hors de t() / T (à vérifier : identifiants, couleurs, etc. sont ignorés).
// Code de sortie 1 si une clé manque ou si un gabarit est incohérent.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { parseAst } from 'rollup/parseAst';

const ROOT = new URL('..', import.meta.url).pathname;
const SRC = join(ROOT, 'src');
const files = process.argv.slice(2).length ? process.argv.slice(2).map((f) => join(ROOT, f)) : walk(SRC);
function walk(d) {
  const out = [];
  for (const n of readdirSync(d)) {
    const p = join(d, n);
    if (statSync(p).isDirectory()) {
      if (!p.includes(`${join('src', 'i18n')}`)) out.push(...walk(p));
    } else if (p.endsWith('.js') && !p.endsWith('core/i18n.js')) out.push(p);
  }
  return out;
}

const EN = {};
for (const n of readdirSync(join(SRC, 'i18n', 'en'))) Object.assign(EN, (await import(join(SRC, 'i18n', 'en', n))).default);

const holes = (s) => [...s.matchAll(/\{(\d+)\}/g)].map((m) => m[1]).sort().join(',');
const FRENCH = /[éèêàùçâîôûœÉÈÀÇ’«»]|\b(le|la|les|des|du|une|un|est|et|ton|ta|tes|vous|pour|avec|sur|dans|pas|au|aux|en)\b/i;
const IGNORE = /^(#[0-9a-f]{3,8}|[a-z0-9_\-./:#?=&%]+|[A-Z0-9_]+|\s*)$/;

let missing = 0, bad = 0, suspects = 0;
for (const f of files) {
  const src = readFileSync(f, 'utf8');
  let ast;
  try {
    ast = parseAst(src);
  } catch (e) {
    console.log(`${relative(ROOT, f)} : analyse impossible (${e.message})`);
    bad++;
    continue;
  }
  const lineOf = (pos) => src.slice(0, pos).split('\n').length;
  const wrapped = new Set();
  const keys = [];
  const visit = (n, parent, pkey) => {
    if (!n || typeof n.type !== 'string') return;
    if (n.type === 'CallExpression' && n.callee.type === 'Identifier' && n.callee.name === 't' && n.arguments[0]) {
      const a = n.arguments[0];
      if (a.type === 'Literal' && typeof a.value === 'string') keys.push([a.value, n.start]), wrapped.add(a);
      else if (a.type === 'TemplateLiteral' && !a.expressions.length) keys.push([a.quasis[0].value.cooked, n.start]), wrapped.add(a);
    }
    if (n.type === 'TaggedTemplateExpression' && n.tag.type === 'Identifier' && n.tag.name === 'T') {
      const q = n.quasi.quasis.map((x) => x.value.cooked);
      let k = q[0];
      for (let i = 1; i < q.length; i++) k += `{${i - 1}}${q[i]}`;
      keys.push([k, n.start]);
      wrapped.add(n.quasi);
    }
    // Textes probablement affichés, hors t() / T.
    const skip = parent && ((parent.type === 'ImportDeclaration') || (parent.type === 'ExportNamedDeclaration') || (parent.type === 'Property' && pkey === 'key') || (parent.type === 'MemberExpression' && pkey === 'property'));
    if (!skip && !wrapped.has(n)) {
      let text = null;
      if (n.type === 'Literal' && typeof n.value === 'string') text = n.value;
      else if (n.type === 'TemplateLiteral' && !(parent?.type === 'TaggedTemplateExpression')) text = n.quasis.map((x) => x.value.cooked).join('…');
      if (text && !IGNORE.test(text) && FRENCH.test(text) && /\s/.test(text.trim()) || (text && /[éèêàùç’]/.test(text) && !IGNORE.test(text))) {
        console.log(`  ? ${relative(ROOT, f)}:${lineOf(n.start)} non traduit : ${JSON.stringify(text.slice(0, 90))}`);
        suspects++;
      }
    }
    for (const k of Object.keys(n)) {
      if (k === 'start' || k === 'end') continue;
      const v = n[k];
      if (Array.isArray(v)) v.forEach((c) => visit(c, n, k));
      else if (v && typeof v.type === 'string') visit(v, n, k);
    }
  };
  visit(ast, null, null);
  for (const [k, pos] of keys) {
    const e = EN[k];
    if (e === undefined) {
      console.log(`✘ ${relative(ROOT, f)}:${lineOf(pos)} sans traduction : ${JSON.stringify(k)}`);
      missing++;
    } else if (holes(e) !== holes(k)) {
      console.log(`✘ ${relative(ROOT, f)}:${lineOf(pos)} gabarit incohérent : ${JSON.stringify(k)} → ${JSON.stringify(e)}`);
      bad++;
    }
  }
}
console.log(`\n${Object.keys(EN).length} traductions · ${missing} clé(s) sans traduction · ${bad} incohérence(s) · ${suspects} texte(s) français probable(s) hors t()/T`);
process.exit(missing || bad ? 1 : 0);
