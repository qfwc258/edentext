// harper.js never settles setup() when its worker dies; the singleton has to notice
// the worker's error itself, report it and put the toggle back off.
import { describe, it, expect, vi } from 'vitest';

const { worker, reported, stub } = vi.hoisted(() => ({
  worker: new EventTarget(),
  reported: [] as unknown[],
  stub: { hang: true, linted: [] as string[] },
}));
vi.mock('harper.js', () => ({
  WorkerLinter: class {
    worker = Object.assign(worker, { terminate: vi.fn() });
    setup = () => (stub.hang ? new Promise(() => {}) : Promise.resolve());
    setDialect = async () => {};
    lint = async (text: string) => (stub.linted.push(text), []);
  },
}));
vi.mock('harper.js/binary', () => ({ binary: {} }));
vi.mock('../../src/lib/utils/loadFailure', () => ({
  reportLoadFailure: (_what: string, err: unknown) => reported.push(err),
}));

const { setGrammarEnabled, grammarEnabled, grammarLoading, grammarReady, lintText } = await import('../../src/lib/spell/grammar.svelte');

describe('grammar engine load', () => {
  it('reports a worker that dies during setup and switches back off', async () => {
    setGrammarEnabled(true);
    expect(grammarLoading()).toBe(true);
    // The listener goes on once the dynamic import is in, so keep firing until it hears.
    await vi.waitFor(() => {
      worker.dispatchEvent(Object.assign(new Event('error'), { message: 'blocked by CSP' }));
      expect(grammarLoading()).toBe(false);
    });
    expect((reported[0] as Error).message).toBe('blocked by CSP');
    expect(grammarEnabled()).toBe(false);
    expect((worker as unknown as { terminate: () => void }).terminate).toHaveBeenCalled();
  });

  // Text pasted from a web editor can carry a no-break space between every word.
  it('hands Harper no-break spaces as plain ones', async () => {
    stub.hang = false;
    setGrammarEnabled(true);
    await vi.waitFor(() => expect(grammarReady()).toBe(true));
    await lintText('the\u00a0the\u202fend');
    expect(stub.linted).toEqual(['the the end']);
  });
});
