<script lang="ts">
  import { fly, fade } from 'svelte/transition';
  import {
    dismissToast,
    pauseToast,
    resumeToast,
    type Toast,
  } from '$lib/stores/toasts';

  export let toast: Toast;

  const VARIANT_CLASSES: Record<Toast['variant'], string> = {
    success: 'border-green-600',
    error: 'border-red-600',
    warning: 'border-amber-500',
    info: 'border-blue-500',
  };

  const VARIANT_ICON: Record<Toast['variant'], string> = {
    success: '✓',
    error: '!',
    warning: '!',
    info: 'i',
  };

  const VARIANT_ICON_BG: Record<Toast['variant'], string> = {
    success: 'bg-green-600',
    error: 'bg-red-600',
    warning: 'bg-amber-500',
    info: 'bg-blue-500',
  };

  // Respect prefers-reduced-motion. Fall back to instant if matchMedia is unavailable (SSR).
  const reducedMotion =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function leftCard(e: MouseEvent | FocusEvent): boolean {
    const related = (e as { relatedTarget?: EventTarget | null }).relatedTarget as Node | null;
    const current = e.currentTarget as HTMLElement | null;
    if (!current) return true;
    return !current.contains(related);
  }

  function handleMouseEnter() {
    const id = toast.id;
    if (id) pauseToast(id, 'hover');
  }

  function handleMouseLeave(e: MouseEvent) {
    if (!leftCard(e)) return;
    const id = toast.id;
    if (id) resumeToast(id, 'hover');
  }

  function handleFocusIn() {
    const id = toast.id;
    if (id) pauseToast(id, 'focus');
  }

  function handleFocusOut(e: FocusEvent) {
    if (!leftCard(e)) return;
    const id = toast.id;
    if (id) resumeToast(id, 'focus');
  }

  function handleDismiss() {
    const id = toast.id;
    if (id) dismissToast(id);
  }

  function handleCloseKey(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.stopPropagation();
      handleDismiss();
    }
  }
</script>

<div
  class="toast-card flex items-start gap-3 rounded-lg border-l-4 bg-pub-darker border-pub-muted shadow-lg p-3 pr-2 {VARIANT_CLASSES[
    toast.variant
  ]}"
  role="group"
  aria-label={toast.title ? `${toast.variant} notification: ${toast.title}` : `${toast.variant} notification`}
  data-testid="toast"
  data-variant={toast.variant}
  data-toast-id={toast.id}
  onmouseenter={handleMouseEnter}
  onmouseleave={handleMouseLeave}
  onfocusin={handleFocusIn}
  onfocusout={handleFocusOut}
  in:fly={{ y: reducedMotion ? 0 : -12, duration: reducedMotion ? 0 : 180 }}
  out:fade={{ duration: reducedMotion ? 0 : 150 }}
>
  <span
    class="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-white text-sm font-bold {VARIANT_ICON_BG[
      toast.variant
    ]}"
    aria-hidden="true"
  >
    {VARIANT_ICON[toast.variant]}
  </span>
  <div class="flex-1 min-w-0 text-sm">
    {#if toast.title}
      <p class="font-semibold text-pub-gold mb-0.5">{toast.title}</p>
    {/if}
    <p class="text-pub-muted whitespace-pre-wrap break-words">{toast.message}</p>
  </div>
  {#if toast.dismissible}
    <button
      type="button"
      class="flex-shrink-0 ml-1 w-7 h-7 inline-flex items-center justify-center rounded hover:bg-white/10 text-pub-muted hover:text-white focus:outline-none focus:ring-2 focus:ring-pub-gold"
      aria-label="Dismiss"
      onclick={handleDismiss}
      onkeydown={handleCloseKey}
    >
      <span aria-hidden="true">×</span>
    </button>
  {/if}
</div>

<style>
  .toast-card {
    /* Slight alpha overlay so the card reads above confetti and page content. */
    background-color: rgb(22 33 62 / 0.97);
  }
</style>
