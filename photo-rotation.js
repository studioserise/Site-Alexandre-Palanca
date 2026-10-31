/* Roulement des photographies d'une galerie : xxx-01 → xxx-11 → xxx-21… (même rang, dizaine suivante).
   Les fichiers manquants sont simplement ignorés. Indépendant de reveal.js et de page-transition.js. */
(function () {
  'use strict';

  var FIGURES = '.portrait-photo';
  var INTERVAL = 8000;
  var SLOT_OFFSET = 700;
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

  function start(fig, img, list, index) {
    var current = 0;
    var busy = false;
    setTimeout(function () {
      setInterval(function () {
        if (busy || !visible(fig) || !revealed(fig)) return;
        busy = true;
        var nextIndex = (current + 1) % list.length;
        var next = document.createElement('img');
        next.className = 'rotation-next';
        next.alt = img.alt;
        next.src = list[nextIndex];
        fig.appendChild(next);
        next.addEventListener('animationend', function () {
          img.src = list[nextIndex];
          current = nextIndex;
          var finish = function () { next.remove(); busy = false; };
          if (img.decode) img.decode().then(finish, finish); else finish();
        }, { once: true });
      }, INTERVAL);
    }, index * SLOT_OFFSET);
  }

  function init() {
    var groups = document.querySelectorAll('.portrait-gallery');
    for (var g = 0; g < groups.length; g++) {
      var figs = groups[g].querySelectorAll(FIGURES);
      for (var i = 0; i < figs.length; i++) {
        (function (fig, index) {
          var img = fig.querySelector('img');
          var build = img && candidates(img.getAttribute('src'));
          if (!build) return;
          discover(build, function (extra) {
            if (!extra.length) return;
            start(fig, img, [img.getAttribute('src')].concat(extra), index);
          });
        })(figs[i], i);
      }
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
