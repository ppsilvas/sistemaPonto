#!/usr/bin/env node
/**
 * PreToolUse security hook: blocks agents from reading, writing, editing,
 * searching, or inspecting `.env` files via file tools, shell commands, or
 * workflow scripts, while allowing safe template files (`.env.example`, etc.).
 */

import fs from "node:fs";
import path from "node:path";

const ALLOWED_ENV_TEMPLATES = new Set([
  ".env.example",
  ".env.sample",
  ".env.template",
  ".env.dist",
  ".env.defaults",
]);

const PATH_ARG_KEYS = new Set([
  "path",
  "targetfile",
  "filepath",
  "absolutepath",
  "searchpath",
  "searchdirectory",
  "directorypath",
  "targetpaths",
  "includes",
  "pattern",
  "scriptpath",
]);

const COMMAND_ARG_KEYS = new Set(["commandline", "command"]);
const SCRIPT_ARG_KEYS = new Set(["script"]);

function respond(payload) {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

function isBlockedEnvSegment(rawSegment) {
  const segment = rawSegment.trim().replace(/^["'`]+|["'`]+$/g, "").toLowerCase();
  if (!segment) return false;
  if (ALLOWED_ENV_TEMPLATES.has(segment)) return false;
  if (segment === ".env") return true;
  if (segment.startsWith(".env.")) return true;
  if (/^\.env[*?[\]]/.test(segment)) return true;
  return false;
}

function pathTargetsEnv(value) {
  if (typeof value !== "string" || !value.trim()) return false;
  const normalized = value.replace(/\\/g, "/");
  const segments = normalized.split("/");
  return segments.some(isBlockedEnvSegment);
}

function textReferencesEnvFile(text) {
  if (typeof text !== "string" || !text.trim()) return false;

  // Match `.env` file references not preceded by identifier/variable chars
  // (avoids false positives on `process.env`, `import.meta.env`, `dotenv`, `.venv`).
  const envTokenRegex =
    /(?:^|[\s"'`\/\\=(,;|&<>{}\[:])(\.env(?:\.[A-Za-z0-9._*?[\]-]+|[*?[\]][^\s"'`;|&<>)]*)?)(?=$|[\s"'`\/\\),;|&<>{}\]:])/gi;

  for (const match of text.matchAll(envTokenRegex)) {
    const token = (match[1] ?? "").toLowerCase();
    if (!token) continue;
    if (ALLOWED_ENV_TEMPLATES.has(token)) continue;
    return true;
  }

  return false;
}

function collectValuesByKey(obj, allowedKeys, out = []) {
  if (!obj || typeof obj !== "object") return out;
  if (Array.isArray(obj)) {
    for (const item of obj) {
      if (typeof item === "string") out.push(item);
      else collectValuesByKey(item, allowedKeys, out);
    }
    return out;
  }

  for (const [key, val] of Object.entries(obj)) {
    const lowerKey = key.toLowerCase();
    if (allowedKeys.has(lowerKey)) {
      if (typeof val === "string") out.push(val);
      else if (Array.isArray(val)) {
        for (const item of val) {
          if (typeof item === "string") out.push(item);
        }
      }
    } else if (val && typeof val === "object") {
      collectValuesByKey(val, allowedKeys, out);
    }
  }
  return out;
}

function isPathInsideAllowedRoots(targetPath, payload) {
  if (typeof targetPath !== "string" || !targetPath.trim()) return true;
  if (!path.isAbsolute(targetPath)) return true;

  const resolvedTarget = path.resolve(targetPath).toLowerCase();
  const roots = [];

  if (Array.isArray(payload.workspacePaths)) {
    for (const wp of payload.workspacePaths) {
      if (typeof wp === "string" && wp) roots.push(path.resolve(wp).toLowerCase());
    }
  }
  if (typeof payload.cwd === "string" && payload.cwd) {
    roots.push(path.resolve(payload.cwd).toLowerCase());
  }
  if (typeof payload.artifactDirectoryPath === "string" && payload.artifactDirectoryPath) {
    roots.push(path.resolve(payload.artifactDirectoryPath).toLowerCase());
  }
  if (typeof payload.transcriptPath === "string" && payload.transcriptPath) {
    roots.push(path.dirname(path.resolve(payload.transcriptPath)).toLowerCase());
  }

  // Allow Antigravity internal customization/MCP metadata directories (non-.env).
  const normalizedTarget = resolvedTarget.replace(/\\/g, "/");
  if (normalizedTarget.includes("/.gemini/")) {
    return true;
  }

  return roots.some(
    (root) => resolvedTarget === root || resolvedTarget.startsWith(root + path.sep),
  );
}

function evaluateHook(payload) {
  const toolCall = payload?.toolCall ?? {};
  const toolName = String(toolCall.name ?? "").toLowerCase();
  const args = toolCall.args ?? {};

  const denyMessage =
    "Acesso bloqueado pelo hook de segurança (block-env-access): agentes não podem ler, editar, buscar ou inspecionar arquivos .env. Utilize .env.example como referência de variáveis.";

  // 1. Check file/directory/glob path arguments across all matched tools.
  const pathValues = collectValuesByKey(args, PATH_ARG_KEYS);
  for (const val of pathValues) {
    if (pathTargetsEnv(val)) {
      return { decision: "deny", reason: denyMessage };
    }
  }

  // 2. Check shell commands (`run_command`).
  if (toolName === "run_command") {
    const commandValues = collectValuesByKey(args, COMMAND_ARG_KEYS);
    for (const cmd of commandValues) {
      if (textReferencesEnvFile(cmd)) {
        return { decision: "deny", reason: denyMessage };
      }
    }

    // Never weaken user approval when BypassSandbox is requested.
    if (args.BypassSandbox === true || args.bypassSandbox === true) {
      return {
        decision: "ask",
        reason: "Comando solicita execução fora da sandbox (BypassSandbox).",
      };
    }

    return { decision: "allow" };
  }

  // 3. Check workflow scripts (`run_workflow`).
  if (toolName === "run_workflow") {
    const scriptValues = collectValuesByKey(args, SCRIPT_ARG_KEYS);
    for (const script of scriptValues) {
      if (textReferencesEnvFile(script)) {
        return { decision: "deny", reason: denyMessage };
      }
    }
    return { decision: "allow" };
  }

  // 4. For file tools not targeting .env, preserve user prompt if outside known roots.
  for (const val of pathValues) {
    if (!isPathInsideAllowedRoots(val, payload)) {
      return {
        decision: "ask",
        reason: "Acesso a caminho fora do workspace requer confirmação.",
      };
    }
  }

  return { decision: "allow" };
}

try {
  const rawInput = fs.readFileSync(0, "utf8").trim();
  if (!rawInput) {
    respond({ decision: "ask", reason: "Payload vazio recebido pelo hook block-env-access." });
    process.exit(0);
  }
  const payload = JSON.parse(rawInput);
  respond(evaluateHook(payload));
} catch (err) {
  respond({
    decision: "ask",
    reason: `Erro ao avaliar hook block-env-access: ${err instanceof Error ? err.message : String(err)}`,
  });
}
