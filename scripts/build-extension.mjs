import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const VALID_TARGETS = new Set(["chrome", "firefox"]);
const requestedTarget = process.argv[2] ?? "chrome";
const targets = requestedTarget === "all" ? ["chrome", "firefox"] : [requestedTarget];
const rootDir = resolve(import.meta.dirname, "..");

for (const target of targets) {
  if (!VALID_TARGETS.has(target)) {
    console.error(`Unknown extension build target: ${target}`);
    console.error(`Expected one of: ${[...VALID_TARGETS, "all"].join(", ")}`);
    process.exit(1);
  }
}

run("npx", ["tsc", "-b"]);

for (const target of targets) {
  run("npx", ["vite", "build"], {
    REDUXSHARE_BROWSER_TARGET: target
  });
  await writeTargetManifest(target);
}

function run(command, args, env = {}) {
  const result = spawnSync(command, args, {
    cwd: rootDir,
    env: {
      ...process.env,
      ...env
    },
    stdio: "inherit",
    shell: process.platform === "win32"
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

async function writeTargetManifest(target) {
  const manifestPath = resolve(rootDir, "dist", target, "manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));

  if (target === "firefox") {
    manifest.background = {
      scripts: ["assets/external.js"],
      type: "module"
    };
    manifest.browser_specific_settings = {
      gecko: {
        strict_min_version: "128.0"
      }
    };
  } else {
    manifest.background = {
      service_worker: "assets/external.js",
      type: "module"
    };
    delete manifest.browser_specific_settings;
  }

  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}
