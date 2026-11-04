/* Galerie défilante : défilement lent en boucle, arrêt au survol, diaporama dans la case survolée,
   défilement à la main par clic glissé, clic sur une case = même série dans le portfolio. */
(function () {
  'use strict';

  var SPEED = 14;        // pixels par seconde
  var SLIDE_DELAY = 1600; // temps entre deux images dans une case survolée
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function setupTile(tile) {
    var images = tile.querySelectorAll('img');
    var index = 0;
    var timer = null;
    if (images[0]) images[0].classList.add('is-active');

    function show(next) {
      images[index].classList.remove('is-active');
      index = next % images.length;
      images[index].classList.add('is-active');
    }

    return {
      start: function () {
        tile.classList.add('is-hovered');
        if (images.length < 2 || timer) return;
        timer = setInterval(function () { show(index + 1); }, SLIDE_DELAY);
      },
      stop: function () {
        tile.classList.remove('is-hovered');
        clearInterval(timer);
        timer = null;
      }
    };
  }

  function setupReel(reel) {
    var track = reel.querySelector('.photo-reel-track');
    if (!track) return;
    var originals = Array.prototype.slice.call(track.children);
    var count = originals.length;

    // Deux copies supplémentaires pour une boucle sans trou, quelle que soit la largeur.
    for (var copy = 0; copy < 2; copy++) {
      originals.forEach(function (tile) {
        var clone = tile.cloneNode(true);
        clone.setAttribute('aria-hidden', 'true');
        clone.querySelectorAll('img').forEach(function (img) { img.alt = ''; });
        track.appendChild(clone);
      });
    }

    var paused = false;
    var visible = false;
    var offset = 0;
    var last = 0;

    Array.prototype.forEach.call(track.children, function (tile) {
      var control = setupTile(tile);
      tile.addEventListener('pointerenter', function (event) {
        if (event.pointerType === 'touch') return;
        paused = true;
        control.start();
      });
      tile.addEventListener('pointerleave', function () {
        paused = false;
        control.stop();
      });
    });

    function loopWidth() {
      var tiles = track.children;
      return tiles[count].offsetLeft - tiles[0].offsetLeft;
    }

    // Garde le décalage dans une boucle, dans les deux sens.
    function wrap() {
      var width = loopWidth();
      if (width <= 0) return;
      offset = ((offset % width) + width) % width;
    }

    function render() {
      track.style.transform = 'translate3d(' + (-offset) + 'px,0,0)';
    }

    // Clic glissé (souris) ou glissement au doigt pour faire défiler à la main.
    var dragging = false;
    var dragStartX = 0;
    var dragStartOffset = 0;
    var dragMoved = false;
    var pressedTile = null;

    reel.addEventListener('dragstart', function (event) { event.preventDefault(); });

    reel.addEventListener('pointerdown', function (event) {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      dragging = true;
      dragMoved = false;
      pressedTile = event.target.closest('.photo-reel-tile');
      dragStartX = event.clientX;
      dragStartOffset = offset;
      reel.classList.add('is-dragging');
      reel.setPointerCapture(event.pointerId);
    });

    reel.addEventListener('pointermove', function (event) {
      if (!dragging) return;
      if (Math.abs(event.clientX - dragStartX) > 6) dragMoved = true;
      offset = dragStartOffset - (event.clientX - dragStartX);
      wrap();
      render();
    });

    function endDrag(event) {
      if (!dragging) return;
      dragging = false;
      reel.classList.remove('is-dragging');
      if (reel.hasPointerCapture(event.pointerId)) reel.releasePointerCapture(event.pointerId);
    }
    // Un simple clic (sans glisser) sur une case : on descend au portfolio sur la même série.
    reel.addEventListener('pointerup', function (event) {
      var clicked = dragging && !dragMoved && pressedTile;
      endDrag(event);
      if (clicked) openPortfolio(pressedTile);
    });
    reel.addEventListener('pointercancel', endDrag);

    function frame(time) {
      if (!visible) { last = 0; return; }
      if (last && !paused && !dragging && !reduceMotion) {
        offset += SPEED * Math.min(time - last, 100) / 1000;
        wrap();
        render();
      }
      last = time;
      requestAnimationFrame(frame);
    }

    // Le défilement ne tourne que lorsque la galerie est à l'écran.
    new IntersectionObserver(function (entries) {
      var wasVisible = visible;
      visible = entries[0].isIntersecting;
      if (visible && !wasVisible) requestAnimationFrame(frame);
    }).observe(reel);
  }

  function openPortfolio(tile) {
    var id = tile.getAttribute('data-portfolio');
    var target = document.getElementById('portfolio');
    if (!id || !target) return;
    document.dispatchEvent(new CustomEvent('portfolio:show', { detail: { id: id, set: Number(tile.getAttribute('data-set')) || 0 } }));
    target.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' });
  }

  function init() {
    document.querySelectorAll('[data-photo-reel]').forEach(setupReel);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
