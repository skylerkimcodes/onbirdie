import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/** Unified diff for staged changes (`git diff --cached`). */
export async function getStagedGitDiff(cwd: string): Promise<{ diff: string; error?: string }> {
  try {
    const { stdout, stderr } = await execFileAsync("git", ["diff", "--cached", "--no-color"], {
      cwd,
      maxBuffer: 20 * 1024 * 1024,
      encoding: "utf8",
    });
    const out = stdout as string;
    if (!out.trim() && stderr) {
      const errText = typeof stderr === "string" ? stderr : String(stderr);
      return { diff: "", error: errText.trim() || "git produced no output" };
    }
    return { diff: out };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { diff: "", error: msg };
  }
}
