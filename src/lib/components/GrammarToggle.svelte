<script lang="ts">
  import type { Editor } from '@tiptap/core';
  import { codeForTag, hasGrammar, NO_LANGUAGE, type DocumentLanguage } from '../storage/documentLanguage';
  import { grammarEnabled, setGrammarEnabled, grammarLoading } from '../spell/grammar.svelte';
  import { t } from '../i18n/i18n.svelte';
  import { uniformLanguage } from '../utils/selectionFormat';

  let { value, editor = null, tick = -1 }: { value: DocumentLanguage; editor?: Editor | null; tick?: number } = $props();

  let language = $derived.by(() => {
    if (tick < 0 || !editor) return value;
    const tag = uniformLanguage(editor.state);
    if (tag === null) return value;
    return tag === '' ? NO_LANGUAGE : codeForTag(tag) ?? NO_LANGUAGE;
  });
  let available = $derived(hasGrammar(language));
</script>

<!-- Beside the control that decides whether it is available: pick German and it
     greys out, with the reason in its tooltip. -->
<label
  class="gr-toggle"
  class:off={!available}
  title={available ? t().grammar.hint : t().grammar.unavailable}
>
  <input
    type="checkbox"
    checked={available && grammarEnabled()}
    disabled={!available}
    onchange={(e) => setGrammarEnabled((e.currentTarget as HTMLInputElement).checked)}
  />
  <span>{grammarLoading() ? t().grammar.loadingLabel : t().grammar.label}</span>
</label>

<style>
  .gr-toggle {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    margin-left: 8px;
    color: var(--color-text);
    font-family: var(--font-sans);
    font-size: 0.75rem;
    white-space: nowrap;
    cursor: pointer;
  }

  .gr-toggle.off {
    opacity: 0.45;
    cursor: default;
  }

  .gr-toggle input {
    margin: 0;
    cursor: inherit;
  }
</style>
