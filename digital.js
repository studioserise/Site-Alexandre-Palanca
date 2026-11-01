import { DIGITAL_CONFIG as C, formatPrice } from "./digital-config.js";
import { getConfig } from "./galeries-config.js";

const root = document.querySelector("[data-digital-section]");

const STEP_LABELS = ["Type de site", "Contenus", "Fonctionnalités", "Récapitulatif", "Coordonnées"];

function h(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  Object.entries(attrs).forEach(([key, value]) => {
    if (value === false || value === null || value === undefined) return;
    if (key === "class") node.className = value;
    else if (key === "text") node.textContent = value;
    else node.setAttribute(key, value === true ? "" : value);
  });
  children.flat().forEach((child) => {
    if (child === null || child === undefined || child === false) return;
    node.append(child.nodeType ? child : document.createTextNode(child));
  });
  return node;
}

function previewFrame(kind, preview) {
  const frame = h("figure", { class: `dg-device dg-device--${kind}` });
  const screen = h("div", { class: "dg-device-screen" });
  const placeholder = h("span", { class: "dg-device-empty", text: "Aperçu à venir" });
  const img = h("img", { src: preview.src, alt: preview.alt, loading: "lazy", decoding: "async" });
  img.addEventListener("load", () => placeholder.remove());
  img.addEventListener("error", () => img.remove());
  screen.append(placeholder, img);
  frame.append(screen);
  return frame;
}

function renderIntro() {
  const { intro } = C;
  return h("div", { class: "dg-intro" },
    h("div", { class: "dg-intro-copy" },
      h("p", { class: "dg-eyebrow", text: intro.eyebrow }),
      h("h2", { id: "dg-title", text: intro.title }),
      intro.paragraphs.map((text) => h("p", { class: "dg-lead", text })),
      h("ol", { class: "dg-axes" },
        intro.axes.map((axe) => h("li", {},
          h("span", { class: "dg-axe-number", text: axe.number }),
          h("div", {}, h("h3", { text: axe.title }), h("p", { text: axe.text }))
        ))
      )
    ),
    h("div", { class: "dg-previews", "aria-hidden": "true" },
      previewFrame("desktop", intro.previews.desktop),
      previewFrame("mobile", intro.previews.mobile)
    )
  );
}

function renderFormulas() {
  return h("div", { class: "dg-block" },
    h("div", { class: "dg-formulas lm-offer-grid" },
      C.formulas.map((formula, index) => h("article", { class: "lm-offer-card dg-formula" },
        h("header", { class: "lm-offer-header" },
          h("span", { class: "lm-offer-number", text: String(index + 1).padStart(2, "0") }),
          h("h3", { text: formula.name })
        ),
        h("p", { class: "lm-offer-price", text: `À partir de ${formatPrice(formula.price)}` }),
        h("p", { class: "lm-offer-description", text: formula.audience }),
        h("ul", { class: "lm-deliverables" }, formula.features.map((feature) => h("li", { text: feature }))),
        h("p", { class: "lm-offer-subnote", text: formula.note })
      ))
    ),
    h("p", { class: "dg-footnote", text: C.formulasFootnote })
  );
}

function renderOptions() {
  return h("div", { class: "dg-block dg-options" },
    h("div", { class: "dg-options-head" },
      h("h3", { text: C.optionsTitle }),
      h("p", { text: C.optionsText })
    ),
    h("ul", { class: "dg-options-list" },
      C.contentOptions.map((option) => h("li", {},
        h("span", { text: option.name }),
        h("strong", { text: `À partir de ${formatPrice(option.price)}` })
      ))
    ),
    h("p", { class: "dg-footnote", text: C.optionsFootnote })
  );
}

/* ---------- Configurateur ---------- */

const state = { step: 1, formula: null, none: false, contents: new Set(), features: new Set(), done: false };

