/* Roulement des photographies d'une galerie : xxx-01 → xxx-11 → xxx-21… (même rang, dizaine suivante).
   Les fichiers manquants sont simplement ignorés. Indépendant de reveal.js et de page-transition.js. */
(function () {
  'use strict';

  var FIGURES = '.portrait-photo';
  var INTERVAL = 6000;
  var STEP = 130;
  var DURATION = 1100;

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  var css =
    FIGURES + '{position:relative}' +
    '.rotation-next{position:absolute;inset:0;z-index:1;width:100%;height:100%;object-fit:cover;' +
    'animation:rotation-in ' + DURATION + 'ms cubic-bezier(.22,.61,.36,1) both}' +
    '@keyframes rotation-in{from{clip-path:inset(100% 0 0 0)}to{clip-path:inset(0 0 0 0)}}' +
    '@media (max-width:1023px){.rotation-next{animation-duration:850ms}}';
  var style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  function candidates(src) {
    var m = src.match(/^(.*-)0(\d)(\.\w+)(\?.*)?$/);
    if (!m) return null;
    return function (tens) { return m[1] + tens + m[2] + m[3]; };
  }

  function load(url, ok, fail) {
    var img = new Image();
    img.onload = function () { ok(url); };
    img.onerror = fail;
    img.src = url;
  }

  function discover(build, done) {
    var found = [];
    (function next(tens) {
      if (tens > 9) return done(found);
      load(build(tens), function (url) { found.push(url); next(tens + 1); }, function () { done(found); });
    })(1);
  }

  function visible(el) {
    var r = el.getBoundingClientRect();
    return r.bottom > 0 && r.top < window.innerHeight && !document.hidden;
  }

  function revealed(fig) {
    var section = fig.closest('section');
    return !document.documentElement.classList.contains('reveal-ready') ||
      !section || section.classList.contains('is-revealed');
  }

  // Un seul minuteur par galerie : toutes les photos changent ensemble, avec un léger décalage visuel.
  function start(gallery, items, count) {
    var current = 0;
    var busy = false;
    setInterval(function () {
      if (busy || !visible(gallery) || !revealed(gallery)) return;
      busy = true;
      var nextIndex = (current + 1) % count;
      var pending = items.length;
      items.forEach(function (item, i) {
        var next = document.createElement('img');
        next.className = 'rotation-next';
        next.alt = item.img.alt;
        next.style.animationDelay = i * STEP + 'ms';
        next.src = item.list[nextIndex];
        item.fig.appendChild(next);
        next.addEventListener('animationend', function () {
          item.img.src = item.list[nextIndex];
          var finish = function () {
            next.remove();
            if (--pending === 0) { current = nextIndex; busy = false; }
          };
          if (item.img.decode) item.img.decode().then(finish, finish); else finish();
        }, { once: true });
      });
    }, INTERVAL);
  }

  function init() {
    var groups = document.querySelectorAll('.portrait-gallery');
    Array.prototype.forEach.call(groups, function (gallery) {
      var figs = gallery.querySelectorAll(FIGURES);
      var items = [];
      var waiting = figs.length;
      Array.prototype.forEach.call(figs, function (fig, index) {
        var img = fig.querySelector('img');
        var build = img && candidates(img.getAttribute('src'));
        var done = function (extra) {
          items[index] = { fig: fig, img: img, list: [img.getAttribute('src')].concat(extra || []) };
          if (--waiting) return;
          // Le nombre de séries est limité à la galerie la moins fournie pour garder les groupes cohérents.
          var count = Math.min.apply(null, items.map(function (it) { return it.list.length; }));
          if (count > 1) start(gallery, items, count);
        };
        if (!build) return done([]);
        discover(build, done);
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
