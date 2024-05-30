import { createRequire } from "node:module";
import fsp from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { relative, dirname, resolve } from "pathe";
import jiti from "jiti";
import { consola } from "consola";
import chalk from "chalk";
import { getProperty } from "dot-prop";
import { upperFirst } from "scule";
import { Nitro } from "nitropack/types";

export function hl(str: string) {
  return chalk.cyan(str);
}

export function prettyPath(p: string, highlight = true) {
  p = relative(process.cwd(), p);
  return highlight ? hl(p) : p;
}

export function compileTemplate(contents: string) {
  return (params: Record<string, any>) =>
    contents.replace(/{{ ?([\w.]+) ?}}/g, (_, match) => {
      const val = getProperty<Record<string, string>, string>(params, match);
      if (!val) {
        consola.warn(
          `cannot resolve template param '${match}' in ${contents.slice(0, 20)}`
        );
      }
      return val || `${match}`;
    });
}

export function jitiImport(dir: string, path: string) {
  return jiti(dir, { interopDefault: true })(path);
}

export function tryImport(dir: string, path: string) {
  try {
    return jitiImport(dir, path);
  } catch {
    // Ignore
  }
}

export async function writeFile(
  file: string,
  contents: Buffer | string,
  log = false
) {
  await fsp.mkdir(dirname(file), { recursive: true });
  await fsp.writeFile(
    file,
    contents,
    typeof contents === "string" ? "utf8" : undefined
  );
  if (log) {
    consola.info("Generated", prettyPath(file));
  }
}

export function resolvePath(
  path: string,
  nitroOptions: Nitro["options"],
  base?: string
): string {
  if (typeof path !== "string") {
    throw new TypeError("Invalid path: " + path);
  }

  // TODO: Skip if no template used
  path = compileTemplate(path)(nitroOptions);
  for (const base in nitroOptions.alias) {
    if (path.startsWith(base)) {
      path = nitroOptions.alias[base] + path.slice(base.length);
    }
  }

  return resolve(base || nitroOptions.srcDir, path);
}

export function resolveFile(
  path: string,
  base = ".",
  extensions = [".js", ".ts", ".mjs", ".cjs", ".json"]
): string | undefined {
  path = resolve(base, path);
  if (existsSync(path)) {
    return path;
  }
  for (const ext of extensions) {
    const p = path + ext;
    if (existsSync(p)) {
      return p;
    }
  }
}

export function replaceAll(input: string, from: string, to: string) {
  return input.replace(new RegExp(from, "g"), to);
}

export async function isDirectory(path: string) {
  try {
    return (await fsp.stat(path)).isDirectory();
  } catch {
    return false;
  }
}

const _getDependenciesMode = {
  dev: ["devDependencies"],
  prod: ["dependencies"],
  all: ["devDependencies", "dependencies"],
};
const _require = createRequire(import.meta.url);
export function getDependencies(
  dir: string,
  mode: keyof typeof _getDependenciesMode = "all"
) {
  const fields = _getDependenciesMode[mode];
  const pkg = _require(resolve(dir, "package.json"));
  const dependencies = [];
  for (const field of fields) {
    if (pkg[field]) {
      for (const name in pkg[field]) {
        dependencies.push(name);
      }
    }
  }
  return dependencies;
}

export function readPackageJson(
  packageName: string,
  _require: NodeRequire = createRequire(import.meta.url)
) {
  try {
    return _require(`${packageName}/package.json`);
  } catch (error: any) {
    if (error?.code === "ERR_PACKAGE_PATH_NOT_EXPORTED") {
      const pkgModulePaths = /^(.*\/node_modules\/).*$/.exec(
        _require.resolve(packageName)
      );
      for (const pkgModulePath of pkgModulePaths || []) {
        const path = resolve(pkgModulePath, packageName, "package.json");
        if (existsSync(path)) {
          return JSON.parse(readFileSync(path, "utf8"));
        }
        continue;
      }

      throw error;
    }
    throw error;
  }
}

export async function retry(fn: () => Promise<void>, retries: number) {
  let retry = 0;
  let lastError: any;
  while (retry++ < retries) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 2));
    }
  }
  throw lastError;
}

export function nitroServerName(nitro: Nitro) {
  return nitro.options.framework.name === "nitro"
    ? "Nitro Server"
    : `${upperFirst(nitro.options.framework.name as string)} Nitro server`;
}
