<script lang="ts">
  import { page } from '$app/stores';
  import '../app.css';
  import HostNav from '$lib/components/HostNav.svelte';
  import { hostSessionStore } from '$lib/stores/host-session.js';

  export let data;
  $: isProjector = $page.url.pathname.startsWith('/projector/');
  $: isHostRoute = $page.url.pathname.startsWith('/host/');
</script>

<div class="flex h-full min-h-0 flex-col overflow-hidden">
  {#if !isProjector && (data?.hostAuthenticated || (isHostRoute && $hostSessionStore.active))}
    <HostNav />
  {/if}
  <main class="flex-1 min-h-0 overflow-y-auto">
    <!-- min-h-full: fill main (viewport − nav − footer), not 100vh — avoids phantom scrollbars -->
    <div class="min-h-full">
      <slot />
    </div>
  </main>
  <footer class="flex-shrink-0 py-4 px-4 text-center text-sm text-gray-500 border-t border-gray-200">
    © {new Date().getFullYear()} Let's Go Quizzing · <a href="https://github.com/ST4RKiLLaX/lets_go_quizzing" target="_blank" rel="noopener noreferrer" class="text-gray-600 hover:text-gray-900 underline">GitHub</a>
  </footer>
</div>
