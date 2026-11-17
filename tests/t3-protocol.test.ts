import { describe, expect, it } from 'vitest';
import {
  DONE_MS,
  PROTOCOL_VERSION,
  ackFrame,
  applyShellItem,
  MAX_COMMAND,
  PREVIEW_CHARS,
  approvalPrompt,
  cleanBlock,
  fitsPreview,
  promptPreview,
  backoffSeconds,
  clean,
  cleanOrigin,
  decodeDescriptor,
  decodeFrames,
  decodeRuntimeState,
  decodeTicket,
  emptyShell,
  isCompatible,
  isWaiting,
  lastActive,
  launchPayload,
  replyCommand,
  requestFrame,
  respondCommand,
  sessionsOf,
  socketUrl,
  stopCommand,
  subscribeShellPayload,
  threadLink,
  visibleSessions,
  type ShellState,
} from '../src/modules/t3/protocol.js';
// @ts-expect-error -- plain JavaScript shared with the mock server
import * as fixtures from './t3-mock/fixtures.js';

const NOW = Date.parse('2026-11-17T12:00:00.000Z');

function shell(name = 'default'): ShellState {
  const state = emptyShell();
  applyShellItem(state, fixtures.snapshotItem(fixtures.FIXTURES[name](NOW).threads));
  return state;
}

describe('finding the server', () => {
  it('reads the origin of the runtime state', () => {
    const text = '{"version":1,"pid":1,"port":3773,"origin":"http://127.0.0.1:3773"}\n';
    expect(decodeRuntimeState(text)).toBe('http://127.0.0.1:3773');
  });

  it('refuses what is not a plain http address', () => {
    expect(decodeRuntimeState('')).toBeNull();
    expect(decodeRuntimeState('[]')).toBeNull();
    expect(decodeRuntimeState('{"origin":"file:///etc/passwd"}')).toBeNull();
    expect(cleanOrigin('http://127.0.0.1:3773/')).toBe('http://127.0.0.1:3773');
    expect(cleanOrigin('https://t3.example.org')).toBe('https://t3.example.org');
    expect(cleanOrigin('http://[::1]:3773')).toBe('http://[::1]:3773');
    expect(cleanOrigin('http://user:secret@host')).toBeNull();
    expect(cleanOrigin('http://host/path?x=1')).toBeNull();
    expect(cleanOrigin(42)).toBeNull();
  });

  it('builds the addresses', () => {
    expect(socketUrl('http://127.0.0.1:3773', 'a b&c')).toBe(
      'ws://127.0.0.1:3773/ws?orchestrationProtocol=2&wsTicket=a%20b%26c',
    );
    expect(socketUrl('https://host', 't')).toMatch(/^wss:\/\/host\/ws\?/);
    expect(threadLink('http://h:1', 'env/1', 'thread 1')).toBe(
      'http://h:1/threads/env%2F1/thread%201',
    );
  });
});

describe('the version', () => {
  it('accepts the protocol it was written for', () => {
    const descriptor = decodeDescriptor(JSON.stringify(fixtures.descriptor()))!;
    expect(descriptor.environmentId).toBe(fixtures.ENVIRONMENT_ID);
    expect(descriptor.version).toBe(PROTOCOL_VERSION);
    expect(isCompatible(descriptor)).toBe(true);
    expect(subscribeShellPayload(descriptor)).toEqual({
      omitIdleSubagents: true,
      omitOlderSettled: true,
    });
  });

  it('refuses another protocol and a server that names none', () => {
    expect(isCompatible(decodeDescriptor(JSON.stringify(fixtures.descriptor(3)))!)).toBe(false);
    const old = decodeDescriptor('{"environmentId":"e","capabilities":{}}')!;
    expect(old.version).toBeNull();
    expect(isCompatible(old)).toBe(false);
    expect(subscribeShellPayload(old)).toEqual({});
  });

  it('refuses a descriptor that is none', () => {
    expect(decodeDescriptor('<html>')).toBeNull();
    expect(decodeDescriptor('null')).toBeNull();
    expect(decodeDescriptor('{"orchestrationProtocolVersion":2}')).toBeNull();
  });

  it('reads a ticket', () => {
    expect(decodeTicket('{"ticket":"abc","expiresAt":"2026-11-17T12:00:00Z"}')).toBe('abc');
    expect(decodeTicket('{"ticket":7}')).toBeNull();
    expect(decodeTicket('nope')).toBeNull();
  });
});

