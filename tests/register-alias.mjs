// Resolves the "@/" tsconfig path alias for the plain node:test runner (no bundler
// involved), so tests can import app/lib modules the same way the app does. Uses
// module.register (stable since Node 20.6) rather than the newer registerHooks, to
// match the Node 22.x runtime pinned in Dockerfile/CI without relying on a specific patch.
import { register } from "node:module";
register("./alias-loader.mjs", import.meta.url);
