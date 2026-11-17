# Visor

Dynamic Island & Notch for GNOME

> Work in progress. This README will be expanded.

## Development

Requires Node 24, pnpm, `glib-compile-schemas` (libglib2.0-bin), gettext and zip.

```sh
pnpm install
```

| Script           | Purpose                                                            |
| ---------------- | ------------------------------------------------------------------ |
| `pnpm build`     | Compile TypeScript and assemble an installable `build/` dir        |
| `pnpm pack:zip`  | Build and create `dist/visor@taulit.github.io.shell-extension.zip` |
| `pnpm typecheck` | Type-check with `tsc --noEmit`                                     |
| `pnpm lint`      | Run ESLint and `prettier --check`                                  |
| `pnpm format`    | Format with Prettier                                               |
| `pnpm test`      | Run the Vitest unit tests                                          |
| `pnpm pot`       | Regenerate `po/visor.pot` and merge into `po/*.po`                 |

## License

GPL-2.0-or-later
