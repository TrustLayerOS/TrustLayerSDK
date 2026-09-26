import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: {
      index: "src/index.ts",
      react: "src/react/index.ts",
      middleware: "src/middleware/index.ts",
      mobile: "src/mobile/index.ts",
    },
    format: ["cjs", "esm"],
    dts: true,
    sourcemap: true,
    clean: true,
    splitting: false,
    treeshake: true,
    minify: false,
    target: "es2020",
    platform: "neutral",
    outDir: "dist",
    external: ["react"],
    define: {
      "process.env.TRUSTLAYER_SDK_VERSION": JSON.stringify("0.1.0"),
    },
  },
  {
    entry: { "trustlayer.iife": "src/index.ts" },
    format: ["iife"],
    globalName: "TrustLayerSDK",
    dts: false,
    sourcemap: true,
    clean: false,
    minify: true,
    target: "es2020",
    platform: "browser",
    outDir: "dist",
    define: {
      "process.env.TRUSTLAYER_SDK_VERSION": JSON.stringify("0.1.0"),
    },
  },
]);
