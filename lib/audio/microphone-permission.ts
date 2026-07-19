/**
 * 麦克风权限管理与浏览器兼容性检查工具
 */

/**
 * 检测浏览器是否支持 getUserMedia
 */
export const hasGetUserMedia = (): boolean => {
  // 检查是否在浏览器环境中运行
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return false;
  }
  
  return !!(
    navigator.mediaDevices &&
    navigator.mediaDevices.getUserMedia
  );
};

/**
 * 检测浏览器是否支持 Web Audio API
 */
export const hasWebAudioAPI = (): boolean => {
  // 检查是否在浏览器环境中运行
  if (typeof window === 'undefined') {
    return false;
  }
  
  return !!(
    window.AudioContext ||
    (window as any).webkitAudioContext
  );
};

/**
 * 获取浏览器支持的音频编码格式
 */
export const getSupportedAudioFormats = (): string[] => {
  const formats: string[] = [];
  
  // 检查基本的 PCM 支持
  if (hasGetUserMedia() && hasWebAudioAPI()) {
    formats.push('PCM16');
    formats.push('PCM24');
  }
  
  return formats;
};

/**
 * 主动请求麦克风权限
 */
export async function requestMicrophonePermission(): Promise<boolean> {
  try {
    // 首先检查浏览器支持
    if (!hasGetUserMedia()) {
      throw new Error('您的浏览器不支持麦克风功能，请使用 Chrome、Firefox 或 Edge 浏览器');
    }

    // 请求音频流（只是为了请求权限，立即停止所有轨道）
    const stream = await navigator.mediaDevices.getUserMedia({ 
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    });
    
    // 立即停止所有轨道（只是为了请求权限）
    stream.getTracks().forEach(track => track.stop());
    
    console.log('✅ 麦克风权限请求成功');
    return true;
  } catch (error: any) {
    console.error('麦克风权限请求失败:', error);
    
    if (error.name === 'NotAllowedError') {
      throw new Error('麦克风权限被拒绝。请在浏览器设置中允许麦克风访问，然后重试。');
    } else if (error.name === 'NotFoundError') {
      throw new Error('未检测到麦克风设备。请检查设备连接后重试。');
    } else if (error.name === 'NotSupportedError') {
      throw new Error('您的浏览器不支持麦克风功能，请使用 Chrome、Firefox 或 Edge 浏览器');
    } else if (error.name === 'NotReadableError') {
      throw new Error('麦克风设备被其他应用占用。请关闭其他使用麦克风的应用后重试。');
    } else if (error.name === 'OverconstrainedError') {
      throw new Error('麦克风设备不支持所需的音频设置。');
    }
    
    // 其他未知错误
    throw new Error(`麦克风权限请求失败: ${error.message || '未知错误'}`);
  }
}

/**
 * 检查麦克风权限状态
 */
export async function checkMicrophonePermission(): Promise<'granted' | 'denied' | 'prompt'> {
  try {
    // 检查是否在浏览器环境中运行
    if (typeof navigator === 'undefined' || !navigator.permissions) {
      // 如果不支持 Permissions API，返回 'prompt'
      return 'prompt';
    }

    // 查询麦克风权限状态
    const permission = await navigator.permissions.query({ name: 'microphone' as PermissionName });
    return permission.state;
  } catch (error) {
    console.warn('无法查询麦克风权限状态:', error);
    return 'prompt';
  }
}

/**
 * 获取浏览器兼容性信息
 */
export interface BrowserCompatibility {
  getUserMedia: boolean;
  webAudioAPI: boolean;
  permissions: boolean;
  recommended: boolean;
  issues: string[];
}

/**
 * 检查浏览器兼容性
 */
export const checkBrowserCompatibility = (): BrowserCompatibility => {
  const issues: string[] = [];
  const getUserMediaSupported = hasGetUserMedia();
  const webAudioSupported = hasWebAudioAPI();
  const permissionsSupported = !!navigator.permissions;
  
  if (!getUserMediaSupported) {
    issues.push('浏览器不支持 getUserMedia API');
  }
  
  if (!webAudioSupported) {
    issues.push('浏览器不支持 Web Audio API');
  }
  
  if (!permissionsSupported) {
    issues.push('浏览器不支持权限管理 API');
  }
  
  // 推荐使用现代浏览器
  const isModernBrowser = getUserMediaSupported && webAudioSupported;
  const isRecommended = isModernBrowser;
  
  if (!isRecommended) {
    issues.push('建议使用最新版本的 Chrome、Firefox 或 Edge 浏览器');
  }
  
  return {
    getUserMedia: getUserMediaSupported,
    webAudioAPI: webAudioSupported,
    permissions: permissionsSupported,
    recommended: isRecommended,
    issues
  };
};