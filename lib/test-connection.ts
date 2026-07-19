/**
 * Qwen API 连接测试工具
 */

export interface ConnectionTestResult {
  success: boolean;
  message: string;
  latency?: number;
  errorType?: string;
}

/**
 * 测试 Qwen-Omni API 连接
 */
export async function testQwenConnection(apiKey: string): Promise<ConnectionTestResult> {
  if (!apiKey) {
    return {
      success: false,
      message: '❌ API Key 未提供，请在 .env.local 文件中配置 NEXT_PUBLIC_DASHSCOPE_API_KEY',
      errorType: 'missing_api_key'
    };
  }

  const startTime = Date.now();
  
  try {
    console.log('🔄 正在测试 API 连接...');
    
    // 创建 WebSocket 连接
    const url = new URL('wss://dashscope.aliyuncs.com/api-ws/v1/realtime');
    url.searchParams.set('model', 'qwen-omni-turbo-realtime');
    url.searchParams.set('api_key', apiKey);

    const ws = new WebSocket(url.toString());

    return new Promise((resolve) => {
      // 10秒超时
      const timeout = setTimeout(() => {
        try {
          ws.close();
        } catch (e) {
          // 忽略关闭错误
        }
        resolve({
          success: false,
          message: '❌ 连接超时（10秒），请检查网络连接或 API Key',
          errorType: 'timeout'
        });
      }, 10000);

      ws.onopen = () => {
        const latency = Date.now() - startTime;
        
        try {
          ws.close();
        } catch (e) {
          // 忽略关闭错误
        }
        
        clearTimeout(timeout);
        
        console.log(`✅ API 连接成功，延迟: ${latency}ms`);
        resolve({
          success: true,
          message: `✅ API 连接成功（延迟: ${latency}ms）`,
          latency
        });
      };

      ws.onerror = (error) => {
        clearTimeout(timeout);
        
        console.error('❌ API 连接失败:', error);
        resolve({
          success: false,
          message: '❌ 连接失败，请检查 API Key 是否正确或网络连接',
          errorType: 'connection_error'
        });
      };

      ws.onclose = (event) => {
        clearTimeout(timeout);
        
        // 检查关闭原因
        if (event.code === 1008) {
          resolve({
            success: false,
            message: '❌ API Key 无效，请检查 NEXT_PUBLIC_DASHSCOPE_API_KEY',
            errorType: 'invalid_api_key'
          });
        } else if (event.code === 1006) {
          resolve({
            success: false,
            message: '❌ 网络连接异常，请检查网络设置',
            errorType: 'network_error'
          });
        } else {
          resolve({
            success: false,
            message: `❌ 连接关闭 (代码: ${event.code})，请重试`,
            errorType: 'connection_closed'
          });
        }
      };
    });
  } catch (error: any) {
    console.error('API 连接测试异常:', error);
    
    let errorType = 'unknown_error';
    let errorMessage = `❌ 错误: ${error.message}`;
    
    if (error.name === 'SecurityError') {
      errorType = 'security_error';
      errorMessage = '❌ 安全策略阻止连接，请确保使用 HTTPS 或 localhost';
    } else if (error.name === 'NetworkError') {
      errorType = 'network_error';
      errorMessage = '❌ 网络错误，请检查网络连接';
    } else if (error.name === 'InvalidStateError') {
      errorType = 'invalid_state';
      errorMessage = '❌ WebSocket 状态错误，请重试';
    }
    
    return {
      success: false,
      message: errorMessage,
      errorType
    };
  }
}

/**
 * 验证 API Key 格式
 */
export function validateApiKey(apiKey: string): { valid: boolean; message: string } {
  if (!apiKey) {
    return {
      valid: false,
      message: 'API Key 不能为空'
    };
  }
  
  // DashScope API Key 通常以 "sk-" 开头，长度在 20-100 字符之间
  if (!apiKey.startsWith('sk-')) {
    return {
      valid: false,
      message: 'API Key 格式不正确，应以 "sk-" 开头'
    };
  }
  
  if (apiKey.length < 20) {
    return {
      valid: false,
      message: 'API Key 太短，请检查是否完整'
    };
  }
  
  if (apiKey.length > 100) {
    return {
      valid: false,
      message: 'API Key 太长，请检查是否正确'
    };
  }
  
  return {
    valid: true,
    message: 'API Key 格式正确'
  };
}

/**
 * 获取环境信息用于调试
 */
export function getEnvironmentInfo(): {
  protocol: string;
  hostname: string;
  secure: boolean;
  userAgent: string;
  webSocketSupported: boolean;
} {
  // 检查是否在浏览器环境中运行
  if (typeof window === 'undefined') {
    return {
      protocol: 'unknown',
      hostname: 'server',
      secure: false,
      userAgent: 'unknown',
      webSocketSupported: false
    };
  }

  return {
    protocol: window.location.protocol,
    hostname: window.location.hostname,
    secure: window.location.protocol === 'https:',
    userAgent: navigator.userAgent,
    webSocketSupported: 'WebSocket' in window
  };
}
