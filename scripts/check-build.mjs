import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve, relative, isAbsolute, join } from 'node:path';
import { Script } from 'node:vm';

const dist = resolve('dist');
const manifestFile = join(dist, 'manifest.json');
if (!existsSync(manifestFile)) throw new Error('Missing dist/manifest.json');
const manifest = JSON.parse(readFileSync(manifestFile, 'utf8'));
const packageMetadata = JSON.parse(readFileSync(resolve('package.json'), 'utf8'));
if (manifest.manifest_version !== 3 || manifest.name !== 'JobLens'
  || manifest.version !== packageMetadata.version || packageMetadata.name !== 'joblens') {
  throw new Error('JobLens package and MV3 manifest metadata must agree');
}


function checkFile(file, label) {
  if (typeof file !== 'string' || !file) throw new Error(`Missing ${label} path in manifest`);
  const fullPath = resolve(dist, file);
  const withinDist = relative(dist, fullPath);
  if (withinDist.startsWith('..') || isAbsolute(withinDist) || !existsSync(fullPath) || !statSync(fullPath).isFile()) {
    throw new Error(`${label} is missing from dist: ${file}`);
  }
  return fullPath;
}

if (manifest.background?.type !== 'module') {
  throw new Error('Background service worker must remain a module');
}
checkFile(manifest.background.service_worker, 'background service worker');
checkFile(manifest.side_panel?.default_path, 'side panel');
for (const [size, file] of Object.entries(manifest.icons || {})) checkFile(file, `icon ${size}`);
for (const [size, file] of Object.entries(manifest.action?.default_icon || {})) checkFile(file, `action icon ${size}`);
if (manifest.action?.default_popup) checkFile(manifest.action.default_popup, 'action popup');

let contentCount = 0;
for (const [index, entry] of (manifest.content_scripts || []).entries()) {
  for (const file of entry.js || []) {
    const fullPath = checkFile(file, `content script ${index}`);
    // Chrome loads manifest content scripts as classic scripts. This parser rejects
    // top-level import/export and import.meta without executing the file.
    try {
      new Script(readFileSync(fullPath, 'utf8'), { filename: fullPath });
    } catch (error) {
      throw new Error(`Content script is not a standalone classic script: ${file}\n${error.message}`);
    }
    contentCount += 1;
  }
  for (const file of entry.css || []) checkFile(file, `content stylesheet ${index}`);
}
if (!contentCount) throw new Error('Manifest has no content scripts to validate');

if (manifest.default_locale) checkFile(`_locales/${manifest.default_locale}/messages.json`, 'default locale');
checkFile('_locales/zh_CN/messages.json', 'Simplified Chinese locale');
console.log(`Build check passed: ${contentCount} standalone content script(s); manifest files exist.`);
