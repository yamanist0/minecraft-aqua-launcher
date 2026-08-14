const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const { spawn } = require('child_process');

const MAX_BUFFERED_LINES = 3000;

class GameConsoleService {
  constructor(root) {
    this.root = root;
    this.logPath = null;
    this.stream = null;
    this.lines = [];
    this.opened = false;
  }

  get enabled() {
    return Boolean(this.stream);
  }

  open() {
    if (this.opened) return;
    this.opened = true;

    const logsDir = path.join(this.root, 'logs');
    fs.mkdirSync(logsDir, { recursive: true });

    const stamp = new Date()
      .toISOString()
      .replace(/[:|.]/g, '-');
    this.logPath = path.join(logsDir, `launcher-${stamp}.log`);
    this.stream = fs.createWriteStream(this.logPath, {
      flags: 'a',
      encoding: 'utf8',
    });

    this.writeLine('======================================================');
    this.writeLine(`Aqua Launcher konsolu | ${new Date().toLocaleString()}`);
    this.writeLine('Oyun baslatildiginda Java ciktisi ve hatalar burada');
    this.writeLine('gorunur. Pencereyi kapatmak icin "exit" yazin.');
    this.writeLine(`Log dosyasi: ${this.logPath}`);
    this.writeLine('======================================================');
    this.openTailWindow();
  }

  openTailWindow() {
    try {
      const batPath = path.join(app.getPath('userData'), 'console-starter.bat');
      const logArg = String(this.logPath).replace(/'/g, "''");
      const psTail = `Get-Content -LiteralPath '${logArg}' -Encoding UTF8 -Wait -Tail 300`;
      const bat = [
        '@echo off',
        'mode con: cols=130 lines=55',
        'title Aqua Launcher - Oyun Konsolu',
        'powershell -NoExit -NoProfile -ExecutionPolicy Bypass -Command "' + psTail + '"',
        '',
      ].join('\r\n');
      fs.writeFileSync(batPath, bat, { encoding: 'utf8' });

      // `start` in cmd açar a new console window that runs the batch tail.
      this.consoleProcess = spawn(
        'cmd.exe',
        ['/c', 'start', '', `"${batPath}"`],
        { stdio: 'ignore', windowsHide: false },
      );
    } catch (e) {
      this.writeLine(`[Konsol] Pencere acilamadi: ${e.message}`);
    }
  }

  write(text) {
    this.writeLine(text);
  }

  writeLine(text) {
    if (!this.stream) return;
    const line = `${text}`;
    this.lines.push(line);
    if (this.lines.length > MAX_BUFFERED_LINES) this.lines.shift();
    this.stream.write(`${line}\r\n`);
  }

  writeChunk(text) {
    if (!this.stream) return;
    const pieces = String(text).split(/\r?\n/);
    for (const piece of pieces) this.writeLine(piece);
  }

  async close() {
    if (this.stream) {
      this.writeLine('');
      this.writeLine('[Konsol] Bu oturumun log akisi bitti. Pencere acik kaliyor.');
      await new Promise((resolve) => this.stream.end(resolve));
      this.stream = null;
    }
  }
}

module.exports = { GameConsoleService };