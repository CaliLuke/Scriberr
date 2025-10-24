# Data Fetching Surfaces & Shared Utilities

This note captures where the current UI issues network requests and which cross-cutting utilities wrap those calls. Use it as a reference while migrating to TanStack Query or refactoring shared providers.

## Shared Providers

- **`AuthProvider` (`src/contexts/AuthContext.tsx`)**
  - Persists JWTs in `localStorage`, exposes `getAuthHeaders()` and auth state.
  - Wraps `window.fetch` once to retry 401s via `/api/v1/auth/refresh`; performs logout on repeat failures.
  - Polls for token expiry every minute and exposes `login` / `logout`.
- **`RouterProvider` (`src/contexts/RouterContext.tsx`)**
  - Implements a lightweight history API wrapper with routes: `home`, `audio-detail`, `settings`, `chat`.
  - Converts push/pop state events into route objects consumed by `App`.
- **`ToastProvider` (`src/components/ui/toast.tsx`)**
  - Simple in-memory toaster with `useToast().toast({ title, description })` helper.
- **`ChatEventsProvider` (`src/contexts/ChatEventsContext.tsx`)**
  - Pub/sub for chat session title updates and “title is generating” state, used by chat sidebar + interface.

When adding queries, prefer pulling auth headers from `useAuth().getAuthHeaders()` rather than duplicating logic. Query keys should include the route params emitted by `RouterContext`.

## API Surfaces by Feature

### Auth & Account

| Area | Component(s) | Endpoints | Notes |
| --- | --- | --- | --- |
| Login & registration | `pages/Login`, `pages/Register`, `contexts/AuthContext` | `/api/v1/auth/login`, `/api/v1/auth/register`, `/api/v1/auth/registration-status`, `/api/v1/auth/logout`, `/api/v1/auth/refresh` | Form-driven POSTs; `AuthProvider` manages refresh + logout redirects. |
| Account settings | `components/AccountSettings` | `/api/v1/auth/change-username`, `/api/v1/auth/change-password` | Uses toast notifications on success/error. |

### Global Configuration

| Area | Component(s) | Endpoints | Notes |
| --- | --- | --- | --- |
| LLM configuration | `components/LLMSettings`, `pages/Settings` | `/api/v1/llm/config` (GET/PUT) | Shared between the standalone settings card and summary dialogs. |
| User defaults & profiles | `components/ProfileSettings`, `components/QuickTranscriptionDialog`, `components/TranscribeDDialog` | `/api/v1/profiles`, `/api/v1/user/default-profile`, `/api/v1/user/settings` | Mix of list fetch + create/update requests; heavy candidate for query/mutation hooks. |
| API keys | `components/APIKeyTable`, `components/APIKeyCreateDialog`, `components/APIKeyDisplayDialog` | `/api/v1/api-keys/`, `/api/v1/api-keys/:id` | Table loads keys; dialogs issue POST/DELETE and display secrets. |
| Summary templates | `components/SummaryTemplatesTable`, `components/SummaryTemplateDialog`, `pages/Settings` | `/api/v1/summaries`, `/api/v1/summaries/:id` | CRUD flows + template selection, re-used inside audio detail summaries. |

### Transcription Management

| Area | Component(s) | Endpoints | Notes |
| --- | --- | --- | --- |
| Upload & job queue | `components/Homepage`, `components/AudioFilesTable`, `components/MergeStatusBadge` | `/api/v1/transcription/upload`, `/upload-video`, `/upload-multitrack`, `/list`, `/start`, `/kill`, `/merge-status`, `/track-progress`, `/admin/queue/stats` | Combination of polling (progress), action buttons, and uploads via `fetch` + `FormData`. |
| Quick jobs | `components/QuickTranscriptionDialog` | `/api/v1/transcription/quick`, `/quick/:id` | Polls until completion. |
| Audio detail view | `components/AudioDetailView` | `/api/v1/transcription/:id` (GET/DELETE), `/notes`, `/summary`, `/summaries`, `/execution`, `/title`, `/speakers`, `/llm/config`, `/summarize`, `/notes/:id` | Largest surface: loads metadata, transcript blobs, notes CRUD, Hugging Face/summary interactions. Multiple nested fetches and polling loops. |

### Chat

| Area | Component(s) | Endpoints | Notes |
| --- | --- | --- | --- |
| Chat page bootstrap | `pages/ChatPage` | `/api/v1/transcription/:id` | Prefetch audio metadata before rendering interface. |
| Session management | `components/ChatSessionsSidebar` | `/api/v1/chat/models`, `/chat/transcriptions/:id/sessions`, `/chat/sessions`, `/chat/sessions/:id`, `/chat/sessions/:id/title` | Lists sessions per transcription, renames titles, deletes sessions. |
| Chat interface | `components/ChatInterface` | `/api/v1/chat/sessions/:id`, `/chat/transcriptions/:id/sessions`, `/chat/models`, `/chat/sessions/:id/messages`, `/chat/sessions/:id/title/auto` | Handles message history, model selection, streaming message send. Emits toast errors on failure. |

### Miscellaneous

| Area | Component(s) | Endpoints | Notes |
| --- | --- | --- | --- |
| Speaker rename | `components/SpeakerRenameDialog` | `/api/v1/transcription/:id/speakers` | GET/PUT cycles for diarization metadata. |
| YouTube download | `components/YouTubeDownloadDialog` | `/api/v1/transcription/youtube` | Starts remote download and polls status. |
| Audio playback | `components/AudioDetailView` | direct file URLs (`/api/v1/transcription/:id/download`) | Uses `fetch` + blob conversion for audio playback. |

## Integration Notes

- **Auth headers:** Most calls manually spread `{ ...getAuthHeaders() }`. When introducing a shared fetch wrapper or query function, be sure to preserve header overrides (e.g., multipart requests add their own `Content-Type`).
- **Polling patterns:** Progress tracking, quick jobs, merge status, and chat title generation rely on manual intervals. TanStack Query’s `refetchInterval` can replace these once adapters exist.
- **Error handling:** Toasts are triggered ad hoc (`useToast().toast`) across components. Centralizing mutation errors via query `onError` callbacks should route through the same helper.
- **Routing dependencies:** Components derive IDs from `RouterContext` (e.g., audio detail route params). Query keys should include `audioId` or `sessionId` to avoid stale caches when navigating via History API.
- **Streaming & side effects:** Chat message send currently handles streaming manually inside the component. Migration will require custom mutations that append to cached message lists.

This inventory should keep the initial TanStack Query wiring focused on the highest-impact surfaces—`AudioFilesTable`, `ChatInterface`, `Settings`—while ensuring shared providers remain a single source of truth.
