<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { EditorView, basicSetup } from 'codemirror';
  import { EditorState } from '@codemirror/state';
  import { autocompletion } from '@codemirror/autocomplete';
  import { tags } from '@lezer/highlight';
  import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
  import { yamlSchema, yamlCompletion } from 'codemirror-json-schema/yaml';
  import {
    choiceAnswerCompletion,
    questionTypeCompletion,
    wrapSchemaCompletionWithOptionsList,
  } from '$lib/components/choice-answer-completion.js';

  export let value = '';
  export let onChange: (value: string) => void = () => {};
  export let schema: object = {};
  export let disabled = false;

  let container: HTMLDivElement;
  let view: EditorView | null = null;

  // Lighter syntax colors for dark background (avoid dark blue)
  const yamlHighlight = syntaxHighlighting(
    HighlightStyle.define([
      { tag: tags.propertyName, color: '#93c5fd' },
      { tag: tags.string, color: '#e2e8f0' },
      { tag: tags.number, color: '#86efac' },
      { tag: tags.bool, color: '#fbbf24' },
      { tag: tags.null, color: '#94a3b8' },
      { tag: tags.keyword, color: '#c4b5fd' },
      { tag: tags.atom, color: '#c4b5fd' },
      { tag: tags.meta, color: '#94a3b8' },
      { tag: tags.punctuation, color: '#94a3b8' },
      { tag: tags.name, color: '#93c5fd' },
    ])
  );

  const darkTheme = EditorView.theme(
    {
      '&': { color: '#e2e8f0' },
      '.cm6-json-schema-hover': {
        backgroundColor: '#1e293b',
        color: '#f1f5f9',
        padding: '8px 12px',
        borderRadius: '6px',
        fontSize: '13px',
        maxWidth: '360px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
      },
      '.cm6-json-schema-hover--description': {
        color: '#e2e8f0',
        marginBottom: '4px',
      },
      '.cm6-json-schema-hover--code': {
        color: '#93c5fd',
        fontFamily: 'monospace',
      },
    },
    { dark: true }
  );

  onMount(() => {
    const extensions = [
      basicSetup,
      autocompletion({
        aboveCursor: true,
        override: [
          choiceAnswerCompletion,
          questionTypeCompletion,
          wrapSchemaCompletionWithOptionsList(yamlCompletion()),
        ],
      }),
      yamlHighlight,
      darkTheme,
      yamlSchema(schema as object),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          const newValue = update.state.doc.toString();
          onChange(newValue);
        }
      }),
      EditorView.editable.of(!disabled),
    ];

    const state = EditorState.create({
      doc: value,
      extensions,
    });

    view = new EditorView({
      state,
      parent: container,
    });
  });

  onDestroy(() => {
    view?.destroy();
    view = null;
  });

  $: if (view && value !== view.state.doc.toString()) {
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: value },
    });
  }
</script>

<div
  bind:this={container}
  class="min-h-[300px] rounded-lg border border-pub-muted bg-pub-darker [&_.cm-editor]:bg-pub-darker [&_.cm-editor]:rounded-lg [&_.cm-scroller]:font-mono [&_.cm-content]:text-slate-200 [&_.cm-gutters]:bg-pub-dark [&_.cm-gutters]:border-pub-muted"
  role="textbox"
  aria-label="YAML editor"
></div>
