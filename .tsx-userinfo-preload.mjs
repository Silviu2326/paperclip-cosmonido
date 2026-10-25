import os from "node:os";
import { syncBuiltinESMExports } from "node:module";
os.userInfo = () => ({ username: "codex", uid: -1, gid: -1, homedir: process.cwd(), shell: "" });
syncBuiltinESMExports();
