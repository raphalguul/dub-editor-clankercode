import path from 'path';
import fs from 'fs';
import os from 'os';
import { app } from 'electron';
import { execFile } from 'child_process';
import https from 'https';
import http from 'http';

import { resolveWhisperBinary, selectAssetUrl, WhisperRelease } from './whisperAssets';

const ffmpeg = require('fluent-ffmpeg');
const StreamZip = require('node-stream-zip');

export interface WhisperConfig {
  modelSize: string;
  useCuda: boolean;
  cudaFallbackCpu: boolean;
  suppressSilence: boolean;
}

export interface SubtitleResult {
  index: number;
  startTime: number;
  endTime: number;
  text: string;
}

export interface WhisperPreflightItem {
    label: string;
    status: 'ok' | 'cached' | 'error';
    detail: string;
}

export interface WhisperPreflightResult {
    ok: boolean;
    cacheDir: string;
    modelDir: string;
    items: WhisperPreflightItem[];
}

const MODEL_MAP: Record<string, string> = {
  tiny: 'ggml-tiny-q5_1.bin',
  base: 'ggml-base-q5_1.bin',
  small: 'ggml-small-q5_1.bin',
  medium: 'ggml-medium-q5_0.bin',
  large: 'ggml-large-v3-q5_0.bin',
  'large-v3': 'ggml-large-v3-q5_0.bin',
};

const MODEL_SIZES: Record<string, string> = {
  'ggml-tiny-q5_1.bin': '32 MB',
  'ggml-base-q5_1.bin': '60 MB',
  'ggml-small-q5_1.bin': '190 MB',
  'ggml-medium-q5_0.bin': '539 MB',
  'ggml-large-v3-q5_0.bin': '1081 MB',
};

const HF_MODEL_BASE = 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main';
const GITHUB_RELEASES_URL = 'https://api.github.com/repos/ggml-org/whisper.cpp/releases';

// api.github.com answers 403 to requests without a User-Agent.
const USER_AGENT = 'dub-editor-electron';

// whisper.cpp stopped attaching binaries to v* tags (v1.9.3 and v1.9.4 have
// none) and moved them onto rolling b#### prereleases, so
// /releases/latest/download/... 404s every time now. These pinned tags are the
// newest verified to still carry the Windows x64 zips.
const CPU_BINARY_FALLBACK_URL =
  'https://github.com/ggml-org/whisper.cpp/releases/download/v1.9.2/whisper-bin-x64.zip';
const CUDA_BINARY_FALLBACK_URL =
  'https://github.com/ggml-org/whisper.cpp/releases/download/v1.9.2/whisper-cublas-12.4.0-bin-x64.zip';

function getUserDataBase(): string {
  const p = path.join(app.getPath('userData'), 'whisper');
  fs.mkdirSync(p, { recursive: true });
  return p;
}

function getCpuBinaryDir(): string {
  const p = path.join(getUserDataBase(), '_whisper_bin');
  fs.mkdirSync(p, { recursive: true });
  return p;
}

function getCudaBinaryDir(): string {
  const p = path.join(getUserDataBase(), '_cuda_bin');
  fs.mkdirSync(p, { recursive: true });
  return p;
}

function getModelsDir(): string {
  const p = path.join(getUserDataBase(), 'models');
  fs.mkdirSync(p, { recursive: true });
  return p;
}

function downloadFile(
  url: string,
  dest: string,
  onProgress?: (percent: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const proto = url.startsWith('https') ? https : http;

    const request = proto.get(url, { timeout: 300000, headers: { 'User-Agent': USER_AGENT } }, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        file.close();
        fs.unlinkSync(dest);
        downloadFile(response.headers.location!, dest, onProgress)
          .then(resolve)
          .catch(reject);
        return;
      }

      if (response.statusCode !== 200) {
        file.close();
        fs.unlinkSync(dest);
        reject(new Error(`HTTP ${response.statusCode} for ${url}`));
        return;
      }

      const total = parseInt(response.headers['content-length'] || '0', 10);
      let downloaded = 0;
      let lastReported = 0;

      response.on('data', (chunk: Buffer) => {
        downloaded += chunk.length;
        file.write(chunk);
        if (total > 0 && onProgress) {
          const pct = Math.floor((downloaded * 100) / total);
          if (pct >= lastReported + 10) {
            lastReported = pct;
            onProgress(pct);
          }
        }
      });

      response.on('end', () => {
        file.end();
        if (onProgress) onProgress(100);
        resolve();
      });

      response.on('error', (err) => {
        file.close();
        fs.unlinkSync(dest);
        reject(err);
      });
    });

    request.on('timeout', () => {
      request.destroy();
      file.close();
      fs.unlinkSync(dest);
      reject(new Error('Download timed out'));
    });

    request.on('error', (err) => {
      file.close();
      fs.unlinkSync(dest);
      reject(err);
    });
  });
}

