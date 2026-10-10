/* Six-pose 2.5D actor. Animation follows conversation state and pauses offscreen. */
export function createGuideActor({ host, image, source, reduced = false, preview = false }) {
  const canvas = document.createElement('canvas');
  canvas.className = 'guide-actor';
  canvas.width = 420;
  canvas.height = 630;
  canvas.setAttribute('aria-hidden', 'true');
  host.insertBefore(canvas, image);
  canvas.hidden = true;
  const context = canvas.getContext('2d');
  const sheet = new Image();
  let loaded = false, raf = 0, mode = 'idle', frame = 0, previous = 0;
  let changed = 0, started = performance.now(), lastDraw = 0, visible = !preview;
  let gestureUntil = 0;
  const phase = preview ? Math.random() * 5000 : 0;
  const frameAt = now => {
    if (reduced) return 0;
    if (gestureUntil > now) return 3;
    if (mode === 'talking') return [4, 5, 4, 2][Math.floor((now - started) / 850) % 4];
    if (mode === 'hint') return [3, 2, 0][Math.floor((now - started) / 1800) % 3];
    const t = (now - started + phase) % 16000;
    if (t > 2500 && t < 2670) return 1;
    if (t > 6700 && t < 8200) return 2;
    if (t > 11700 && t < 13200) return 3;
    return 0;
  };
  function drawPose(index, opacity) {
    const cellW = sheet.naturalWidth / 3, cellH = sheet.naturalHeight / 2;
    const bounds = /qinglan/.test(source) ? [[0,0,449,627],[449,0,385,627],[834,0,420,627],[0,627,449,627],[449,627,385,627],[834,627,420,627]] : null;
    const rect = bounds?.[index] || [(index % 3) * cellW, Math.floor(index / 3) * cellH, cellW, cellH];
    const [sx,sy,w,h] = rect;
    const scale = Math.min((canvas.width - 22) / w, (canvas.height - 28) / h);
    const width = w * scale, height = h * scale;
    context.globalAlpha = opacity;
    context.drawImage(sheet, sx, sy, w, h,
      (canvas.width - width) / 2, canvas.height - height - 14, width, height);
  }
  function draw(now) {
    if (!loaded) return;
    const next = frameAt(now);
    if (next !== frame) { previous = frame; frame = next; changed = now; }
    canvas.dataset.frame = String(frame);
    canvas.dataset.mode = mode;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.save();
    if (!reduced) {
      const breathe = Math.sin(now / 1500) * 1.8;
      context.translate(canvas.width / 2, canvas.height - 15);
      context.scale(1 + breathe / 1000, 1 - breathe / 900);
      context.translate(-canvas.width / 2, -(canvas.height - 15));
    }
    const mix = reduced ? 1 : Math.min(1, (now - changed) / 180);
    if (mix < 1 && previous !== frame) drawPose(previous, 1 - mix);
    drawPose(frame, mix < 1 && previous !== frame ? mix : 1);
    context.restore();
    context.globalAlpha = 1;
  }
  function loop(now) {
    raf = 0;
    if (!loaded || document.hidden || !visible || reduced) return;
    if (now - lastDraw >= 1000 / 24) { draw(now); lastDraw = now; }
    raf = requestAnimationFrame(loop);
  }
  function resume() { if (!raf && loaded && visible && !document.hidden && !reduced) raf = requestAnimationFrame(loop); }
  function pause() { cancelAnimationFrame(raf); raf = 0; }
  const onVisibility = () => document.hidden ? pause() : resume();
  document.addEventListener('visibilitychange', onVisibility);
  const observer = 'IntersectionObserver' in window ? new IntersectionObserver(entries => {
    visible = entries[0].isIntersecting;
    if (visible) resume(); else pause();
  }) : null;
  observer?.observe(host);
  if (!observer) visible = true;
  sheet.onload = () => {
    loaded = true; image.hidden = true; canvas.hidden = false;
    host.classList.add('has-guide-actor');
    draw(performance.now()); resume();
  };
  // Retain the approved still as a graceful fallback if an atlas cannot load.
  sheet.onerror = () => { image.hidden = false; canvas.hidden = true; };
  sheet.src = source;
  return {
    setMode(value) { mode = value; started = performance.now(); if (loaded) draw(performance.now()); resume(); },
    wave() { if (reduced) return; gestureUntil = performance.now() + 1300; resume(); },
    state: () => ({ loaded, frame, mode, animated: !!raf, source }),
    destroy() { pause(); observer?.disconnect(); document.removeEventListener('visibilitychange', onVisibility); sheet.onload = null; sheet.onerror = null; canvas.remove(); image.hidden = false; host.classList.remove('has-guide-actor'); },
  };
}
