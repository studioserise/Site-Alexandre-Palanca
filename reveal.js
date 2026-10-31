/* Dévoilement par masque des sections « image + texte ». Indépendant de page-transition.js. */
(function () {
  'use strict';

  // Sections éditoriales concernées : image(s) à côté d'un bloc de texte.
  var SECTIONS = [
    {
      section: '.portrait-service',
      images: '.portrait-photo',
      text: '.portrait-copy > *'
    },
    {
      section: '.lm-approach',
      images: '.lm-approach-image-wrap',
      text: '.lm-approach-copy > *'
    },
    {
      section: '.photo-universe',
      images: '.photo-universe-image'
    },
    {
      // Mosaïque des formats vidéo : chaque vignette se dévoile individuellement.
      section: '.video-format',
      images: '.video-format-image',
      text: 'p'
    }
  ];

  var VISIBLE_SHARE = 0.65;
  var IMAGE_STEP = 130;
  var TITLE_DELAY = 150;
  var PARAGRAPH_DELAY = 350;
  var TEXT_STEP = 150;

  var root = document.documentElement;
  if (!('IntersectionObserver' in window)) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  var IMG_HIDDEN = 'clip-path:inset(100% 0 0 0)';
  var TXT_HIDDEN = 'clip-path:inset(-14px 100% -14px -14px)';
  var EASE = 'cubic-bezier(.22,.61,.36,1)';
  var css = '';
  SECTIONS.forEach(function (cfg) {
    var img = '.reveal-ready ' + cfg.section + ' ' + cfg.images;
    var txt = cfg.text ? '.reveal-ready ' + cfg.section + ' ' + cfg.text : null;
    css +=
      img + (txt ? ',' + txt : '') + '{will-change:clip-path}' +
      img + '{' + IMG_HIDDEN + '}' +
      '.reveal-ready ' + cfg.section + '.is-revealed ' + cfg.images +
      '{animation:reveal-image var(--reveal-duration,1100ms) ' + EASE + ' var(--reveal-delay,0ms) both}';
    if (txt) {
      css +=
        txt + '{' + TXT_HIDDEN + '}' +
        '.reveal-ready ' + cfg.section + '.is-revealed ' + cfg.text +
        '{animation:reveal-text var(--reveal-duration,1100ms) ' + EASE + ' var(--reveal-delay,0ms) both}';
    }
  });
  css +=
    '@keyframes reveal-image{from{clip-path:inset(100% 0 0 0)}to{clip-path:inset(0 0 0 0)}}' +
    '@keyframes reveal-text{from{clip-path:inset(-14px 100% -14px -14px)}to{clip-path:inset(-14px -14px -14px -14px)}}' +
    '@media (max-width:1023px){.reveal-ready{--reveal-duration:850ms}}';
  var style = document.createElement('style');
  style.setAttribute('data-reveal', '');
  style.textContent = css;
  (document.head || root).appendChild(style);
  root.classList.add('reveal-ready');

  function prepare() {
    var found = [];
    SECTIONS.forEach(function (cfg) {
      var sections = document.querySelectorAll(cfg.section);
      for (var s = 0; s < sections.length; s++) {
        var section = sections[s];
        var images = section.querySelectorAll(cfg.images);
        for (var i = 0; i < images.length; i++) {
          images[i].style.setProperty('--reveal-delay', i * IMAGE_STEP + 'ms');
        }
        var texts = cfg.text ? section.querySelectorAll(cfg.text) : [];
        for (var t = 0; t < texts.length; t++) {
          var delay = t === 0 ? TITLE_DELAY : PARAGRAPH_DELAY + (t - 1) * TEXT_STEP;
          texts[t].style.setProperty('--reveal-delay', delay + 'ms');
        }
        found.push(section);
      }
    });

    if (!found.length) {
      root.classList.remove('reveal-ready');
      return;
    }

    // Déclenchement quand 65 % de la section (ou de l'écran si elle est plus haute) est visible.
    var thresholds = [];
    for (var n = 0; n <= 100; n++) thresholds.push(n / 100);
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        var needed = Math.min(entry.boundingClientRect.height, entry.rootBounds.height) * VISIBLE_SHARE;
        if (entry.intersectionRect.height < needed) return;
        entry.target.classList.add('is-revealed');
        observer.unobserve(entry.target);
      });
    }, { threshold: thresholds });
    found.forEach(function (section) { observer.observe(section); });

  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', prepare, { once: true });
  } else {
    prepare();
  }
})();