function estimate() {
  const formula = C.formulas.find((item) => item.id === state.formula);
  const options = C.contentOptions.filter((option) => state.contents.has(option.id));
  const features = C.features.filter((feature) => state.features.has(feature.id));
  const quoteFeatures = features.filter((feature) => feature.quote);
  const total = (formula ? formula.price : 0) + options.reduce((sum, option) => sum + option.price, 0);
  return { formula, options, features, quoteFeatures, total, needsStudy: quoteFeatures.length > 0 };
}

function choice(type, id, label, detail, checked, onChange, tag) {
  const input = h("input", { type, name: `dg-${type === "radio" ? "formula" : "choice"}`, value: id, checked });
  input.checked = checked;
  input.addEventListener("change", () => onChange(input.checked));
  return h("label", { class: "dg-choice" },
    input,
    h("span", { class: "dg-choice-box", "aria-hidden": "true" }),
    h("span", { class: "dg-choice-body" },
      h("span", { class: "dg-choice-label", text: label }),
      detail && h("span", { class: "dg-choice-detail", text: detail })
    ),
    tag && h("span", { class: "dg-choice-tag", text: tag })
  );
}

function stepContent() {
  const wrap = h("div", { class: "dg-step-body" });

  if (state.step === 1) {
    wrap.append(h("h4", { text: "Quel type de site imaginez-vous ?" }));
    C.formulas.forEach((formula) => wrap.append(choice("radio", formula.id, `${formula.name} — ${formula.configuratorLabel}`, formula.audience, state.formula === formula.id, () => {
      state.formula = formula.id;
      render();
    }, `À partir de ${formatPrice(formula.price)}`)));
  }

  if (state.step === 2) {
    wrap.append(h("h4", { text: "Souhaitez-vous créer des contenus ?" }), h("p", { class: "dg-hint", text: "Plusieurs choix possibles." }));
    wrap.append(choice("checkbox", "none", C.noContentLabel, "", state.none, (checked) => {
      state.none = checked;
      if (checked) state.contents.clear();
      render();
    }));
    C.contentOptions.forEach((option) => wrap.append(choice("checkbox", option.id, option.name, "", state.contents.has(option.id), (checked) => {
      if (checked) { state.contents.add(option.id); state.none = false; } else state.contents.delete(option.id);
      render();
    }, `À partir de ${formatPrice(option.price)}`)));
  }

  if (state.step === 3) {
    wrap.append(h("h4", { text: "Quelles fonctionnalités souhaitez-vous ?" }), h("p", { class: "dg-hint", text: "Optionnel. Les fonctionnalités marquées « Sur devis » font l'objet d'une étude." }));
    C.features.forEach((feature) => wrap.append(choice("checkbox", feature.id, feature.name, "", state.features.has(feature.id), (checked) => {
      if (checked) state.features.add(feature.id); else state.features.delete(feature.id);
      render();
    }, feature.quote ? "Sur devis" : "Inclus")));
  }

  if (state.step === 4) wrap.append(recap());
  if (state.step === 5) wrap.append(contactForm());
  return wrap;
}

function recapRow(label, value, quote) {
  return h("li", { class: quote ? "is-quote" : "" }, h("span", { text: label }), h("strong", { text: value }));
}

function recap() {
  const result = estimate();
  const wrap = h("div", { class: "dg-recap" }, h("h4", { text: "Récapitulatif de votre projet" }));
  const rows = h("ul", { class: "dg-recap-list" });
  if (result.formula) rows.append(recapRow(`Formule ${result.formula.name}`, `À partir de ${formatPrice(result.formula.price)}`));
  result.options.forEach((option) => rows.append(recapRow(option.name, `À partir de ${formatPrice(option.price)}`)));
  if (state.none) rows.append(recapRow(C.noContentLabel, "—"));
  result.features.forEach((feature) => rows.append(recapRow(feature.name, feature.quote ? "Sur devis" : "Inclus", feature.quote)));
  wrap.append(rows);
  wrap.append(h("p", { class: "dg-total" }, h("small", { text: "Estimation indicative" }), h("strong", { text: `À partir de ${formatPrice(result.total)}` }), result.needsStudy && h("small", { text: "hors fonctionnalités sur devis" })));
  if (result.needsStudy) wrap.append(h("p", { class: "dg-study", role: "note", text: C.studyMessage }));
  wrap.append(h("p", { class: "dg-footnote", text: C.disclaimer }));
  return wrap;
}

