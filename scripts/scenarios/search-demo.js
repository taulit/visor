// Demo modules for the search scenarios and tests. Test data, not shipped:
// evaluated in the sandboxed shell through shell_eval, which has `visor` in scope.
/* global visor */
globalThis.visorSearchDemoRegister = () => {
  const demo = (globalThis.visorSearchDemo = {
    log: [],
    // Queries the notes source was asked for, in order.
    queries: [],
    // While true the notes source answers only when the test calls answer(index).
    hold: false,
    pending: [],
    // The cancellable of every call of the notes source.
    cancellables: [],
    answer(index) {
      demo.pending[index]();
    },
    // Resolves the promise of the 'later' command.
    later: null,
  });
  const note = what => () => demo.log.push(what);
  const base = { slot: 'now', enable() {}, disable() {} };
  const notes = ['Shopping list', 'Shop opening hours', 'Visor ideas', 'Workshop notes'];

  visor.api.register({
    ...base,
    id: 'demo-timers',
    name: 'Timers',
    icon: 'alarm-symbolic',
    commands: [
      {
        keyword: ['timer', 'wecker'],
        hint: 'timer 25m Pizza',
        resolve(args) {
          const match = /^(\d+)m(?:\s+(.*))?$/.exec(args.trim());
          if (!match) return [];
          const label = match[2] ? ` · ${match[2]}` : '';
          return [
            {
              id: 'start',
              title: `Start a timer: ${match[1]} min${label}`,
              subtitle: 'Runs as a live activity in the notch',
              icon: 'alarm-symbolic',
              hint: 'Enter starts',
              activate: note(`timer:${match[1]}:${match[2] ?? ''}`),
              alternate: note('timer:alternate'),
            },
          ];
        },
      },
      {
        keyword: ['later'],
        hint: 'later Call the dentist',
        resolve: args =>
          new Promise(resolve => {
            demo.later = () =>
              resolve(
                args
                  ? [{ id: 'later', title: `Later: ${args}`, activate: note(`later:${args}`) }]
                  : [],
              );
          }),
      },
    ],
  });

  visor.api.register({
    ...base,
    id: 'demo-notes',
    name: 'Notes',
    icon: 'accessories-text-editor-symbolic',
    search: {
      id: 'notes',
      title: 'Notes',
      search(query, cancellable) {
        demo.queries.push(query);
        demo.cancellables.push(cancellable);
        const results = notes
          .filter(title => title.toLowerCase().includes(query.toLowerCase()))
          .map(title => ({
            id: title,
            title,
            subtitle: 'Note',
            activate: note(`note:${title}`),
            alternate: note(`note-in-app:${title}`),
          }));
        if (!demo.hold) return Promise.resolve(results);
        return new Promise(resolve => demo.pending.push(() => resolve(results)));
      },
    },
  });
  return true;
};
