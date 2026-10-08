/**
 * ============================================================
 *  CONFIG DU SITE — modifie ici le nom, le logo et les textes
 * ============================================================
 *  1. Change `brandName` pour ton nom
 *  2. Remplace le fichier `assets/logo.svg` (ou mets un .png/.jpg
 *     et mets à jour `logoPath` ci-dessous)
 *  3. Adapte les textes de l'âge si besoin
 */
window.SITE_CONFIG = {
  brandName: "Maria",
  logoPath: "assets/logo.svg",
  tagline: "Bienvenue. L’accès est réservé aux personnes majeures.",

  ageGate: {
    title: "Vérification d’âge",
    message:
      "Ce site est réservé aux personnes de 18 ans et plus. En continuant, tu confirmes avoir l’âge légal requis.",
    confirmLabel: "J’ai 18 ans",
    denyLabel: "Je n’ai pas 18 ans",
    deniedTitle: "Accès refusé",
    deniedMessage:
      "Désolé — tu ne peux pas entrer sur ce site si tu as moins de 18 ans.",
  },
};
