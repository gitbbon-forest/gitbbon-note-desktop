import * as http from 'http';
import * as os from 'os';
import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import { logService } from './logService';

const execAsync = promisify(exec);

export interface HardwareInfo {
  ramGB: number;
  hasGPU: boolean;
}

export interface OllamaStatusEvent {
  step: 'checking' | 'installing' | 'pulling' | 'ready' | 'error';
  detail: string;
  progress?: number;
}

interface Message {
  role: string;
  content: string;
}

export class OllamaService {
  private readonly baseUrl = 'http://localhost:11434';

  async isRunning(): Promise<boolean> {
    return new Promise((resolve) => {
      const req = http.get(`${this.baseUrl}/api/tags`, (res) => {
        const result = res.statusCode === 200;
        logService.info(`[ollamaService] isRunning: ${result} (status ${res.statusCode})`);
        resolve(result);
        res.resume();
      });
      req.on('error', (err) => {
        logService.info(`[ollamaService] isRunning: false (${err.message})`);
        resolve(false);
      });
      req.setTimeout(2000, () => {
        logService.info('[ollamaService] isRunning: false (timeout)');
        req.destroy();
        resolve(false);
      });
    });
  }

  async isInstalled(): Promise<boolean> {
    try {
      const { stdout } = await execAsync('which ollama');
      logService.info(`[ollamaService] isInstalled: true (${stdout.trim()})`);
      return true;
    } catch {
      const paths = ['/usr/local/bin/ollama', '/opt/homebrew/bin/ollama', '/usr/bin/ollama'];
      for (const p of paths) {
        try {
          await execAsync(`test -f ${p}`);
          logService.info(`[ollamaService] isInstalled: true (${p})`);
          return true;
        } catch { /* continue */ }
      }
      logService.info('[ollamaService] isInstalled: false');
      return false;
    }
  }

  async install(): Promise<void> {
    const platform = os.platform();
    logService.info(`[ollamaService] install: starting on platform=${platform}`);
    if (platform === 'darwin' || platform === 'linux') {
      try {
        await execAsync('curl -fsSL https://ollama.com/install.sh | sh', { timeout: 120000 });
        logService.info('[ollamaService] install: success');
      } catch (err) {
        logService.error('[ollamaService] install: failed', err);
        throw new Error('INSTALL_FAILED');
      }
    } else {
      logService.warn(`[ollamaService] install: unsupported platform=${platform}`);
      throw new Error('INSTALL_FAILED');
    }
  }

  async startServer(): Promise<void> {
    logService.info('[ollamaService] startServer: spawning ollama serve');
    spawn('ollama', ['serve'], {
      detached: true,
      stdio: 'ignore',
    }).unref();

    for (let i = 0; i < 10; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      logService.info(`[ollamaService] startServer: waiting... (${i + 1}/10)`);
      if (await this.isRunning()) {
        logService.info('[ollamaService] startServer: ready');
        return;
      }
    }
    logService.error('[ollamaService] startServer: timed out after 10s');
    throw new Error('Server failed to start');
  }

  async detectHardware(): Promise<HardwareInfo> {
    const ramGB = os.totalmem() / (1024 ** 3);
    let hasGPU = false;

    try {
      const platform = os.platform();
      if (platform === 'darwin') {
        const { stdout } = await execAsync('system_profiler SPDisplaysDataType 2>/dev/null');
        hasGPU = stdout.toLowerCase().includes('metal') || stdout.toLowerCase().includes('gpu');
      } else if (platform === 'linux') {
        const { stdout } = await execAsync('lspci 2>/dev/null | grep -i vga');
        hasGPU = stdout.length > 0;
      }
    } catch { /* GPU detection is best-effort */ }

    logService.info(`[ollamaService] detectHardware: RAM=${ramGB.toFixed(1)}GB, GPU=${hasGPU}`);
    return { ramGB, hasGPU };
  }

  selectModel(hardware: HardwareInfo): string {
    let model: string;
    if (hardware.ramGB >= 16 && hardware.hasGPU) {
      model = 'llama3.1:8b';
    } else if (hardware.ramGB >= 8) {
      model = 'llama3.2:3b';
    } else {
      model = 'gemma2:2b';
    }
    logService.info(`[ollamaService] selectModel: ${model} (RAM=${hardware.ramGB.toFixed(1)}GB, GPU=${hardware.hasGPU})`);
    return model;
  }

  async getInstalledModels(): Promise<string[]> {
    return new Promise((resolve) => {
      http.get(`${this.baseUrl}/api/tags`, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            const models = (json.models || []).map((m: any) => m.name as string);
            logService.info(`[ollamaService] getInstalledModels: [${models.join(', ')}]`);
            resolve(models);
          } catch {
            logService.warn('[ollamaService] getInstalledModels: parse error, returning []');
            resolve([]);
          }
        });
      }).on('error', (err) => {
        logService.warn(`[ollamaService] getInstalledModels: error (${err.message}), returning []`);
        resolve([]);
      });
    });
  }

  async pullModel(model: string, onProgress: (pct: number) => void): Promise<void> {
    logService.info(`[ollamaService] pullModel: starting ${model}`);
    return new Promise((resolve, reject) => {
      const body = JSON.stringify({ name: model, stream: true });
      const options: http.RequestOptions = {
        hostname: 'localhost',
        port: 11434,
        path: '/api/pull',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
      };

      const req = http.request(options, (res) => {
        let buffer = '';
        res.on('data', (chunk: Buffer) => {
          buffer += chunk.toString();
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';
          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const json = JSON.parse(line);
              if (json.total && json.completed) {
                const pct = Math.round((json.completed / json.total) * 100);
                onProgress(pct);
              }
              if (json.status === 'success') {
                logService.info(`[ollamaService] pullModel: ${model} complete`);
                onProgress(100);
              }
            } catch { /* skip */ }
          }
        });
        res.on('end', () => resolve());
        res.on('error', (err) => {
          logService.error(`[ollamaService] pullModel: ${model} error`, err);
          reject(err);
        });
      });

      req.on('error', (err) => {
        logService.error(`[ollamaService] pullModel: request error`, err);
        reject(err);
      });
      req.write(body);
      req.end();
    });
  }

  async *streamChat(messages: Message[]): AsyncGenerator<string> {
    const models = await this.getInstalledModels();
    const hw = await this.detectHardware();
    const model = models.length > 0 ? models[0] : this.selectModel(hw);
    logService.info(`[ollamaService] streamChat: using model=${model}, messages=${messages.length}`);

    const body = JSON.stringify({
      model,
      messages,
      stream: true,
    });

    const chunks = await new Promise<string[]>((resolve, reject) => {
      const results: string[] = [];
      const options: http.RequestOptions = {
        hostname: 'localhost',
        port: 11434,
        path: '/api/chat',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
      };

      const req = http.request(options, (res) => {
        let buffer = '';
        res.on('data', (chunk: Buffer) => {
          buffer += chunk.toString();
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';
          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const json = JSON.parse(line);
              if (json.message?.content) {
                results.push(json.message.content);
              }
            } catch { /* skip */ }
          }
        });
        res.on('end', () => {
          logService.info(`[ollamaService] streamChat: received ${results.length} chunks`);
          resolve(results);
        });
        res.on('error', (err) => {
          logService.error('[ollamaService] streamChat: response error', err);
          reject(err);
        });
      });

      req.on('error', (err) => {
        logService.error('[ollamaService] streamChat: request error', err);
        reject(err);
      });
      req.write(body);
      req.end();
    });

    for (const chunk of chunks) {
      yield chunk;
    }
  }
}

export const ollamaService = new OllamaService();
