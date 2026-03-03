# Confetti Animation Tuning Guide

This document explains where the player confetti behavior lives and how to
adjust it safely.

## Files to Edit

- `src/lib/components/PlayerConfetti.svelte`
  - Core animation engine (canvas, particles, physics, stop conditions).
- `src/routes/play/[roomId]/+page.svelte`
  - Trigger logic (when confetti starts) and mount lifecycle in player view.

## Trigger Controls (Player Page)

In `src/routes/play/[roomId]/+page.svelte`:

- `const confettiDurationMs = 1200;`
  - Minimum runtime before confetti is allowed to end.
  - Increase for longer celebration; decrease for snappier celebration.

- `celebratedRevealKeys` + reveal transition logic
  - Prevents duplicate confetti triggers from repeated socket updates.
  - Keep this guard to avoid double bursts.

- `triggerConfetti()` and `onConfettiDone()`
  - Starts and ends visibility for `<PlayerConfetti />`.
  - Confetti now ends when particles leave screen (not fixed timeout only).

## Visual Tuning Parameters (Confetti Component)

In `src/lib/components/PlayerConfetti.svelte`:

- `export let particleCount = 120;`
  - Number of particles.
  - Higher = denser / heavier visual load.
  - Lower = cleaner / lighter burst.

- `const colors = [...]`
  - Color palette for particles.
  - Add/remove colors to change style.

- Tier mix in `createParticles()`:
  - `const tier = i % 3;` (light, medium, heavy classes)
  - Controls how many particles use each fall profile.
  - Change tier logic to bias floaty vs heavy particles.

### Per-particle Physics Fields

For each tier object:

- `vx`
  - Horizontal drift amount.
  - Larger range = wider spread.

- `vy`
  - Initial downward speed.
  - Lower = softer start; higher = immediate drop.

- `gravity`
  - Downward acceleration each frame.
  - Higher = falls faster over time.

- `drag`
  - Velocity damping factor in vertical update.
  - Closer to `1` = smoother/glidier acceleration.
  - Lower = reaches strong downward speed sooner.

- `maxVy`
  - Terminal velocity cap.
  - Higher = particles can drop very fast near end.

- `size`
  - Confetti rectangle size range.
  - Larger pieces look heavier and are easier to see.

- `rotationVelocity`
  - Spin rate.
  - Higher absolute values = more flutter.

## Motion Update Formula

Current per-frame vertical update:

- `p.vy = Math.min(p.maxVy, p.vy * p.drag + p.gravity);`

Effect summary:

- `+ gravity` pushes particles down.
- `* drag` smooths rate changes.
- `maxVy` prevents unrealistic acceleration.

## End Conditions

In `animateFrame()`:

- `reachedMinRuntime = elapsed >= durationMs`
- `allOffscreen = particles.every(...)`
- `reachedSafetyLimit = elapsed >= 6000`

Animation ends when:

- minimum runtime is met and all particles are off-screen, or
- safety limit is hit (fallback).

## Practical Recipes

- More floaty:
  - Reduce `gravity`, raise `drag` (closer to `1`), lower `maxVy`.
- More energetic burst:
  - Increase `vx` range and `rotationVelocity` range.
- Shorter tail:
  - Raise heavy-tier `gravity`/`maxVy` and/or lower heavy-tier `drag`.
- Lower CPU cost:
  - Reduce `particleCount` and keep runtime near current default.

## Safety Notes

- Keep `prefers-reduced-motion` guard in place.
- Keep the `done` event dispatch so parent page can unmount component cleanly.
- If changing stop logic, always keep a safety cap to avoid infinite animation.
