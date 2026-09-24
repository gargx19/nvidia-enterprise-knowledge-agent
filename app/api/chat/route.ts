import { NextRequest, NextResponse } from "next/server";
import { DefaultAzureCredential } from "@azure/identity";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const endpoint = process.env.FOUNDRY_AGENT_ENDPOINT;

if (!endpoint) {
  throw new Error("FOUNDRY_AGENT_ENDPOINT is missing.");
}

type Source = {
  id: string;
  title: string;
  url?: string;
};

const SOURCE_URLS: Record<string, string> = {
  // Curated PDF documentation
  "01-AI-Enterprise.pdf":
    "https://docs.nvidia.com/ai-enterprise/software/latest/overview.html",
  "02-Deployment.pdf":
    "https://docs.nvidia.com/ai-enterprise/deployment/bare-metal/latest/overview.html",
  "03-Installation.pdf":
    "https://docs.nvidia.com/ai-enterprise/release-8/latest/getting-started/quick-start-guide.html",
  "04-NIM.pdf": "https://docs.nvidia.com/nim/",
  "05-Company.pdf": "https://www.nvidia.com/en-us/about-nvidia/",
  "06-Privacy.pdf":
    "https://www.nvidia.com/en-us/about-nvidia/privacy-policy/",

  // Active knowledge base corpus documents
  "01_nvidia_company_and_platform.txt":
    "https://www.nvidia.com/en-us/about-nvidia/",
  "01_NVIDIA_FY2026_Annual_Report.pdf":
    "https://investor.nvidia.com/",
  "02_gpu_cuda_and_performance.txt":
    "https://docs.nvidia.com/cuda/",
  "02_NVIDIA_FY26_Sustainability_Report.pdf":
    "https://www.nvidia.com/en-us/csr/",
  "03_ai_enterprise_nim_nemo.txt":
    "https://docs.nvidia.com/ai-enterprise/software/latest/overview.html",
  "03_NVIDIA_Code_of_Conduct.pdf":
    "https://www.nvidia.com/en-us/about-nvidia/code-of-conduct/",
  "04_triton_gpu_operator_networking.txt":
    "https://docs.nvidia.com/deeplearning/triton-inference-server/user-guide/docs/",
  "04_NVIDIA_Human_Rights_Policy.pdf":
    "https://www.nvidia.com/en-us/about-nvidia/human-rights-policy/",
  "05_virtualization_containers_ngc.txt":
    "https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/index.html",
  "05_NVIDIA_Responsible_Minerals_Policy.pdf":
    "https://www.nvidia.com/en-us/csr/",
  "06_kubernetes_deployment_architecture.txt":
    "https://docs.nvidia.com/datacenter/cloud-native/gpu-operator/latest/",
  "06_NVIDIA_2026_Forced_Labor_Statement..pdf":
    "https://www.nvidia.com/en-us/about-nvidia/human-rights-policy/",
  "07_compatibility_lifecycle_licensing.txt":
    "https://docs.nvidia.com/ai-enterprise/release-8/latest/getting-started/quick-start-guide.html",
  "07_NVIDIA_Trustworthy_AI.md":
    "https://www.nvidia.com/en-us/ai-data-science/trustworthy-ai/",
  "08_security_data_governance.txt":
    "https://docs.nvidia.com/ai-enterprise/",
  "08_NVIDIA_CUDA_Programming_Guide.md":
    "https://docs.nvidia.com/cuda/cuda-c-programming-guide/index.html",
  "09_troubleshooting_support_operations.txt":
    "https://docs.nvidia.com/ai-enterprise/deployment/bare-metal/latest/troubleshooting.html",
  "09_NVIDIA_Blackwell_Compatibility_Guide.md":
    "https://docs.nvidia.com/ai-enterprise/",
  "10_rag_agent_knowledge_glossary_sources.txt":
    "https://docs.nvidia.com/ai-enterprise/",
  "10_NVIDIA_AI_Trust_Center.md":
    "https://www.nvidia.com/en-us/security/trust-center/",
};

