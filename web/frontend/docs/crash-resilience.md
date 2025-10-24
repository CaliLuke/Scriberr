# Crash Resilience Audit

Phase 0 calls for identifying fragile areas of the UI and defining how we want the product to behave when data fetching fails or unexpected component errors occur. Below is the current state and recommended fallbacks.

## Entry Points & Global Concerns

- **`App.tsx`** renders lazy-loaded routes via `Suspense` but has no error boundary. Any runtime exception inside a page will bubble up to the nearest provider and blank the app.
- **`RouterContext`** mutates history without guards. If parsing fails it defaults to the home route, which is acceptable but worth re-validating when adding deep links.
- **`ToastProvider`** is always present; use it for non-blocking error notifications.
- **Auth bootstrap**: failures during `/api/v1/auth/registration-status` fall back to best-effort token reuse. Subsequent component renders must still handle `getAuthHeaders()` returning an empty object.

## High-Risk Views

| Route | Component(s) | Observed Risks | Proposed Fallback |
| --- | --- | --- | --- |
| `/` (home/upload) | `Homepage`, `AudioFilesTable` modals | Upload workflows and job polling assume fetch success; failures surface via `alert()` or bare `console.error`. | Wrap upload area in an error boundary that renders a friendly retry panel. Surface mutation failures with toast + inline status row (“Job failed to start, try again”). |
| `/audio/:id` | `AudioDetailView` | Large component with multiple chained fetches and streaming transforms. Exceptions often throw inside `useEffect` and break the entire view. | Introduce an error boundary around the main detail content; fallback should offer “Reload transcript” and link back home. Consider splitting fetches into query hooks to isolate failure states (notes, summary, audio download). |
| `/audio/:id/chat` | `ChatPage`, `ChatInterface`, `ChatSessionsSidebar` | Manual streaming mutation throws and `throw new Error` in message loaders cause hard crashes that eject users from chat. | Wrap chat area (composer + sidebar) with boundary showing “Chat failed to load. Retry” and preserving session selection. Suspense-friendly loaders should reflect `isFetching` instead of manual `useState`. |
| `/settings` | `Settings` + subcomponents (profiles, summaries) | Each tab uses imperative fetches. Network errors toggle local `state` inconsistently, leaving blank screens. | Provide per-tab fault tolerance: show inline `Callout` with retry button if profile list or templates fail. Wrap the full page in an error boundary so that failures in a single tab do not blank the layout. |
| Auth routes | `Login`, `Register` | Already guard errors with inline messages but still rely on direct `alert()` inside catch blocks. | Standardize on toast + inline message; ensure form components disable submit during retries. |

## Draft UX Guidelines

1. **Per-page error boundaries**  
   - Add lightweight boundaries for `Homepage`, `AudioDetailView`, `ChatPage`, and `Settings`.  
   - Fallback UIs should: display a short explanation, include a “Retry” button (calls `queryClient.invalidateQueries()` or window reload), and offer navigation back to the dashboard when possible.

2. **Granular query errors**  
   - When adopting TanStack Query, partition data dependencies so one failing request does not blank the whole screen. For example, wrap “Notes” and “Summary” panels in separate queries with their own error placeholders.

3. **User feedback hierarchy**  
   - Use inline callouts for blocking errors (e.g., table rows, summary template list).  
   - Reserve toasts for non-blocking operations or background retries (“Unable to refresh queue stats”).  
   - Avoid browser alerts—they interrupt flows and lack styling.

4. **Polling & background tasks**  
   - Replace manual `setInterval` loops with query polling so failures respect retry/backoff policies.
   - Provide explicit status tags (e.g., “Offline”, “Retrying…”) near tables that depend on polling.

5. **Accessibility considerations**  
   - Fallback content should include focusable retry controls and use standard landmarks for screen readers (`role="alert"` for critical messages).

This audit should guide upcoming TanStack Query work: introduce error boundaries before migrating fetches so the UX is resilient, then map query errors to the documented fallbacks.
