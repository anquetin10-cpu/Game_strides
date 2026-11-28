# Equestrian Tour — préparation TestFlight

État vérifié le 18 novembre 2026. Aucun envoi à Apple n'a été effectué.

## Identité de l'application

- Nom affiché : `Equestrian Tour`
- Bundle ID : `com.strides.equestriantour`
- Version marketing : `1.0.0`
- Plateformes : iPhone et iPad, paysage gauche/droite
- Minimum : iOS 16.0
- Architecture : arm64
- Chiffrement non exempt : non (`ITSAppUsesNonExemptEncryption=false`)
- Données collectées par le code applicatif actuel : aucune ; sauvegarde locale uniquement

## État vérifié

- UE 5.8.4 et composant iOS officiel installés.
- Compilation Shipping iOS arm64 réussie.
- Cuisson complète : 570/570 paquets.
- Archive technique complète générée : exécutable, données `.pak/.ucas/.utoc`, icônes et `PrivacyInfo.xcprivacy`.
- 4 944 vérifications du cœur réussies.
- 5/5 tests Unreal réussis : cœur, sauvegarde, unités, architecture du monde et graphe de carrière.
- Commandes tactiles compilées et rendues à l'écran sur Mac avec `-TouchControls`.
- Téléphone, 16 missions, prérequis, récompenses, rangs, minicarte, GPS et sauvegarde de carrière joués dans la
  fenêtre Unreal ; les deux missions initiales ont été terminées puis sauvegardées sans erreur.
- Le parcours CSO est maintenant placé au Pôle International dans le monde de 1,2 km².

## Contrôles restant obligatoires

1. Accepter l'accord Apple Developer en attente dans le compte Apple de Julien.
2. Installer ou créer un certificat Apple Distribution et un profil App Store pour le Bundle ID.
3. Renseigner l'équipe Apple dans les réglages Xcode/Unreal, puis produire une archive signée `Distribution`.
4. Installer une build Development sur un iPhone/iPad réel et vérifier commandes, lisibilité, mémoire, température et 30 i/s stables.
5. Valider dans App Store Connect : nom, Bundle ID, version, catégorie Jeux, absence de collecte de données et conformité chiffrement.
6. Exporter l’IPA App Store et la valider avec Xcode avant tout envoi.
7. Ne téléverser vers TestFlight qu'après validation explicite de Julien.

## Métadonnées TestFlight préparées

- Description bêta : « Equestrian Tour est un jeu équestre 3D natif en monde ouvert. Cette bêta valide l'Écurie du Val, Deauville et ses lieux, le téléphone Strides, la carrière de 16 missions, le guidage GPS, la conduite à pied et à cheval, le parcours CSO et la sauvegarde locale. »
- Points à tester : « Ouvrir le téléphone, lancer une mission, suivre la cible GPS, vérifier crédits et réputation, monter à cheval, changer d'allure, franchir le parcours du Pôle, sauvegarder puis recharger. Signaler tout bouton difficile à atteindre, chute de fluidité ou blocage. »
- Contact bêta : à renseigner par Julien dans App Store Connect.
- Politique de confidentialité : URL publique à fournir avant diffusion externe ; la build actuelle ne collecte aucune donnée applicative.

## Archive technique locale

La sortie régénérable est ignorée par Git :

`StridesGrandTour/Builds/EquestrianTour-IOS-Candidate-20261118/EquestrianTour-complete.xcarchive`

Cette archive n'est pas téléversable telle quelle : elle est volontairement non signée. Elle contient le binaire
arm64, les 570 paquets cuits, les données `.pak/.ucas/.utoc`, le dSYM associé, les icônes et le manifeste de
confidentialité. Elle prouve que le code, les ressources mobiles, l'identité et la cuisson iOS sont prêts pour
l'étape de signature Apple.
