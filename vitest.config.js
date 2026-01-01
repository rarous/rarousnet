import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    reporters: ["default", "junit", "html"],
    outputFile: {
      junit: "./results/vite.xml",
      html: "./results/vite.html",
    },
    projects:  [
      "workers/*",
      "www.rarous.net",
    ]
  }
 });
