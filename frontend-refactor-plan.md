# Frontend Refactor & TanStack Adoption Plan

This document outlines an incremental strategy to improve maintainability, performance, and developer experience in `web/frontend` while leaning on TanStack libraries instead of bespoke plumbing. Each phase is designed to be reviewable and self-contained.

---

## Phase 0 – Baseline & Tooling

- [x] Add Vitest + React Testing Library for component/unit coverage; wire into `npm run test`.
- [x] Establish a "tests alongside code" policy: every component or hook touched in later phases must land with matching specs.
- [x] Document current data-fetching surfaces and shared utilities (Auth context, router, toast) to clarify integration points.
- [ ] Enable Storybook or Ladle snapshot stories for high-complexity components (`ChatInterface`, `AudioFilesTable`) to aid regression testing during refactors. _(skipped for now)_
- [x] Audit crash resilience: identify routes/areas needing error isolation and draft fallback UX guidelines.

## Phase 1 – TanStack Query Foundation

- [x] Introduce `@tanstack/react-query` with a top-level `<QueryClientProvider>`; configure auth header injection via `fetch` wrapper.
- [ ] Replace imperative `fetch` blocks in `ChatInterface`, `AudioFilesTable`, and settings pages with query/mutation hooks. Focus on read paths first, keeping mutations shape-identical to current API contracts.
- [ ] Centralize API request utilities (`lib/api.ts`) using `fetchQuery` to remove duplicate error parsing and retries.
- [ ] Add suspense-friendly loading states leveraging `useQuery` status instead of bespoke `useState` flags.

## Phase 2 – Component Architecture

- [ ] Split `ChatInterface` into presentational children (`ChatMessageList`, `ChatComposer`, `SessionSidebar`). Co-locate query hooks in a `hooks/useChatSessions.ts` module built on TanStack Query, and cover them with Vitest/RTL tests (rendering, streaming edge cases).
- [ ] Extract toast/clipboard logic into utility hooks (`useCopyToClipboard`, `useMarkdownRenderer`) for reuse across chat/notes.
- [ ] Introduce a shared layout component for tables (`components/data-table/DataTable.tsx`) that composes TanStack Table v8 for column definitions, pagination, and empty state rendering; include interaction tests (sorting, pagination, empty state).
- [ ] Migrate `APIKeyTable` and `ProfilesTable` onto the shared table foundation with regression tests asserting actions (delete, open dialogs, callbacks).

## Phase 3 – State Management Simplification

- [ ] Reassess global contexts (Auth, Router, Theme, Chat Events). Where possible, replace derived state with TanStack Query selectors or local component state, adding focused tests for contexts or hooks that remain.
- [ ] Introduce TanStack Query cache hydration during SSR/build if the backend provides pre-fetched data (optional stretch goal).
- [ ] Narrow Auth context surface area: expose token/admin metadata; let queries depend on auth state rather than unlifting everything into context.

## Phase 4 – Performance & DX Enhancements

- [ ] Adopt `@tanstack/react-virtual` for long lists (chat history, audio job tables) to reduce render cost; add snapshot/interaction tests for virtualization boundaries.
- [ ] Use `useMutation` + optimistic updates for chat message sends and profile mutations; coordinate with server events via query invalidation.
- [ ] Integrate `QueryDevtools` in non-production builds for easier inspection.
- [ ] Add ESLint rules (`@tanstack/eslint-plugin-query`) to enforce best practices (cached keys, disabled fetch-in-effects, etc.).
- [ ] Introduce top-level and feature-specific error boundaries using `react-error-boundary` (or equivalent). Verify suspending routes render fallback UIs and add tests for boundary behavior.

## Phase 5 – Documentation & Rollout

- [ ] Update `frontend/README.md` with new architectural patterns, testing strategy, and query guidelines.
- [ ] Provide migration examples for developers (before/after fetch -> TanStack Query, component splitting checklists).
- [ ] Schedule targeted knowledge-sharing sessions or Loom walkthroughs covering the new data layer and component structure.
- [ ] Track testing progress (coverage thresholds, critical-path specs) and document expectations for future contributions.

---

### Success Metrics

- Reduced component size/complexity (track lines of code per major component and cyclomatic complexity where available).
- Consistent data-fetching patterns with observable cache benefits (hit rates, reduced duplicate HTTP calls).
- Improved test coverage on critical flows (chat interactions, audio management) backed by Vitest.
- Developer feedback indicating easier onboarding and faster iteration.
