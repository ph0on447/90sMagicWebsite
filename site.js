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

document.querySelectorAll('[data-youtube]').forEach((link) => {
  link.addEventListener('click', (event) => {
    event.preventDefault();
    const frame = document.createElement('iframe');
    frame.src = `https://www.youtube-nocookie.com/embed/${link.dataset.youtube}?autoplay=1&rel=0`;
    frame.title = link.dataset.title || 'Video clip';
    frame.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
    frame.allowFullscreen = true;
    link.replaceWith(frame);
  });
});

const storyBlocks = document.querySelector('.story-blocks');
if (storyBlocks && 'IntersectionObserver' in window) {
  storyBlocks.classList.add('is-armed');
  const observer = new IntersectionObserver((entries) => {
    if (entries.some((entry) => entry.isIntersecting)) {
      storyBlocks.classList.add('is-visible');
      observer.disconnect();
    }
  }, { threshold: 0.25 });
  observer.observe(storyBlocks);
}
