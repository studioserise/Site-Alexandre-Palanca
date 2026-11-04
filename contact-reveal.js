/* Formulaire de contact replié : le bouton « Remplir le formulaire » l'ouvre en grand.
   Il s'ouvre aussi tout seul quand on arrive par un lien vers la section (menu, bouton devis…). */
(function () {
  'use strict';

  function setup(button) {
    var collapse = document.getElementById(button.getAttribute('aria-controls'));
    if (!collapse) return;
    var section = button.closest('section');
    var label = button.querySelector('span');
    var arrow = button.querySelector('[aria-hidden="true"]');

    function setOpen(open, scroll) {
      collapse.classList.toggle('is-closed', !open);
      collapse.classList.remove('is-open');
      collapse.inert = !open;
      button.setAttribute('aria-expanded', String(open));
      label.textContent = open ? 'Réduire le formulaire' : 'Remplir le formulaire';
      if (arrow) arrow.textContent = open ? '↑' : '↓';
      if (open && scroll) {
        setTimeout(function () {
          collapse.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 250);
      }
    }

    // Une fois ouvert, on laisse dépasser les contours (focus, ombres).
    collapse.addEventListener('transitionend', function (event) {
      if (event.target === collapse && !collapse.classList.contains('is-closed')) collapse.classList.add('is-open');
    });

    button.addEventListener('click', function () {
      setOpen(collapse.classList.contains('is-closed'), true);
    });

    function openFromHash() {
      if (section && section.id && location.hash === '#' + section.id) setOpen(true, false);
    }
    window.addEventListener('hashchange', openFromHash);
    document.addEventListener('click', function (event) {
      var link = event.target.closest && event.target.closest('a[href*="#"]');
      if (!link || !section || !section.id) return;
      var url = new URL(link.href, location.href);
      if (url.pathname === location.pathname && url.hash === '#' + section.id) setOpen(true, false);
    });

    setOpen(false, false);
    openFromHash();
  }

  function init() {
    document.querySelectorAll('[data-contact-reveal]').forEach(setup);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
