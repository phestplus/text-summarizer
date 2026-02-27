import { spawn } from 'child_process';
import { readdir, readFile, writeFile, stat } from 'fs/promises';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');

async function runCommand(command, args) {
  return new Promise((resolve, reject) => {
    const process = spawn(command, args, {
      stdio: 'pipe',
      shell: true,
      cwd: projectRoot,
    });

    process.on('close', code => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Command failed with exit code ${code}`));
      }
    });
  });
}

async function addJsExtensions(dir) {
  try {
    const entries = await readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(dir, entry.name);

      if (entry.isDirectory()) {
        await addJsExtensions(fullPath);
      } else if (entry.name.endsWith('.js')) {
        const content = await readFile(fullPath, 'utf8');

        // Add .js extensions to relative imports
        const updatedContent = await processImports(content, dir);

        if (content !== updatedContent) {
          await writeFile(fullPath, updatedContent, 'utf8');
        }
      }
    }
  } catch (error) {
    console.error(`Error processing directory ${dir}:`, error);
  }
}

async function processImports(content, currentDir) {
  // Process from imports (both relative and absolute)
  let updatedContent = await replaceAsync(
    content,
    /from\s+['"]([^'"]*?)['"];?/g,
    async (match, importPath) => {
      // Skip node_modules and already has extension
      if (
        importPath.includes('node_modules') ||
        importPath.endsWith('.js') ||
        importPath.endsWith('.json') ||
        (!importPath.startsWith('.') && !importPath.startsWith('/'))
      ) {
        return match;
      }
      const resolvedPath = await resolveImportPath(importPath, currentDir);
      return match.replace(importPath, resolvedPath);
    },
  );

  // Process side-effect imports (import 'path')
  updatedContent = await replaceAsync(
    updatedContent,
    /import\s+['"]([^'"]*?)['"];?/g,
    async (match, importPath) => {
      // Skip node_modules and already has extension
      if (
        importPath.includes('node_modules') ||
        importPath.endsWith('.js') ||
        importPath.endsWith('.json') ||
        (!importPath.startsWith('.') && !importPath.startsWith('/'))
      ) {
        return match;
      }
      const resolvedPath = await resolveImportPath(importPath, currentDir);
      return match.replace(importPath, resolvedPath);
    },
  );

  // Process dynamic imports
  updatedContent = await replaceAsync(
    updatedContent,
    /import\s*\(\s*['"]([^'"]*?)['"];?\s*\)/g,
    async (match, importPath) => {
      // Skip node_modules and already has extension
      if (
        importPath.includes('node_modules') ||
        importPath.endsWith('.js') ||
        importPath.endsWith('.json') ||
        (!importPath.startsWith('.') && !importPath.startsWith('/'))
      ) {
        return match;
      }
      const resolvedPath = await resolveImportPath(importPath, currentDir);
      return match.replace(importPath, resolvedPath);
    },
  );

  return updatedContent;
}

async function resolveImportPath(importPath, currentDir) {
  const fullPath = resolve(currentDir, importPath);

  try {
    // Check if it's a file
    if (await fileExists(fullPath + '.js')) {
      return importPath + '.js';
    }

    // Check if it's a directory with index.js
    if (await fileExists(join(fullPath, 'index.js'))) {
      return importPath + '/index.js';
    }

    // Default to .js extension
    return importPath + '.js';
  } catch {
    // If we can't determine, default to .js
    return importPath + '.js';
  }
}

async function fileExists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function replaceAsync(str, regex, asyncFn) {
  const promises = [];
  str.replace(regex, (match, ...args) => {
    const promise = asyncFn(match, ...args);
    promises.push(promise);
  });

  const data = await Promise.all(promises);
  return str.replace(regex, () => data.shift());
}

async function build() {
  try {
    await runCommand('npx', ['tsc']);
    await runCommand('npx', ['tsc-alias', '-p', 'tsconfig.json']);
    await addJsExtensions(join(projectRoot, 'dist'));

    console.log('Build completed successfully!');
  } catch (error) {
    console.error('Build failed:', error);
    process.exit(1);
  }
}

build();
