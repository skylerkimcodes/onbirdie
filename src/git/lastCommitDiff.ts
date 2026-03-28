import { runGit } from "./runGit";

/** Patch introduced by the latest commit (`git show` without commit message noise). */
export async function getLastCommitPatch(cwd: string): Promise<{ diff: string; error?: string }> {
  const { output, error } = await runGit(cwd, ["show", "--no-color", "--pretty=format:", "-1"]);
  return { diff: output, error };
}
