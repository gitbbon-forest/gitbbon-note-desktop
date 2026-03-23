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
        resolve(res.statusCode === 200);
        res.resume();
      });
      req.on('error', () => resolve(false));
      req.setTimeout(2000, () => {
        req.destroy();
        resolve(false);
      });
    });
  }

  async isInstalled(): Promise<boolean> {
    try {
      await execAsync('which ollama');
      return true;
    } catch {
      const paths = ['/usr/local/bin/ollama', '/opt/homebrew/bin/ollama', '/usr/bin/ollama'];
      for (const p of paths) {
        try {
          await execAsync(`test -f ${p}`);
          return true;
        } catch { /* continue */ }
      }
      return false;
    }
  }

  async install(): Promise<void> {
    const platform = os.platform();
    if (platform === 'darwin' || platform === 'linux') {
      try {
        await execAsync('curl -fsSL https://ollama.com/install.sh | sh', { timeout: 120000 });
        logService.info('[ollamaService] Ollama installed successfully');
      } catch {
        throw new Error('INSTALL_FAILED');
      }
    } else {
      throw new Error('INSTALL_FAILED');
    }
  }

  async startServer(): Promise<void> {
    spawn('ollama', ['serve'], {
      detached: true,
      stdio: 'ignore',
    }).unref();

    for (let i = 0; i < 10; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      if (await this.isRunning()) {
        logService.info('[ollamaService] Server started');
        return;
      }
    }
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

    return { ramGB, hasGPU };
  }

  selectModel(hardware: HardwareInfo): string {
    if (hardware.ramGB >= 16 && hardware.hasGPU) {
      return 'llama3.1:8b';
    } else if (hardware.ramGB >= 8) {
      return 'llama3.2:3b';
    } else {
      return 'gemma2:2b';
    }
  }

  async getInstalledModels(): Promise<string[]> {
    return new Promise((resolve) => {
      http.get(`${this.baseUrl}/api/tags`, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            resolve((json.models || []).map((m: any) => m.name as string));
          } catch {
            resolve([]);
          }
        });
      }).on('error', () => resolve([]));
    });
  }

  async pullModel(model: string, onProgress: (pct: number) => void): Promise<void> {
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
                onProgress(100);
              }
            } catch { /* skip */ }
          }
        });
        res.on('end', () => resolve());
        res.on('error', reject);
      });

      req.on('error', reject);
      req.write(body);
      req.end();
    });
  }

  async *streamChat(messages: Message[]): AsyncGenerator<string> {
    const models = await this.getInstalledModels();
    const hw = await this.detectHardware();
    const model = models.length > 0 ? models[0] : this.selectModel(hw);

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
        res.on('end', () => resolve(results));
        res.on('error', reject);
      });

      req.on('error', reject);
      req.write(body);
      req.end();
    });

    for (const chunk of chunks) {
      yield chunk;
    }
  }
}

export const ollamaService = new OllamaService();
