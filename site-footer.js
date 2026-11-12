const footerScript = document.currentScript;
const footer = document.createElement('footer');
footer.className = 'footer page-width';

const topHref = footerScript.dataset.top;
const topLabel = footerScript.dataset.topLabel || 'Back to top';

footer.innerHTML = `
  <a class="footer__logo" href="https://wrongwaygames.com" aria-label="90s Magic home"><img src="Assets/Logos/Logo%20Square3%20128.png" alt=""></a>
  <div class="footer__text">
    <p>Made with lots of love, support, and many sleepless nights.</p>
  </div>
  <a href="${topHref}" class="footer__top">${topLabel} ↑</a>
  <p class="footer__disclaimer">'90s Magic is an unofficial fan project. It is not produced by, endorsed by, or affiliated with Wizards of the Coast. Magic: The Gathering and related names and imagery are property of Wizards of the Coast LLC.</p>
`;

footerScript.before(footer);
footerScript.remove();
