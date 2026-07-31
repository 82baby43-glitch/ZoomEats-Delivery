import { Router, Request, Response } from 'express';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const router = Router();
const exec = promisify(execFile);
// Resolve from the fixed workspace in production, while allowing SDK_ROOT for deployments.
const sdkRoot = process.env.QUANTUM_SDK_ROOT || '/home/team/shared/quantum-sdk';
const enginePath = path.join(sdkRoot, 'engine', 'quantum-engine.js');

function htmlForScene(scene: unknown, engine: string): string {
  const json = JSON.stringify(scene).replace(/</g, '\\u003c');
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Quantum Engine Game</title><style>html,body{margin:0;width:100%;height:100%;background:#111;overflow:hidden}canvas{display:block;margin:auto;max-width:100%;max-height:100%;image-rendering:pixelated}</style></head><body><canvas id="game" width="640" height="480"></canvas><script>${engine}</script><script>const sceneData=${json};(function(){const canvas=document.getElementById('game');const scene=new QuantumEngine.Scene(sceneData);const game=new QuantumEngine.Engine({canvas,scene});game.start();window.quantumGame=game;})();</script></body></html>`;
}

router.post('/export/browser', async (req: Request, res: Response) => {
  try {
    const { scene } = req.body as { scene?: unknown; projectRoot?: string };
    if (!scene || typeof scene !== 'object') { res.status(400).json({ error: 'bad_request', message: 'scene is required' }); return; }
    const engine = await fs.readFile(enginePath, 'utf8');
    const html = htmlForScene(scene, engine);
    res.set({ 'Content-Type': 'text/html; charset=utf-8', 'Content-Disposition': 'attachment; filename="quantum-game.html"', 'Content-Length': Buffer.byteLength(html) });
    res.send(html);
  } catch (err) { res.status(500).json({ error: 'export_failed', message: err instanceof Error ? err.message : 'Unable to export browser game' }); }
});

router.post('/export/q1', async (req: Request, res: Response) => {
  const { scene } = req.body as { scene?: unknown; projectRoot?: string };
  if (!scene || typeof scene !== 'object') { res.status(400).json({ error: 'bad_request', message: 'scene is required' }); return; }
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'quantum-q1-'));
  try {
    await fs.writeFile(path.join(temp, 'scene.json'), JSON.stringify(scene, null, 2));
    const output = path.join(temp, 'game.bin');
    await exec(path.join(sdkRoot, 'tools', 'build-q1.sh'), [temp, output], { timeout: 120000 });
    const binary = await fs.readFile(output);
    res.set({ 'Content-Type': 'application/octet-stream', 'Content-Disposition': 'attachment; filename="quantum-game.bin"', 'Content-Length': binary.length });
    res.send(binary);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Q1 export failed';
    const missing = message.includes('requires') || message.includes('not found') || message.includes('ENOENT');
    res.status(missing ? 503 : 500).json({ error: missing ? 'toolchain_unavailable' : 'export_failed', message: missing ? 'Q1 export requires arm-linux-gnueabihf-gcc cross-compiler.' : message });
  } finally { await fs.rm(temp, { recursive: true, force: true }); }
});

export default router;