describe('frames', () => {
  it('decodes one frame and a list of frames', () => {
    expect(
      decodeFrames('{"_tag":"Chunk","requestId":"1","values":[{"kind":"synchronized"}]}'),
    ).toEqual([{ tag: 'chunk', requestId: '1', values: [{ kind: 'synchronized' }] }]);
    const list =
      '[{"_tag":"Pong"},{"_tag":"Exit","requestId":2,"exit":{"_tag":"Success","value":{"sequence":4}}}]';
    expect(decodeFrames(list)).toEqual([
      { tag: 'pong' },
      { tag: 'exit', requestId: '2', ok: true, value: { sequence: 4 } },
    ]);
  });

  it('names the reason of a failure', () => {
    const exit = (cause: unknown) =>
      decodeFrames(
        JSON.stringify({ _tag: 'Exit', requestId: '3', exit: { _tag: 'Failure', cause } }),
      );
    expect(exit([{ _tag: 'Fail', error: { _tag: 'X', message: 'No such\nthread' } }])).toEqual([
      { tag: 'exit', requestId: '3', ok: false, error: 'No such thread' },
    ]);
    expect(exit([{ _tag: 'Fail', error: { _tag: 'ScopeError' } }])[0]).toMatchObject({
      error: 'ScopeError',
    });
    expect(exit([{ _tag: 'Die', defect: 'boom' }])[0]).toMatchObject({ error: 'boom' });
    expect(exit([{ _tag: 'Interrupt', fiberId: null }])[0]).toMatchObject({ error: 'failed' });
    expect(exit('nonsense')[0]).toMatchObject({ ok: false, error: 'failed' });
  });

  it('drops what it does not know', () => {
    expect(decodeFrames('not json')).toEqual([]);
    expect(decodeFrames('42')).toEqual([]);
    expect(
      decodeFrames('[null,{"_tag":"Chunk"},{"_tag":"Exit","requestId":"1"},{"_tag":"Request"}]'),
    ).toEqual([]);
    expect(decodeFrames('{"_tag":"Defect","defect":"x"}')).toEqual([{ tag: 'defect' }]);
  });

  it('encodes requests and acks', () => {
    expect(JSON.parse(requestFrame('7', 'orchestration.subscribeShell', {}))).toEqual({
      _tag: 'Request',
      id: '7',
      tag: 'orchestration.subscribeShell',
      payload: {},
      headers: [],
    });
    expect(JSON.parse(ackFrame('7'))).toEqual({ _tag: 'Ack', requestId: '7' });
  });
});

