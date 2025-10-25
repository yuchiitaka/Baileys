import makeWASocket from './Socket';
export * from '../WAProto';
export * from './Utils';
export * from './Types';
export * from './Store';
export * from './Defaults';
export * from './WABinary';
export * from './WAM';
export * from './WAUSync';

export type WASocket = ReturnType<typeof makeWASocket>;

// Banner function
function displayBanner(): void {
  const chalk = {
    blueBright: { bold: (text: string) => text },
    whiteBright: (text: string) => text,
    greenBright: (text: string) => text,
    blue: { bold: (text: string) => text },
    white: { bold: (text: string) => text }
  };

  // Try to use actual chalk if available, otherwise use fallback
  try {
    const realChalk = require('chalk');
    console.log(realChalk.blueBright.bold("\n🚀 Yuichi - Baileys 🚀\n"));
    console.log(realChalk.whiteBright("Terima Kasih Telah Menggunakan Baileys Modifikasi Ini. Jika ada yang error bisa hubungi owner di bawah ini !!"));
    console.log(realChalk.blue.bold(">-----------------------------------<"));
    console.log(realChalk.whiteBright.bold("— INFORMATION"));
    console.log(realChalk.whiteBright.bold("Telegram : ") + realChalk.greenBright("@zero_hosting"));
    console.log(realChalk.whiteBright.bold("Channel : ") + realChalk.greenBright("@about_meyuchi"));
    console.log(realChalk.blue.bold(">-----------------------------------<"));
  } catch (error) {
    // Fallback without chalk
    console.log("\n🚀 Yuichi - Baileys 🚀\n");
    console.log("Terima Kasih Telah Menggunakan Baileys Modifikasi Ini. Jika ada yang error bisa hubungi owner di bawah ini !!");
    console.log(">-----------------------------------<");
    console.log("— INFORMATION");
    console.log("Telegram : @zero_hosting");
    console.log("Channel : @about_meyuchi");
    console.log(">-----------------------------------<");
  }
}

// Display banner when imported
displayBanner();

export { makeWASocket };
export default makeWASocket;