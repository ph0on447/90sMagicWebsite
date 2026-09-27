const navigation = document.querySelector('.site-nav');
const hero = document.querySelector('.hero');

if (navigation && hero) {
  function updateNavigation() {
    const shouldStick = window.scrollY >= hero.offsetHeight - navigation.offsetHeight;
    navigation.classList.toggle('is-stuck', shouldStick);
  }

  window.addEventListener('scroll', updateNavigation, { passive: true });
  window.addEventListener('resize', updateNavigation);
  updateNavigation();
}