import fs from 'fs';
import path from 'path';

const rootPkgPath = path.resolve(import.meta.dirname, '../../package.json');
const appPkgPath = path.resolve(import.meta.dirname, '../../release/app/package.json');

const rootPkg = JSON.parse(fs.readFileSync(rootPkgPath, 'utf-8'));
const appPkg = JSON.parse(fs.readFileSync(appPkgPath, 'utf-8'));

if (rootPkg.version !== appPkg.version) {
    appPkg.version = rootPkg.version;
    fs.writeFileSync(appPkgPath, JSON.stringify(appPkg, null, '    ') + '\n');
    console.log(`Synced version ${rootPkg.version} to release/app/package.json`);
} else {
    console.log(`Version ${rootPkg.version} already in sync`);
}
