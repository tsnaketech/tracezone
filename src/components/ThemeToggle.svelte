<script lang="ts">
  import { onMount } from 'svelte';

  /**
   * Dark/light switch. The initial class is already on <html> (set by
   * /theme.js before paint), so this only has to stay in sync with it.
   */
  // Dark is the server-rendered default, so the sun icon is already correct for
  // most visitors; a light-mode visitor is corrected as soon as this hydrates.
  let isDark = $state(true);

  onMount(() => {
    isDark = document.documentElement.classList.contains('dark');
  });

  function toggle(): void {
    isDark = !isDark;
    document.documentElement.classList.toggle('dark', isDark);
    try {
      localStorage.setItem('tz-theme', isDark ? 'dark' : 'light');
    } catch {
      /* storage unavailable — the choice just will not persist */
    }
  }
</script>

<button
  type="button"
  onclick={toggle}
  class="border-line bg-surface text-muted hover:border-line-strong hover:text-fg inline-flex h-8 w-8 items-center justify-center rounded-md border transition-colors"
  aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
  title={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
>
  {#if isDark}
    <svg
      viewBox="0 0 24 24"
      class="h-4 w-4"
      fill="none"
      stroke="currentColor"
      stroke-width="1.7"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="4" />
      <path
        stroke-linecap="round"
        d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"
      />
    </svg>
  {:else}
    <svg
      viewBox="0 0 24 24"
      class="h-4 w-4"
      fill="none"
      stroke="currentColor"
      stroke-width="1.7"
      aria-hidden="true"
    >
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        d="M20 14.5A8.5 8.5 0 1 1 9.5 4a6.8 6.8 0 0 0 10.5 10.5Z"
      />
    </svg>
  {/if}
</button>