describe('sessions', () => {
  it('lists waiting first, then running, then what just finished', () => {
    const sessions = sessionsOf(shell(), NOW);
    expect(sessions.map(s => [s.id, s.phase])).toEqual([
      ['thread-wait', 'approval'],
      ['thread-run', 'working'],
      ['thread-done', 'done'],
      ['thread-error', 'error'],
    ]);
    expect(sessions.map(s => s.project)).toEqual(['visor', 'visor', 'visor', 'visor']);
    expect(isWaiting(sessions[0]!)).toBe(true);
    expect(isWaiting(sessions[1]!)).toBe(false);
  });

  it('lets the request of a subagent make its parent wait', () => {
    const [waiting] = sessionsOf(shell(), NOW);
    expect(waiting!.title).toBe('Spawn a subagent for the fixture');
    expect(waiting!.request).toEqual({
      id: 'request-1',
      kind: 'command',
      threadId: 'thread-wait-child',
    });
    expect(waiting!.lastMessage).toBe(
      'I asked a subagent to write the fixture file. It needs your approval to run the command.',
    );
  });

  it('knows when the run began and what failed', () => {
    const sessions = sessionsOf(shell(), NOW);
    expect(sessions[1]!.startedAt).toBe(NOW - 256_000);
    expect(sessions[3]!.error).toBe('The provider process exited with code 1.');
    expect(sessions[1]!.error).toBe('');
  });

  it('drops a finished session after two minutes', () => {
    const state = shell();
    const done = sessionsOf(state, NOW).find(s => s.id === 'thread-done')!;
    expect(done.until).toBe(NOW - 20_000 + DONE_MS);
    expect(sessionsOf(state, done.until! - 1).some(s => s.id === 'thread-done')).toBe(true);
    expect(sessionsOf(state, done.until!).some(s => s.id === 'thread-done')).toBe(false);
  });

  it('follows the stream', () => {
    const state = shell();
    const update = (thread: unknown, location = 'active') =>
      applyShellItem(state, { kind: 'thread.updated', sequence: 2, location, thread });
    const ids = () => sessionsOf(state, NOW).map(s => s.id);

    // The approval is answered: the parent runs again.
    update(
      fixtures.running('thread-wait-child', NOW, {
        lineage: {
          parentThreadId: 'thread-wait',
          relationshipToParent: 'subagent',
          rootThreadId: 'thread-wait',
        },
      }),
    );
    expect(sessionsOf(state, NOW)[0]).toMatchObject({ phase: 'working', request: null });

    // A question, a stop, an archived thread, a removed one.
    update(
      fixtures.running('thread-run', NOW, {
        pendingRuntimeRequest: fixtures.pendingRequest('request-2', NOW, 'user_input'),
      }),
    );
    expect(sessionsOf(state, NOW)[0]).toMatchObject({ id: 'thread-run', phase: 'question' });
    update(
      fixtures.completed('thread-run', NOW, {
        status: 'interrupted',
        latestRunStopRequested: true,
      }),
    );
    expect(ids()).not.toContain('thread-run');
    update(fixtures.completed('thread-done', NOW), 'archive');
    expect(ids()).not.toContain('thread-done');
    expect(applyShellItem(state, { kind: 'thread.removed', threadId: 'thread-error' })).toBe(true);
    expect(ids()).toEqual(['thread-wait']);

    applyShellItem(state, {
      kind: 'project.updated',
      project: fixtures.project({ title: 'renamed' }),
    });
    expect(sessionsOf(state, NOW)[0]!.project).toBe('renamed');
    expect(applyShellItem(state, { kind: 'synchronized' })).toBe(false);
  });

  it('does not show a settled thread, an auth refresh or a side chat', () => {
    const state = emptyShell();
    applyShellItem(
      state,
      fixtures.snapshotItem([
        fixtures.completed('settled', NOW, { settledOverride: 'settled' }),
        fixtures.running('refresh', NOW, {
          status: 'idle',
          activityRunStatus: null,
          pendingRuntimeRequest: fixtures.pendingRequest('r', NOW, 'auth_refresh'),
        }),
        fixtures.running('side', NOW, {
          lineage: {
            parentThreadId: null,
            relationshipToParent: null,
            rootThreadId: 'side',
            sideChat: true,
          },
        }),
        fixtures.waitingSubagent('orphan', 'missing', NOW),
      ]),
    );
    expect(sessionsOf(state, NOW)).toEqual([]);
  });

  it('survives input that is not what the contract says', () => {
    const state = emptyShell();
    expect(applyShellItem(state, null)).toBe(false);
    expect(applyShellItem(state, { kind: 'thread.updated', thread: 'x' })).toBe(false);
    expect(applyShellItem(state, { kind: 'thread.updated', thread: { id: 7 } })).toBe(false);
    applyShellItem(state, {
      kind: 'snapshot',
      snapshot: { threads: 'many', projects: [null, { id: '' }] },
    });
    applyShellItem(state, {
      kind: 'snapshot',
      snapshot: {
        projects: [{ id: 'p', title: `<b>bold</b> ${'x'.repeat(500)}` }],
        threads: [
          null,
          { id: 'a'.repeat(500), status: 'running' },
          {
            id: 't',
            projectId: 'p',
            title: `<span foreground="red">${'long '.repeat(100)}</span>\u0007\nnext`,
            status: 'running',
            lineage: 'none',
            updatedAt: 'yesterday',
            activityRunStartedAt: {},
            pendingRuntimeRequest: { id: 'r', kind: 'unheard-of' },
            latestVisibleMessage: { role: 'assistant', text: 'a'.repeat(5000) },
            modelSelection: 'gpt',
          },
        ],
      },
    });
    const sessions = sessionsOf(state, NOW);
    expect(sessions).toHaveLength(1);
    const [session] = sessions;
    expect(session!.title).toHaveLength(80);
    expect(session!.title.startsWith('<span foreground="red">long long')).toBe(true);
    expect(session!.project).toHaveLength(40);
    expect(session!.lastMessage).toHaveLength(600);
    expect(session).toMatchObject({
      phase: 'working',
      request: null,
      startedAt: null,
      launch: null,
    });
  });

  it('cuts text to one line', () => {
    expect(clean('  a\n\tb\u0000c  ', 10)).toBe('a b c');
    expect(clean('abcdef', 4)).toBe('abc…');
    expect(clean(12, 4)).toBe('');
  });
});

describe('rows', () => {
  it('shows three and counts the rest', () => {
    const sessions = sessionsOf(shell(), NOW);
    expect(visibleSessions(sessions, false).shown.map(s => s.id)).toEqual([
      'thread-wait',
      'thread-run',
      'thread-done',
    ]);
    expect(visibleSessions(sessions, false).more).toBe(1);
    expect(visibleSessions(sessions, true)).toEqual({ shown: sessions, more: 0 });
    expect(visibleSessions(sessions.slice(0, 3), false).more).toBe(0);
  });
});

