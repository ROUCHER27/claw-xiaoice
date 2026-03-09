/**
 * Video Ngrok Integration Tests
 *
 * Tests for video service ngrok callback configuration system
 */

const http = require('http');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

describe('Video Ngrok Integration', () => {
  const PROJECT_ROOT = path.resolve(__dirname, '..');
  const OPENCLAW_DIR = '/home/yirongbest/.openclaw';

  describe('Script Files', () => {
    test('video-ngrok-status.sh exists and is executable', () => {
      const scriptPath = path.join(PROJECT_ROOT, 'video-ngrok-status.sh');
      expect(fs.existsSync(scriptPath)).toBe(true);

      const stats = fs.statSync(scriptPath);
      expect(stats.mode & fs.constants.S_IXUSR).toBeTruthy();
    });

    test('update-video-callback.sh exists and is executable', () => {
      const scriptPath = path.join(PROJECT_ROOT, 'update-video-callback.sh');
      expect(fs.existsSync(scriptPath)).toBe(true);

      const stats = fs.statSync(scriptPath);
      expect(stats.mode & fs.constants.S_IXUSR).toBeTruthy();
    });

    test('start-video-service.sh includes VIDEO_USE_NGROK support', () => {
      const scriptPath = path.join(PROJECT_ROOT, 'start-video-service.sh');
      const content = fs.readFileSync(scriptPath, 'utf8');

      expect(content).toContain('VIDEO_USE_NGROK');
      expect(content).toContain('update-video-callback.sh');
    });

    test('start-ngrok.sh supports dual tunnels', () => {
      const scriptPath = path.join(PROJECT_ROOT, 'start-ngrok.sh');
      const content = fs.readFileSync(scriptPath, 'utf8');

      expect(content).toContain('xiaoice-webhook');
      expect(content).toContain('video-callback');
      expect(content).toContain('.video-ngrok-url');
    });
  });

  describe('Environment Configuration', () => {
    test('.env.example includes VIDEO_USE_NGROK', () => {
      const envPath = path.join(PROJECT_ROOT, '.env.example');
      const content = fs.readFileSync(envPath, 'utf8');

      expect(content).toContain('VIDEO_USE_NGROK');
      expect(content).toMatch(/VIDEO_USE_NGROK=false/);
    });

    test('.env.example includes all required video service tokens', () => {
      const envPath = path.join(PROJECT_ROOT, '.env.example');
      const content = fs.readFileSync(envPath, 'utf8');

      expect(content).toContain('VIDEO_SERVICE_INTERNAL_TOKEN');
      expect(content).toContain('VIDEO_SERVICE_ADMIN_TOKEN');
      expect(content).toContain('VIDEO_SERVICE_CALLBACK_TOKEN');
    });
  });

  describe('Documentation', () => {
    test('VIDEO-NGROK-GUIDE.md exists', () => {
      const guidePath = path.join(PROJECT_ROOT, 'VIDEO-NGROK-GUIDE.md');
      expect(fs.existsSync(guidePath)).toBe(true);
    });

    test('VIDEO-NGROK-GUIDE.md includes key sections', () => {
      const guidePath = path.join(PROJECT_ROOT, 'VIDEO-NGROK-GUIDE.md');
      const content = fs.readFileSync(guidePath, 'utf8');

      expect(content).toContain('Quick Start');
      expect(content).toContain('Management Scripts');
      expect(content).toContain('Troubleshooting');
      expect(content).toContain('Admin API Reference');
      expect(content).toContain('video-ngrok-status.sh');
      expect(content).toContain('update-video-callback.sh');
    });
  });

  describe('Ngrok API Integration', () => {
    test('video-ngrok-status.sh queries correct API endpoint', () => {
      const scriptPath = path.join(PROJECT_ROOT, 'video-ngrok-status.sh');
      const content = fs.readFileSync(scriptPath, 'utf8');

      expect(content).toContain('http://localhost:4040/api/tunnels');
      expect(content).toContain('video-callback');
    });

    test('update-video-callback.sh calls admin API correctly', () => {
      const scriptPath = path.join(PROJECT_ROOT, 'update-video-callback.sh');
      const content = fs.readFileSync(scriptPath, 'utf8');

      expect(content).toContain('/v1/admin/config');
      expect(content).toContain('X-Admin-Token');
      expect(content).toContain('callbackPublicBaseUrl');
      expect(content).toContain('PUT');
    });
  });

  describe('URL Cache Files', () => {
    test('start-ngrok.sh saves video URL to correct location', () => {
      const scriptPath = path.join(PROJECT_ROOT, 'start-ngrok.sh');
      const content = fs.readFileSync(scriptPath, 'utf8');

      expect(content).toContain('.video-ngrok-url');
      expect(content).toContain('/home/yirongbest/.openclaw/.video-ngrok-url');
    });

    test('update-video-callback.sh reads from cache file', () => {
      const scriptPath = path.join(PROJECT_ROOT, 'update-video-callback.sh');
      const content = fs.readFileSync(scriptPath, 'utf8');

      expect(content).toContain('.video-ngrok-url');
      expect(content).toContain('VIDEO_NGROK_URL_FILE');
    });
  });

  describe('Error Handling', () => {
    test('video-ngrok-status.sh handles ngrok not running', () => {
      const scriptPath = path.join(PROJECT_ROOT, 'video-ngrok-status.sh');
      const content = fs.readFileSync(scriptPath, 'utf8');

      expect(content).toContain('pgrep -f "ngrok"');
      expect(content).toContain('Ngrok 未运行');
      expect(content).toContain('exit 1');
    });

    test('update-video-callback.sh handles service not running', () => {
      const scriptPath = path.join(PROJECT_ROOT, 'update-video-callback.sh');
      const content = fs.readFileSync(scriptPath, 'utf8');

      expect(content).toContain('/health');
      expect(content).toContain('视频服务未运行');
    });

    test('update-video-callback.sh handles authentication errors', () => {
      const scriptPath = path.join(PROJECT_ROOT, 'update-video-callback.sh');
      const content = fs.readFileSync(scriptPath, 'utf8');

      expect(content).toContain('401');
      expect(content).toContain('认证失败');
    });
  });

  describe('Callback URL Format', () => {
    test('scripts construct correct callback URL format', () => {
      const statusScript = fs.readFileSync(
        path.join(PROJECT_ROOT, 'video-ngrok-status.sh'),
        'utf8'
      );

      expect(statusScript).toContain('/v1/callbacks/provider');
      expect(statusScript).toContain('?token=');
      expect(statusScript).toContain('VIDEO_SERVICE_CALLBACK_TOKEN');
    });
  });

  describe('Integration with start-video-service.sh', () => {
    test('VIDEO_USE_NGROK flag controls ngrok startup', () => {
      const scriptPath = path.join(PROJECT_ROOT, 'start-video-service.sh');
      const content = fs.readFileSync(scriptPath, 'utf8');

      expect(content).toContain('if [ "$VIDEO_USE_NGROK" = "true" ]');
      expect(content).toContain('start-ngrok.sh');
    });

    test('Callback update runs after service starts', () => {
      const scriptPath = path.join(PROJECT_ROOT, 'start-video-service.sh');
      const content = fs.readFileSync(scriptPath, 'utf8');

      // Check that update-video-callback.sh is called after service starts
      const lines = content.split('\n');
      const serviceStartIndex = lines.findIndex(line =>
        line.includes('Video service started')
      );
      const callbackUpdateIndex = lines.findIndex(line =>
        line.includes('update-video-callback.sh')
      );

      expect(serviceStartIndex).toBeGreaterThan(-1);
      expect(callbackUpdateIndex).toBeGreaterThan(serviceStartIndex);
    });
  });

  describe('Dual Tunnel Support', () => {
    test('start-ngrok.sh detects tunnel configuration', () => {
      const scriptPath = path.join(PROJECT_ROOT, 'start-ngrok.sh');
      const content = fs.readFileSync(scriptPath, 'utf8');

      expect(content).toContain('HAS_TUNNELS_CONFIG');
      expect(content).toContain('ngrok start xiaoice-webhook video-callback');
      expect(content).toContain('ngrok http 3002');
    });

    test('start-ngrok.sh saves both URLs', () => {
      const scriptPath = path.join(PROJECT_ROOT, 'start-ngrok.sh');
      const content = fs.readFileSync(scriptPath, 'utf8');

      expect(content).toContain('.ngrok-url');
      expect(content).toContain('.video-ngrok-url');
      expect(content).toContain('XIAOICE_URL');
      expect(content).toContain('VIDEO_URL');
    });
  });

  describe('Security', () => {
    test('Scripts use environment variables for tokens', () => {
      const updateScript = fs.readFileSync(
        path.join(PROJECT_ROOT, 'update-video-callback.sh'),
        'utf8'
      );

      expect(updateScript).toContain('VIDEO_SERVICE_ADMIN_TOKEN');
      expect(updateScript).toContain('VIDEO_SERVICE_CALLBACK_TOKEN');
      expect(updateScript).not.toMatch(/token=["']?[a-zA-Z0-9-]{20,}["']?/);
    });

    test('Default VIDEO_USE_NGROK is false', () => {
      const envPath = path.join(PROJECT_ROOT, '.env.example');
      const content = fs.readFileSync(envPath, 'utf8');

      expect(content).toMatch(/VIDEO_USE_NGROK=false/);
    });
  });
});

describe('Admin API Endpoint', () => {
  const PROJECT_ROOT = path.resolve(__dirname, '..');

  test('Video service supports PUT /v1/admin/config', async () => {
    const serverPath = path.join(PROJECT_ROOT, 'services/video-task-service/server.js');
    const content = fs.readFileSync(serverPath, 'utf8');

    expect(content).toContain('/v1/admin/config');
    expect(content).toContain('callbackPublicBaseUrl');
    expect(content).toContain('x-admin-token');
  });

  test('Admin API validates authentication', async () => {
    const serverPath = path.join(PROJECT_ROOT, 'services/video-task-service/server.js');
    const content = fs.readFileSync(serverPath, 'utf8');

    // Check for admin token validation
    expect(content).toMatch(/adminToken|x-admin-token/);
  });
});
