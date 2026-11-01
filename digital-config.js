/*
  Configuration centralisée de l'offre « Création digitale ».
  Modifier ici les prix (en euros), les formules, les options et les fonctionnalités :
  la page et le configurateur se mettent à jour automatiquement.
  quote: true  =>  « Sur devis » : jamais chiffré, déclenche le message d'étude personnalisée.
*/

export const DIGITAL_CONFIG = {
  currency: "€",

  intro: {
    eyebrow: "Création digitale",
    title: "Votre univers, jusque dans le digital.",
    paragraphs: [
      "Un lieu ou une marque ne se raconte pas uniquement à travers son image. Son identité se prolonge dans chaque expérience, jusque sur son site internet.",
      "De la direction artistique à la conception web, en passant par la création de contenus photographiques et audiovisuels, nous imaginons des expériences digitales cohérentes, singulières et pensées pour votre activité."
    ],
    axes: [
      { number: "01", title: "Conception web", text: "Design, architecture, expérience utilisateur et développement de sites internet." },
      { number: "02", title: "Direction artistique", text: "Identité visuelle, univers graphique, cohérence des supports et expérience digitale." },
      { number: "03", title: "Création de contenus", text: "Photographie, vidéo et prises de vues aériennes par drone." }
    ],
    // Captures à déposer dans images/digital/ ; tant qu'elles sont absentes, un cadre « à venir » s'affiche.
    previews: {
      desktop: { src: "images/digital/apercu-ordinateur.jpg", alt: "Aperçu d'un site internet sur ordinateur" },
      mobile: { src: "images/digital/apercu-mobile.jpg", alt: "Aperçu d'un site internet sur mobile" }
    }
  },

  formulas: [
    {
      id: "essentiel",
      name: "Essentiel",
      price: 650,
      audience: "Pour les indépendants, artisans et petites structures.",
      configuratorLabel: "One-page ou site simple",
      features: [
        "Site one-page ou site simple",
        "Direction artistique adaptée à la marque",
        "Design responsive",
        "Présentation de l'activité et des prestations",
        "Intégration des photographies fournies",
        "Formulaire de contact",
        "Optimisation technique de base"
      ],
      note: "Shooting, vidéo et drone en supplément."
    },
    {
      id: "signature",
      name: "Signature",
      price: 1200,
      audience: "Pour les hôtels, restaurants, domaines et marques.",
      configuratorLabel: "Site vitrine multipage",
      features: [
        "Site vitrine multipage",
        "Direction artistique personnalisée",
        "Architecture et expérience utilisateur travaillées",
        "Pages dédiées aux activités et prestations",
        "Galerie photographique",
        "Animations et interactions sur mesure",
        "Formulaire de contact ou demande de devis",
        "Responsive design",
        "Référencement naturel de base"
      ],
      note: "Possibilité d'intégrer un shooting photo ou vidéo."
    },
    {
      id: "immersion",
      name: "Immersion",
      price: 2000,
      audience: "Pour les projets entièrement personnalisés.",
      configuratorLabel: "Site personnalisé",
      features: [
        "Site entièrement personnalisé",
        "Architecture de pages adaptée au projet",
        "Direction artistique approfondie",
        "Design et expérience utilisateur sur mesure",
        "Animations et interactions avancées",
        "Intégration de photographies et vidéos",
        "Galeries et contenus immersifs",
        "Fonctionnalités spécifiques selon les besoins",
        "Responsive design",
        "Référencement naturel de base"
      ],
      note: "Possibilité d'intégrer un shooting photo, une production vidéo et des prises de vues drone."
    }
  ],

  formulasFootnote:
    "Les fonctionnalités spécifiques comme la réservation en ligne, le paiement, l'espace client ou le catalogue dynamique nécessitent une étude et un devis complémentaire.",

  contentOptions: [
    { id: "photo", name: "Shooting photographique", price: 250 },
    { id: "video", name: "Production vidéo", price: 450 },
    { id: "drone", name: "Prises de vues aériennes par drone", price: 150 }
  ],
  noContentLabel: "Aucun shooting, je possède déjà mes contenus",

  optionsTitle: "Options de création de contenus",
  optionsText: "Des options modulables, qui peuvent être ajoutées à toutes les formules.",
  optionsFootnote:
    "Le tarif définitif dépend du lieu, du temps de production, du volume de contenus et des contraintes techniques.",

  features: [
    { id: "galerie", name: "Galerie photographique", quote: false },
    { id: "contact", name: "Formulaire de contact", quote: false },
    { id: "devis", name: "Demande de devis", quote: false },
    { id: "reservation", name: "Réservation en ligne", quote: true },
    { id: "paiement", name: "Paiement en ligne", quote: true },
    { id: "catalogue", name: "Catalogue ou présentation de produits", quote: true },
    { id: "autre", name: "Autre besoin spécifique", quote: true }
  ],

  studyMessage: "Votre projet nécessite une étude personnalisée. Le montant définitif sera précisé après échange.",
  disclaimer: "Cette estimation est indicative et ne constitue pas un devis contractuel.",
  contactService: "Lieux & marques"
};

export function formatPrice(value, config = DIGITAL_CONFIG) {
  return `${value.toLocaleString("fr-FR")}\u00a0${config.currency}`;
}
