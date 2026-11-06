const os = require("node:os");
os.userInfo = () => ({ username: "codex", uid: -1, gid: -1, homedir: process.cwd(), shell: "" });
