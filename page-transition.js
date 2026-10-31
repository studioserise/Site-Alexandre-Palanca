/* Transition entre pages : cadre de mise au point + flou (ordinateur uniquement). */
(function () {
  'use strict';

  var MIN_WIDTH = 1024;
  var KEY = 'pt-transition';
  var FLAG_TTL = 4000;
  var OUT_MS = 360;
  var IN_MS = 340;
  var FADE_IN = 340;
  var FADE_MS = 520;
  var EXCLUDED = /(^|\/)(galerie-privee|admin-galeries|commande-confirmee)(\.html)?$/i;

  var desktop = window.matchMedia('(min-width: ' + MIN_WIDTH + 'px)');
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  var busy = false;
  var styled = false;

  function enabled() {
    return desktop.matches && !reduced.matches;
  }

  function injectStyle() {
    if (styled) return;
    styled = true;
    var css =
      '.pt-overlay{position:fixed;inset:0;z-index:2147483000;pointer-events:none;' +
      'background:rgba(0,0,0,0);-webkit-backdrop-filter:blur(0px);backdrop-filter:blur(0px)}' +
      '.pt-overlay.pt-blur{background:rgba(0,0,0,.94);-webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px)}' +
      '.pt-overlay.pt-anim-out{transition:background-color ' + OUT_MS + 'ms ease,-webkit-backdrop-filter ' + OUT_MS + 'ms ease,backdrop-filter ' + OUT_MS + 'ms ease}' +
      '.pt-overlay.pt-anim-in{transition:background-color ' + IN_MS + 'ms ease,-webkit-backdrop-filter ' + IN_MS + 'ms ease,backdrop-filter ' + IN_MS + 'ms ease}' +
      '.pt-frame{position:absolute;inset:0;opacity:0;transition:opacity ' + FADE_IN + 'ms ease}' +
      '.pt-overlay.pt-leave .pt-frame{transition-duration:' + FADE_MS + 'ms}' +
      '.pt-overlay.pt-show .pt-frame{opacity:1}' +
      '.pt-corner{position:absolute;width:30px;height:30px;border:0 solid rgba(255,255,255,.7)}' +
      '.pt-tl{top:28px;left:28px;border-top-width:1px;border-left-width:1px}' +
      '.pt-tr{top:28px;right:28px;border-top-width:1px;border-right-width:1px}' +
      '.pt-bl{bottom:28px;left:28px;border-bottom-width:1px;border-left-width:1px}' +
      '.pt-br{bottom:28px;right:28px;border-bottom-width:1px;border-right-width:1px}' +
      '.pt-cross-h,.pt-cross-v{position:absolute;left:50%;top:50%;background:rgba(255,255,255,.7);transform:translate(-50%,-50%)}' +
      '.pt-cross-h{width:22px;height:1px}.pt-cross-v{width:1px;height:22px}';
    var style = document.createElement('style');
    style.setAttribute('data-page-transition', '');
    style.textContent = css;
    document.documentElement.appendChild(style);
  }

  function buildOverlay() {
    injectStyle();
    var overlay = document.createElement('div');
    overlay.className = 'pt-overlay';
    overlay.setAttribute('aria-hidden', 'true');
    overlay.innerHTML =
      '<div class="pt-frame">' +
      '<span class="pt-corner pt-tl"></span><span class="pt-corner pt-tr"></span>' +
      '<span class="pt-corner pt-bl"></span><span class="pt-corner pt-br"></span>' +
      '<span class="pt-cross-h"></span><span class="pt-cross-v"></span>' +
      '</div>';
    document.documentElement.appendChild(overlay);
    return overlay;
  }

  function removeOverlays() {
    var list = document.querySelectorAll('.pt-overlay');
    for (var i = 0; i < list.length; i++) list[i].remove();
    busy = false;
  }

  function readFlag() {
    try {
      var raw = sessionStorage.getItem(KEY);
      sessionStorage.removeItem(KEY);
      return !!raw && Date.now() - Number(raw) < FLAG_TTL;
    } catch (e) {
      return false;
    }
  }

  function setFlag() {
    try {
      sessionStorage.setItem(KEY, String(Date.now()));
    } catch (e) { /* stockage indisponible : navigation sans effet d'arrivée */ }
  }

  function isInternalTarget(link, event) {
    if (event.defaultPrevented || event.button !== 0) return false;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;
    if (link.target && link.target !== '_self') return false;
    if (link.hasAttribute('download') || link.hasAttribute('data-no-transition')) return false;
    var raw = link.getAttribute('href');
    if (!raw || raw.charAt(0) === '#') return false;
    var url;
    try {
      url = new URL(link.href, location.href);
    } catch (e) {
      return false;
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
    if (url.origin !== location.origin) return false;
    if (EXCLUDED.test(url.pathname)) return false;
    if (url.pathname === location.pathname && url.search === location.search) return false;
    return url.href;
  }

  // Départ : cadre + flou progressif, puis navigation.
  document.addEventListener('click', function (event) {
    if (!enabled()) return;
    var link = event.target.closest && event.target.closest('a[href]');
    if (!link) return;
    var href = isInternalTarget(link, event);
    if (!href) return;
    if (busy) {
      event.preventDefault();
      return;
    }
    busy = true;
    event.preventDefault();
    var overlay = buildOverlay();
    void overlay.offsetWidth;
    overlay.classList.add('pt-anim-out', 'pt-show', 'pt-blur');
    window.setTimeout(function () {
      setFlag();
      location.href = href;
    }, OUT_MS);
    // Garde-fou : navigation interrompue ou en échec.
    window.setTimeout(function () {
      if (document.visibilityState === 'visible') removeOverlays();
    }, 6000);
  });

  // Arrivée : la page démarre floue sous le cadre, puis la mise au point se fait.
  if (readFlag() && enabled()) {
    var arrival = buildOverlay();
    arrival.classList.add('pt-show', 'pt-blur');
    var focus = function () {
      void arrival.offsetWidth;
      window.setTimeout(function () {
        arrival.classList.add('pt-anim-in');
        arrival.classList.remove('pt-blur');
        window.setTimeout(function () {
          arrival.classList.add('pt-leave');
          arrival.classList.remove('pt-show');
          window.setTimeout(function () {
            arrival.remove();
          }, FADE_MS + 40);
        }, IN_MS);
      }, 30);
    };
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', focus, { once: true });
    } else {
      focus();
    }
    // Garde-fou si DOMContentLoaded tarde ou ne vient pas.
    window.setTimeout(function () {
      if (arrival.parentNode) arrival.remove();
    }, 8000);
  }

  // Retour arrière (cache de navigation) : aucun calque résiduel.
  window.addEventListener('pageshow', function (event) {
    if (event.persisted) removeOverlays();
  });
})();