function contactForm() {
  const form = h("form", { class: "dg-form", id: "dg-form", novalidate: true },
    h("h4", { text: "Vos coordonnées" }),
    h("div", { class: "dg-fields" },
      field("Nom et prénom", "name", "text", true, "name"),
      field("Entreprise ou établissement (facultatif)", "company", "text", false, "organization"),
      field("Adresse e-mail", "email", "email", true, "email"),
      field("Téléphone (facultatif)", "phone", "tel", false, "tel")
    ),
    h("label", { class: "dg-field dg-field--wide" }, h("span", { text: "Description du projet (facultatif)" }), h("textarea", { name: "details", rows: "4", maxlength: "1500" })),
    h("div", { class: "dg-honeypot", "aria-hidden": "true" }, h("label", {}, "Ne pas remplir", h("input", { type: "text", name: "website", tabindex: "-1", autocomplete: "off" }))),
    h("div", { class: "dg-consent" },
      h("input", { id: "dg-consent", type: "checkbox", name: "consent", required: true }),
      h("label", { for: "dg-consent" }, "J’accepte que les informations transmises soient utilisées uniquement pour répondre à ma demande. Consultez la ", h("a", { href: "politique-confidentialite.html", text: "politique de confidentialité" }), ".")
    ),
    h("p", { class: "dg-status", id: "dg-status", role: "status", "aria-live": "polite" })
  );
  form.addEventListener("submit", submit);
  return form;
}

function field(label, name, type, required, autocomplete) {
  return h("label", { class: "dg-field" }, h("span", { text: label }), h("input", { name, type, required, autocomplete }));
}

function buildMessage(details, company) {
  const result = estimate();
  const lines = [
    "Demande issue du configurateur « Création digitale ».",
    "",
    `Formule : ${result.formula.name} (${result.formula.configuratorLabel}) — à partir de ${formatPrice(result.formula.price)}`,
    `Contenus : ${result.options.length ? result.options.map((o) => `${o.name} (à partir de ${formatPrice(o.price)})`).join(" ; ") : C.noContentLabel}`,
    `Fonctionnalités : ${result.features.length ? result.features.map((f) => `${f.name}${f.quote ? " [sur devis]" : ""}`).join(" ; ") : "aucune sélectionnée"}`,
    `Estimation indicative : à partir de ${formatPrice(result.total)}${result.needsStudy ? " (hors fonctionnalités sur devis)" : ""}`
  ];
  if (result.needsStudy) lines.push("Étude personnalisée nécessaire.");
  if (company) lines.push("", `Entreprise / établissement : ${company}`);
  if (details) lines.push("", "Description du projet :", details);
  return lines.join("\n").slice(0, 3900);
}

