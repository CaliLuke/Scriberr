import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LLMSettings } from "../LLMSettings";

vi.mock("@/contexts/AuthContext", () => ({
	useAuth: () => ({
		getAuthHeaders: () => ({ Authorization: "Bearer test-token" }),
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

describe("LLMSettings", () => {
	const originalFetch = global.fetch;

	afterEach(() => {
		global.fetch = originalFetch;
		vi.clearAllMocks();
	});

	it("shows existing configuration values", async () => {
		const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			if (typeof input === "string" && input.endsWith("/api/v1/llm/config") && (!init || !init.method || init.method === "GET")) {
				return new Response(JSON.stringify({ provider: "ollama", is_active: true, base_url: "http://localhost:11434" }), {
					status: 200,
					headers: { "Content-Type": "application/json" },
				});
			}
			return new Response(null, { status: 404 });
		}) as typeof fetch;

		global.fetch = fetchMock;

		render(<LLMSettings />, { wrapper: createWrapper() });

		expect(await screen.findByDisplayValue("http://localhost:11434")).toBeInTheDocument();
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it("saves updated configuration via mutation", async () => {
		const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			if (typeof input === "string" && input.endsWith("/api/v1/llm/config")) {
				if (!init || !init.method || init.method === "GET") {
					return new Response(JSON.stringify({ provider: "ollama", is_active: false, base_url: "http://localhost:11434" }), {
						status: 200,
						headers: { "Content-Type": "application/json" },
					});
				}

				if (init.method === "POST") {
					return new Response(JSON.stringify({ provider: "openai", is_active: true, has_api_key: true }), {
						status: 200,
						headers: { "Content-Type": "application/json" },
					});
				}
			}

			return new Response(null, { status: 404 });
		}) as typeof fetch;

		global.fetch = fetchMock;

		render(<LLMSettings />, { wrapper: createWrapper() });

		await screen.findByDisplayValue("http://localhost:11434");

	await userEvent.click(screen.getByLabelText(/openai/i));
	await userEvent.type(await screen.findByPlaceholderText(/sk-/i), "secret");
		await userEvent.click(screen.getByRole("button", { name: /save configuration/i }));

		await waitFor(() => {
			expect(screen.getByText(/LLM configuration saved successfully/i)).toBeInTheDocument();
		});

		const postCall = fetchMock.mock.calls.find(([, init]) => init?.method === "POST");
		expect(postCall).toBeDefined();
		const headers = postCall?.[1]?.headers as Headers;
		expect(headers.get("Content-Type")).toBe("application/json");
		expect(headers.get("Authorization")).toBe("Bearer test-token");
	});
});
