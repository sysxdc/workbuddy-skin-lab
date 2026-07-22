#!/usr/bin/env node
import { realpath } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const FIXED_TIMEOUT_MS = 600_000;

function parse(argv) {
  const separator = argv.indexOf("--");
  if (separator < 0) throw new Error("缺少 NoneLinear 参数分隔符");
  const control = argv.slice(0, separator);
  const passthrough = argv.slice(separator + 1);
  let skillScript = null;
  for (let index = 0; index < control.length; index += 2) {
    if (control[index] !== "--skill-script" || !control[index + 1]) throw new Error("受控调用器参数无效");
    skillScript = control[index + 1];
  }
  if (!skillScript) throw new Error("缺少 --skill-script");
  return { skillScript, passthrough };
}

export async function run(argv, dependencies = {}) {
  const { skillScript, passthrough } = parse(argv);
  const resolved = await realpath(skillScript);
  const module = await import(pathToFileURL(resolved).href);
  if (typeof module.run !== "function") throw new Error("$nonelinear-image 未导出受支持的 run() 接口");
  return module.run(passthrough, { timeoutMs: dependencies.timeoutMs ?? FIXED_TIMEOUT_MS });
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  run(process.argv.slice(2)).then(
    (result) => {
      process.stdout.write(`${JSON.stringify(result)}\n`);
      if (result?.status !== "completed") process.exitCode = 1;
    },
    (error) => {
      process.stdout.write(`${JSON.stringify({ status: "failed", code: "skill_transport_error", error: String(error?.message || error).slice(0, 500) })}\n`);
      process.exitCode = 1;
    },
  );
}
