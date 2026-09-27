// Per STANDARDS.md §1, the final installer belongs in the project ROOT, not
// buried in dist/ - electron-builder itself still needs a working output
// directory (win-unpacked/, blockmap, latest.yml), so that stays under
// desktop-agent/dist/ and only the finished .exe is copied up to the repo
// root. Also removes any older TapAct-Setup-*.exe (and its .blockmap) left
// in root from a previous version, so exactly one, correctly-versioned
// installer is ever visible there - this repo had a stale v3.6.0 copy
// sitting at root while dist/ had already moved on to v3.8.0, with nothing
// automatically keeping the two in sync (see clean-dist.cjs, which only
// ever cleaned dist/, never the root copy).
const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '..', '..');
const distDir = path.join(__dirname, '..', 'dist');
const { version } = JSON.parse(fs.readFileSync(path.join(repoRoot, 'version.json'), 'utf8'));

const exeName = `TapAct-Setup-${version}.exe`;
const src = path.join(distDir, exeName);
if (!fs.existsSync(src)) {
  console.error(`Expected installer not found: ${src}`);
  process.exit(1);
}

const stalePatterns = [/^TapAct-Setup-.*\.exe(\.blockmap)?$/i, /^ActionClip-Setup-.*\.exe(\.blockmap)?$/i];
for (const old of fs.readdirSync(repoRoot)) {
  if (stalePatterns.some((re) => re.test(old)) && old !== exeName) {
    fs.unlinkSync(path.join(repoRoot, old));
    console.log(`Removed older installer artifact from root: ${old}`);
  }
}

fs.copyFileSync(src, path.join(repoRoot, exeName));
console.log(`Installer ready at project root: ${exeName}`);
