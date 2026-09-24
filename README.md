# NVIDIA Enterprise Knowledge Agent

An end-to-end enterprise RAG (Retrieval-Augmented Generation) assistant built on **Microsoft Foundry → Foundry IQ → Azure AI Search → Next.js → Vercel**, grounded exclusively in public NVIDIA documentation.

Built as an *AI-103 (Azure AI Apps and Agents Developer Associate)* group project.

> Ask a question about NVIDIA. The agent retrieves relevant NVIDIA documentation, generates a grounded answer, and shows exactly which sources support it — or says so when the answer isn't in the knowledge base.

---

## Team

| Name | ID |
|---|---|
| Nandini Gupta | 2410992816 |
| Harkamal Singh | 2410992746 |
| Harmanpreet Kaur | 2410992750 |
| Krish Garg | 2410992949 |

---

## Why this project

Rather than build a generic chatbot, this project narrows the scope to a public-document enterprise assistant: a user asks a question, the agent retrieves relevant NVIDIA documentation, the model produces a grounded answer, and the UI shows which documents supported that answer.

NVIDIA was chosen because it offers a coherent, entirely public documentation domain — AI Enterprise, deployment/installation guides, NIM documentation, company and privacy content — assembled into a small but realistic enterprise knowledge collection. No confidential or internal material is used anywhere in this project.

---

## Architecture

```
User
  ↓
Custom NVIDIA UI (Next.js)
  ↓
Next.js /api/chat
  ↓
Microsoft Entra authentication
  ↓
Foundry Agent
  ↓
Foundry IQ knowledge base
  ↓
Azure AI Search
  ↓
NVIDIA documents
```

