<script lang="ts">
  export let onEnable: () => void;
</script>

<div class="mb-4 text-xs">
  <button
    type="button"
    class="px-3 py-1 rounded-md border border-pub-muted bg-pub-dark hover:opacity-90 w-full sm:w-auto"
    onclick={onEnable}
  >
    Enable screen wake
  </button>
</div>
