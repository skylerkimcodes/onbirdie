import * as vscode from "vscode";
import { apiRequest } from "./lib/api";
import { getAccessToken } from "./lib/auth";
import type { StyleReviewOutcome, StyleReviewResult } from "./lib/types";

export type { StyleReviewOutcome };

export async function runStyleReviewForDiff(
  secrets: vscode.SecretStorage,
  diff: string
): Promise<StyleReviewOutcome> {
  const token = await getAccessToken(secrets);
  if (!token) {
    return { ok: false, error: "Sign in to OnBirdie to run style review." };
  }
  const trimmed = diff.trim();
  if (!trimmed) {
    return { ok: false, error: "No diff to review." };
  }
  const res = await apiRequest("POST", "/api/v1/style-review", {
    body: { diff: trimmed },
    token,
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const err = (await res.json()) as { detail?: unknown };
      if (typeof err.detail === "string") {
        detail = err.detail;
      }
    } catch {
      /* ignore */
    }
    return { ok: false, error: detail };
  }
  const result = (await res.json()) as StyleReviewResult;
  return { ok: true, result };
}

export async function runStyleReviewForFile(
  secrets: vscode.SecretStorage,
  filePath: string,
  content: string
): Promise<StyleReviewOutcome> {
  const token = await getAccessToken(secrets);
  if (!token) {
    return { ok: false, error: "Sign in to OnBirdie for live style checks." };
  }
  const trimmed = content;
  if (!trimmed.trim()) {
    return { ok: false, error: "Empty file." };
  }
  const res = await apiRequest("POST", "/api/v1/style-review/live", {
    body: { file_path: filePath, content: trimmed },
    token,
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const err = (await res.json()) as { detail?: unknown };
      if (typeof err.detail === "string") {
        detail = err.detail;
      }
    } catch {
      /* ignore */
    }
    return { ok: false, error: detail };
  }
  const result = (await res.json()) as StyleReviewResult;
  return { ok: true, result };
}

export function writeStyleReviewOutput(
  outcome: StyleReviewOutcome,
  channel: vscode.OutputChannel
): void {
  channel.clear();
  if (outcome.ok) {
    channel.appendLine(outcome.result.summary);
    if (outcome.result.tier_used) {
      channel.appendLine(
        `Tier: ${outcome.result.tier_used === "lava_light" ? "light (Lava)" : "K2"}`
      );
    }
    channel.appendLine("");
    if (outcome.result.issues.length === 0) {
      channel.appendLine("No style issues reported.");
    } else {
      for (let i = 0; i < outcome.result.issues.length; i++) {
        const it = outcome.result.issues[i];
        channel.appendLine(
          `--- ${i + 1}. [${it.severity}] ${it.file_path ?? "(file unknown)"} ---`
        );
        channel.appendLine(`Guide: ${it.guide_quote}`);
        channel.appendLine(it.explanation);
        channel.appendLine(`Suggestion: ${it.suggestion}`);
        channel.appendLine("");
      }
    }
  } else {
    channel.appendLine(outcome.error);
  }
  channel.show(true);
}
