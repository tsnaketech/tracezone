<script lang="ts">
  /**
   * Copies either a literal string or the text of an element already rendered
   * on the page. Reading from the DOM keeps large payloads (the raw JSON and
   * TOON views) out of the island's serialised props.
   */
  interface Props {
    text?: string;
    targetId?: string;
    label?: string;
    class?: string;
  }

  const { text, targetId, label = 'Copy', class: className = '' }: Props = $props();

  let state = $state<'idle' | 'copied' | 'failed'>('idle');
  let timer: ReturnType<typeof setTimeout> | undefined;

  function resolveText(): string {
    if (typeof text === 'string') return text;
    if (targetId === undefined) return '';
    return document.getElementById(targetId)?.textContent ?? '';
  }

  async function copy(): Promise<void> {
    const value = resolveText();
    if (value === '') return;

    try {
      await navigator.clipboard.writeText(value);
      state = 'copied';
    } catch {
      state = 'failed';
    }

    clearTimeout(timer);
    timer = setTimeout(() => {
      state = 'idle';
    }, 1600);
  }
</script>

<button
  type="button"
  onclick={copy}
  class={`border-line bg-surface text-muted hover:border-line-strong hover:text-fg inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs transition-colors ${className}`}
  aria-live="polite"
>
  {#if state === 'copied'}
    <svg
      viewBox="0 0 24 24"
      class="text-success h-3.5 w-3.5"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      aria-hidden="true"
    >
      <path stroke-linecap="round" stroke-linejoin="round" d="m5 13 4 4L19 7" />
    </svg>
    Copied
  {:else if state === 'failed'}
    <span class="text-danger">Copy failed</span>
  {:else}
    <svg
      viewBox="0 0 24 24"
      class="h-3.5 w-3.5"
      fill="none"
      stroke="currentColor"
      stroke-width="1.7"
      aria-hidden="true"
    >
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15V5a2 2 0 0 1 2-2h10" stroke-linecap="round" />
    </svg>
    {label}
  {/if}
</button>
