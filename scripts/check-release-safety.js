import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const FORBIDDEN_TRACKED_PATHS = [
  ".env",
  "data/",
  "backups/",
  "uploads/",
  "uploads-local-test/",
  "uploads-local-test-3002/",
  "scripts/cleanup-delegate-test-data.js",
  "scripts/prepare-delegate-test-data.js",
  "scripts/prepare-local-internal-test-league.js"
];

const REQUIRED_DOCKERIGNORE_LINES = [
  ".env",
  ".env.*",
  "data",
  "backups",
  "uploads",
  "uploads-local-test*",
  "scripts/cleanup-delegate-test-data.js",
  "scripts/prepare-delegate-test-data.js",
  "scripts/prepare-local-internal-test-league.js"
];

const DIST_FORBIDDEN_PATTERNS = [
  /LigatecQA/i,
  /DelegadoTemp/i,
  /ArbitroTemp/i,
  /739214/,
  /ligatec\.test/i,
  /qa\.admin/i,
  /qa\.arbitro/i,
  /liga-interna-ligatec-qa/i,
  /temp-match/i,
  /Club Deportivo Aguilas/i,
  /Halcones FC Delegado/i,
  /super123/i,
  /admin123/i,
  /@demo\.com/i,
  /@ligafut\.local/i,
  /Liga Norte Demo/i,
  /Liga Municipal Ting/i
];

const SCRIPT_FORBIDDEN_PATTERNS = [
  /prepare-local-internal-test-league/,
  /prepare-delegate-test-data/,
  /cleanup-delegate-test-data/
];

const TEXT_EXTENSIONS = new Set([
  ".css",
  ".html",
  ".js",
  ".json",
  ".map",
  ".svg",
  ".txt",
  ".webmanifest"
]);

const problems = [];

function fail(message) {
  problems.push(message);
}

function readFile(relativePath) {
  return fs.readFileSync(path.join(ROOT_DIR, relativePath), "utf8");
}

function gitLsFiles() {
  try {
    return execFileSync("git", ["ls-files", "-z"], { cwd: ROOT_DIR, encoding: "utf8" })
      .split("\0")
      .filter(Boolean);
  } catch (error) {
    fail(`No se pudo leer git ls-files: ${error.message}`);
    return [];
  }
}

function walkFiles(directory) {
  if (!fs.existsSync(directory)) return [];
  const entries = fs.readdirSync(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkFiles(fullPath));
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }
  return files;
}

function assertNoTrackedLocalArtifacts() {
  const tracked = gitLsFiles();
  for (const file of tracked) {
    for (const forbidden of FORBIDDEN_TRACKED_PATHS) {
      const isPrefix = forbidden.endsWith("/");
      if ((isPrefix && file.startsWith(forbidden)) || file === forbidden) {
        fail(`Archivo local/QA versionado por error: ${file}`);
      }
    }
  }
}

function assertDockerIgnore() {
  const dockerignore = readFile(".dockerignore")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  for (const required of REQUIRED_DOCKERIGNORE_LINES) {
    if (!dockerignore.includes(required)) {
      fail(`.dockerignore no excluye: ${required}`);
    }
  }
}

function assertPackageScripts() {
  const packageJson = JSON.parse(readFile("package.json"));
  const scripts = packageJson.scripts || {};
  for (const [name, command] of Object.entries(scripts)) {
    for (const pattern of SCRIPT_FORBIDDEN_PATTERNS) {
      if (pattern.test(command)) {
        fail(`package.json script "${name}" referencia un script local de pruebas: ${command}`);
      }
    }
  }
}

function assertRenderConfig() {
  const renderYaml = readFile("render.yaml");
  if (!/startCommand:\s*npm run start:api/.test(renderYaml)) {
    fail("render.yaml debe iniciar con npm run start:api.");
  }
  if (!/key:\s*SEED_DEMO_DATA[\s\S]*?value:\s*"?false"?/.test(renderYaml)) {
    fail("render.yaml debe definir SEED_DEMO_DATA=false.");
  }
  if (!/key:\s*SEED_DEMO_USERS[\s\S]*?value:\s*"?false"?/.test(renderYaml)) {
    fail("render.yaml debe definir SEED_DEMO_USERS=false.");
  }
}

function assertSeedDataNotStaticallyImported() {
  const sourceFiles = [
    ...walkFiles(path.join(ROOT_DIR, "src")),
    ...walkFiles(path.join(ROOT_DIR, "server"))
  ].filter((file) => {
    const extension = path.extname(file);
    return extension === ".js" || extension === ".jsx";
  });

  for (const file of sourceFiles) {
    if (file.endsWith(path.join("src", "data", "seedData.js"))) continue;
    const source = fs.readFileSync(file, "utf8");
    if (/from\s+["'][^"']*seedData\.js["']/.test(source) || /from\s+["'][^"']*seedData["']/.test(source)) {
      fail(`Import estatico de seedData en frontend: ${path.relative(ROOT_DIR, file)}`);
    }
  }
}

function assertDistClean() {
  const distDir = path.join(ROOT_DIR, "dist");
  if (!fs.existsSync(distDir)) {
    fail("No existe dist/. Ejecuta npm run build antes del chequeo de release.");
    return;
  }

  for (const file of walkFiles(distDir)) {
    const extension = path.extname(file);
    if (!TEXT_EXTENSIONS.has(extension)) continue;
    const source = fs.readFileSync(file, "utf8");
    for (const pattern of DIST_FORBIDDEN_PATTERNS) {
      if (pattern.test(source)) {
        fail(`dist contiene rastro QA/demo (${pattern}) en ${path.relative(ROOT_DIR, file)}`);
      }
    }
  }
}

assertNoTrackedLocalArtifacts();
assertDockerIgnore();
assertPackageScripts();
assertRenderConfig();
assertSeedDataNotStaticallyImported();
assertDistClean();

if (problems.length) {
  console.error("Revision de release fallida:");
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}

console.log("Release safety OK");
console.log("- Sin scripts/datos locales versionados");
console.log("- Docker excluye artefactos QA/locales");
console.log("- Render bloquea seed demo en produccion");
console.log("- dist limpio de rastros QA/demo");
