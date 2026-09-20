import { NextRequest, NextResponse } from "next/server";
import { DefaultAzureCredential } from "@azure/identity";

const endpoint = process.env.FOUNDRY_AGENT_ENDPOINT;

if (!endpoint) {
  throw new Error("FOUNDRY_AGENT_ENDPOINT is missing.");
}

type Source = {
  id: string;
  title: string;
};

function cleanAnswer(text: string): string {
  return text
    // Remove [6:0†filename.pdf]
    .replace(/\[\d+:\d+†[^\]]+\]/g, "")
    // Remove 【6:0†filename.pdf】
    .replace(/【\d+:\d+†[^】]+】/g, "")
    // Remove any remaining source marker variants
    .replace(/\[\d+:\d+[^\]]*\]/g, "")
    .replace(/【[^】]+】/g, "")
    // Clean spacing
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function extractSourcesFromText(text: string): Source[] {
  const sources: Source[] = [];
  const seen = new Set<string>();

  const patterns = [
    /\[\d+:\d+†([^\]]+)\]/g,
    /【\d+:\d+†([^】]+)】/g,
  ];

  for (const regex of patterns) {
    for (const match of text.matchAll(regex)) {
      const title = match[1]?.trim();

      if (!title || seen.has(title)) continue;

      seen.add(title);

      sources.push({
        id: `source-${sources.length + 1}`,
        title,
      });
    }
  }

  return sources;
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

    const data = await response.json();

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
              (item: any) =>
                item.content ?? []
            )
            ?.filter(
              (item: any) =>
                item.type === "output_text"
            )
            ?.map(
              (item: any) => item.text
            )
            ?.join("\n") ?? "";

    const sources = extractSourcesFromText(rawAnswer);
    const answer = cleanAnswer(rawAnswer);

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