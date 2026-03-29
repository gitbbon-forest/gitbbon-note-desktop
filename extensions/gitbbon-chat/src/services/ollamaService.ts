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

// 추천 모델 정보 인터페이스
export interface RecommendedModel {
  name: string;
  sizeGB: number;
  installed: boolean;
  description: string;
}

// Issue #77: 모델 capabilities 인터페이스
export interface ModelCapabilities {
  thinking: boolean;
  tools: boolean;
  completion: boolean;
}

// Issue #77: capabilities 포함 모델 정보 인터페이스
export interface ModelWithCapabilities {
  name: string;
  capabilities: ModelCapabilities;
}

// Issue #77: capabilities 기본값 (capabilities 필드가 없는 경우)
const DEFAULT_CAPABILITIES: ModelCapabilities = {
  thinking: false,
  tools: false,
  completion: true,
};

interface Message {
  role: string;
  content: string;
}

// 모델별 대략적인 다운로드 크기 (GB)
export const MODEL_SIZES_GB: Record<string, number> = {
  'llama3.1:8b':  4.7,
  'llama3.2:3b':  2.0,
  'llama3.2:1b':  1.3,
  'gemma2:2b':    1.6,
  'gemma2:9b':    5.5,
  'phi3:mini':    2.2,
  'mistral:7b':   4.1,
  'qwen2.5:7b':   4.7,
  'qwen2.5:3b':   2.0,
};

// 추천 모델별 설명
export const MODEL_DESCRIPTIONS: Record<string, string> = {
  'llama3.1:8b':  '고성능 범용 모델 (16GB+ RAM 권장)',
  'llama3.2:3b':  '균형 잡힌 중간 모델 (8GB+ RAM 권장)',
  'llama3.2:1b':  '경량 모델 (4GB+ RAM)',
  'gemma2:2b':    'Google 경량 모델 (4GB+ RAM)',
  'gemma2:9b':    'Google 고성능 모델 (16GB+ RAM 권장)',
  'phi3:mini':    'Microsoft 소형 모델 (8GB+ RAM)',
  'mistral:7b':   'Mistral 범용 모델 (16GB+ RAM 권장)',
  'qwen2.5:7b':   'Alibaba 고성능 모델 (16GB+ RAM 권장)',
  'qwen2.5:3b':   'Alibaba 경량 모델 (8GB+ RAM)',
};

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

  /**
   * 현재 사용할 모델명을 반환한다.
   * 이미 설치된 모델이 있으면 첫 번째 모델을, 없으면 하드웨어 기반으로 선정한다.
   */
  async getSelectedModel(): Promise<string> {
    const models = await this.getInstalledModels();
    if (models.length > 0) {
      logService.info(`[ollamaService] getSelectedModel: using installed model=${models[0]}`);
      return models[0];
    }
    const hw = await this.detectHardware();
    return this.selectModel(hw);
  }

  /**
   * 추천 모델 리스트를 반환 (설치 여부 포함)
   */
  async getRecommendedModels(): Promise<RecommendedModel[]> {
    const installed = await this.getInstalledModels();
    // 설치된 모델명에서 :latest 태그 제거하여 비교 용이하게
    const installedSet = new Set(installed.map(m => m.replace(':latest', '')));

    const recommended: RecommendedModel[] = Object.entries(MODEL_SIZES_GB).map(([name, sizeGB]) => ({
      name,
      sizeGB,
      installed: installedSet.has(name) || installedSet.has(name.split(':')[0]),
      description: MODEL_DESCRIPTIONS[name] || '',
    }));

    // 설치된 모델 중 추천 목록에 없는 것도 추가
    for (const m of installed) {
      const normalizedName = m.replace(':latest', '');
      if (!MODEL_SIZES_GB[normalizedName]) {
        recommended.push({
          name: normalizedName,
          sizeGB: 0,
          installed: true,
          description: '사용자 설치 모델',
        });
      }
    }

    return recommended;
  }

  // Issue #77: /api/show 엔드포인트로 모델 capabilities 조회
  async getModelCapabilities(modelName: string): Promise<ModelCapabilities> {
    return new Promise((resolve) => {
      const body = JSON.stringify({ name: modelName });
      const options: http.RequestOptions = {
        hostname: 'localhost',
        port: 11434,
        path: '/api/show',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
      };

      const req = http.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            const caps: string[] = json.capabilities || [];
            const result: ModelCapabilities = {
              thinking: caps.includes('thinking'),
              tools: caps.includes('tools'),
              completion: caps.includes('completion'),
            };
            resolve(result);
          } catch (err) {
            logService.warn(`[ollamaService] getModelCapabilities: ${modelName} 파싱 실패, 기본값 사용`, err);
            resolve({ ...DEFAULT_CAPABILITIES });
          }
        });
      });

      req.on('error', (err) => {
        logService.warn(`[ollamaService] getModelCapabilities: ${modelName} 요청 실패, 기본값 사용`, err);
        resolve({ ...DEFAULT_CAPABILITIES });
      });

      req.setTimeout(5000, () => {
        logService.warn(`[ollamaService] getModelCapabilities: ${modelName} 타임아웃, 기본값 사용`);
        req.destroy();
        resolve({ ...DEFAULT_CAPABILITIES });
      });

      req.write(body);
      req.end();
    });
  }

  // Issue #77: 설치된 모델 목록에 capabilities를 병렬로 조회하여 반환
  async getInstalledModelsWithCapabilities(): Promise<ModelWithCapabilities[]> {
    const models = await this.getInstalledModels();
    if (models.length === 0) {
      return [];
    }
    const results = await Promise.all(
      models.map(async (name) => {
        const capabilities = await this.getModelCapabilities(name);
        return { name, capabilities };
      })
    );

    return results;
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

  async getFreeDiskGB(): Promise<number> {
    try {
      const { stdout } = await execAsync('df -k / | tail -1');
      const parts = stdout.trim().split(/\s+/);
      // df -k 출력: Filesystem 1K-blocks Used Available Use% Mountpoint
      const availableKB = parseInt(parts[3], 10);
      const freeGB = availableKB / (1024 * 1024);
      logService.info(`[ollamaService] getFreeDiskGB: ${freeGB.toFixed(1)}GB`);
      return freeGB;
    } catch (err) {
      logService.warn('[ollamaService] getFreeDiskGB: failed to detect', err);
      return Infinity;
    }
  }

  // Issue #79: DELETE /api/delete 엔드포인트로 모델 삭제
  async deleteModel(modelName: string): Promise<void> {
    logService.info(`[debug:#79] 모델 삭제 요청: ${modelName}`);
    return new Promise((resolve, reject) => {
      const body = JSON.stringify({ name: modelName });
      const options: http.RequestOptions = {
        hostname: 'localhost',
        port: 11434,
        path: '/api/delete',
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
      };

      const req = http.request(options, (res) => {
        res.resume();
        if (res.statusCode === 200) {
          logService.info(`[debug:#79] 모델 삭제 완료: ${modelName}`);
          resolve();
        } else {
          const err = new Error(`DELETE /api/delete 실패: status=${res.statusCode}`);
          logService.error(`[debug:#79] 모델 삭제 실패: ${modelName}`, err);
          reject(err);
        }
      });

      req.on('error', (err) => {
        logService.error(`[debug:#79] 모델 삭제 요청 오류: ${modelName}`, err);
        reject(err);
      });

      req.write(body);
      req.end();
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
