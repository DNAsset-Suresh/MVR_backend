// No libraries, timers or JS animation. JS only creates equal copies and controls pause.
(() => {
  const instances = new WeakMap();
  function init(root) {
    instances.get(root)?.();
    const viewport = root.querySelector('.mvr-marquee-viewport');
    const track = root.querySelector('.mvr-marquee-track');
    const group = root.querySelector('.mvr-marquee-group');
    const button = root.querySelector('.mvr-marquee-toggle');
    if (!viewport || !track || !group || !group.children.length) return;
    const originals = [...group.children].filter(card => !card.hasAttribute('data-mvr-copy'));
    const clone = node => {
      const copy = node.cloneNode(true);
      copy.setAttribute('aria-hidden', 'true');
      copy.setAttribute('data-mvr-copy', '');
      copy.removeAttribute('id');
      copy.querySelectorAll('[id]').forEach(item => item.removeAttribute('id'));
      copy.querySelectorAll('a,button,input,select,textarea,[tabindex]').forEach(item => item.setAttribute('tabindex', '-1'));
      return copy;
    };
    let lastWidth = 0;
    function rebuild() {
      const width = viewport.clientWidth;
      if (!width) return;
      lastWidth = width;
      root.classList.remove('is-ready');
      track.querySelectorAll(':scope > [data-mvr-copy]').forEach(item => item.remove());
      group.querySelectorAll(':scope > [data-mvr-copy]').forEach(item => item.remove());
      // A short feed must still cover the viewport before we duplicate the group.
      const repeats = Math.max(1, Math.ceil(width / Math.max(1, group.getBoundingClientRect().width)));
      for (let index = 1; index < repeats; index++) {
        originals.forEach(card => group.append(clone(card)));
      }
      track.append(clone(group));
      root.classList.add('is-ready');
    }
    const toggle = () => {
      const paused = root.classList.toggle('is-paused');
      button.setAttribute('aria-pressed', String(paused));
      button.textContent = paused ? 'தொடரவும் / Play' : 'நிறுத்தவும் / Pause';
    };
    button.hidden = false;
    button.setAttribute('aria-pressed', String(root.classList.contains('is-paused')));
    button.textContent = root.classList.contains('is-paused') ? 'தொடரவும் / Play' : 'நிறுத்தவும் / Pause';
    button.addEventListener('click', toggle);
    const resize = new ResizeObserver(() => { if (viewport.clientWidth !== lastWidth) rebuild(); });
    resize.observe(viewport);
    const fallback = event => {
      if (event.target.tagName !== 'IMG') return;
      event.target.hidden = true;
      const label = event.target.parentElement.querySelector('.mvr-marquee-fallback');
      if (label) label.hidden = false;
    };
    root.addEventListener('error', fallback, true);
    instances.set(root, () => {
      resize.disconnect();
      button.removeEventListener('click', toggle);
      root.removeEventListener('error', fallback, true);
    });
    rebuild();
  }
  window.MVRMarquee = {init};
  const start = () => document.querySelectorAll('[data-mvr-marquee]').forEach(init);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, {once:true});
  else start();
})();