| Layer | Role |
|---|---|
| **Next.js UI** | Custom product surface — the only user-facing part of the app |
| **Microsoft Entra auth** | Server-side service identity (not a developer's local login) |
| **Foundry Agent** | Role-bound, grounded agent — answers only from NVIDIA knowledge, says "not found" when evidence is missing |
| **Foundry IQ** | Managed knowledge layer — knowledge bases, knowledge sources, agentic retrieval, citations |
| **Azure AI Search** | Retrieval infrastructure underneath Foundry IQ — indexes and ranks NVIDIA document chunks |
| **NVIDIA documents** | Six curated public PDFs (AI Enterprise, Deployment, Installation, NIM, Company, Privacy) |

**Hosting:** GitHub → Vercel (custom UI + server route). Foundry stays the agent/knowledge control plane — never the product surface.

---

## Agent behavior

The agent is instructed to:

- Use the connected NVIDIA knowledge base as the primary source of truth
- **Never invent** NVIDIA-specific facts
- Say so explicitly when the answer isn't in the knowledge base
- Stay in scope — NVIDIA products, deployment, company/privacy information only (no general-knowledge fallback, no web search)

```
You are the NVIDIA Enterprise Knowledge Agent.
Use the connected NVIDIA knowledge base as the primary source of truth.
Do not invent NVIDIA-specific facts.
If the answer is not present in the knowledge base, say so.
```

---

## Tech stack

- **Model:** GPT-5 mini
- **Agent & knowledge layer:** Microsoft Foundry, Foundry IQ
- **Retrieval:** Azure AI Search (`text-embedding-3-small`, extractive output, minimal reasoning effort)
- **Auth:** Microsoft Entra ID — `DefaultAzureCredential` locally, `EnvironmentCredential` in production
- **App:** Next.js (`/api/chat` server route)
- **Hosting:** Vercel
- **Source control:** GitHub (private repo)

---

## Getting started (rebuild checklist)

1. Create an Azure subscription/resource group and a Foundry project.
2. Deploy GPT-5 mini in the Foundry model catalog.
3. Create the NVIDIA Enterprise Knowledge Agent with strict grounding instructions.
4. Create an Azure AI Search resource in a region that currently supports Foundry IQ / agentic retrieval and has capacity.
5. Create a Foundry IQ knowledge base and a file-backed knowledge source.
6. Upload the six curated NVIDIA documents and wait for ingestion to complete.
7. Connect the knowledge base to the agent — **exactly once** (a duplicate connection throws a duplicate `server_label` error).
8. Test two answerable NVIDIA questions and one missing-information question.
9. Create the Next.js application and the `/api/chat` server route.
10. Use server-side Entra authentication — never place secrets in browser code.
11. Create an Entra service principal for deployment, grant the minimum required Foundry permission (`Foundry Agent Consumer`, scoped to the specific agent), and test locally.
12. Push the project to a **private** GitHub repository after confirming `.env.local` is ignored.
13. Import the repository into Vercel and configure the same environment variables server-side.
14. Deploy and run live tests.
15. Polish source presentation, add a tool, complete this README, and record the demo.

---

## Environment variables

```bash
FOUNDRY_AGENT_ENDPOINT=.../agents/NVIDIA-Enterprise-Knowledge-Agent/.../responses
AZURE_CLIENT_ID=<application-client-id>
AZURE_TENANT_ID=<tenant-id>
AZURE_CLIENT_SECRET=<secret-value>
AZURE_TOKEN_CREDENTIALS=EnvironmentCredential
```

> Set these in `.env.local` for local development and in the Vercel project settings for production. Never commit real values — `.env.local` must stay in `.gitignore`.

---

## Local development

```bash
npx create-next-app@latest nvidia-enterprise-agent
cd nvidia-enterprise-agent
npm install @azure/identity
npm run dev
```

Authenticate locally with Azure CLI before your first run:

```bash
brew update && brew install azure-cli
az login
az account show
az account get-access-token --resource https://ai.azure.com
```

To find the service-principal Object ID (needed for RBAC role assignment — distinct from the Application/client ID):

```bash
az ad sp show --id <APPLICATION_CLIENT_ID> --query id -o tsv
```

---

## API response shape

The backend deliberately separates the answer from its evidence so the UI never renders raw citation markers or dead authenticated URLs:

```json
{
  "answer": "NVIDIA AI Enterprise is ...",
  "sources": [
    { "id": "source-1", "title": "01-AI-Enterprise.pdf" }
  ]
}
```

`sources` is only populated when the answer is actually grounded — a "not found" or out-of-scope response always returns `sources: []`. Retrieval returning a nearby document is not the same as that document being evidence for the final answer.

---

## Known failures and fixes

| Failure | Root cause | Fix |
|---|---|---|
| Duplicate MCP `server_label` error | Knowledge base connected to the agent twice | Remove the duplicate connection, not the knowledge base |
| `HTTP 403 Forbidden` on retrieval | Resource existed but the caller wasn't authorized | Fixed via Azure RBAC / managed identity / Search access configuration |
| `AZURE_TOKEN_CREDENTIALS="Environment"` rejected | Invalid credential selector string | Use `EnvironmentCredential` (the documented Azure Identity credential name) |
| `AADSTS7000215: Invalid client secret provided` | Sent the secret **ID** instead of the secret **value** | Create a new secret, copy the Value field, not the ID |
| GitHub `Repository not found` | Wrong GitHub account active in the CLI, not a bad remote URL | `gh auth switch --user <account>`, then verify with `git ls-remote origin` |
| Raw citation markers (e.g. `【6:0†file.pdf】`) shown in UI; cited URLs 401'd | Citations weren't separated from answer text before rendering | API now returns `answer` and `sources[]` separately; sources rendered as clean cards |
| Agent cited a document on an out-of-scope question ("NVIDIA's policy on colonizing Mars?") | Retrieval found a nearby chunk; that isn't the same as evidence | Backend rule: if the answer text signals "not found," force `sources = []` regardless of what retrieval returned |
| Agent answered general-knowledge questions ("what is Amazon?") | No scope boundary in the agent instructions | Strengthened instructions: NVIDIA-only scope, no general-knowledge fallback, no web search |

---

## Responsible AI

Every response passes through Azure AI Content Safety guardrails before reaching the user:

- **Protected materials** (code and text) — blocked on output
- **Jailbreak** and **indirect prompt injection** — blocked on user input / tool response
- **Content harms** (hate, sexual, self-harm, violence) — filtered at medium blocking, on both input and output

---

## What's complete vs. provisional

**Complete**
- Custom Next.js UI (not the Foundry Playground)
- Foundry Agent + GPT-5 mini
- Foundry IQ + Azure AI Search retrieval
- Grounded answers with clean source visibility
- Scope control (NVIDIA-only) and "not found" handling

**Next**
- Larger, continuously updated document corpus
- Role-based access control
- More enterprise tools / actions
- Analytics and evaluation dashboard

---

## References

1. [What is Foundry IQ?](https://learn.microsoft.com/en-us/azure/foundry/agents/concepts/what-is-foundry-iq)
2. [Foundry IQ FAQ](https://learn.microsoft.com/en-us/azure/foundry/agents/concepts/foundry-iq-faq)
3. [Azure AI Search — Agentic Retrieval Overview](https://learn.microsoft.com/en-us/azure/search/agentic-retrieval-overview)
4. [Connect Agents to Foundry IQ Knowledge Bases](https://learn.microsoft.com/azure/foundry/agents/how-to/foundry-iq-connect)
5. [Microsoft Foundry — Responses API quickstart](https://learn.microsoft.com/en-us/azure/foundry/agents/quickstarts/responses-api)
6. [Azure Identity for JavaScript — DefaultAzureCredential / EnvironmentCredential](https://learn.microsoft.com/en-us/javascript/api/overview/azure/identity-readme?view=azure-node-latest)
7. [Vercel — Next.js platform](https://vercel.com/frameworks/nextjs)

---

*AI-103 Group Project — Enterprise Knowledge Agent*
