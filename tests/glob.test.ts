import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { create } from "@actions/glob";
import { expect, test } from "vitest";

test("discovers Markdown while excluding generated directories", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "math-lint-glob-"));
  try {
    await mkdir(path.join(directory, "dist"));
    await writeFile(path.join(directory, "README.md"), "# Example\n");
    await writeFile(path.join(directory, "dist", "generated.md"), "# Generated\n");
    const root = directory.replaceAll(path.sep, "/");
    const matcher = await create(`${root}/**/*.md\n!${root}/dist/**`, {
      followSymbolicLinks: false,
      implicitDescendants: false,
    });
    expect(await matcher.glob()).toEqual([path.join(directory, "README.md")]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
