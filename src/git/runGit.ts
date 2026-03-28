import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/**
 * Run a git command and return its stdout.
 * Returns ``{ output, error? }`` so callers can handle failures without try/catch.
 */
export async function runGit(
  cwd: string,
  args: string[]
): Promise<{ output: string; error?: string }> {
  try {
    const { stdout, stderr } = await execFileAsync("git", args, {
      cwd,
      maxBuffer: 20 * 1024 * 1024,
      encoding: "utf8",
    });
    if (!stdout.trim() && stderr) {
      return { output: "", error: stderr.trim() || "git produced no output" };
    }
    return { output: stdout };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { output: "", error: msg };
  }
}
