import { runGit } from "./runGit";

/** Unified diff for staged changes (`git diff --cached`). */
export async function getStagedGitDiff(cwd: string): Promise<{ diff: string; error?: string }> {
  const { output, error } = await runGit(cwd, ["diff", "--cached", "--no-color"]);
  return { diff: output, error };
}
