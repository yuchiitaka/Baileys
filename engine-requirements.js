import chalk from "chalk";
import gradient from "gradient-string";

const major = parseInt(process.versions.node.split(".")[0], 10);

if (major < 20) {
  console.clear();

  const title = gradient.pastel.multiline(`
╔════════════════════════════════════════╗
║ 🚫  Node.js Version Unsupported! ❌     ║
╚════════════════════════════════════════╝
`);

  console.log(title);
  console.log(
    chalk.redBright(`   ⚠️  Kamu lagi pakai Node.js ${process.versions.node}`)
  );
  console.log(
    chalk.yellow(`   🔧 Minimal versi yang dibutuhkan: ${chalk.bold("20+")}`)
  );
  console.log();
  console.log(
    chalk.cyan(
      `   👉 Silakan upgrade Node.js kamu ke versi terbaru biar lancar jaya.`
    )
  );
  console.log();
  console.log(gradient.passion("💀 Program dihentikan..."));
  console.log();

  process.exit(1);
}
