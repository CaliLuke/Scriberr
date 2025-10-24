import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SummaryTemplatesTable } from "../SummaryTemplatesTable";

const toastSpy = vi.fn();

vi.mock("@/components/ui/toast", () => ({
  useToast: () => ({
    toast: toastSpy,
  }),
}));

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

describe("SummaryTemplatesTable", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    toastSpy.mockReset();
    vi.clearAllMocks();
  });

  it("renders fetched templates", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (typeof input === "string" && input.endsWith("/api/v1/summaries") && (!init || !init.method || init.method === "GET")) {
        return new Response(JSON.stringify([
          { id: "1", name: "Default Summary", description: "My prompt", model: "gpt-4" },
        ]), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(null, { status: 404 });
    }) as typeof fetch;

    global.fetch = fetchMock;

    render(<SummaryTemplatesTable onEdit={vi.fn()} />, { wrapper: createWrapper() });

    expect(await screen.findByText(/Default Summary/i)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("deletes a template and shows toast", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (typeof input === "string" && input.endsWith("/api/v1/summaries")) {
        if (!init || !init.method || init.method === "GET") {
          return new Response(JSON.stringify([
            { id: "1", name: "Default Summary", description: "My prompt", model: "gpt-4" },
          ]), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
      }

      if (typeof input === "string" && input.endsWith("/api/v1/summaries/1") && init?.method === "DELETE") {
        return new Response(null, { status: 204 });
      }

      return new Response(null, { status: 404 });
    }) as typeof fetch;

    global.fetch = fetchMock;

    render(<SummaryTemplatesTable onEdit={vi.fn()} />, { wrapper: createWrapper() });

    await screen.findByText(/Default Summary/i);

    await userEvent.click(screen.getByRole("button", { name: /⋮/ }));
    await userEvent.click(await screen.findByRole("button", { name: /delete/i }));
    await userEvent.click(await screen.findByRole("button", { name: /^delete$/i }));

    await waitFor(() => {
      expect(screen.queryByText(/Default Summary/i)).not.toBeInTheDocument();
    });

    expect(fetchMock).toHaveBeenCalledWith(expect.stringMatching(/\/api\/v1\/summaries\/1$/), expect.objectContaining({ method: "DELETE" }));
    expect(toastSpy).toHaveBeenCalledWith(expect.objectContaining({ title: "Template deleted" }));
  });
});
