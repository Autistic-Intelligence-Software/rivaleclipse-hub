(() => {
  const canvas = document.getElementById('sky');
  const ctx = canvas.getContext('2d');
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const TAU = Math.PI * 2;
  let W = 0, H = 0, stars = [], wisps = [], sparks = [], patches = [], nebulae = [], comets = [];
  let nextCometAt = 2.5;

  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = arr => arr[(Math.random() * arr.length) | 0];

  function resize() {
    const DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = Math.floor(W * DPR);
    canvas.height = Math.floor(H * DPR);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    build();
  }

  function build() {
    const R = eclipseR();
    // Starfield
    stars = [];
    const count = Math.floor(W * H / 6500);
    for (let i = 0; i < count; i++) {
      stars.push({
        x: Math.random() * W, y: Math.random() * H,
        r: rand(0.4, 1.7), a: rand(0.25, 0.9),
        sp: rand(0.6, 2.4), ph: Math.random() * TAU,
        warm: Math.random() < 0.18
      });
    }
    // Wispy corona clouds (fiery orange, like the reference)
    wisps = [];
    const palette = ['255,150,50', '255,170,70', '230,110,35', '255,190,90', '200,80,25'];
    for (let i = 0; i < 52; i++) {
      wisps.push({
        ang: Math.random() * TAU,
        rad: R * rand(1.02, 2.3),
        size: R * rand(0.22, 0.65),
        c: pick(palette),
        a: rand(0.05, 0.15),
        orbit: rand(-0.05, 0.05),
        ps: rand(0.4, 1.4), ph: Math.random() * TAU,
        rot: Math.random() * TAU, rs: rand(-0.05, 0.05), sq: rand(0.45, 0.8)
      });
    }
    // Bright sparkles hugging the limb
    sparks = [];
    for (let i = 0; i < 42; i++) {
      sparks.push({
        ang: Math.random() * TAU, rad: R * rand(1.0, 1.35),
        r: rand(0.6, 1.8), a: rand(0.4, 1),
        sp: rand(1, 3), ph: Math.random() * TAU
      });
    }
    // Subtle mottling on the moon disk
    patches = [];
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * TAU, d = Math.random() * R * 0.8;
      patches.push({ dx: Math.cos(a) * d, dy: Math.sin(a) * d, r: R * rand(0.15, 0.45), a: rand(0.04, 0.1) });
    }
    // Faint warm nebula washes
    const m = Math.min(W, H);
    nebulae = [
      { x: W * 0.85, y: H * 0.7, r: m * 0.35, c: '200,110,40', a: 0.05 },
      { x: W * 0.6, y: H * 0.15, r: m * 0.3, c: '124,92,255', a: 0.035 },
      { x: W * 0.3, y: H * 0.9, r: m * 0.28, c: '150,50,30', a: 0.04 }
    ];
  }

  // Big disk, bleeding off the left edge
  function eclipseR() {
    return Math.max(200, Math.min(460, Math.min(W, H) * 0.45));
  }
  function eclipseGeom() {
    const R = eclipseR();
    return { x: R * 0.55, y: Math.min(H * 0.44, 480), R };
  }

  function drawEclipse(t, dt) {
    const { x, y, R } = eclipseGeom();
    const flick = 0.9 + 0.1 * Math.sin(t * 1.7) + 0.05 * Math.sin(t * 4.3 + 1.2);

    // Ambient warm glow
    let g = ctx.createRadialGradient(x, y, R * 0.9, x, y, R * 3.2);
    g.addColorStop(0, 'rgba(255,140,50,0.08)');
    g.addColorStop(0.5, 'rgba(220,100,40,0.035)');
    g.addColorStop(1, 'rgba(220,100,40,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - R * 3.2, y - R * 3.2, R * 6.4, R * 6.4);

    // Wispy corona clouds
    for (const w of wisps) {
      w.ang += w.orbit * dt;
      const px = x + Math.cos(w.ang) * w.rad;
      const py = y + Math.sin(w.ang) * w.rad * 0.92;
      const pulse = 0.7 + 0.3 * Math.sin(t * w.ps + w.ph);
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(w.rot + t * w.rs);
      ctx.scale(1, w.sq);
      const wg = ctx.createRadialGradient(0, 0, 0, 0, 0, w.size);
      wg.addColorStop(0, 'rgba(' + w.c + ',' + (w.a * pulse).toFixed(3) + ')');
      wg.addColorStop(0.6, 'rgba(' + w.c + ',' + (w.a * 0.45 * pulse).toFixed(3) + ')');
      wg.addColorStop(1, 'rgba(' + w.c + ',0)');
      ctx.fillStyle = wg;
      ctx.beginPath(); ctx.arc(0, 0, w.size, 0, TAU); ctx.fill();
      ctx.restore();
    }

    // Moon disk
    g = ctx.createRadialGradient(x - R * 0.2, y - R * 0.2, R * 0.1, x, y, R);
    g.addColorStop(0, '#0c0b12');
    g.addColorStop(0.8, '#060509');
    g.addColorStop(1, '#030307');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, R, 0, TAU); ctx.fill();
    // Mottled texture
    for (const p of patches) {
      const pg = ctx.createRadialGradient(x + p.dx, y + p.dy, 0, x + p.dx, y + p.dy, p.r);
      pg.addColorStop(0, 'rgba(52,48,58,' + p.a + ')');
      pg.addColorStop(1, 'rgba(52,48,58,0)');
      ctx.fillStyle = pg;
      ctx.beginPath(); ctx.arc(x + p.dx, y + p.dy, p.r, 0, TAU); ctx.fill();
    }
    // Faint earthshine on the right edge
    const es = ctx.createLinearGradient(x - R, 0, x + R, 0);
    es.addColorStop(0.55, 'rgba(70,60,50,0)');
    es.addColorStop(1, 'rgba(120,100,80,0.22)');
    ctx.fillStyle = es;
    ctx.beginPath(); ctx.arc(x, y, R, 0, TAU); ctx.fill();

    // Warm halo hugging the limb
    g = ctx.createRadialGradient(x, y, R * 0.95, x, y, R * 1.6);
    g.addColorStop(0, 'rgba(255,190,100,' + (0.4 * flick).toFixed(3) + ')');
    g.addColorStop(0.5, 'rgba(255,150,60,' + (0.16 * flick).toFixed(3) + ')');
    g.addColorStop(1, 'rgba(255,150,60,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, R * 1.6, 0, TAU); ctx.fill();

    // Bright limb ring: soft glow + hot core
    ctx.strokeStyle = 'rgba(255,160,60,' + (0.5 * flick).toFixed(3) + ')';
    ctx.lineWidth = Math.max(4, R * 0.03);
    ctx.beginPath(); ctx.arc(x, y, R, 0, TAU); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,240,205,' + (0.95 * flick).toFixed(3) + ')';
    ctx.lineWidth = Math.max(1.5, R * 0.011);
    ctx.beginPath(); ctx.arc(x, y, R, 0, TAU); ctx.stroke();
    // Extra-hot arc across the top
    ctx.strokeStyle = 'rgba(255,250,230,' + (0.9 * flick).toFixed(3) + ')';
    ctx.lineWidth = Math.max(2, R * 0.016);
    ctx.beginPath(); ctx.arc(x, y, R, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();

    // Sparkles near the limb
    for (const s of sparks) {
      const tw = 0.5 + 0.5 * Math.sin(t * s.sp + s.ph);
      ctx.globalAlpha = s.a * tw;
      ctx.fillStyle = '#ffe9c0';
      ctx.beginPath(); ctx.arc(x + Math.cos(s.ang) * s.rad, y + Math.sin(s.ang) * s.rad, s.r, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function spawnComet() {
    const fromTop = Math.random() < 0.6;
    let x, y;
    if (fromTop) { x = rand(W * 0.15, W * 0.95); y = -20; }
    else { x = W + 20; y = rand(0, H * 0.4); }
    const vx = -rand(400, 750), vy = rand(180, 380);
    const speed = Math.hypot(vx, vy);
    comets.push({ x, y, vx, vy, ux: vx / speed, uy: vy / speed, age: 0, life: rand(0.7, 1.1) });
  }

  function drawComets(t, dt) {
    if (!reduceMotion && t > nextCometAt) {
      spawnComet();
      nextCometAt = t + rand(3.5, 9);
    }
    for (let i = comets.length - 1; i >= 0; i--) {
      const c = comets[i];
      c.age += dt; c.x += c.vx * dt; c.y += c.vy * dt;
      const k = c.age / c.life;
      if (k >= 1 || c.x < -160 || c.y > H + 160) { comets.splice(i, 1); continue; }
      const fade = k < 0.15 ? k / 0.15 : 1 - (k - 0.15) / 0.85;
      const tx = c.x - c.ux * 150, ty = c.y - c.uy * 150;
      const grad = ctx.createLinearGradient(c.x, c.y, tx, ty);
      grad.addColorStop(0, 'rgba(255,255,255,' + (0.9 * fade).toFixed(3) + ')');
      grad.addColorStop(0.25, 'rgba(200,220,255,' + (0.5 * fade).toFixed(3) + ')');
      grad.addColorStop(1, 'rgba(200,220,255,0)');
      ctx.strokeStyle = grad;
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(c.x, c.y); ctx.lineTo(tx, ty); ctx.stroke();
      const hg = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, 10);
      hg.addColorStop(0, 'rgba(255,255,255,' + (0.95 * fade).toFixed(3) + ')');
      hg.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = hg;
      ctx.beginPath(); ctx.arc(c.x, c.y, 10, 0, TAU); ctx.fill();
    }
  }

  function draw(t, dt) {
    ctx.clearRect(0, 0, W, H);
    // Deep space base
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#050508');
    bg.addColorStop(0.5, '#0a0a12');
    bg.addColorStop(1, '#07070d');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
    // Nebulae
    for (const n of nebulae) {
      const g = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, n.r);
      g.addColorStop(0, 'rgba(' + n.c + ',' + n.a + ')');
      g.addColorStop(1, 'rgba(' + n.c + ',0)');
      ctx.fillStyle = g;
      ctx.fillRect(n.x - n.r, n.y - n.r, n.r * 2, n.r * 2);
    }
    // Stars with twinkle
    for (const s of stars) {
      const tw = 0.55 + 0.45 * Math.sin(t * s.sp + s.ph);
      ctx.globalAlpha = s.a * tw;
      ctx.fillStyle = s.warm ? '#ffe9c4' : '#dfe8ff';
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
    drawEclipse(t, dt);
    drawComets(t, dt);
  }

  let last = 0, raf = 0;
  function frame(ts) {
    const t = ts / 1000;
    const dt = Math.min(0.05, t - last || 0.016);
    last = t;
    draw(t, dt);
    raf = requestAnimationFrame(frame);
  }

  resize();
  window.addEventListener('resize', resize);
  if (reduceMotion) {
    draw(1.2, 0); // single static frame
  } else {
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) cancelAnimationFrame(raf);
      else { last = performance.now() / 1000; raf = requestAnimationFrame(frame); }
    });
    raf = requestAnimationFrame(frame);
  }
})();
