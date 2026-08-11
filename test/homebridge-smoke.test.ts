import net from 'node:net';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const children = new Set<ChildProcessWithoutNullStreams>();

async function freePort(): Promise<number> {
  const server = net.createServer();
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  await new Promise<void>(resolve => server.close(() => resolve()));
  return port;
}

async function launchHomebridge(platforms: unknown[]): Promise<string> {
  const root = process.cwd();
  const storage = await mkdtemp(path.join(os.tmpdir(), 'magic-home-pro-smoke-'));
  const port = await freePort();
  const config = {
    bridge: {
      name: 'Magic Home Pro Verification',
      username: '0E:42:38:9A:11:02',
      port,
      pin: '031-45-154',
    },
    platforms,
  };
  await writeFile(path.join(storage, 'config.json'), JSON.stringify(config), 'utf8');
  const child = spawn(process.execPath, [
    path.join(root, 'node_modules/homebridge/bin/homebridge'),
    '-U', storage,
    '-P', root,
    '--strict-plugin-resolution',
    '-Q',
    '-T',
  ], { cwd: root, env: { ...process.env, NO_COLOR: '1' } });
  children.add(child);
  let output = '';
  const ready = new Promise<void>((resolve, reject) => {
    const inspect = (chunk: Buffer): void => {
      output += chunk.toString();
      if (output.includes('is running on port')) resolve();
    };
    child.stdout.on('data', inspect);
    child.stderr.on('data', inspect);
    child.once('exit', code => reject(new Error(`Homebridge exited before startup (${code ?? 'signal'}):\n${output}`)));
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      ready,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Homebridge startup timed out:\n${output}`)), 10_000);
      }),
    ]);
    return output;
  } finally {
    if (timer) clearTimeout(timer);
    child.kill('SIGTERM');
    await new Promise<void>(resolve => child.once('close', () => resolve()));
    children.delete(child);
    await rm(storage, { recursive: true, force: true });
  }
}

afterEach(() => {
  for (const child of children) child.kill('SIGKILL');
  children.clear();
});

describe('Homebridge package smoke test', () => {
  it('loads without starting the plugin when it is not configured', async () => {
    const output = await launchHomebridge([]);
    expect(output).toContain('Loaded plugin: homebridge-magic-home-pro@');
    expect(output).not.toContain('Initializing MagicHomePro platform');
  }, 15_000);

  it('starts cleanly with a valid platform configuration', async () => {
    const output = await launchHomebridge([{
      platform: 'MagicHomePro',
      name: 'Magic Home Pro Verification',
      discovery: { enabled: false },
      devices: [],
    }]);
    expect(output).toContain('Initializing MagicHomePro platform');
    expect(output).not.toMatch(/characteristic.+warning/i);
    expect(output).not.toContain('UnhandledPromiseRejection');
  }, 15_000);
});
