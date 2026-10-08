// Site-wide "Updated" date. Change it here; every [data-updated] element picks it up.
const SITE_UPDATED = '10.7.26';
document.querySelectorAll('[data-updated]').forEach((el) => { el.textContent = SITE_UPDATED; });

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

const gallery = document.querySelector('[data-gallery]');
if (gallery) {
  const mainLink = gallery.querySelector('.gallery__open');
  const mainImg = mainLink.querySelector('img');
  const capTitle = gallery.querySelector('.gallery__caption strong');
  const capDesc = gallery.querySelector('.gallery__caption span');
  const thumbs = gallery.querySelectorAll('.gallery__thumb');
  const lightbox = document.querySelector('[data-lightbox]');
  thumbs.forEach((thumb) => {
    thumb.addEventListener('click', () => {
      thumbs.forEach((t) => t.removeAttribute('aria-current'));
      thumb.setAttribute('aria-current', 'true');
      mainLink.href = thumb.dataset.full;
      mainImg.src = thumb.dataset.full;
      mainImg.width = thumb.dataset.w;
      mainImg.height = thumb.dataset.h;
      mainImg.alt = `Screenshot: ${thumb.dataset.title}`;
      capTitle.textContent = thumb.dataset.title;
      capDesc.textContent = thumb.dataset.desc;
    });
  });
  if (lightbox && lightbox.showModal) {
    const lbImg = lightbox.querySelector('img');
    mainLink.addEventListener('click', (event) => {
      event.preventDefault();
      lbImg.src = mainLink.getAttribute('href');
      lbImg.alt = mainImg.alt;
      lightbox.showModal();
    });
    lightbox.addEventListener('click', () => lightbox.close());
  }
}
