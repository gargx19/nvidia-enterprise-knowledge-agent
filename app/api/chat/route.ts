import { NextRequest, NextResponse } from "next/server";
import { DefaultAzureCredential } from "@azure/identity";

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

function extractSources(data: FoundryResponse, text: string): Source[] {
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

    if (!title || seen.has(title)) continue;

    seen.add(title);
    const url = getSourceUrl(title);
    sources.push({
      id: `source-${sources.length + 1}`,
      title,
      ...(url ? { url } : {}),
    });
  }

  // Also inspect structured annotations when available
  const output = data.output ?? [];
  for (const item of output) {
    for (const content of item.content ?? []) {
      for (const annotation of (content.annotations ?? []) as Array<Record<string, unknown>>) {
        const candidate =
          annotation.filename ??
          annotation.file_name ??
          annotation.title;

        if (typeof candidate === "string" && candidate.trim()) {
          const raw = candidate.trim();
          // Never use raw HTTP/Search URLs as titles
          if (raw.startsWith("http://") || raw.startsWith("https://")) continue;
          if (raw.toLowerCase() === "source") continue;

          const title = raw.split("/").pop()?.trim() || raw;
          if (!title || seen.has(title)) continue;

          seen.add(title);
          const url = getSourceUrl(title);
          sources.push({
            id: `source-${sources.length + 1}`,
            title,
            ...(url ? { url } : {}),
          });
        }
      }
    }
  }

  return sources;
}

function isNotFoundResponse(text: string): boolean {
  const lower = text.toLowerCase();
  const patterns = [
    /couldn['’]?t find (?:that|any) information/i,
    /could not find (?:that|any) information/i,
    /can(?:not|['’]t) find (?:that|any) information/i,
    /unable to find (?:that|any) information/i,
    /no information (?:was )?found/i,
    /not found in the (?:connected )?nvidia knowledge base/i,
    /not (?:mentioned|available|covered) in the (?:connected )?nvidia knowledge base/i,
    /do not have (?:any )?information/i,
    /don['’]?t have (?:any )?information/i,
    /does not contain (?:any )?information/i,
    /no mention of .* in the (?:connected )?nvidia knowledge base/i,
  ];
  return patterns.some((pattern) => pattern.test(lower));
}

function isOutOfScopeResponse(text: string): boolean {
  const lower = text.toLowerCase();
  const patterns = [
    /nvidia enterprise knowledge agent/i,
    /only answer questions (?:about|regarding|related to) nvidia/i,
    /only assist with questions (?:about|regarding|related to) nvidia/i,
    /only provide information (?:about|regarding|related to) nvidia/i,
    /can only answer questions about nvidia/i,
    /can only assist with questions about nvidia/i,
    /questions about nvidia and information in the (?:connected )?nvidia knowledge base/i,
    /i am an ai assistant dedicated to nvidia/i,
    /i am dedicated to nvidia/i,
    /outside (?:of )?(?:the|my) scope/i,
    /not related to nvidia/i,
  ];
  return patterns.some((pattern) => pattern.test(lower));
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

    let sources = extractSources(data, rawAnswer);
    let answer = cleanAnswer(rawAnswer);

    if (isNotFoundResponse(rawAnswer) || isNotFoundResponse(answer)) {
      sources = [];
      answer = "I couldn't find that information in the NVIDIA knowledge base.";
    } else if (isOutOfScopeResponse(rawAnswer) || isOutOfScopeResponse(answer)) {
      sources = [];
    }

    return NextResponse.json({
      answer,
      sources,
    });
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