function fetchJson(url: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const proto = url.startsWith('https') ? https : http;
    proto
      .get(url, { timeout: 15000, headers: { 'User-Agent': USER_AGENT } }, (response) => {
        if (response.statusCode !== 200) {
          reject(new Error(`HTTP ${response.statusCode} for ${url}`));
          return;
        }
        let data = '';
        response.on('data', (chunk: string) => (data += chunk));
        response.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(e);
          }
        });
      })
      .on('error', reject);
  });
}

async function resolveLatestAssetUrl(
  prefix: string,
  onLog?: (msg: string) => void
): Promise<string | null> {
  try {
    const releases: WhisperRelease[] = await fetchJson(
      `${GITHUB_RELEASES_URL}?per_page=20`
    );
    if (!Array.isArray(releases)) return null;

    const url = selectAssetUrl(releases, prefix);
    if (!url) {
      onLog?.(`No ${prefix} asset found in recent whisper.cpp releases`);
    }
    return url;
  } catch (e: any) {
    onLog?.(`Could not list whisper.cpp releases: ${e?.message || e}`);
    return null;
  }
}

async function extractZip(zipPath: string, destDir: string): Promise<string[]> {
  const zip = new StreamZip.async({ file: zipPath });
  const entries = await zip.entries();

  for (const entry of Object.values(entries) as any[]) {
    const entryPath = entry.name;
    if (entry.isDirectory) continue;
    const baseName = path.basename(entryPath);
    if (entryPath.startsWith('__MACOSX')) continue;
    const destPath = path.join(destDir, baseName);
    await zip.extract(entryPath, destPath);
  }

  await zip.close();
  const extractedFiles = fs.readdirSync(destDir);
  return extractedFiles;
}

async function findOrDownloadCpuBinary(
  onLog?: (msg: string) => void
): Promise<string | null> {
  const binDir = getCpuBinaryDir();
  const exePath = path.join(binDir, 'whisper.cpp.exe');
  if (fs.existsSync(exePath)) return exePath;

  const cliPath = path.join(binDir, 'whisper-cli.exe');
  if (fs.existsSync(cliPath)) {
    fs.renameSync(cliPath, exePath);
    return exePath;
  }

  onLog?.('Downloading whisper.cpp CPU binary...');

  let url = await resolveLatestAssetUrl('whisper-bin-', onLog);
  if (!url) {
    url = CPU_BINARY_FALLBACK_URL;
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'whisper-cpu-dl-'));
  const zipPath = path.join(tmpDir, 'whisper-cpu.zip');

  try {
    await downloadFile(url, zipPath);
    onLog?.('Extracting whisper.cpp...');
    await extractZip(zipPath, binDir);

    if (fs.existsSync(path.join(binDir, 'whisper-cli.exe'))) {
      fs.renameSync(
        path.join(binDir, 'whisper-cli.exe'),
        exePath
      );
    }

    return fs.existsSync(exePath) ? exePath : null;
  } catch (e: any) {
    onLog?.(`CPU binary download failed: ${e?.message || e}`);
    return null;
  } finally {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  }
}

async function findOrDownloadCudaBinary(
  onLog?: (msg: string) => void
): Promise<string | null> {
  const binDir = getCudaBinaryDir();
  const exePath = path.join(binDir, 'whisper.cpp.cuda.exe');
  if (fs.existsSync(exePath)) return exePath;

  const cliPath = path.join(binDir, 'whisper-cli.exe');
  if (fs.existsSync(cliPath)) {
    fs.renameSync(cliPath, exePath);
    return exePath;
  }

  onLog?.('Downloading whisper.cpp CUDA binary...');

  let url = await resolveLatestAssetUrl('whisper-cublas-', onLog);
  if (!url) {
    url = CUDA_BINARY_FALLBACK_URL;
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'whisper-cuda-dl-'));
  const zipPath = path.join(tmpDir, 'whisper-cuda.zip');

  try {
    await downloadFile(url, zipPath);
    onLog?.('Extracting CUDA whisper.cpp...');
    await extractZip(zipPath, binDir);

    if (fs.existsSync(path.join(binDir, 'whisper-cli.exe'))) {
      fs.renameSync(
        path.join(binDir, 'whisper-cli.exe'),
        exePath
      );
    }

    return fs.existsSync(exePath) ? exePath : null;
  } catch (e: any) {
    onLog?.(`CUDA binary download failed: ${e?.message || e}`);
    return null;
  } finally {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  }
}

