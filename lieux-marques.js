const content = {
  hero: {
    eyebrow: "Photographie · Lieux & marques",
    title: "Des lieux à vivre.\nDes histoires à raconter.",
    intro: "Des images éditoriales pour révéler l’identité d’un lieu, d’une marque ou d’un savoir-faire.",
    image: "images/lieux-marques.jpg",
    imageAlt: "Façade de l’Hôtel Plaza Madeleine photographiée depuis la rue."
  },
  portfolio: {
    eyebrow: "Sélection photographique",
    title: "Lieux, gestes et matières.",
    intro: "Une première image issue du portfolio. Les autres emplacements attendent vos photographies de projets.",
    items: [
      {
        image: "images/lieux-marques.jpg",
        alt: "Façade de l’Hôtel Plaza Madeleine.",
        caption: "Hospitalité",
        className: "lm-mosaic-item--large"
      },
      {
        placeholder: "Photographie à ajouter",
        caption: "Architecture",
        className: "lm-mosaic-item--tall"
      },
      {
        placeholder: "Photographie à ajouter",
        caption: "Savoir-faire",
        className: "lm-mosaic-item--small"
      },
      {
        placeholder: "Photographie à ajouter",
        caption: "Matières",
        className: "lm-mosaic-item--wide"
      },
    ]
  },
  approach: {
    eyebrow: "L’approche",
    title: "Révéler ce qui rend chaque lieu singulier.",
    text: "Une architecture, une matière, un geste ou une lumière participent à l’identité d’un lieu. Mon approche consiste à les observer et à les réunir dans une série d’images cohérente, pensée pour raconter un univers et prolonger son identité visuelle.",
    image: "images/accueil.jpg",
    imageAlt: "Hôtel Plaza Madeleine, façade et volets photographiés en lumière naturelle.",
    note: "Photographie présente dans le portfolio"
  },
  offers: {
    eyebrow: "Des formats adaptés à votre projet",
    title: "Les prestations",
    intro: "De la séance ponctuelle à la création d’une bibliothèque de contenus, chaque accompagnement est pensé selon vos besoins.",
    note: "Chaque projet est différent. Les prestations sont adaptées au lieu, aux besoins et aux usages des images.",
    priceNote: "Prix et volumes indicatifs, à ajuster selon le périmètre du projet.",
    packs: [
      {
        id: "essential-offer",
        number: "01",
        title: "L’Essentiel",
        price: "À partir de 250 €",
        description: "Pour renouveler les visuels d’un lieu, présenter un produit ou mettre en valeur un savoir-faire.",
        deliverables: [
          "Préparation du shooting.",
          "Séance photo ponctuelle sur un lieu défini.",
          "Sélection de photographies retouchées.",
          "Livraison numérique adaptée au web et aux réseaux sociaux."
        ],
        cta: "Demander un devis",
        className: "lm-offer-card--essential"
      },
      {
        id: "identity-offer",
        number: "02",
        title: "L’Identité",
        description: "Pour créer une bibliothèque d’images cohérente et alimenter votre communication sur plusieurs semaines.",
        cta: "Construire mon accompagnement",
        className: "lm-offer-card--identity",
        plans: [
          {
            id: "two-months",
            duration: "2 mois",
            name: "Le lancement",
            price: 650,
            deliverables: [
              "1 séance photo de 2 à 3 heures.",
              "20 à 30 photographies retouchées.",
              "5 à 8 vidéos courtes verticales.",
              "Une mini-banque de contenus classée par thème.",
              "Un calendrier éditorial indicatif sur 2 mois.",
              "Livraison des fichiers prêts à publier."
            ]
          },
          {
            id: "three-months",
            duration: "3 mois",
            name: "La saison",
            price: 1100,
            deliverables: [
              "2 séances photo réparties sur la période.",
              "35 à 50 photographies retouchées.",
              "8 à 12 vidéos courtes verticales.",
              "3 séries de contenus thématiques.",
              "Un calendrier éditorial sur 3 mois.",
              "Des contenus adaptés aux publications, stories et Reels."
            ]
          },
          {
            id: "six-months",
            duration: "6 mois",
            name: "L’année en images",
            price: 2200,
            deliverables: [
              "4 séances photo réparties sur 6 mois.",
              "70 à 100 photographies retouchées.",
              "16 à 24 vidéos courtes verticales.",
              "Des séries adaptées aux saisons et aux temps forts.",
              "Un calendrier éditorial global, actualisé au fil des séances.",
              "Une banque de contenus organisée et livrée progressivement."
            ]
          }
        ]
      },
      {
        id: "collection-offer",
        number: "03",
        title: "La Collection",
        price: "À partir de 900 €",
        description: "Pour les marques et les établissements qui souhaitent une direction artistique plus approfondie et une production de contenus adaptée à leurs différents besoins.",
        deliverables: [
          "Préparation éditoriale et direction artistique.",
          "Reportages photographiques et contenus vidéo selon le projet.",
          "Plusieurs séances ou temps de production.",
          "Banque d’images structurée et cohérente.",
          "Possibilité d’accompagnement sur 2, 3 ou 6 mois."
        ],
        note: "Livrables et tarif définis sur mesure.",
        cta: "Imaginer un projet",
        className: "lm-offer-card--collection"
      }
    ]
  },
  editorial: {
    eyebrow: "Accompagnement éditorial",
    title: "Des images pour faire vivre votre communication.",
    text: "Construire une bibliothèque de contenus cohérente, pensée pour vos prochaines semaines de communication et adaptée à l’identité de votre établissement ou de votre marque.",
    keywords: [
      "Photographie",
      "Direction artistique",
      "Création de contenu",
      "Planification"
    ],
    placeholder: "Photographie éditoriale à ajouter pour l’accompagnement de contenu."
  },
  final: {
    eyebrow: "Projet sur mesure",
    title: "Un projet particulier ?",
    text: "Parlons de votre lieu, de votre activité ou de votre univers pour imaginer une série d’images adaptée à vos besoins."
  }
};

