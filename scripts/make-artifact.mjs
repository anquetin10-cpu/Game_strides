// Transforme dist-single/index.html en page Artifact (contenu sans squelette html/head/body).
import { readFileSync, writeFileSync } from 'node:fs';
const [, , input = 'dist-single/index.html', output = 'dist-single/artifact.html'] = process.argv;
const html = readFileSync(input, 'utf8');
const grab = (re) => [...html.matchAll(re)].map((m) => m[0]);
const fonts = grab(/<link[^>]+fonts\.googleapis\.com\/css2[^>]*>/g);
const preconnect = grab(/<link rel="preconnect"[^>]*>/g);
const styles = grab(/<style[^>]*>[\s\S]*?<\/style>/g);
const scripts = grab(/<script type="module"[^>]*>[\s\S]*?<\/script>/g);
const body = html.match(/<body[^>]*>([\s\S]*?)<\/body>/)[1].replace(/<script[\s\S]*?<\/script>/g, '').trim();
const out = [
  '<title>Equestrian Tour</title>',
  '<meta name="claude:viewport-fit-sides" content="cover">',
  '<meta name="description" content="Equestrian Tour : le monde équestre en monde ouvert, avec l’application Strides intégrée au téléphone du personnage.">',
  ...preconnect,
  ...fonts,
  ...styles,
  body,
  ...scripts,
].join('\n');
writeFileSync(output, out);
console.log(`${output}: ${(out.length / 1024).toFixed(0)} Ko, ${scripts.length} script(s), ${styles.length} style(s)`);