function getSourceUrl(title: string): string {
  if (SOURCE_URLS[title]) return SOURCE_URLS[title];
  const cleanTitle = title.toLowerCase().trim();
  for (const [key, url] of Object.entries(SOURCE_URLS)) {
    const cleanKey = key.toLowerCase();
    if (
      cleanKey === cleanTitle ||
      cleanKey.replace(/\.[^.]+$/, "") === cleanTitle.replace(/\.[^.]+$/, "")
    ) {
      return url;
    }
  }

  // Keyword-based fallbacks for official NVIDIA documentation
  if (cleanTitle.includes("nim")) return "https://docs.nvidia.com/nim/";
  if (cleanTitle.includes("cuda")) return "https://docs.nvidia.com/cuda/";
  if (cleanTitle.includes("triton"))
    return "https://docs.nvidia.com/deeplearning/triton-inference-server/user-guide/docs/";
  if (cleanTitle.includes("container") || cleanTitle.includes("operator"))
    return "https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/index.html";
  if (cleanTitle.includes("annual_report") || cleanTitle.includes("investor"))
    return "https://investor.nvidia.com/";
  if (cleanTitle.includes("privacy"))
    return "https://www.nvidia.com/en-us/about-nvidia/privacy-policy/";
  if (cleanTitle.includes("conduct"))
    return "https://www.nvidia.com/en-us/about-nvidia/code-of-conduct/";
  if (cleanTitle.includes("sustainability") || cleanTitle.includes("csr"))
    return "https://www.nvidia.com/en-us/csr/";

  return "https://docs.nvidia.com/ai-enterprise/";
}

type FoundryAnnotation = {
  type?: string;
  url?: string;
  title?: string;
};

type FoundryContent = {
  type?: string;
  text?: string;
  annotations?: FoundryAnnotation[];
};

type FoundryOutputItem = {
  type?: string;
  id?: string;
  name?: string;
  output?: unknown;
  content?: FoundryContent[];
};

type FoundryResponse = {
  output_text?: string;
  output?: FoundryOutputItem[];
  error?: {
    message?: string;
  };
};

type RetrievedDoc = {
  id?: string;
  uid?: string;
  title: string;
};

function extractRetrievedDocs(data: FoundryResponse): {
  docsByIndex: RetrievedDoc[];
  docsByUid: Map<string, RetrievedDoc>;
} {
  const docsByIndex: RetrievedDoc[] = [];
  const docsByUid = new Map<string, RetrievedDoc>();

  for (const item of data.output ?? []) {
    if (item.type === "mcp_call" && item.output) {
      try {
        const parsed =
          typeof item.output === "string" ? JSON.parse(item.output) : item.output;
        const docs = Array.isArray(parsed?.documents) ? parsed.documents : [];
        for (const doc of docs) {
          let metaPath = "";
          let uid = "";
          if (typeof doc.content === "string") {
            try {
              const content = JSON.parse(doc.content);
              metaPath = content.metadata_storage_path || "";
              uid = content.uid || "";
            } catch {}
          } else if (doc.content && typeof doc.content === "object") {
            metaPath = doc.content.metadata_storage_path || "";
            uid = doc.content.uid || "";
          }

          const rawTitle =
            metaPath ||
            (typeof doc.title === "string" && !doc.title.startsWith("http")
              ? doc.title
              : "") ||
            "";
          const cleanTitle = rawTitle.split("/").pop()?.trim() || "";

          const docObj: RetrievedDoc = {
            id: typeof doc.id === "string" ? doc.id : undefined,
            uid: uid || (typeof doc.id === "string" ? doc.id : undefined),
            title: cleanTitle,
          };

          docsByIndex.push(docObj);
          if (uid) docsByUid.set(uid, docObj);
          if (docObj.id) docsByUid.set(docObj.id, docObj);
        }
      } catch (err) {
        console.error("Error parsing MCP retrieve output:", err);
      }
    }
  }

  return { docsByIndex, docsByUid };
}

