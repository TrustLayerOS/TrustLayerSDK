import { defineConfig } from "tsup";

// NOTE: Node.js 18+ is required for server-side usage.
// The browser signal collectors (device.ts, behavior.ts) use window/document
// globals which are guarded at runtime. crypto.subtle is available natively
// in Node 18+ — no polyfill needed.

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["cjs", "esm"],
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: false,
  treeshake: true,
  minify: false,
  target: "es2020",
  // Use "browser" for the ESM bundle and "node" for CJS so that
  // tree-shaking removes DOM globals in Node builds.
  platform: "neutral",
  outDir: "dist",
  define: {
    // Allow consumers to detect the SDK version at runtime
    "process.env.TRUSTLAYER_SDK_VERSION": JSON.stringify("0.1.0"),
  },
});
