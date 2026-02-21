<script lang="ts">
  import '../app.css';
</script>

<div class="h-screen flex flex-col overflow-hidden">
  <main class="flex-1 min-h-0 overflow-y-auto">
    <slot />
  </main>
  <footer class="flex-shrink-0 py-4 px-4 text-center text-sm text-gray-500 border-t border-gray-200">
    © {new Date().getFullYear()} Let's Go Quizzing · <a href="https://github.com/ST4RKiLLaX/lets_go_quizzing" target="_blank" rel="noopener noreferrer" class="text-gray-600 hover:text-gray-900 underline">GitHub</a>
  </footer>
</div>