function cleanAnswer(text: string): string {
  return text
    // Remove [6:0†filename.pdf], [1:2†04-NIM.pdf], [1†filename.pdf], [6:0†source], etc.
    .replace(/\[(?:\d+:)?\d+\s*†\s*[^\]]+\]/g, "")
    // Remove 【6:0†filename.pdf】, 【1:2†04-NIM.pdf】, 【6:0†source】, etc.
    .replace(/【(?:\d+:)?\d+\s*†\s*[^】]+】/g, "")
    // Remove citation format variants like 【...†source】 or [...†source]
    .replace(/\[[^\]]*†[^\]]*\]/gi, "")
    .replace(/【[^】]*†[^】]*】/gi, "")
    // Remove citation indices like [6:0] or [1:2]
    .replace(/\[\d+:\d+[^\]]*\]/g, "")
    // Remove any remaining Chinese citation brackets 【...】
    .replace(/【[^】]+】/g, "")
    // Remove leftover spaces before punctuation marks created by citation removal
    .replace(/[ \t]+([.,;:!?])/g, "$1")
    // Clean spacing: reduce multiple spaces/tabs to single space
    .replace(/[ \t]{2,}/g, " ")
    // Clean blank lines: reduce 3+ newlines to double newlines
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function extractSources(
  data: FoundryResponse,
  rawAnswer: string,
  hasKnowledgeBaseAnswer: boolean
): Source[] {
  if (!hasKnowledgeBaseAnswer) {
    return [];
  }

  const sources: Source[] = [];
  const seen = new Set<string>();

  const { docsByIndex, docsByUid } = extractRetrievedDocs(data);

  function resolveDocTitle(candidate: string): string {
    const clean = candidate.split("/").pop()?.trim() || candidate.trim();
    if (!clean) return "";

    if (docsByUid.has(clean)) {
      const match = docsByUid.get(clean);
      if (match?.title) return match.title;
    }

    for (const [uid, doc] of docsByUid.entries()) {
      if (uid && (clean === uid || clean.includes(uid) || uid.includes(clean))) {
        if (doc.title) return doc.title;
      }
    }

    return clean;
  }

  function addSource(rawCandidate: string) {
    if (!rawCandidate) return;
    const candidateTitle = resolveDocTitle(rawCandidate);
    if (!candidateTitle) return;

    const clean = candidateTitle.split("/").pop()?.trim() || candidateTitle.trim();
    const lower = clean.toLowerCase();
    if (
      lower === "source" ||
      lower === "source.pdf" ||
      lower === "sources" ||
      lower === "unknown" ||
      lower.startsWith("file-") ||
      lower.startsWith("http://") ||
      lower.startsWith("https://")
    ) {
      return;
    }

    if (seen.has(clean)) return;
    seen.add(clean);

    const url = getSourceUrl(clean);
    sources.push({
      id: `source-${sources.length + 1}`,
      title: clean,
      ...(url ? { url } : {}),
    });
  }

  // 1. Text citation markers, e.g.:
  //    - 【6:0†03_ai_enterprise_nim_nemo.txt】 -> explicit filename
  //    - 【6:0†source】 -> maps search_idx (0) to docsByIndex[0]
  //    - [1:2†04-NIM.pdf] -> explicit filename
  const pattern = /(?:\[|【)(?:(\d+):)?(\d+)\s*†\s*([^\]】]+)(?:\]|】)/g;
  for (const match of rawAnswer.matchAll(pattern)) {
    const docIdxStr = match[2];
    const rawTitle = match[3]?.trim();

    if (
      rawTitle &&
      rawTitle.toLowerCase() !== "source" &&
      rawTitle.toLowerCase() !== "sources"
    ) {
      addSource(rawTitle);
    } else if (docIdxStr !== undefined) {
      const idx = parseInt(docIdxStr, 10);
      const doc = docsByIndex[idx];
      if (doc && doc.title) {
        addSource(doc.title);
      }
    }
  }

  // Also support pattern without index: [†filename.pdf] or 【†filename.pdf】
  const simplePattern = /(?:\[|【)†\s*([^\]】]+)(?:\]|】)/g;
  for (const match of rawAnswer.matchAll(simplePattern)) {
    const rawTitle = match[1]?.trim();
    if (rawTitle) addSource(rawTitle);
  }

  // 2. Annotations on output_text content
  for (const item of data.output ?? []) {
    if (item.type === "message" && Array.isArray(item.content)) {
      for (const c of item.content) {
        if (Array.isArray(c.annotations)) {
          for (const ann of c.annotations) {
            if (ann && typeof ann.url === "string") {
              for (const [uid, doc] of docsByUid.entries()) {
                if (uid && ann.url.includes(uid) && doc.title) {
                  addSource(doc.title);
                  break;
                }
              }
            }
          }
        }
      }
    }
  }

  // 3. Fallback: if knowledge base grounded but citations were omitted in text
  if (sources.length === 0 && docsByIndex.length > 0) {
    for (const doc of docsByIndex.slice(0, 3)) {
      if (doc.title) addSource(doc.title);
    }
  }

  return sources;
}