const money = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0
});

function setText(id, value) {
  document.getElementById(id).textContent = value;
}

function createElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function createLink(href, className, label) {
  const link = createElement("a", className);
  link.href = href;
  link.append(document.createTextNode(label));
  const arrow = createElement("span", "", "↗");
  arrow.setAttribute("aria-hidden", "true");
  link.append(" ", arrow);
  return link;
}

function renderMosaic() {
  const mosaic = document.getElementById("lm-mosaic");
  for (const item of content.portfolio.items) {
    const figure = createElement("figure", `lm-mosaic-item ${item.className}`);
    if (item.image) {
      const image = createElement("img");
      image.src = item.image;
      image.alt = item.alt;
      image.loading = "lazy";
      figure.append(image);
    } else {
      const placeholder = createElement("div", "lm-photo-placeholder");
      placeholder.setAttribute("role", "img");
      placeholder.setAttribute("aria-label", `${item.caption} : photographie à ajouter`);
      placeholder.append(
        createElement("span", "lm-placeholder-index", String(content.portfolio.items.indexOf(item) + 1).padStart(2, "0")),
        createElement("span", "lm-placeholder-title", item.placeholder),
        createElement("span", "lm-placeholder-caption", `Emplacement ${item.caption.toLowerCase()}`)
      );
      figure.append(placeholder);
    }
    figure.append(createElement("figcaption", "", item.caption));
    mosaic.append(figure);
  }
}

function renderOfferHeading(offer) {
  const header = createElement("header", "lm-offer-header");
  header.append(
    createElement("span", "lm-offer-number", offer.number),
    createElement("h3", "", offer.title)
  );
  return header;
}

function renderDeliverables(container, items) {
  const list = createElement("ul", "lm-deliverables");
  for (const item of items) {
    list.append(createElement("li", "", item));
  }
  if (container) container.append(list);
  return list;
}

function renderSimpleOffer(offer) {
  const card = createElement("article", `lm-offer-card ${offer.className}`);
  card.id = offer.id;
  card.append(renderOfferHeading(offer));
  card.append(createElement("p", "lm-offer-price", offer.price));
  card.append(createElement("p", "lm-offer-description", offer.description));
  renderDeliverables(card, offer.deliverables);
  if (offer.note) card.append(createElement("p", "lm-offer-subnote", offer.note));
  card.append(createLink("contact.html", "lm-offer-cta", offer.cta));
  return card;
}

