// Bloqueia chaves realmente sensíveis no repositório.
// A anon key é pública por definição e é permitida; a service_role não.
// Uso: node scripts/check-secrets.mjs
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve, relative } from "node:path";

const root = resolve(process.cwd());
const skipDirs = new Set([".git", "node_modules", "dist", ".next"]);
const skipExt = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".pdf", ".zip"]);

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    if (skipDirs.has(name)) return [];
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

const patterns = [
  { name: "Supabase personal access token", re: /sbp_[A-Za-z0-9]{20,}/g },
  { name: "GitHub fine-grained token", re: /github_pat_[A-Za-z0-9_]{20,}/g },
  { name: "GitHub classic token", re: /ghp_[A-Za-z0-9]{30,}/g },
  { name: "Chave privada", re: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g },
];

function jwtRole(token) {
  try {
    const payload = token.split(".")[1];
    const json = Buffer.from(payload.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
    return JSON.parse(json).role;
  } catch {
    return null;
  }
}

const findings = [];

for (const file of walk(root)) {
  if (skipExt.has(file.slice(file.lastIndexOf(".")).toLowerCase())) continue;
  const text = readFileSync(file, "utf8");

  for (const { name, re } of patterns) {
    re.lastIndex = 0;
    if (re.test(text)) findings.push(`${relative(root, file)}: ${name}`);
  }

  // service_role é sempre sensível; anon é esperada e permitida.
  for (const match of text.match(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g) || []) {
    if (jwtRole(match) === "service_role") {
      findings.push(`${relative(root, file)}: JWT com role=service_role`);
    }
  }
}

if (findings.length) {
  console.error("Segredos encontrados (remova antes de commitar):");
  for (const f of findings) console.error("  - " + f);
  process.exit(1);
}

console.log("OK: nenhuma chave sensível encontrada.");