function isDataUnavailable(answer: string, rawAnswer?: string): boolean {
  const check = (text: string) => {
    if (!text) return false;
    const s = text
      .toLowerCase()
      .replace(/[’‘]/g, "'")
      .trim();

    return (
      s.startsWith("i couldn't find that information in the nvidia knowledge base") ||
      s.startsWith("i could not find that information in the nvidia knowledge base") ||
      s.startsWith("the information was not found in the nvidia knowledge base") ||
      s.startsWith("i couldn't find") ||
      s.startsWith("i could not find") ||
      s.startsWith("i cannot find") ||
      s.startsWith("i can't find") ||
      s.startsWith("i am unable to find") ||
      s.startsWith("i'm unable to find") ||
      s.startsWith("the information was not found") ||
      s.startsWith("the requested information was not found") ||
      s.startsWith("the requested information is not available") ||
      s.startsWith("no information was found") ||
      s.startsWith("there is no information") ||
      s.startsWith("no information is available") ||
      s.startsWith("i don't have information") ||
      s.startsWith("i do not have information") ||
      s.includes("couldn't find that information") ||
      s.includes("could not find that information") ||
      s.includes("cannot find that information") ||
      s.includes("unable to find that information") ||
      s.includes("couldn't find any information") ||
      s.includes("could not find any information") ||
      s.includes("information was not found") ||
      s.includes("information is not found") ||
      s.includes("information is not available") ||
      s.includes("information was not available") ||
      s.includes("data is not available") ||
      s.includes("data was not found") ||
      s.includes("not found in the nvidia knowledge base") ||
      s.includes("not found in the knowledge base") ||
      s.includes("not available in the nvidia knowledge base") ||
      s.includes("not available in the knowledge base") ||
      s.includes("not present in the nvidia knowledge base") ||
      s.includes("not present in the connected nvidia knowledge base") ||
      s.includes("not present in the knowledge base") ||
      s.includes("does not contain information") ||
      s.includes("doesn't contain information") ||
      s.includes("do not have information") ||
      s.includes("don't have information") ||
      s.includes("no mention of") ||
      (s.includes("couldn't find") && s.includes("knowledge base")) ||
      (s.includes("could not find") && s.includes("knowledge base")) ||
      (s.includes("not found") && s.includes("knowledge base")) ||
      (s.includes("not available") && s.includes("knowledge base")) ||
      (s.includes("no information") && s.includes("knowledge base")) ||
      (s.includes("not covered") && s.includes("knowledge base")) ||
      (s.includes("does not contain") && s.includes("knowledge base")) ||
      (s.includes("doesn't contain") && s.includes("knowledge base")) ||
      (s.includes("do not have") && s.includes("knowledge base")) ||
      (s.includes("don't have") && s.includes("knowledge base")) ||
      s.includes("i'm the nvidia enterprise knowledge agent") ||
      s.includes("i am the nvidia enterprise knowledge agent") ||
      (s.includes("only answer questions") && s.includes("nvidia")) ||
      (s.includes("only assist with questions") && s.includes("nvidia")) ||
      s.includes("outside the scope") ||
      s.includes("out of scope")
    );
  };

  return check(answer) || (rawAnswer ? check(rawAnswer) : false);
}

export async function POST(request: NextRequest) {
  try {
    const { message } = await request.json();

    if (
      typeof message !== "string" ||
      !message.trim()
    ) {
      return NextResponse.json(
        { error: "Message is required." },
        { status: 400 }
      );
    }

    const credential = new DefaultAzureCredential();

    const token = await credential.getToken(
      "https://ai.azure.com/.default"
    );

    if (!token) {
      throw new Error(
        "Unable to obtain Azure access token."
      );
    }

    const response = await fetch(
      `${endpoint}?api-version=v1`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          input: message.trim(),
        }),
      }
    );

    const data = (await response.json()) as FoundryResponse;

    if (!response.ok) {
      console.error("Foundry response:", data);

      return NextResponse.json(
        {
          error:
            data?.error?.message ??
            "Foundry request failed.",
        },
        { status: response.status }
      );
    }

    const rawAnswer =
      typeof data.output_text === "string"
        ? data.output_text
        : data.output
            ?.flatMap(
              (item) =>
                item.content ?? []
            )
            ?.filter(
              (item) =>
                item.type === "output_text"
            )
            ?.map(
              (item) => item.text ?? ""
            )
            ?.join("\n") ?? "";

    const answer = cleanAnswer(rawAnswer);

    // Foundry can attach the document it retrieved even when the agent says
    // that the question is not answered by that document. Treat that as an
    // ungrounded response: never send those retrieved documents to the UI.
    const hasKnowledgeBaseAnswer = !isDataUnavailable(answer, rawAnswer);
    const sources = extractSources(data, rawAnswer, hasKnowledgeBaseAnswer);

    return NextResponse.json(
      {
        answer,
        sources,
        hasKnowledgeBaseAnswer,
      },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
          Pragma: "no-cache",
          Expires: "0",
        },
      }
    );
  } catch (error) {
    console.error(
      "Chat route error:",
      error
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unknown server error.",
      },
      { status: 500 }
    );
  }
}
