import { pathToFileURL } from "node:url";
import path from "node:path";
const root = path.resolve(import.meta.dirname, "..");
export function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    const rel = specifier.slice(2);
    const withExt = path.extname(rel) ? rel : `${rel}.ts`;
    return nextResolve(pathToFileURL(path.join(root, withExt)).href, context);
  }
  return nextResolve(specifier, context);
}
