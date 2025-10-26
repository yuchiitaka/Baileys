const major = parseInt(process.versions.node.split(".")[0], 10);

// Warna manual pakai ANSI escape code
const colors = {
  reset: "\x1b[0m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  magenta: "\x1b[35m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
};

// Fungsi gradient manual sederhana
function gradientText(text) {
  const gradients = [
    "\x1b[38;2;255;105;180m", // pink
    "\x1b[38;2;255;182;193m", // lightpink
    "\x1b[38;2;173;216;230m", // lightblue
    "\x1b[38;2;152;251;152m", // lightgreen
    "\x1b[38;2;255;255;102m", // yellowish
  ];
  let result = "";
  for (let i = 0; i < text.length; i++) {
    result += gradients[i % gradients.length] + text[i];
  }
  return result + colors.reset;
}

if (major < 20) {
  console.clear();

  const title = `
╔════════════════════════════════════════╗
║ 🚫  Node.js Version Unsupported! ❌     ║
╚════════════════════════════════════════╝
`;

  console.log(gradientText(title));
  console.log(
    `${colors.red}${colors.bold}   ⚠️  Kamu lagi pakai Node.js ${process.versions.node}${colors.reset}`
  );
  console.log(
    `${colors.yellow}   🔧 Minimal versi yang dibutuhkan: ${colors.bold}20+${colors.reset}`
  );
  console.log();
  console.log(
    `${colors.cyan}   👉 Silakan upgrade Node.js kamu ke versi terbaru biar lancar jaya.${colors.reset}`
  );
  console.log();
  console.log(
    `${colors.magenta}${colors.bold}💀 Program dihentikan...${colors.reset}`
  );
  console.log();

  process.exit(1);
}