async function findOrDownloadModel(
  modelName: string,
  onLog?: (msg: string) => void
): Promise<string> {
  const modelFile = MODEL_MAP[modelName] || `ggml-${modelName}.bin`;
  const modelsDir = getModelsDir();
  const modelPath = path.join(modelsDir, modelFile);

  if (fs.existsSync(modelPath)) return modelPath;

  const sizeStr = MODEL_SIZES[modelFile] || '?';
  onLog?.(`Model ${modelFile} (${sizeStr}) not found. Downloading...`);

  const url = `${HF_MODEL_BASE}/${modelFile}`;

  await downloadFile(url, modelPath, (pct) => {
    onLog?.(`Downloading model: ${pct}%`);
  });

  return modelPath;
}

function extractAudioToWav(videoPath: string, startSeconds?: number, durationSeconds?: number, audioTrackIndex?: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dub-editor-audio-'));
    const wavPath = path.join(tmpDir, 'audio.wav');

    let cmd = ffmpeg(videoPath)
      .audioFilters('highpass=f=80,dynaudnorm')
      .audioFrequency(16000)
      .audioChannels(1)
      .audioQuality(9);

    if (audioTrackIndex !== undefined) {
      cmd = cmd.outputOptions(['-map', `0:${audioTrackIndex}`]);
    }

    cmd = cmd.output(wavPath);

    if (startSeconds !== undefined && startSeconds > 0) {
      cmd = cmd.setStartTime(startSeconds);
    }
    if (durationSeconds !== undefined && durationSeconds > 0) {
      cmd = cmd.setDuration(durationSeconds);
    }

    const timeout = setTimeout(() => {
      cmd.kill('SIGKILL');
      reject(new Error('FFmpeg timed out after 300s'));
    }, 300000);

    let settled = false;

    cmd.on('end', () => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve(wavPath);
    });

    cmd.on('error', (err: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      reject(err);
    });

    cmd.run();
  });
}

async function transcribe(
  videoPath: string,
  config: WhisperConfig,
  onLog?: (msg: string) => void,
  onProgress?: (percent: number) => void,
  startSeconds?: number,
  durationSeconds?: number,
  audioTrackIndex?: number
): Promise<SubtitleResult[]> {
  let wavPath: string | undefined;
  let whisperTmpDir: string | undefined;

  const cleanup = () => {
    if (wavPath) {
      try {
        fs.unlinkSync(wavPath);
        fs.rmdirSync(path.dirname(wavPath));
      } catch {}
    }
    if (whisperTmpDir) {
      try {
        fs.rmSync(whisperTmpDir, { recursive: true, force: true });
      } catch {}
    }
  };

  try {
    onLog?.('Extracting audio from video...');
    onProgress?.(5);

    wavPath = await extractAudioToWav(videoPath, startSeconds, durationSeconds, audioTrackIndex);

    onLog?.('Audio extracted.');
    onProgress?.(15);

    let whisperExe: string | null = null;
    let useCuda = config.useCuda;

    ({ whisperExe, useCuda } = await resolveWhisperBinary(
      config.useCuda,
      config.cudaFallbackCpu,
      () => findOrDownloadCudaBinary(onLog),
      () => findOrDownloadCpuBinary(onLog),
      onLog
    ));

    if (!whisperExe) {
      throw new Error(
        'whisper.cpp binary could not be downloaded. Check your internet ' +
        'connection, then use Config > Check & Download Whisper Components.'
      );
    }

    onLog?.(`Using whisper binary: ${whisperExe}`);
    onProgress?.(20);

    onLog?.('Resolving model...');
    const modelPath = await findOrDownloadModel(config.modelSize, onLog);
    onLog?.(`Model: ${path.basename(modelPath)}`);
    onProgress?.(25);

    whisperTmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dub-editor-whisper-'));
    const jsonOut = path.join(whisperTmpDir, 'output');
    const jsonFile = jsonOut + '.json';

    const args: string[] = [
      '-m',
      modelPath,
      '-f',
      wavPath,
      '-ojf',
      '-of',
      jsonOut,
    ];

    if (config.suppressSilence) {
      args.push('--suppress-nst');
    }

    if (!useCuda) {
      args.push('-ng');
    }

    const whisperDir = path.dirname(whisperExe);
    const env = { ...process.env };
    env.PATH = whisperDir + path.delimiter + (env.PATH || '');

    onLog?.(`Running whisper.cpp...`);
    onProgress?.(30);

    await new Promise<void>((res, rej) => {
      execFile(whisperExe!, args, {
        env,
        timeout: 300000,
        maxBuffer: 50 * 1024 * 1024,
      }, (err, stdout, stderr) => {
        if (stderr) onLog?.(stderr);
        if (stdout) onLog?.(stdout);

        if (err) {
          if (useCuda && config.cudaFallbackCpu) {
            onLog?.('CUDA failed, retrying with CPU...');
            // The CPU binary is only ever downloaded on the !useCuda branch, so
            // on a machine that has never transcribed before there is nothing
            // to fall back to. Download it here rather than bailing out.
            findOrDownloadCpuBinary(onLog).then((cpuExe) => {
              if (!cpuExe) {
                onLog?.('No CPU binary available for fallback');
                rej(err);
                return;
              }
              const cpuDir = path.dirname(cpuExe);
              const cpuEnv = { ...process.env };
              cpuEnv.PATH = cpuDir + path.delimiter + (cpuEnv.PATH || '');
              const cpuArgs = [...args];
              if (!cpuArgs.includes('-ng')) cpuArgs.push('-ng');
              execFile(cpuExe, cpuArgs, {
                env: cpuEnv,
                timeout: 300000,
                maxBuffer: 50 * 1024 * 1024,
              }, (cpuErr, cpuStdout, cpuStderr) => {
                if (cpuStderr) onLog?.(cpuStderr);
                if (cpuErr) rej(cpuErr);
                else res();
              });
            }).catch((dlErr) => {
              onLog?.('CPU fallback download failed: ' + dlErr);
              rej(err);
            });
            return;
          }
          rej(err);
        } else {
          res();
        }
      });
    });

    onProgress?.(85);

    if (!fs.existsSync(jsonFile)) {
      throw new Error('whisper.cpp produced no output file');
    }

    const data = JSON.parse(fs.readFileSync(jsonFile, 'utf-8'));
    const results: SubtitleResult[] = [];
    let index = 1;

    for (const segment of data.transcription || []) {
      const text = segment.text?.trim().replace(/^-\s*/, '') || '';
      const offsets = segment.offsets || {};
      const startSeconds = (offsets.from || 0) / 1000.0;
      const endSeconds = (offsets.to || 0) / 1000.0;

      results.push({
        index,
        startTime: Math.round(startSeconds * 1000),
        endTime: Math.round(endSeconds * 1000),
        text,
      });
      index++;
    }

    onProgress?.(100);
    onLog?.(`Transcription complete: ${results.length} segments`);

    return results;
  } finally {
    cleanup();
  }
}

