<script lang="ts">
  import { onMount } from 'svelte';
  import { EXAMPLE_DOMAINS } from '@/lib/config';
  import { validateDomain } from '@/lib/validation/domain';

  /**
   * How long to keep the form locked after starting a navigation.
   *
   * A lookup is a full page navigation, so in the normal case the next document
   * replaces this component long before this fires. It only matters when the
   * navigation never lands — the user pressed Escape, went offline, or the
   * registry is slow — and exists so the form can never stay locked forever.
   */
  const NAVIGATION_WATCHDOG_MS = 15_000;

  /**
   * The lookup entry point. Validation runs with the exact same module the API
   * uses, so an input rejected here would have been rejected server-side too —
   * and a submitted lookup always lands on a shareable `/domain/<name>` URL.
   */
  interface Props {
    initialValue?: string;
    showExamples?: boolean;
    autofocus?: boolean;
    size?: 'lg' | 'sm';
  }

  const {
    initialValue = '',
    showExamples = false,
    autofocus = false,
    size = 'lg',
  }: Props = $props();

  const sizeClasses = $derived(
    size === 'lg'
      ? { input: 'px-4 py-3 text-base', button: 'px-6 py-3 text-base' }
      : { input: 'px-3 py-2 text-sm', button: 'px-4 py-2 text-sm' },
  );

  let value = $state(initialValue);
  let error = $state<string | null>(null);
  let submitting = $state(false);

  const normalized = $derived.by(() => {
    if (value.trim() === '') return null;
    const result = validateDomain(value);
    return result.ok && result.normalized && result.domain !== value.trim().toLowerCase()
      ? result.domain
      : null;
  });

  let watchdog: ReturnType<typeof setTimeout> | undefined;

  function unlock(): void {
    clearTimeout(watchdog);
    submitting = false;
  }

  onMount(() => {
    /**
     * Recover the form whenever this page is shown again.
     *
     * `submitting` is normally discarded along with the whole component when the
     * lookup navigates away. It is *not* discarded when the browser restores the
     * page from the back/forward cache: the component comes back holding the
     * state it had when the user left, so the button would stay on "Looking up…"
     * and every later submit would hit the `if (submitting) return` guard —
     * leaving the search box permanently dead after the first lookup.
     *
     * `pageshow` fires both on a normal load and on a bfcache restore, so
     * resetting here covers both without needing to inspect `event.persisted`.
     */
    window.addEventListener('pageshow', unlock);
    return () => {
      clearTimeout(watchdog);
      window.removeEventListener('pageshow', unlock);
    };
  });

  function submit(event?: Event): void {
    event?.preventDefault();
    if (submitting) return;

    const result = validateDomain(value);
    if (!result.ok) {
      error = result.message;
      return;
    }

    error = null;
    submitting = true;
    clearTimeout(watchdog);
    watchdog = setTimeout(unlock, NAVIGATION_WATCHDOG_MS);
    window.location.assign(`/domain/${encodeURIComponent(result.domain)}`);
  }

  function useExample(domain: string): void {
    value = domain;
    submit();
  }

  function onInput(): void {
    if (error !== null) error = null;
  }
</script>

<form class="w-full" onsubmit={submit} novalidate>
  <div
    class="sm:border-line sm:bg-surface sm:focus-within:border-accent/60 sm:focus-within:ring-accent/25 flex flex-col gap-2 sm:flex-row sm:items-stretch sm:gap-0 sm:rounded-lg sm:border sm:focus-within:ring-2"
  >
    <label class="sr-only" for="tz-domain">Domain name</label>
    <input
      id="tz-domain"
      name="domain"
      type="text"
      inputmode="url"
      autocomplete="off"
      autocapitalize="off"
      autocorrect="off"
      spellcheck="false"
      placeholder="example.com"
      bind:value
      oninput={onInput}
      {autofocus}
      aria-invalid={error !== null}
      aria-describedby={error !== null ? 'tz-domain-error' : undefined}
      class="tz-mono border-line bg-surface text-fg placeholder:text-subtle w-full min-w-0 rounded-lg border focus:outline-none sm:rounded-none sm:rounded-l-lg sm:border-0 sm:bg-transparent {sizeClasses.input}"
    />
    <button
      type="submit"
      disabled={submitting}
      class="bg-accent text-on-accent shrink-0 rounded-lg font-medium transition-opacity hover:opacity-90 disabled:opacity-60 sm:rounded-none sm:rounded-r-lg {sizeClasses.button}"
    >
      {submitting ? 'Looking up…' : 'Lookup'}
    </button>
  </div>

  {#if error !== null}
    <p id="tz-domain-error" class="text-danger mt-2 text-sm" role="alert">{error}</p>
  {:else if normalized !== null}
    <p class="text-subtle mt-2 text-sm">
      Will look up <span class="tz-mono text-muted">{normalized}</span>
    </p>
  {/if}

  {#if showExamples}
    <div class="text-subtle mt-4 flex flex-wrap items-center gap-2 text-sm">
      <span>Try:</span>
      {#each EXAMPLE_DOMAINS as domain (domain)}
        <button
          type="button"
          onclick={() => useExample(domain)}
          class="tz-mono border-line bg-surface text-muted hover:border-accent/50 hover:text-accent rounded-md border px-2 py-1 text-xs transition-colors"
        >
          {domain}
        </button>
      {/each}
    </div>
  {/if}
</form>