function renderIdentityOffer(offer) {
  const card = createElement("article", `lm-offer-card ${offer.className}`);
  card.id = offer.id;
  card.append(renderOfferHeading(offer));
  card.append(createElement("p", "lm-offer-description", offer.description));

  const planNav = createElement("div", "lm-plan-switcher");
  planNav.setAttribute("role", "group");
  planNav.setAttribute("aria-label", "Durée de l’accompagnement");
  const planContent = createElement("div", "lm-plan-content");
  planContent.id = "lm-plan-content";
  planContent.setAttribute("aria-live", "polite");
  planContent.setAttribute("aria-atomic", "true");

  const renderPlan = (plan, activeButton) => {
    for (const button of planNav.querySelectorAll("button")) {
      const selected = button === activeButton;
      button.setAttribute("aria-pressed", String(selected));
      button.classList.toggle("is-selected", selected);
    }
    const price = createElement("p", "lm-offer-price", `Prix indicatif · ${money.format(plan.price)}`);
    const title = createElement("h4", "lm-plan-title", `${plan.duration} · ${plan.name}`);
    const deliverables = createElement("div", "lm-plan-deliverables");
    renderDeliverables(deliverables, plan.deliverables);
    planContent.classList.add("is-updating");
    requestAnimationFrame(() => {
      planContent.replaceChildren(price, title, deliverables);
      requestAnimationFrame(() => planContent.classList.remove("is-updating"));
    });
  };

  for (const [index, plan] of offer.plans.entries()) {
    const button = createElement("button", "lm-plan-button", plan.duration);
    button.type = "button";
    button.setAttribute("aria-controls", planContent.id);
    button.setAttribute("aria-pressed", String(index === 0));
    button.classList.toggle("is-selected", index === 0);
    button.addEventListener("click", () => renderPlan(plan, button));
    planNav.append(button);
  }

  const initialButton = planNav.querySelector("button");
  const initialPlan = offer.plans[0];
  planContent.append(
    createElement("p", "lm-offer-price", `Prix indicatif · ${money.format(initialPlan.price)}`),
    createElement("h4", "lm-plan-title", `${initialPlan.duration} · ${initialPlan.name}`)
  );
  const initialDeliverables = createElement("div", "lm-plan-deliverables");
  renderDeliverables(initialDeliverables, initialPlan.deliverables);
  planContent.append(initialDeliverables);

  card.append(planNav, planContent);
  card.append(createLink("contact.html", "lm-offer-cta", offer.cta));
  return card;
}

function renderOffers() {
  const grid = document.getElementById("lm-offer-grid");
  for (const offer of content.offers.packs) {
    grid.append(offer.plans ? renderIdentityOffer(offer) : renderSimpleOffer(offer));
  }
}

function renderPage() {
  setText("lm-hero-eyebrow", content.hero.eyebrow);
  document.getElementById("lm-hero-title").textContent = content.hero.title;
  setText("lm-hero-intro", content.hero.intro);
  document.getElementById("lm-hero-image").src = content.hero.image;
  document.getElementById("lm-hero-image").alt = content.hero.imageAlt;

  setText("lm-portfolio-eyebrow", content.portfolio.eyebrow);
  setText("lm-portfolio-title", content.portfolio.title);
  setText("lm-portfolio-intro", content.portfolio.intro);
  renderMosaic();

  setText("lm-approach-eyebrow", content.approach.eyebrow);
  setText("lm-approach-title", content.approach.title);
  setText("lm-approach-text", content.approach.text);
  document.getElementById("lm-approach-image").src = content.approach.image;
  document.getElementById("lm-approach-image").alt = content.approach.imageAlt;
  setText("lm-approach-image-note", content.approach.note);

  setText("lm-offers-eyebrow", content.offers.eyebrow);
  setText("lm-offers-title", content.offers.title);
  setText("lm-offers-intro", content.offers.intro);
  setText("lm-offer-note", content.offers.note);
  setText("lm-offer-price-note", content.offers.priceNote);
  renderOffers();

  setText("lm-editorial-eyebrow", content.editorial.eyebrow);
  setText("lm-editorial-title", content.editorial.title);
  setText("lm-editorial-text", content.editorial.text);
  const editorialPlaceholder = document.getElementById("lm-editorial-placeholder");
  editorialPlaceholder.setAttribute("aria-label", content.editorial.placeholder);
  editorialPlaceholder.append(createElement("span", "", content.editorial.placeholder));
  document.getElementById("lm-editorial-keywords").replaceChildren(
    ...content.editorial.keywords.map((keyword) => createElement("li", "", keyword))
  );

  setText("lm-final-eyebrow", content.final.eyebrow);
  setText("lm-final-title", content.final.title);
  setText("lm-final-text", content.final.text);
}

renderPage();
