/* Version anglaise du site.
   Le site est écrit en français ; ce script remplace les textes affichés par leur traduction quand
   le visiteur choisit « EN » (bouton à côté de l'éclair, voir site-nav.js). Le choix est mémorisé.
   - Pour ajouter ou corriger une traduction : ajouter une ligne "texte français": "English text" dans EN.
   - Les textes ajoutés plus tard par les scripts (portfolio, formulaire…) sont traduits automatiquement.
   - Les valeurs envoyées par le formulaire restent en français (Alex reçoit toujours les mêmes intitulés). */
(function () {
  "use strict";

  var KEY = "site-lang";
  var FE = "︎"; // garde les flèches en texte (pas en émoji)

  var EN = {
    // Navigation, bas de page, éléments communs
    "Photo & vidéo": "Photo & video",
    "Sites internet": "Websites",
    "Contenus réseaux": "Social media content",
    "Galerie": "Gallery",
    "Espace client": "Client area",
    "Contact": "Contact",
    "Site internet": "Website",
    "Navigation principale": "Main navigation",
    "Ouvrir le menu": "Open menu",
    "Fermer le menu": "Close menu",
    "Activer le mode clair": "Switch to light mode",
    "Activer le mode sombre": "Switch to dark mode",
    "Retour à l'accueil": "Back to home",
    "Retour à l’accueil": "Back to home",
    "Réseaux sociaux": "Social media",
    "Un projet à imaginer ?": "A project in mind?",
    "Photographe & vidéaste": "Photographer & videographer",
    "Webdesign & création de sites internet": "Web design & website creation",
    "Webdesign &": "Web design &",
    "création de sites internet": "website creation",
    "Parlons de votre prochaine histoire.": "Let’s talk about your next story.",
    "Maintenez le clic et faites glisser pour tourner la carte": "Click and drag to turn the card",
    "Touchez la carte pour la retourner": "Tap the card to flip it",
    "Touchez ou faites glisser pour retourner la carte": "Tap or swipe to flip the card",
    "Carte de visite Alexandre et Elisa": "Alexandre and Elisa business card",
    "Alexandre Palanca, photographe — 06 79 53 82 80 — instagram alexpalanca — alexpalanca@gmail.com":
      "Alexandre Palanca, photographer — 06 79 53 82 80 — instagram alexpalanca — alexpalanca@gmail.com",
    "Mentions légales": "Legal notice",
    "Politique de confidentialité": "Privacy policy",
    "politique de confidentialité": "privacy policy",

    // Accueil
    ", photographe et vidéaste en Dordogne": ", photographer and videographer in Dordogne",
    "Défiler pour découvrir": "Scroll to discover",
    "Deux indépendants · Un même studio": "Two freelancers · One studio",
    "L'image et le digital, réunis.": "Imagery and digital, together.",
    "Nous sommes Alex et Elisa, indépendants en communication digitale. Alex est photographe et vidéaste, Elisa travaille la direction artistique et la création digitale. Nous réunissons nos savoir-faire pour accompagner vos projets, de la première idée à leur réalisation.":
      "We are Alex and Elisa, freelancers in digital communication. Alex is a photographer and videographer; Elisa works on art direction and digital design. We bring our skills together to support your projects, from the very first idea to the finished result.",
    "Nous accordons une importance particulière à la relation avec nos clients : des échanges simples et directs, une écoute attentive et une collaboration à chaque étape du projet.":
      "We care deeply about our relationship with clients: simple, direct conversations, attentive listening and close collaboration at every step of the project.",
    "Nos domaines d’intervention": "What we do",
    "Trois façons de raconter votre projet.": "Three ways to tell your story.",
    "Des images vivantes pour faire ressentir votre univers, vos événements et vos savoir-faire.":
      "Vivid images that convey your world, your events and your craft.",
    "Des expériences web singulières, pensées pour vos besoins et votre identité.":
      "Distinctive web experiences, designed around your needs and your identity.",
    "Des contenus cohérents pour nourrir votre présence et créer du lien avec votre communauté.":
      "Consistent content to grow your presence and connect with your community.",
    "Notre manière de faire": "How we work",
    "De l’écoute, du soin et le sens du détail.": "Listening, care and an eye for detail.",
    "Chaque collaboration commence par une conversation. Nous prenons le temps de comprendre ce qui rend votre projet singulier, puis nous construisons une réponse juste, attentive à chaque étape.":
      "Every collaboration starts with a conversation. We take the time to understand what makes your project unique, then build the right response, with care at every step.",
    "Nous aimons les échanges simples, les idées qui mûrissent ensemble et les finitions qui font toute la différence.":
      "We like simple conversations, ideas that grow together and the finishing touches that make all the difference.",
    "Ils nous font confiance": "They trust us",
    "Les rencontres derrière les projets.": "The people behind the projects.",
    "Événementiel": "Events",
    "Hôtellerie": "Hospitality",
    "Culture": "Culture",
    "Témoignages de nos clients": "Client testimonials",
    "Logos des clients": "Client logos",
    "« Votre retour d’expérience apparaîtra ici. »": "“Your feedback will appear here.”",
    "Votre retour d’expérience apparaîtra ici.": "Your feedback will appear here.",
    "Quelques mots sur votre collaboration pourront être partagés sur cette page.": "A few words about your collaboration could be shared on this page.",
    "Cette section accueillera bientôt les avis des personnes accompagnées.": "This section will soon feature reviews from the people we have worked with.",
    "Témoignage client à ajouter": "Client testimonial to come",
    "Alexandre en séance de prise de vue": "Alexandre during a shoot",
    "Détail d’un lieu photographié pour mettre en valeur son atmosphère": "Detail of a venue photographed to bring out its atmosphere",

    // Photo & vidéo : en-têtes et cartes
    "Photographie": "Photography",
    "Un regard, plusieurs terrains.": "One eye, many fields.",
    "Portraits, événements, lieux et projets professionnels. Des images pensées pour révéler les personnes, les gestes et les atmosphères.":
      "Portraits, events, venues and professional projects. Images designed to reveal people, gestures and atmospheres.",
    "Photographie par Alex & Elisa": "Photography by Alex & Elisa",
    "Vidéo par Alex & Elisa": "Video by Alex & Elisa",
    "Des formats pour chacun": "Formats for everyone",
    "Pour les particuliers": "For individuals",
    "et les professionnels": "and businesses",
    "Particuliers, couples, familles, artistes, associations, entreprises, artisans et lieux...":
      "Individuals, couples, families, artists, associations, companies, craftspeople and venues...",
    "La photographie s'adapte à vos envies et à vos besoins.": "Photography that adapts to your wishes and your needs.",
    "Vidéo": "Video",
    "L'image en mouvement.": "Images in motion.",
    "De la captation d'un événement à la réalisation d'un film sur mesure, chaque projet est pensé selon son sujet, son intention et son format.":
      "From filming an event to producing a bespoke film, every project is shaped around its subject, its intent and its format.",
    "Portraits filmés · Événements · Films de marque · Clips · Formats courts": "Filmed portraits · Events · Brand films · Music videos · Short formats",
    "Des possibilités variées": "Many possibilities",
    "Adapté à vos besoins": "Tailored to your needs",
    "Portraits filmés, clips musicaux, aftermovies, interviews, films institutionnels, vidéos promotionnelles ou contenus pour les réseaux sociaux.":
      "Filmed portraits, music videos, aftermovies, interviews, corporate films, promotional videos and social media content.",
    "Galerie de photographies": "Photo gallery",
    "Galerie de vidéos": "Video gallery",

    // Indications des cartes
    ["Survolez pour découvrir ↻" + FE]: "Hover to discover ↻" + FE,
    ["Touchez pour découvrir ↻" + FE]: "Tap to discover ↻" + FE,
    ["Survolez pour voir le contenu ↻" + FE]: "Hover to see what’s included ↻" + FE,

    // Formules photo
    "Les propositions photo": "Photo packages",
    "Des séances pensées selon votre projet.": "Sessions shaped around your project.",
    "01 · Essentiel": "01 · Essential",
    "02 · Signature": "02 · Signature",
    "03 · Sur mesure": "03 · Tailor-made",
    "03 · sur mesure": "03 · Tailor-made",
    "L'instant": "The moment",
    "Une séance photo pour réaliser une sélection d'images naturelles et soignées.": "A photo session for a selection of natural, polished images.",
    "Durée : environ 1 h": "Duration: about 1 hour",
    "Pour : portraits individuels, couples et petites familles.": "For: individual portraits, couples and small families.",
    "À partir de 120 €": "From €120",
    "À partir de 200 €": "From €200",
    "À partir de 250 €": "From €250",
    "à partir de 250 €": "From €250",
    "à partir de 450 €": "From €450",
    "Ce qui est compris": "What’s included",
    "Échange préparatoire": "Preparatory call",
    "Séance photo": "Photo session",
    "Sélection et retouche des images": "Image selection and retouching",
    "Galerie privée de livraison": "Private delivery gallery",
    "L'empreinte": "The imprint",
    "Une séance approfondie pour explorer plusieurs ambiances et créer une série d'images cohérente.":
      "An in-depth session to explore several moods and create a coherent series of images.",
    "Durée : environ 2 à 3 h": "Duration: about 2 to 3 hours",
    "Pour : portraits individuels, couples, familles et professionnels.": "For: individual portraits, couples, families and professionals.",
    "Repérage et préparation": "Location scouting and preparation",
    "Galerie privée pour partager les images": "Private gallery to share the images",
    "Le récit": "The story",
    "Un reportage photographique construit autour de votre activité ou de votre évènement.": "A photo report built around your business or your event.",
    "Durée : de quelques heures à une journée": "Duration: from a few hours to a full day",
    "Pour : entreprises, artisans, lieux et événements.": "For: companies, craftspeople, venues and events.",
    "Brief et intentions visuelles": "Brief and visual direction",
    "Préparation et repérage": "Preparation and scouting",
    "Tarifs indicatifs, à préciser selon le lieu, la durée et les livrables.": "Indicative prices, to be confirmed depending on location, duration and deliverables.",

    // Formules vidéo
    "Les propositions vidéo": "Video packages",
    "Du tournage à votre film finalisé.": "From filming to your finished film.",
    "La captation": "The capture",
    "Un tournage ciblé pour obtenir des séquences vidéo prêtes à être exploitées.": "A focused shoot to get video footage ready to use.",
    "Pour : événements, interviews, artistes et contenus courts.": "For: events, interviews, artists and short-form content.",
    "Préparation technique": "Technical preparation",
    "Tournage sur site": "On-site filming",
    "Prise de son selon les besoins": "Sound recording as needed",
    "Sélection et organisation des séquences": "Selection and organisation of footage",
    "Livraison des fichiers vidéo bruts": "Delivery of raw video files",
    "Le film": "The film",
    "Un tournage accompagné d'un montage soigné pour donner forme à un film prêt à diffuser.": "A shoot followed by careful editing to shape a film ready to share.",
    "Durée : environ une demi journée": "Duration: about half a day",
    "Pour : portraits filmés, aftermovies et vidéos promotionnelles.": "For: filmed portraits, aftermovies and promotional videos.",
    "Sélection des séquences": "Footage selection",
    "Montage et étalonnage": "Editing and colour grading",
    "Livraison du film final": "Delivery of the final film",
    "La production": "The production",
    "Une réalisation audiovisuelle complète, de la conception aux déclinaisons finales.": "A complete audiovisual production, from concept to final versions.",
    "Durée : une à plusieurs journées selon le projet": "Duration: one or more days depending on the project",
    "Pour : films de marque, clips et projets spécifiques.": "For: brand films, music videos and special projects.",
    "Sur devis": "On quote",
    "Conception et écriture des intentions": "Concept and creative direction",
    "Organisation de la production": "Production planning",
    "Tournage": "Filming",
    "Déclinaisons convenues avec vous": "Versions agreed with you",
    "Livraison de la production finale": "Delivery of the final production",
    "Chaque projet fait l’objet d’un devis adapté à sa durée et à ses livrables.": "Each project receives a quote tailored to its duration and deliverables.",

    // Drone
    "Prises de vues aériennes": "Aerial footage",
    "Prendre de la hauteur.": "Rise above.",
    "Les prises de vues aériennes offrent une nouvelle perspective sur vos lieux, vos événements et vos projets. Elles peuvent enrichir un reportage photo ou un film, selon les possibilités du site et les conditions de vol.":
      "Aerial shots offer a new perspective on your venues, events and projects. They can enrich a photo report or a film, depending on the site and flight conditions.",
    "Demander un devis": "Request a quote",

    // Formulaire de contact
    "Un projet photo ou vidéo ?": "A photo or video project?",
    "Imaginons la suite ensemble.": "Let’s imagine what comes next.",
    "Décrivez-nous votre idée et recevez une proposition adaptée à votre besoin.": "Tell us about your idea and receive a proposal tailored to your needs.",
    "Remplir le formulaire": "Fill in the form",
    "Réduire le formulaire": "Collapse the form",
    "Nom et prénom": "Full name",
    "Adresse e-mail": "Email address",
    "Téléphone": "Phone",
    "(facultatif)": "(optional)",
    "Date ou période": "Date or period",
    "Type de prestation": "Type of service",
    "À préciser ensemble": "To be discussed",
    "Portrait (solo, couple, famille)": "Portrait (solo, couple, family)",
    "Portrait professionnel": "Professional portrait",
    "Événement privé ou d’entreprise": "Private or corporate event",
    "Concert, spectacle ou festival": "Concert, show or festival",
    "Sport et compétition": "Sport and competition",
    "Lieu, commerce ou savoir-faire": "Venue, shop or craft",
    "Clip ou projet artistique": "Music video or artistic project",
    "Contenus pour les réseaux sociaux": "Social media content",
    "Autre projet": "Other project",
    "Budget indicatif": "Indicative budget",
    "Je ne sais pas encore": "I don’t know yet",
    "Moins de 300 €": "Under €300",
    "300 € – 800 €": "€300 – €800",
    "800 € – 1 500 €": "€800 – €1,500",
    "Plus de 1 500 €": "Over €1,500",
    "Ce dont vous avez besoin": "What you need",
    "Photos": "Photos",
    "Drone": "Drone",
    "Retouche avancée": "Advanced retouching",
    "Quelques mots sur votre projet": "A few words about your project",
    "Ne pas remplir ce champ": "Leave this field empty",
    "J’accepte que mes informations soient utilisées pour répondre à cette demande. Consultez la":
      "I agree that my information may be used to respond to this request. See the",
    "Envoyer ma demande": "Send my request",
    "Envoi en cours…": "Sending…",
    "Votre demande a bien été envoyée. Merci, je reviendrai vers vous dès que possible.": "Your request has been sent. Thank you, I will get back to you as soon as possible.",
    "Indiquez votre adresse e-mail pour que nous puissions vous répondre.": "Please enter your email address so we can reply.",
    "Cette adresse e-mail semble incomplète. Vérifiez-la pour que nous puissions vous répondre.": "This email address looks incomplete. Please check it so we can reply.",
    "Un problème avec l’envoi du formulaire ?": "Trouble sending the form?",
    "Votre message n’a pas pu partir pour une raison technique. Vous pouvez nous contacter directement :":
      "Your message could not be sent because of a technical issue. You can contact us directly:",
    "Fermer": "Close",

    // Biographie d'Alex
    "Alex · Photographe & vidéaste": "Alex · Photographer & videographer",
    "Derrière l'objectif.": "Behind the lens.",
    "Je suis Alexandre": "I’m Alexandre",
    "Photographe et vidéaste indépendant, j'accompagne les particuliers et les professionnels dans leurs projets visuels.":
      "An independent photographer and videographer, I support individuals and businesses with their visual projects.",
    "J'aime observer, découvrir et comprendre ce qui m'entoure. La photographie et la vidéo me permettent d'explorer des univers différents, de rencontrer des personnes et de les mettre en lumière.":
      "I love observing, discovering and understanding the world around me. Photography and video let me explore different worlds, meet people and bring them into the light.",
    "Chaque collaboration est l'occasion de porter un regard nouveau sur un sujet, avec une attention particulière à la composition, à la lumière et aux détails.":
      "Every collaboration is a chance to take a fresh look at a subject, with particular attention to composition, light and detail.",

    // Portfolio
    "Portfolio · Sélection": "Portfolio · Selection",
    "Des images, des histoires.": "Images, stories.",
    "Projet précédent": "Previous project",
    "Projet suivant": "Next project",
    "Une présence simple, des images naturelles et une séance pensée à votre rythme.": "A simple presence, natural images and a session at your own pace.",
    "Le film d’un événement, monté pour en retrouver l’énergie et le partager.": "The film of an event, edited to capture its energy and share it.",
    "Des images au cœur de la scène, pour garder l’énergie d’un live.": "Images from the heart of the stage, to keep the energy of a live show.",
    "Captation": "Live capture",
    "Un concert ou un spectacle filmé tel qu’il s’est vécu, au plus près de la scène.": "A concert or show filmed as it was lived, as close to the stage as possible.",
    "L’ambiance d’un festival, de la foule aux instants en coulisses.": "The atmosphere of a festival, from the crowd to backstage moments.",
    "Interview filmée": "Filmed interview",
    "Une parole mise en valeur, avec un cadre et un son soignés.": "A voice brought to the fore, with careful framing and sound.",
    "Sport & compétition": "Sport & competition",
    "Le mouvement, l’effort et la concentration, saisis au bon moment.": "Movement, effort and focus, captured at the right moment.",
    "Formats courts": "Short formats",
    "Des vidéos courtes et rythmées, pensées pour les réseaux sociaux.": "Short, punchy videos designed for social media.",
    "L’élégance et le rythme d’une soirée cabaret, au plus près des artistes.": "The elegance and rhythm of a cabaret night, close to the performers.",
    "Des images en drone pour offrir une autre perspective sur vos lieux et vos événements.": "Drone footage offering a new perspective on your venues and events.",
    "Site vitrine": "Showcase website",
    "Un aperçu du travail de conception et de mise en page, à remplacer par les mockups des réalisations.": "A preview of design and layout work, to be replaced by project mockups.",
    "Univers de marque": "Brand identity",
    "Une direction visuelle adaptée au projet, de l’identité aux supports digitaux.": "A visual direction tailored to the project, from identity to digital media.",
    "Projet sur mesure": "Bespoke project",
    "Des exemples et descriptifs détaillés pourront être ajoutés au fil des réalisations.": "Examples and detailed descriptions will be added as projects are completed.",

    // Pages en préparation
    "Une nouvelle page se prépare": "A new page is on its way",
    "Cette partie de notre studio est en cours de développement. À retrouver prochainement, avec des idées et des contenus imaginés pour vos réseaux.":
      "This part of our studio is under development. Coming soon, with ideas and content designed for your social media.",
    "Cette page est en cours de préparation. À retrouver prochainement, avec les sites internet réalisés par Elisa.":
      "This page is being prepared. Coming soon, with websites created by Elisa.",
    "Découvrir nos autres prestations": "Discover our other services",

    // Galerie privée
    "Accès clients": "Client access",
    "Galeries": "Private",
    "privées": "galleries",
    "Retrouvez les photographies de votre événement ou de votre séance grâce au code d’accès transmis par Alexandre.":
      "Find the photos from your event or session using the access code provided by Alexandre.",
    "Code d’accès": "Access code",
    "Saisir votre code": "Enter your code",
    "Accéder à la galerie": "Open the gallery",
    "Accès administrateur": "Admin access",
    "Saisissez le code transmis par votre photographe.": "Enter the code provided by your photographer.",
    "Les galeries privées sont momentanément indisponibles. Contactez-nous pour accéder à vos photos.": "Private galleries are temporarily unavailable. Contact us to access your photos.",
    "Vérification…": "Checking…",
    "Le serveur n’a pas confirmé l’accès à cette galerie.": "The server did not confirm access to this gallery.",

    // Titres des pages (onglet du navigateur)
    "Alexandre Palanca | Photographe, vidéaste et création digitale en Dordogne": "Alexandre Palanca | Photographer, videographer and digital design in Dordogne",
    "Photographe & vidéaste en Dordogne — Alexandre Palanca": "Photographer & videographer in Dordogne — Alexandre Palanca",
    "Sites internet — bientôt disponible": "Websites — coming soon",
    "Contenus réseaux — bientôt disponibles": "Social media content — coming soon",
    "Galeries privées — Alexandre Palanca": "Private galleries — Alexandre Palanca",
    "Mentions légales — Alexandre Palanca": "Legal notice — Alexandre Palanca",
    "Politique de confidentialité — Alexandre Palanca": "Privacy policy — Alexandre Palanca"
  };

  // Textes construits par les scripts (« Concerts, image 2 », « L'instant — demander un devis »…)
  var PATTERNS = [
    [/^(.+), image (\d+)$/, function (m) { return (EN[m[1]] || m[1]) + ", image " + m[2]; }],
    [/^(.+) — image (\d+)$/, function (m) { return (EN[m[1]] || m[1]) + " — image " + m[2]; }],
    [/^(.+) — demander un devis$/, function (m) { return (EN[m[1]] || m[1]) + " — request a quote"; }]
  ];

  // Pages légales : texte juridique conservé en français, avec une mention en anglais.
  var LEGAL_PAGE = /(mentions-legales|politique-confidentialite)/.test(location.pathname);

  var ATTRS = ["alt", "aria-label", "placeholder", "title"];
  var originalText = new WeakMap();   // nœud de texte -> texte français d'origine
  var originalAttr = new WeakMap();   // élément -> { attribut: valeur française }
  var lang = "fr";
  try { lang = localStorage.getItem(KEY) === "en" ? "en" : "fr"; } catch (e) { /* stockage indisponible */ }

  var normalize = function (s) { return s.replace(/\s+/g, " ").trim(); };

  function translate(fr) {
    if (Object.prototype.hasOwnProperty.call(EN, fr)) return EN[fr];
    for (var i = 0; i < PATTERNS.length; i++) {
      var m = fr.match(PATTERNS[i][0]);
      if (m) return PATTERNS[i][1](m);
    }
    return null;
  }

  function translateTextNode(node) {
    var raw = node.nodeValue;
    var key = normalize(raw);
    if (!key) return;
    var en = translate(key);
    if (en == null || en === key) return;
    if (!originalText.has(node)) originalText.set(node, raw);
    var lead = raw.match(/^\s*/)[0], trail = raw.match(/\s*$/)[0];
    node.nodeValue = lead + en + trail;
  }

  function translateAttributes(el) {
    for (var i = 0; i < ATTRS.length; i++) {
      var name = ATTRS[i];
      var value = el.getAttribute(name);
      if (!value) continue;
      var en = translate(normalize(value));
      if (en == null || en === value) continue;
      var saved = originalAttr.get(el) || {};
      if (!(name in saved)) { saved[name] = value; originalAttr.set(el, saved); }
      el.setAttribute(name, en);
    }
  }

  function translateTree(root) {
    if (!root) return;
    if (root.nodeType === 3) { translateTextNode(root); return; }
    if (root.nodeType !== 1 || root.closest("script, style")) return;
    translateAttributes(root);
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    var node;
    while ((node = walker.nextNode())) {
      if (node.nodeType === 3) {
        if (!node.parentElement || !node.parentElement.closest("script, style")) translateTextNode(node);
      } else {
        translateAttributes(node);
      }
    }
  }

  function restoreTree() {
    var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    var node;
    while ((node = walker.nextNode())) {
      if (node.nodeType === 3) {
        if (originalText.has(node)) { node.nodeValue = originalText.get(node); originalText.delete(node); }
      } else if (originalAttr.has(node)) {
        var saved = originalAttr.get(node);
        Object.keys(saved).forEach(function (name) { node.setAttribute(name, saved[name]); });
        originalAttr.delete(node);
      }
    }
  }

  var frenchTitle = document.title;
  var legalNote = null;

  function applyEnglish() {
    document.documentElement.lang = "en";
    translateTree(document.body);
    var t = translate(normalize(frenchTitle));
    if (t) document.title = t;
    if (LEGAL_PAGE && !legalNote) {
      var main = document.querySelector("main");
      if (main) {
        legalNote = document.createElement("p");
        legalNote.className = "lang-legal-note";
        legalNote.textContent = "This legal page is only available in French.";
        main.insertBefore(legalNote, main.firstChild);
      }
    }
  }

  function applyFrench() {
    document.documentElement.lang = "fr";
    restoreTree();
    document.title = frenchTitle;
    if (legalNote) { legalNote.remove(); legalNote = null; }
  }

  // Les textes ajoutés ou modifiés après coup par les scripts sont traduits au fil de l'eau.
  var observer = new MutationObserver(function (mutations) {
    if (lang !== "en") return;
    mutations.forEach(function (m) {
      if (m.type === "characterData") translateTextNode(m.target);
      else if (m.type === "attributes") translateAttributes(m.target);
      else m.addedNodes.forEach(translateTree);
    });
  });

  function setLang(next) {
    lang = next === "en" ? "en" : "fr";
    try { localStorage.setItem(KEY, lang); } catch (e) { /* stockage indisponible */ }
    if (lang === "en") applyEnglish(); else applyFrench();
    document.dispatchEvent(new CustomEvent("site:lang", { detail: { lang: lang } }));
  }

  // Accès pour les autres scripts (témoignages tapés lettre par lettre, bouton de langue…)
  window.siteI18n = {
    lang: function () { return lang; },
    set: setLang,
    toggle: function () { setLang(lang === "en" ? "fr" : "en"); },
    t: function (fr) { return lang === "en" ? (translate(normalize(fr)) || fr) : fr; }
  };

  function start() {
    observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
    if (lang === "en") applyEnglish();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})();
