import { execFileSync } from "node:child_process";

/** Liest fremde Commits ausschließlich als Diff; führt keinen Checkout und keinen PR-Code aus. */
export function lesePrDiff(basis: string, head: string, cwd = process.cwd()): { dateien: string[]; diff: string } {
  if (![basis, head].every((sha) => /^[a-f0-9]{40}$/i.test(sha))) throw new Error("Vollständige Commit-SHA erforderlich");
  const git = (...args: string[]) => execFileSync("git", args, { cwd, encoding: "utf8", maxBuffer: 50_000_000 });
  const range = `${basis}...${head}`;
  return {
    dateien: git("diff", "--no-ext-diff", "--no-textconv", "--name-only", "-z", range).split("\0").filter(Boolean),
    diff: git("diff", "--no-ext-diff", "--no-textconv", "--unified=3", range),
  };
}
