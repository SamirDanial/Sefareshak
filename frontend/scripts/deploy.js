#!/usr/bin/env node

import { execSync } from "child_process";
import { existsSync, rmSync, cpSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Paths
const frontendDir = join(__dirname, "..");
const backendDir = join(__dirname, "../../backend");
const distDir = join(frontendDir, "dist");
const publicDir = join(backendDir, "public");

try {
  execSync("npm run build", {
    cwd: frontendDir,
    stdio: "inherit",
  });
} catch (error) {
  console.error("❌ Frontend build failed!");
  process.exit(1);
}

// Step 2: Check if dist directory exists
if (!existsSync(distDir)) {
  console.error("❌ Build output directory not found:", distDir);
  process.exit(1);
}

// Step 3: Remove existing public directory in backend (if it exists)
if (existsSync(publicDir)) {
  rmSync(publicDir, { recursive: true, force: true });
}

try {
  cpSync(distDir, publicDir, {
    recursive: true,
    force: true,
  });
} catch (error) {
  console.error("❌ Failed to copy files:", error.message);
  process.exit(1);
}
