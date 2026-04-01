// Pretext text-flow animation — bundled as a Vite module so the
// @chenglou/pretext import is resolved at build time (not at runtime).

import { prepareWithSegments, layoutNextLine } from '@chenglou/pretext';

function initPretextAnimation() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const container = document.getElementById('pretext-hero');
  const staticLines = document.getElementById('pretext-lines');
  const canvas = document.getElementById('pretext-canvas');
  if (!container || !staticLines || !canvas) return;

  const longText = container.dataset.text || '';
  if (!longText) return;

  const orbEls = [
    document.getElementById('pretext-orb-0'),
    document.getElementById('pretext-orb-1'),
    document.getElementById('pretext-orb-2'),
  ].filter(Boolean) as HTMLElement[];

  if (orbEls.length === 0) return;

  const computedStyle = getComputedStyle(staticLines);
  const fontSize = computedStyle.fontSize || '14px';
  const fontFamily = computedStyle.fontFamily || 'monospace';
  const font = `${fontSize} ${fontFamily}`;
  const lineHeight = parseFloat(computedStyle.lineHeight) || parseFloat(fontSize) * 1.625;

  const isMobile = window.innerWidth < 640;

  const orbConfigs = [
    { radius: isMobile ? 30 : 50, delay: 3000, speed: 0.0003, pathFn: 'sine' as const },
    { radius: isMobile ? 18 : 30, delay: 5000, speed: 0.00025, pathFn: 'cosine' as const },
    { radius: isMobile ? 12 : 20, delay: 7000, speed: 0.00035, pathFn: 'diagonal' as const },
  ];

  const orbPositions = orbConfigs.map(() => ({ x: -200, y: -200, r: 0, active: false }));

  function getOrbGradient(opacity: number): string {
    const isLight = document.documentElement.classList.contains('light');
    if (isLight) {
      return `radial-gradient(circle, rgba(59,130,246,${opacity}) 0%, rgba(59,130,246,0) 70%)`;
    }
    return `radial-gradient(circle, rgba(34,197,94,${opacity}) 0%, rgba(34,197,94,0) 70%)`;
  }

  function layoutText(obstacles: typeof orbPositions, containerWidth: number) {
    canvas!.innerHTML = '';

    const paragraphs = longText.split('\n\n');
    let globalY = 0;

    for (const para of paragraphs) {
      if (!para.trim()) continue;
      const prepared = prepareWithSegments(para, font);
      let cursor = { segmentIndex: 0, graphemeIndex: 0 };
      let safety = 0;

      while (safety < 500) {
        safety++;
        let lineX = 0;
        let maxWidth = containerWidth;

        const lineTop = globalY;
        const lineBottom = globalY + lineHeight;

        for (const obs of obstacles) {
          if (!obs.active) continue;
          const orbTop = obs.y - obs.r;
          const orbBottom = obs.y + obs.r;

          if (lineBottom > orbTop && lineTop < orbBottom) {
            const lineMid = (lineTop + lineBottom) / 2;
            const dy = Math.abs(obs.y - lineMid);
            if (dy < obs.r) {
              const dx = Math.sqrt(obs.r * obs.r - dy * dy);
              const orbLeft = obs.x - dx;
              const orbRight = obs.x + dx;

              if (orbLeft <= containerWidth * 0.5) {
                const newLineX = Math.max(lineX, orbRight + 8);
                lineX = newLineX;
                maxWidth = containerWidth - lineX;
              } else {
                maxWidth = Math.min(maxWidth, Math.max(40, orbLeft - 8) - lineX);
              }
            }
          }
        }

        if (maxWidth < 40) maxWidth = 40;

        const line = layoutNextLine(prepared, cursor, maxWidth);
        if (line === null) break;

        const span = document.createElement('span');
        span.textContent = line.text;
        span.style.left = `${lineX}px`;
        span.style.top = `${globalY}px`;
        canvas!.appendChild(span);

        cursor = line.end;
        globalY += lineHeight;
      }

      globalY += lineHeight * 0.5;
    }

    const totalHeight = Math.max(globalY, staticLines!.scrollHeight);
    canvas!.style.height = `${totalHeight}px`;
    container!.style.minHeight = `${totalHeight}px`;
  }

  function sinePathPosition(t: number) {
    return { x: (Math.sin(t * 0.7) + 1) / 2, y: (Math.sin(t * 1.3) + 1) / 2 };
  }

  function cosinePathPosition(t: number) {
    return { x: (Math.cos(t * 0.5 + 1) + 1) / 2, y: (Math.cos(t * 0.9 + 2) + 1) / 2 };
  }

  function diagonalPathPosition(t: number) {
    return { x: (Math.sin(t * 0.6 + 3) + 1) / 2, y: (Math.sin(t * 0.4 + 1.5) * Math.cos(t * 0.3) + 1) / 2 };
  }

  const pathFns = { sine: sinePathPosition, cosine: cosinePathPosition, diagonal: diagonalPathPosition };

  let animFrameId: number | null = null;
  let startTime: number | null = null;
  let running = false;

  function startAnimation() {
    if (running) return;
    running = true;

    const containerWidth = container!.clientWidth;
    const containerHeight = staticLines!.scrollHeight;

    container!.style.minHeight = `${containerHeight}px`;
    canvas!.style.display = 'block';
    staticLines!.style.visibility = 'hidden';

    layoutText(orbPositions, containerWidth);

    startTime = performance.now();

    function animate(now: number) {
      const elapsed = now - startTime!;
      const containerW = container!.clientWidth;
      const containerH = parseInt(container!.style.minHeight) || containerHeight;

      const padX = 60;
      const padY = 40;

      for (let i = 0; i < orbConfigs.length; i++) {
        const cfg = orbConfigs[i];
        const orbEl = orbEls[i];
        if (!orbEl) continue;

        if (elapsed < cfg.delay) {
          orbPositions[i].active = false;
          orbEl.style.opacity = '0';
          continue;
        }

        orbPositions[i].active = true;
        const fadeIn = Math.min((elapsed - cfg.delay) / 1000, 1);
        const opacity = 0.3 + fadeIn * 0.3;
        orbEl.style.opacity = String(fadeIn * 0.8);
        orbEl.style.background = getOrbGradient(opacity);

        const t = (elapsed - cfg.delay) * cfg.speed;
        const pathFn = pathFns[cfg.pathFn];
        const pos = pathFn(t);

        const orbX = padX + pos.x * (containerW - padX * 2);
        const orbY = padY + pos.y * (containerH - padY * 2);

        orbPositions[i].x = orbX;
        orbPositions[i].y = orbY;
        orbPositions[i].r = cfg.radius;

        const size = cfg.radius * 2;
        orbEl.style.width = `${size}px`;
        orbEl.style.height = `${size}px`;
        orbEl.style.left = `${orbX - cfg.radius}px`;
        orbEl.style.top = `${orbY - cfg.radius}px`;
      }

      layoutText(orbPositions, containerW);

      animFrameId = requestAnimationFrame(animate);
    }

    animFrameId = requestAnimationFrame(animate);
  }

  const timer = setTimeout(startAnimation, 2000);

  container.addEventListener('mouseenter', () => {
    clearTimeout(timer);
    startAnimation();
  }, { once: true });

  document.addEventListener('astro:before-swap', () => {
    if (animFrameId) cancelAnimationFrame(animFrameId);
    clearTimeout(timer);
    running = false;
  });

  // Update orb colors on theme change
  const observer = new MutationObserver(() => {
    for (let i = 0; i < orbConfigs.length; i++) {
      if (orbPositions[i].active && orbEls[i]) {
        orbEls[i].style.background = getOrbGradient(0.5);
      }
    }
  });
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
}

// Boot: wait for DOM if needed
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => initPretextAnimation());
} else {
  setTimeout(() => initPretextAnimation(), 100);
}
