// tr46@0.0.3 (via @datadog/datadog-api-client → cross-fetch → node-fetch → whatwg-url)
// uses the deprecated built-in punycode module (DEP0040). Must run before any npm
// package in the module graph is evaluated, hence the side-effect import at the top
// of index.ts.
import process from "node:process";
(process as unknown as Record<string, unknown>).noDeprecation = true;
