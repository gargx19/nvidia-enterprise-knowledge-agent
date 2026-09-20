import { NextRequest, NextResponse } from "next/server";
import { DefaultAzureCredential } from "@azure/identity";

const endpoint = process.env.FOUNDRY_AGENT_ENDPOINT;

if (!endpoint) {
  throw new Error("FOUNDRY_AGENT_ENDPOINT is missing.");
}

export async function POST(request: NextRequest) {
  try {
    const { message } = await request.json();

    if (typeof message !== "string" || !message.trim()) {
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
      throw new Error("Unable to obtain Azure access token.");
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
          error: data?.error?.message ?? "Foundry request failed.",
        },
        { status: response.status }
      );
    }

    // Responses API normally returns structured output.
    const answer =
      typeof data.output_text === "string"
        ? data.output_text
        : data.output
            ?.flatMap((item: any) => item.content ?? [])
            ?.filter((item: any) => item.type === "output_text")
            ?.map((item: any) => item.text)
            ?.join("\n") ?? "";

    return NextResponse.json({ answer });
  } catch (error) {
    console.error("Chat route error:", error);

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