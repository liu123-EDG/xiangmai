/* Native scroll, reversible layers; no wheel interception or perpetual animation. */
export function mountBrightFinale(host) {
  if (!host) return;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const chapters = [...host.querySelectorAll('[data-finale-step]')];
  let progress = 0, phase = -1, pending = false;
  const clamp = (n) => Math.max(0, Math.min(1, n));
  const rise = (start, end) => {
    const t = clamp((progress - start) / (end - start));
    return t * t * (3 - 2 * t);
  };
  function paint() {
    pending = false;
    const rect = host.getBoundingClientRect();
    const scene = host.querySelector('.bf-scene');
    const distance = Math.max(1, host.offsetHeight - scene.offsetHeight);
    progress = reduced.matches ? 1 : clamp(-rect.top / distance);
    const next = progress < .22 ? 0 : progress < .45 ? 1 : progress < .71 ? 2 : 3;
    const vars = {
      '--bf-dawn': 1 - rise(0, .17),
      '--bf-cloud-opacity': rise(.04, .22),
      '--bf-cloud-x': `${(1 - rise(.04, .5)) * 8}%`,
      '--bf-cloud-y': `${(1 - progress) * 40}px`,
      '--bf-note-opacity': rise(.2, .36),
      '--bf-note-y': `${(1 - rise(.2, .8)) * 100}px`,
      '--bf-people-opacity': rise(.43, .54),
      '--bf-people-mask': `${(1 - rise(.43, .88)) * 50}%`,
      '--bf-people-y': `${(1 - rise(.43, .86)) * 65}px`,
      '--bf-progress': `${progress * 100}%`,
    };
    for (const [key, value] of Object.entries(vars)) host.style.setProperty(key, value);
    if (next !== phase) {
      phase = next;
      host.dataset.phase = String(phase);
      chapters.forEach((chapter, i) => {
        chapter.setAttribute('aria-hidden', String(i !== phase));
        chapter.inert = i !== phase;
      });
    }
    const finished = progress >= .92;
    host.classList.toggle('is-finished', finished);
    host.classList.toggle('has-dawn', progress < .09);
    const link = host.querySelector('.bf-return');
    link.inert = !finished;
    link.setAttribute('aria-hidden', String(!finished));
    document.body.classList.toggle('finale-view', rect.top < 80 && rect.bottom > 80);
  }
  function schedule() {
    if (!pending) { pending = true; requestAnimationFrame(paint); }
  }
  function configure() {
    host.classList.add('is-enhanced');
    host.classList.toggle('is-reduced', reduced.matches);
    paint();
  }
  addEventListener('scroll', schedule, { passive: true });
  addEventListener('resize', schedule, { passive: true });
  reduced.addEventListener('change', configure);
  configure();
  window.__XM_FINALE__ = {
    state: () => ({progress, phase, reduced: reduced.matches,
      images: [...host.querySelectorAll('img')].map(img => ({src: img.getAttribute('src'), loaded: img.complete && img.naturalWidth > 0})),
    }),
  };
}
