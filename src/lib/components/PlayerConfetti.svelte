<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { onDestroy, onMount } from 'svelte';

  export let durationMs = 1200;
  export let particleCount = 120;

  type Particle = {
    x: number;
    y: number;
    vx: number;
    vy: number;
    gravity: number;
    drag: number;
    maxVy: number;
    size: number;
    rotation: number;
    rotationVelocity: number;
    color: string;
  };

  let canvas: HTMLCanvasElement | null = null;
  let rafId: number | null = null;
  let startTime = 0;
  let particles: Particle[] = [];
  let finished = false;
  const colors = ['#FFD166', '#06D6A0', '#118AB2', '#EF476F', '#FFFFFF'];
  const dispatch = createEventDispatcher<{ done: void }>();

  function resizeCanvas() {
    if (!canvas) return;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }

  function createParticles(width: number): Particle[] {
    return Array.from({ length: particleCount }, (_, i) => {
      // Mix particle classes so they clearly fall at different rates.
      const tier = i % 3; // 0 = light, 1 = medium, 2 = heavy

      if (tier === 0) {
        return {
          x: width * (0.15 + Math.random() * 0.7),
          y: -10 - Math.random() * 100,
          vx: (Math.random() - 0.5) * 6,
          vy: 0.8 + Math.random() * 1.2,
          gravity: 0.035 + Math.random() * 0.02,
          drag: 0.995,
          maxVy: 3.2 + Math.random() * 0.8,
          size: 3.5 + Math.random() * 3,
          rotation: Math.random() * Math.PI,
          rotationVelocity: (Math.random() - 0.5) * 0.3,
          color: colors[Math.floor(Math.random() * colors.length)],
        };
      }

      if (tier === 1) {
        return {
          x: width * (0.15 + Math.random() * 0.7),
          y: -10 - Math.random() * 100,
          vx: (Math.random() - 0.5) * 6,
          vy: 1.4 + Math.random() * 2.1,
          gravity: 0.055 + Math.random() * 0.03,
          drag: 0.992,
          maxVy: 5 + Math.random() * 1.2,
          size: 4 + Math.random() * 4,
          rotation: Math.random() * Math.PI,
          rotationVelocity: (Math.random() - 0.5) * 0.28,
          color: colors[Math.floor(Math.random() * colors.length)],
        };
      }

      return {
        x: width * (0.15 + Math.random() * 0.7),
        y: -10 - Math.random() * 100,
        vx: (Math.random() - 0.5) * 6,
        vy: 2.8 + Math.random() * 3.6,
        gravity: 0.1 + Math.random() * 0.05,
        drag: 0.985,
        maxVy: 8.5 + Math.random() * 2.2,
        size: 5 + Math.random() * 5,
        rotation: Math.random() * Math.PI,
        rotationVelocity: (Math.random() - 0.5) * 0.24,
        color: colors[Math.floor(Math.random() * colors.length)],
      };
    });
  }

  function animateFrame(now: number) {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    if (startTime === 0) startTime = now;

    const elapsed = now - startTime;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (const p of particles) {
      p.vy = Math.min(p.maxVy, p.vy * p.drag + p.gravity);
      p.x += p.vx;
      p.y += p.vy;
      p.rotation += p.rotationVelocity;

      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
      ctx.restore();
    }

    const canvasHeight = canvas.height;
    const allOffscreen = particles.every((p) => p.y - p.size > canvasHeight + 40);
    const reachedMinRuntime = elapsed >= durationMs;
    const reachedSafetyLimit = elapsed >= 6000;

    if ((!reachedMinRuntime || !allOffscreen) && !reachedSafetyLimit) {
      rafId = requestAnimationFrame(animateFrame);
      return;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    rafId = null;
    if (!finished) {
      finished = true;
      dispatch('done');
    }
  }

  onMount(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return;
    }

    resizeCanvas();
    particles = createParticles(window.innerWidth);
    window.addEventListener('resize', resizeCanvas);
    rafId = requestAnimationFrame(animateFrame);
  });

  onDestroy(() => {
    window.removeEventListener('resize', resizeCanvas);
    if (rafId != null) cancelAnimationFrame(rafId);
  });
</script>

<canvas
  bind:this={canvas}
  class="fixed inset-0 pointer-events-none z-[100] w-screen h-screen"
  aria-hidden="true"
></canvas>
