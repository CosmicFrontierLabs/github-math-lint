import * as core from "@actions/core";
import * as glob from "@actions/glob";
import { promises as fs } from "node:fs";
import path from "node:path";
import { hasSkippedExtension, scanTarget } from "./scan.js";
import type { Finding, ScanTarget } from "./types.js";

function entries(value: string): string[] {
  return value.split(/[\n,]/).map((entry) => entry.trim()).filter(Boolean);
}

function booleanInput(name: string): boolean {
  return core.getBooleanInput(name, { required: false });
}

async function pullRequestTarget(): Promise<ScanTarget | undefined> {
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (!eventPath) return undefined;
  const event = JSON.parse(await fs.readFile(eventPath, "utf8")) as {
    pull_request?: { title?: string; body?: string | null };
  };
  if (!event.pull_request) return undefined;
  return {
    label: "pull-request-text.md",
    text: `# ${event.pull_request.title ?? ""}\n\n${event.pull_request.body ?? ""}\n`,
  };
}

function summaryCell(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;")
    .replaceAll("|", "\\|")
    .replaceAll("\n", " ");
}

async function writeSummary(findings: Finding[], filesScanned: number, scannedPrText: boolean): Promise<void> {
  core.summary.addHeading("GitHub Math Lint");
  core.summary.addRaw(`Scanned ${filesScanned} file(s)${scannedPrText ? " plus pull request text" : ""} and found ${findings.length} issue(s).`);
  if (findings.length > 0) {
    core.summary.addTable([
      [
        { data: "Location", header: true },
        { data: "Rule", header: true },
        { data: "Finding", header: true },
      ],
      ...findings.map((item) => [
        `${summaryCell(item.file)}:${item.line}:${item.column}`,
        item.rule,
        `${summaryCell(item.message)}<br><code>${summaryCell(item.excerpt)}</code>`,
      ]),
    ]);
  }
  await core.summary.write();
}

async function run(): Promise<void> {
  const includes = entries(core.getInput("paths"));
  const excludes = entries(core.getInput("exclude"));
  const skippedExtensions = new Set(entries(core.getInput("skip-extensions")).map((extension) => extension.startsWith(".") ? extension.toLowerCase() : `.${extension.toLowerCase()}`));
  const patterns = [...includes, ...excludes.map((entry) => `!${entry.replace(/^!/, "")}`)].join("\n");
  const matcher = await glob.create(patterns, { followSymbolicLinks: false, implicitDescendants: false });
  const workspace = process.env.GITHUB_WORKSPACE ?? process.cwd();
  const targets: ScanTarget[] = [];

  for await (const file of matcher.globGenerator()) {
    const relative = path.relative(workspace, file).replaceAll(path.sep, "/");
    if (hasSkippedExtension(relative, skippedExtensions)) {
      core.debug(`Skipping ${relative} because its extension is excluded`);
      continue;
    }
    const stat = await fs.stat(file);
    if (!stat.isFile()) continue;
    targets.push({ label: relative, annotationFile: relative, text: await fs.readFile(file, "utf8") });
  }

  const filesScanned = targets.length;
  let scannedPrText = false;
  if (booleanInput("scan-pr-text")) {
    const prTarget = await pullRequestTarget();
    if (prTarget) {
      targets.push(prTarget);
      scannedPrText = true;
    }
  }

  const findings = targets.flatMap(scanTarget);
  const annotationsEnabled = booleanInput("annotations");
  const annotationLimit = Number.parseInt(core.getInput("max-annotations"), 10);
  if (!Number.isSafeInteger(annotationLimit) || annotationLimit < 0) {
    throw new Error("max-annotations must be a non-negative integer");
  }

  findings.forEach((item, index) => {
    const rendered = `${item.file}:${item.line}:${item.column}: [${item.rule}] ${item.message}\n  ${item.excerpt}`;
    core.info(rendered);
    if (annotationsEnabled && index < annotationLimit && item.file !== "pull-request-text.md") {
      core.error(item.message, {
        title: `GitHub Math Lint: ${item.rule}`,
        file: item.file,
        startLine: item.line,
        endLine: item.line,
        startColumn: item.column,
        endColumn: item.column,
      });
    }
  });
  if (annotationsEnabled && findings.length > annotationLimit) {
    core.info(`${findings.length - annotationLimit} additional finding(s) are in the complete log, job summary, and JSON report.`);
  }

  const reportPathInput = core.getInput("report-path").trim();
  let reportPath = "";
  if (reportPathInput) {
    reportPath = path.resolve(workspace, reportPathInput);
    const relativeReportPath = path.relative(workspace, reportPath);
    if (relativeReportPath.startsWith("..") || path.isAbsolute(relativeReportPath)) {
      throw new Error("report-path must stay within GITHUB_WORKSPACE");
    }
    await fs.mkdir(path.dirname(reportPath), { recursive: true });
    await fs.writeFile(reportPath, `${JSON.stringify({ filesScanned, scannedPrText, findings }, null, 2)}\n`);
    core.info(`Wrote complete JSON report to ${path.relative(workspace, reportPath)}`);
  }

  core.setOutput("findings-count", findings.length.toString());
  core.setOutput("files-scanned", filesScanned.toString());
  core.setOutput("report-path", reportPath ? path.relative(workspace, reportPath) : "");
  await writeSummary(findings, filesScanned, scannedPrText);

  if (findings.length > 0 && booleanInput("fail-on-findings")) {
    core.setFailed(`Found ${findings.length} GitHub math rendering issue(s)`);
  } else if (findings.length === 0) {
    core.info(`No GitHub math rendering issues found in ${filesScanned} file(s)`);
  }
}

run().catch((error: unknown) => core.setFailed(error instanceof Error ? error.message : String(error)));
