// Verifica se todo asset local referenciado no HTML existe no repositório.
// Uso: node scripts/check-assets.mjs
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, dirname, resolve, relative } from "node:path";

const root = resolve(process.cwd());
const skip = new Set([".git", "node_modules", ".github", "supabase"]);
const pagesBase = "/Agendamento-de-Chromes/";

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    if (skip.has(name)) return [];
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

const htmlFiles = walk(root).filter((f) => f.endsWith(".html"));
const problems = [];
const attrRe = /\b(?:src|href)\s*=\s*["']([^"']+)["']/gi;

for (const file of htmlFiles) {
  const html = readFileSync(file, "utf8");
  let match;
  while ((match = attrRe.exec(html)) !== null) {
    const ref = match[1].trim();
    if (
      !ref ||
      ref.startsWith("#") ||
      ref.startsWith("//") ||
      ref.startsWith("data:") ||
      /^[a-z]+:/i.test(ref)
    ) {
      continue;
    }
    const clean = ref.split("#")[0].split("?")[0];
    if (!clean) continue;

    let target;
    if (clean.startsWith("/")) {
      // Caminho absoluto do GitHub Pages (ex.: /Agendamento-de-Chromes/assets/...)
      if (clean === pagesBase.slice(0, -1)) {
        target = join(root, "index.html");
      } else if (clean.startsWith(pagesBase)) {
        target = resolve(root, clean.slice(pagesBase.length));
      } else {
        continue; // aponta para outra base/domínio
      }
    } else {
      target = resolve(dirname(file), clean);
    }

    if (!existsSync(target)) {
      problems.push(`${relative(root, file)} -> ${ref}`);
    }
  }
}

if (problems.length) {
  console.error("Assets referenciados e inexistentes:");
  for (const p of problems) console.error("  - " + p);
  process.exit(1);
}

console.log(`OK: ${htmlFiles.length} arquivo(s) HTML, todos os assets existem.`);