function findModelFile(modelName: string): string | null {
  const modelFile = MODEL_MAP[modelName] || `ggml-${modelName}.bin`;
  const modelPath = path.join(getModelsDir(), modelFile);
  return fs.existsSync(modelPath) ? modelPath : null;
}

function findWhisperBinary(): string | null {
  const cpuExe = path.join(getCpuBinaryDir(), 'whisper.cpp.exe');
  if (fs.existsSync(cpuExe)) return cpuExe;
  const cudaExe = path.join(getCudaBinaryDir(), 'whisper.cpp.cuda.exe');
  if (fs.existsSync(cudaExe)) return cudaExe;
  return null;
}

async function preflight(
  config: WhisperConfig,
  onLog?: (msg: string) => void
): Promise<WhisperPreflightResult> {
  const items: WhisperPreflightItem[] = [];

  const check = async (
    label: string,
    cachedPath: string,
    acquire: () => Promise<string | null>
  ): Promise<void> => {
    if (fs.existsSync(cachedPath)) {
      items.push({ label, status: 'cached', detail: path.basename(cachedPath) });
      return;
    }

    onLog?.(`Fetching ${label}...`);
    try {
      const resolved = await acquire();
      items.push(
        resolved
          ? { label, status: 'ok', detail: path.basename(resolved) }
          : {
            label,
            status: 'error',
            detail: 'Download finished but produced no usable file',
          }
      );
    } catch (e: any) {
      items.push({ label, status: 'error', detail: e?.message || String(e) });
    }
  };

  await check(
    'whisper.cpp CPU binary',
    path.join(getCpuBinaryDir(), 'whisper.cpp.exe'),
    () => findOrDownloadCpuBinary(onLog)
  );

  if (config.useCuda) {
    await check(
      'whisper.cpp CUDA binary',
      path.join(getCudaBinaryDir(), 'whisper.cpp.cuda.exe'),
      () => findOrDownloadCudaBinary(onLog)
    );
  }

  const modelFile = MODEL_MAP[config.modelSize] || `ggml-${config.modelSize}.bin`;
  await check(
    `Model ${modelFile}`,
    path.join(getModelsDir(), modelFile),
    () => findOrDownloadModel(config.modelSize, onLog)
  );

  return {
    ok: items.every((i) => i.status !== 'error'),
    cacheDir: getUserDataBase(),
    modelDir: getModelsDir(),
    items,
  };
}

export {
  transcribe,
  preflight,
  extractAudioToWav,
  downloadFile,
  findOrDownloadCpuBinary,
  findOrDownloadCudaBinary,
  findOrDownloadModel,
  findModelFile,
  findWhisperBinary,
  getUserDataBase,
  getCpuBinaryDir,
  getCudaBinaryDir,
  getModelsDir,
  resolveLatestAssetUrl,
  MODEL_MAP,
};
