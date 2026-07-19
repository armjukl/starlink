import { DragManager } from './drag-manager';
import { ScaleManager } from './scale-manager';

// 定义锁定配置接口
export interface LockConfig {
  lockAll?: boolean;         // 锁定拖动和缩放，但允许交互
}

// 导出LockManager类
export class LockManager {
  private dragManager: DragManager;
  private scaleManager: ScaleManager;
  private config: LockConfig;
  private lockStatusCallbacks: ((status: LockConfig) => void)[] = [];
  private toastFunction: ((message: string, type: 'info' | 'warning' | 'error') => void) | null = null;

  constructor(
    dragManager: DragManager,
    scaleManager: ScaleManager,
    config: LockConfig = {}
  ) {
    this.dragManager = dragManager;
    this.scaleManager = scaleManager;
    this.config = {
      lockAll: config.lockAll ?? false
    };

    // 应用初始锁定状态
    this.applyLockStatus();
    
    // 从本地存储加载锁定状态
    this.loadLockStatus();
  }

  // 锁定拖动和缩放，但允许交互
  lockAll(): void {
    this.config.lockAll = true;
    
    this.applyLockStatus();
    this.saveLockStatus();
    this.notifyLockStatusChange();
  }

  // 解锁拖动和缩放
  unlockAll(): void {
    this.config.lockAll = false;
    
    this.applyLockStatus();
    this.saveLockStatus();
    this.notifyLockStatusChange();
  }

  // 切换锁定状态
  toggle(): void {
    if (this.isLocked()) {
      this.unlockAll();
    } else {
      this.lockAll();
    }
  }

  // 检查是否已锁定
  isLocked(): boolean {
    return this.config.lockAll === true;
  }

  // 获取当前锁定状态
  getStatus(): LockConfig {
    return { ...this.config };
  }

  // 添加锁定状态变化回调
  addLockStatusCallback(callback: (status: LockConfig) => void): void {
    this.lockStatusCallbacks.push(callback);
  }

  // 移除锁定状态变化回调
  removeLockStatusCallback(callback: (status: LockConfig) => void): void {
    const index = this.lockStatusCallbacks.indexOf(callback);
    if (index > -1) {
      this.lockStatusCallbacks.splice(index, 1);
    }
  }

  // 设置提示函数（用于显示锁定提示）
  setToastFunction(toastFunction: (message: string, type: 'info' | 'warning' | 'error') => void): void {
    this.toastFunction = toastFunction;
  }



  // 私有方法：应用锁定状态到相关管理器
  private applyLockStatus(): void {
    // 应用拖动和缩放锁定
    if (this.config.lockAll) {
      this.dragManager.disable();
      this.scaleManager.disable();
    } else {
      this.dragManager.enable();
      this.scaleManager.enable();
    }
  }

  // 私有方法：通知锁定状态变化
  private notifyLockStatusChange(): void {
    this.lockStatusCallbacks.forEach(callback => {
      callback(this.getStatus());
    });
  }

  // 私有方法：显示锁定提示
  private showLockToast(message: string): void {
    if (this.toastFunction) {
      this.toastFunction(message, 'warning');
    } else {
      console.warn(message);
    }
  }

  // 私有方法：保存锁定状态到本地存储
  private saveLockStatus(): void {
    try {
      localStorage.setItem(
        'live2d_lock_status',
        JSON.stringify(this.config)
      );
    } catch (error) {
      console.error('保存锁定状态失败:', error);
    }
  }

  // 私有方法：从本地存储加载锁定状态
  private loadLockStatus(): void {
    try {
      const saved = localStorage.getItem('live2d_lock_status');
      if (saved) {
        const parsedConfig = JSON.parse(saved);
        
        // 确保只更新已存在的配置项
        this.config = {
          ...this.config,
          ...parsedConfig
        };
        
        this.applyLockStatus();
      }
    } catch (error) {
      console.error('加载锁定状态失败:', error);
    }
  }
}