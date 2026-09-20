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
};

function getSourceUrl(title: string): string | undefined {
  if (SOURCE_URLS[title]) return SOURCE_URLS[title];
  const cleanTitle = title.toLowerCase().trim();
  for (const [key, url] of Object.entries(SOURCE_URLS)) {
    const cleanKey = key.toLowerCase();
    if (
      cleanKey === cleanTitle ||
      cleanKey.replace(/\.pdf$/, "") === cleanTitle.replace(/\.pdf$/, "")
    ) {
      return url;
    }
  }
  return undefined;
}

type FoundryContent = {
  type?: string;
  text?: string;
  annotations?: unknown[];
};

type FoundryOutputItem = {
  type?: string;
  content?: FoundryContent[];
};

type FoundryResponse = {
  output_text?: string;
  output?: FoundryOutputItem[];
  error?: {
    message?: string;
  };
};

function cleanAnswer(text: string): string {
  return text
    // Remove [6:0†filename.pdf], [1:2†04-NIM.pdf], [1†filename.pdf], etc.
    .replace(/\[(?:\d+:)?\d+\s*†\s*[^\]]+\]/g, "")
    // Remove 【6:0†filename.pdf】, 【1:2†04-NIM.pdf】, etc.
    .replace(/【(?:\d+:)?\d+\s*†\s*[^】]+】/g, "")
    // Remove Foundry citation format variants like 【...†source】 or [...†source]
    .replace(/\[[^\]]*†source\]/gi, "")
    .replace(/【[^】]*†source】/gi, "")
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

function extractSourcesFromText(text: string): Source[] {
  const sources: Source[] = [];
  const seen = new Set<string>();

  // Matches [6:0†01-AI-Enterprise.pdf] and 【6:0†01-AI-Enterprise.pdf】 in appearance order
  const pattern = /(?:\[|【)(?:\d+:)?\d+\s*†\s*([^\]】]+)(?:\]|】)/g;

  for (const match of text.matchAll(pattern)) {
    const rawTitle = match[1]?.trim();
    if (!rawTitle) continue;

    // Ignore generic "source" tokens (e.g. 【...†source】)
    if (rawTitle.toLowerCase() === "source") continue;

    // Strip leading path if present (e.g. folder/01-AI-Enterprise.pdf)
    const title = rawTitle.split("/").pop()?.trim() || rawTitle;

    const lowerTitle = title.toLowerCase();
    if (
      lowerTitle === "source" ||
      lowerTitle === "source.pdf" ||
      lowerTitle === "sources" ||
      lowerTitle === "unknown"
    ) {
      continue;
    }

    if (!title || seen.has(title)) continue;

    seen.add(title);
    const url = getSourceUrl(title);
    sources.push({
      id: `source-${sources.length + 1}`,
      title,
      ...(url ? { url } : {}),
    });
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
    const sources = hasKnowledgeBaseAnswer
      ? extractSourcesFromText(rawAnswer)
      : [];

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