async function submit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const status = form.querySelector("#dg-status");
  status.textContent = "";
  delete status.dataset.kind;
  if (!form.reportValidity()) return;

  const data = new FormData(form);
  const config = getConfig();
  const payload = {
    name: data.get("name"),
    email: data.get("email"),
    phone: data.get("phone"),
    service: C.contactService,
    date: "",
    message: buildMessage(String(data.get("details") || "").trim(), String(data.get("company") || "").trim()),
    consent: data.get("consent") === "on",
    website: data.get("website")
  };

  const button = root.querySelector("[data-dg-next]");
  button.disabled = true;
  status.textContent = "Envoi en cours…";
  try {
    const response = await fetch(`${config.supabaseUrl}/functions/v1/contact-request`, {
      method: "POST",
      headers: { apikey: config.supabaseAnonKey, "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const result = await response.json().catch(() => null);
    if (!response.ok) throw new Error(result?.message || "L’envoi n’a pas abouti. Réessayez dans quelques instants.");
    state.done = true;
    render();
  } catch (error) {
    status.textContent = error instanceof Error ? error.message : "Une erreur est survenue pendant l’envoi.";
    button.disabled = false;
  }
}

function canAdvance() {
  if (state.step === 1) return Boolean(state.formula);
  if (state.step === 2) return state.none || state.contents.size > 0;
  return true;
}

let configurator;

function render() {
  const focused = document.activeElement?.closest?.(".dg-choice")?.querySelector("input")?.value;
  configurator.replaceChildren();
  queueMicrotask(() => {
    if (focused) configurator.querySelector(`.dg-choice input[value="${focused}"]`)?.focus();
  });

  if (state.done) {
    configurator.append(h("div", { class: "dg-success", role: "status" },
      h("h4", { text: "Votre demande a bien été envoyée." }),
      h("p", { text: "Merci, je reviendrai vers vous dès que possible pour échanger sur votre projet." })
    ));
    return;
  }

  const progress = h("ol", { class: "dg-progress", "aria-label": "Progression" },
    STEP_LABELS.map((label, index) => {
      const number = index + 1;
      const item = h("li", { class: number === state.step ? "is-current" : number < state.step ? "is-done" : "", ...(number === state.step ? { "aria-current": "step" } : {}) });
      if (number < state.step) {
        const back = h("button", { type: "button", class: "dg-progress-btn" }, h("span", { text: String(number).padStart(2, "0") }), label);
        back.addEventListener("click", () => { state.step = number; render(); });
        item.append(back);
      } else {
        item.append(h("span", { class: "dg-progress-btn" }, h("span", { text: String(number).padStart(2, "0") }), label));
      }
      return item;
    })
  );

  const layout = h("div", { class: "dg-config-layout" }, stepContent(), summary());

  const prev = h("button", { type: "button", class: "dg-btn dg-btn--ghost", text: "Retour", disabled: state.step === 1 });
  prev.addEventListener("click", () => { state.step -= 1; render(); });
  const next = h("button", { type: state.step === 5 ? "submit" : "button", class: "dg-btn", "data-dg-next": true, disabled: !canAdvance() });
  next.append(state.step === 5 ? "Envoyer ma demande " : "Continuer ", h("span", { "aria-hidden": "true", text: "↗" }));
  if (state.step === 5) next.setAttribute("form", "dg-form");
  else next.addEventListener("click", () => { state.step += 1; render(); });

  configurator.append(progress, layout, h("div", { class: "dg-actions" }, prev, next));
}

function summary() {
  const result = estimate();
  const box = h("aside", { class: "dg-summary", "aria-label": "Estimation en cours" },
    h("p", { class: "dg-summary-title", text: "Votre projet" }),
    h("p", { class: "dg-summary-line", text: result.formula ? `Formule ${result.formula.name}` : "Formule à choisir" }),
    result.options.map((option) => h("p", { class: "dg-summary-line", text: option.name })),
    h("p", { class: "dg-summary-total" }, h("small", { text: "Estimation indicative" }), h("strong", { text: result.formula ? `À partir de ${formatPrice(result.total)}` : "—" })),
    result.needsStudy && h("p", { class: "dg-summary-study", text: "Fonctionnalités sur devis : étude personnalisée." })
  );
  return box;
}

function init() {
  root.classList.add("dg-section");
  root.setAttribute("aria-labelledby", "dg-title");
  const inner = h("div", { class: "dg-inner" });
  configurator = h("div", { class: "dg-configurator" });
  inner.append(
    renderIntro(),
    renderFormulas(),
    renderOptions(),
    h("div", { class: "dg-block dg-config", id: "configurateur" },
      h("div", { class: "dg-config-head" },
        h("p", { class: "dg-eyebrow", text: "Configurateur" }),
        h("h3", { text: "Composez votre projet." })
      ),
      configurator
    )
  );
  root.append(inner);
  render();
}

if (root) init();
