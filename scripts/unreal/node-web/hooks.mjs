// Chargeur Node pour importer les modules du jeu web hors navigateur (export des missions, J3) : les imports d'actifs
// (images, sons, modèles, feuilles de style) deviennent un module qui exporte leur URL. Ne modifie rien dans src/.
export async function load(url, ctx, next) {
  if (/\.(png|jpe?g|svg|webp|gif|glb|gltf|mp3|ogg|wav|m4a|css)(\?.*)?$/.test(url)) {
    return { format: 'module', source: `export default ${JSON.stringify(url)};`, shortCircuit: true };
  }
  return next(url, ctx);
}
