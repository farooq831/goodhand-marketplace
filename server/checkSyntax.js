const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

function getJavaScriptFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return getJavaScriptFiles(entryPath);
    return entry.name.endsWith(".js") ? [entryPath] : [];
  });
}

for (const file of getJavaScriptFiles(__dirname)) {
  const result = spawnSync(process.execPath, ["--check", file], { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status || 1);
}
