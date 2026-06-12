import { readdir, readFile, rm, writeFile } from "node:fs/promises";
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

await removeDistRootArtifacts(targets);
run("npx", ["tsc", "-b"]);

for (const target of targets) {
  run("npx", ["vite", "build"], {
    REDUXSHARE_BROWSER_TARGET: target
  });
  await removeBuildJunk(resolve(rootDir, "dist", target));
  const manifest = await writeTargetManifest(target);
  await createTargetArchive(target, manifest.version);
}

function run(command, args, env = {}, cwd = rootDir) {
  const result = spawnSync(command, args, {
    cwd,
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
        id: "reduxshare@naloaty.me",
        strict_min_version: "140.0",
        data_collection_permissions: {
          required: ["authenticationInfo", "personallyIdentifyingInfo", "websiteActivity", "websiteContent"]
        }
      },
      gecko_android: {
        strict_min_version: "142.0"
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
  return manifest;
}

async function createTargetArchive(target, version) {
  if (typeof version !== "string" || !version.trim()) {
    console.error(`Cannot create ${target} archive: manifest version is missing.`);
    process.exit(1);
  }

  const targetDir = resolve(rootDir, "dist", target);
  const archivePath = resolve(rootDir, "dist", `reduxshare-${target}-v${version}.zip`);

  await rm(archivePath, { force: true });
  run("zip", ["-qr", archivePath, ".", "-x", "*.DS_Store"], {}, targetDir);

  if (target === "firefox") {
    const xpiPath = resolve(rootDir, "dist", `reduxshare-firefox-v${version}.xpi`);
    await rm(xpiPath, { force: true });
    run("zip", ["-qr", xpiPath, ".", "-x", "*.DS_Store"], {}, targetDir);
  }
}

async function removeDistRootArtifacts(targetsToBuild) {
  const distDir = resolve(rootDir, "dist");
  const legacyBuildEntries = new Set([".DS_Store", "_locales", "assets", "icons", "index.html", "manifest.json"]);

  let entries;

  try {
    entries = await readdir(distDir, { withFileTypes: true });
  } catch {
    return;
  }

  await Promise.all(
    entries.map(async (entry) => {
      const entryPath = resolve(distDir, entry.name);

      if (legacyBuildEntries.has(entry.name)) {
        await rm(entryPath, { force: true, recursive: true });
        return;
      }

      if (
        entry.isFile() &&
        targetsToBuild.some((target) => {
          return (
            entry.name.startsWith(`reduxshare-${target}-v`) &&
            (entry.name.endsWith(".zip") || (target === "firefox" && entry.name.endsWith(".xpi")))
          );
        })
      ) {
        await rm(entryPath, { force: true });
      }
    })
  );
}

async function removeBuildJunk(directory) {
  let entries;

  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    return;
  }

  await Promise.all(
    entries.map(async (entry) => {
      const entryPath = resolve(directory, entry.name);

      if (entry.name === ".DS_Store") {
        await rm(entryPath, { force: true });
        return;
      }

      if (entry.isDirectory()) {
        await removeBuildJunk(entryPath);
      }
    })
  );
}
