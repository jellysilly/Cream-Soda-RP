import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { readJson, httpError } from './storage.js';

/**
 * Third-party extensions are git repositories cloned into <data>/extensions.
 * Each one ships a manifest.json in the SillyTavern format:
 *   { "display_name", "js", "css", "author", "version", "homePage", "loading_order" }
 */

function run(cmd, args, cwd, timeoutMs = 120000) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } });
    let out = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (out += d));
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(httpError(504, `${cmd}: timed out`));
    }, timeoutMs);
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(httpError(500, err.code === 'ENOENT' ? 'Git not found. Install git to add extensions from a link.' : err.message));
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(out);
      else reject(httpError(500, out.trim().split('\n').slice(-3).join('\n') || `${cmd} exited with code ${code}`));
    });
  });
}

function nameFromUrl(url) {
  const last = String(url).replace(/\.git$/, '').replace(/\/+$/, '').split('/').pop() || 'extension';
  return last.replace(/[^A-Za-z0-9_\-.]/g, '-').replace(/^\.+/, '').slice(0, 64) || 'extension';
}

export class Extensions {
  constructor(paths) {
    this.dir = paths.extensionsDir;
  }

  dirOf(name) {
    if (!/^[A-Za-z0-9_\-.]{1,64}$/.test(name) || name.startsWith('.')) throw httpError(400, 'Invalid extension name');
    return path.join(this.dir, name);
  }

  async list() {
    let entries = [];
    try {
      entries = await fsp.readdir(this.dir, { withFileTypes: true });
    } catch {
      return [];
    }
    const out = [];
    for (const e of entries) {
      if (!e.isDirectory() || e.name.startsWith('.')) continue;
      const manifest = await readJson(path.join(this.dir, e.name, 'manifest.json'), null);
      if (!manifest) continue;
      out.push({
        name: e.name,
        displayName: manifest.display_name || e.name,
        version: manifest.version || '',
        author: manifest.author || '',
        homePage: manifest.homePage || '',
        js: manifest.js || '',
        css: manifest.css || '',
        loadingOrder: manifest.loading_order ?? 100,
        requires: manifest.requires || [],
        isGit: fs.existsSync(path.join(this.dir, e.name, '.git')),
      });
    }
    return out.sort((a, b) => a.loadingOrder - b.loadingOrder || a.name.localeCompare(b.name));
  }

  async install(url) {
    const u = String(url || '').trim();
    if (!/^(https?:\/\/|git@)[\w.@:/\-~]+$/.test(u)) throw httpError(400, 'A link to a git repository is needed (https://…)');
    await fsp.mkdir(this.dir, { recursive: true });
    const name = nameFromUrl(u);
    const target = this.dirOf(name);
    if (fs.existsSync(target)) throw httpError(409, `Extension "${name}" is already installed`);
    await run('git', ['clone', '--depth', '1', u, target], this.dir);
    if (!fs.existsSync(path.join(target, 'manifest.json'))) {
      await fsp.rm(target, { recursive: true, force: true });
      throw httpError(400, 'The repository has no manifest.json, so it is not an extension');
    }
    return (await this.list()).find((e) => e.name === name);
  }

  async update(name) {
    const dir = this.dirOf(name);
    if (!fs.existsSync(path.join(dir, '.git'))) throw httpError(400, 'The extension was not installed with git');
    const out = await run('git', ['pull', '--ff-only'], dir);
    return { output: out.trim() };
  }

  async remove(name) {
    await fsp.rm(this.dirOf(name), { recursive: true, force: true });
  }
}