describe('commands', () => {
  const descriptor = decodeDescriptor(JSON.stringify(fixtures.descriptor()))!;

  it('answers an approval on the thread that asked', () => {
    expect(respondCommand('c', 'thread-wait-child', 'request-1', 'accept')).toEqual({
      type: 'runtime-request.respond',
      commandId: 'c',
      threadId: 'thread-wait-child',
      requestId: 'request-1',
      decision: 'accept',
    });
  });

  it('sends a reply', () => {
    expect(replyCommand('c', 'm', 't', 'Go on')).toEqual({
      type: 'message.dispatch',
      commandId: 'c',
      createdBy: 'user',
      creationSource: 'web',
      threadId: 't',
      messageId: 'm',
      text: 'Go on',
      attachments: [],
      deliveryIntent: 'auto',
      dispatchMode: { type: 'start_immediately' },
    });
  });

  it('stops a thread, or its run on an older server', () => {
    const session = sessionsOf(shell(), NOW)[1]!;
    expect(stopCommand('c', session, descriptor)).toEqual({
      type: 'thread.stop',
      commandId: 'c',
      threadId: 'thread-run',
    });
    expect(stopCommand('c', session, { threadStop: false })).toEqual({
      type: 'run.interrupt',
      commandId: 'c',
      threadId: 'thread-run',
      runId: 'run-thread-run',
    });
    expect(stopCommand('c', { id: 't', runId: null }, { threadStop: false })).toBeNull();
  });

  it('starts a thread like the last active one', () => {
    const like = lastActive(shell())!;
    expect(like.id).toBe('thread-run');
    const payload = launchPayload(
      { commandId: 'c', threadId: 'n', messageId: 'm' },
      like,
      'Write the docs',
    );
    expect(payload).toMatchObject({
      commandId: 'c',
      threadId: 'n',
      projectId: fixtures.PROJECT_ID,
      title: 'Write the docs',
      modelSelection: { instanceId: 'codex', model: 'gpt-5.5' },
      runtimeMode: 'approval-required',
      interactionMode: 'default',
      workspaceStrategy: { type: 'root' },
      initialMessage: { messageId: 'm', text: 'Write the docs', attachments: [] },
    });
    expect(lastActive(emptyShell())).toBeNull();
  });

  it('finds what an approval asks', () => {
    const projection = { turnItems: [{ type: 'message' }, fixtures.approvalItem('request-1')] };
    expect(approvalPrompt(projection, 'request-1')).toBe(fixtures.APPROVAL_COMMAND);
    expect(approvalPrompt(projection, 'request-2')).toBe('');
    expect(approvalPrompt({ turnItems: 'none' }, 'request-1')).toBe('');
    expect(approvalPrompt(null, 'request-1')).toBe('');
  });

  it('keeps a long command whole, with its lines', () => {
    const long = `git commit -m "${'x'.repeat(500)}"\r\n  && git push\torigin\u0007 main  \n`;
    const projection = { turnItems: [fixtures.approvalItem('request-1', long)] };
    const prompt = approvalPrompt(projection, 'request-1');
    expect(prompt).toBe(`git commit -m "${'x'.repeat(500)}"\n  && git push  origin  main`);
    expect(promptPreview(prompt)).toHaveLength(200);
    expect(promptPreview(prompt).endsWith('…')).toBe(true);
    expect(promptPreview('a\nb')).toBe('a b');
  });

  it('cuts a command only at its limit', () => {
    expect(cleanBlock('y'.repeat(MAX_COMMAND), MAX_COMMAND)).toHaveLength(MAX_COMMAND);
    const cut = cleanBlock('y'.repeat(MAX_COMMAND + 1), MAX_COMMAND);
    expect(cut).toHaveLength(MAX_COMMAND);
    expect(cut.endsWith('…')).toBe(true);
    expect(cleanBlock(7, 10)).toBe('');
  });

  it('knows when the one-line preview shows a command whole', () => {
    expect(fitsPreview('rm -rf build')).toBe(true);
    expect(fitsPreview('x'.repeat(PREVIEW_CHARS))).toBe(true);
    expect(fitsPreview('x'.repeat(PREVIEW_CHARS + 1))).toBe(false);
    expect(fitsPreview('ls\nrm -rf ~')).toBe(false);
    expect(fitsPreview(fixtures.APPROVAL_COMMAND)).toBe(false);
  });
});

describe('reconnect', () => {
  it('waits 1 s, 2 s, 4 s and at most 60 s', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7, 40].map(backoffSeconds)).toEqual([
      1, 2, 4, 8, 16, 32, 60, 60, 60,
    ]);
  });
});
