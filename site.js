// Site-wide "Updated" date. Change it here; every [data-updated] element picks it up.
const SITE_UPDATED = '11.11.26';
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

const blogList = document.querySelector('[data-blog-source]');
if (blogList) {
  const postCardClasses = ['post-card--featured', 'post-card--blue', 'post-card--pink'];

  function showBlogLoadError(message) {
    const status = document.createElement('p');
    status.className = 'post-grid__status';
    status.textContent = message;
    blogList.replaceChildren(status);
    blogList.setAttribute('aria-busy', 'false');
  }

  async function loadLatestBlogPosts() {
    try {
      const response = await fetch(blogList.dataset.blogSource);
      if (!response.ok) {
        throw new Error(`Blog request failed with status ${response.status}.`);
      }

      const blogDocument = new DOMParser().parseFromString(await response.text(), 'text/html');
      const entries = [...blogDocument.querySelectorAll('.blog-entries > .blog-entry')].slice(0, 3);
      if (entries.length === 0) {
        throw new Error('No blog entries were found.');
      }

      const cards = entries.map((entry, index) => {
        const summary = entry.querySelector('summary');
        const metadata = summary?.querySelectorAll('.blog-entry__meta span');
        const title = summary?.querySelector('.blog-entry__row h2')?.textContent.trim();
        const excerpt = summary?.querySelector('p')?.textContent.trim();
        const log = metadata?.[0]?.textContent.trim();
        const date = metadata?.[1]?.textContent.trim();
        if (!title || !excerpt || !log || !date) {
          throw new Error(`A blog entry is missing its title, excerpt, or metadata.`);
        }

        const card = document.createElement('article');
        card.className = `post-card ${postCardClasses[index % postCardClasses.length]}`;

        const meta = document.createElement('div');
        meta.className = 'post-card__meta';
        for (const value of [log, date]) {
          const item = document.createElement('span');
          item.textContent = value;
          meta.append(item);
        }

        const heading = document.createElement('h3');
        heading.textContent = title;

        const description = document.createElement('p');
        description.textContent = excerpt;

        const link = document.createElement('a');
        link.className = 'post-card__arrow';
        link.href = blogList.dataset.blogSource;
        link.setAttribute('aria-label', `Read ${title}`);
        link.textContent = '↗';

        card.append(meta, heading, description, link);
        return card;
      });

      blogList.replaceChildren(...cards);
      blogList.setAttribute('aria-busy', 'false');
    } catch (error) {
      console.error('Unable to load the latest blog posts:', error);
      showBlogLoadError('Latest dev posts could not be loaded. Please use “All dev posts” to read the blog.');
    }
  }

  loadLatestBlogPosts();
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
  const thumbs = gallery.querySelectorAll('.gallery__thumb');
  thumbs.forEach((thumb) => {
    thumb.addEventListener('click', () => {
      thumbs.forEach((t) => t.removeAttribute('aria-current'));
      thumb.setAttribute('aria-current', 'true');
      mainLink.href = thumb.dataset.full;
      mainImg.src = thumb.dataset.full;
      mainImg.width = thumb.dataset.w;
      mainImg.height = thumb.dataset.h;
      mainImg.alt = 'Gallery image';
    });
  });
}

const lightbox = document.querySelector('[data-lightbox]');
if (lightbox && lightbox.showModal) {
  const lbImg = lightbox.querySelector('img');
  document.querySelectorAll('[data-lightbox-image]').forEach((link) => {
    link.addEventListener('click', (event) => {
      event.preventDefault();
      lbImg.src = link.href;
      lbImg.alt = link.querySelector('img').alt;
      lightbox.showModal();
    });
  });
  lightbox.addEventListener('click', () => lightbox.close());
}
