# Scriberr Frontend

This directory houses the Scriberr web client built with React, TypeScript, and Vite. The app ships as part of the Go binary bundle, but you can develop it independently with the commands below.

## Development

- `npm install` — install dependencies (run once or after updating `package.json`).
- `npm run dev` — start the Vite dev server on port 5173 with hot module reload.
- `npm run build` — emit the production bundle and type-check via project references.
- `npm run lint` — run ESLint using the shared repo configuration.
- `npm run test` — execute the Vitest suite in watchless mode (pass additional flags as needed).

The project uses the alias `@` for `src/` (configured in `vite.config.ts` and `tsconfig.*.json`). Co-locate shared utilities under `src/lib` or `src/utils`, and keep UI primitives under `src/components/ui`.

## Test Authoring Policy

Phase 0 of the refactor introduces a “tests alongside code” policy:

1. When you add or modify a component, hook, or utility, ensure there is a matching spec committed in the same directory tree (for example, `Component.test.tsx` or `__tests__/Component.test.tsx`).
2. Feature files should prefer React Testing Library with Vitest. Import `@testing-library/jest-dom/vitest` from `src/test/setup.ts` for extended matchers.
3. Prefer realistic user flows (render → interact → assert DOM) over implementation detail tests. For hooks, use `@testing-library/react`’s `renderHook`.
4. When touching existing code without tests, add baseline coverage before or as part of the change so regressions are caught.
5. Keep specs small and focused; share fixtures through helpers in `src/test/` if multiple suites need them.

Vitest is configured for jsdom with coverage reports (`npm run test -- --coverage`). CI pipelines should invoke the same command to ensure parity.

## Troubleshooting

- Clear Vite caches: delete `node_modules/.vite` and restart the dev server.
- TypeScript project references may cache aggressively; remove `node_modules/.tmp` if stale diagnostics appear.
- If you introduce new global setup needs, append them to `src/test/setup.ts` rather than individual specs to keep behavior consistent.
