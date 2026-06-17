const { spawnSync } = require("child_process");

const forwardedArgs = process.argv.slice(2).filter((arg) => arg !== "--run");
const result = spawnSync(
  process.platform === "win32" ? "npx.cmd" : "npx",
  ["jest", "--runInBand", ...forwardedArgs],
  { stdio: "inherit" }
);

process.exit(result.status === null ? 1 : result.status);
