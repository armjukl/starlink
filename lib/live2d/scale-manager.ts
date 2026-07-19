export interface ScaleConfig {
  enabled?: boolean;       // 是否启用缩放功能，默认 true
  minScale: number;        // 最小缩放比例，默认 0.5
  maxScale: number;        // 最大缩放比例，默认 2.5
  initialScale: number;    // 初始缩放比例，默认 1.0
  scaleStep: number;       // 每次缩放增量，默认 0.1
  smoothing: boolean;      // 是否平滑缩放，默认 true
  smoothDuration: number;  // 平滑时间（ms），默认 200
}

type Live2DModel = any;

export class ScaleManager {
  private model: Live2DModel;
  private config: ScaleConfig;
  private currentScale: number;
  private targetScale: number;
  private isAnimating: boolean = false;
  private animationId: number | null = null;
  private scaleChangeCallbacks: ((scale: number) => void)[] = [];

  constructor(model: Live2DModel, config: Partial<ScaleConfig> = {}) {
    this.model = model;
    this.config = {
      enabled: config.enabled ?? true,
      minScale: config.minScale ?? 0.5,
      maxScale: config.maxScale ?? 2.5,
      initialScale: config.initialScale ?? 1.0,
      scaleStep: config.scaleStep ?? 0.1,
      smoothing: config.smoothing ?? true,
      smoothDuration: config.smoothDuration ?? 200
    };
    
    this.currentScale = this.config.initialScale;
    this.targetScale = this.config.initialScale;
    this.applyScale(this.currentScale);
  }

  // 添加缩放变化回调
  addScaleChangeCallback(callback: (scale: number) => void): void {
    this.scaleChangeCallbacks.push(callback);
  }

  // 移除缩放变化回调
  removeScaleChangeCallback(callback: (scale: number) => void): void {
    const index = this.scaleChangeCallbacks.indexOf(callback);
    if (index > -1) {
      this.scaleChangeCallbacks.splice(index, 1);
    }
  }

  // 通知缩放变化
  private notifyScaleChange(): void {
    this.scaleChangeCallbacks.forEach(callback => callback(this.currentScale));
  }

  // 应用缩放到模型
  private applyScale(scale: number): void {
    if (this.model && this.model.scale) {
      this.model.scale.set(scale, scale);
      this.currentScale = scale;
      this.notifyScaleChange();
    }
  }

  // 平滑缩放动画
  private animateScale(fromScale: number, toScale: number, duration: number): void {
    const startTime = Date.now();
    
    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      // 使用缓动函数实现平滑动画
      const easedProgress = this.easeInOutCubic(progress);
      const currentScale = fromScale + (toScale - fromScale) * easedProgress;
      
      this.applyScale(currentScale);
      
      if (progress < 1) {
        this.animationId = requestAnimationFrame(animate);
      } else {
        this.isAnimating = false;
        this.animationId = null;
      }
    };
    
    this.isAnimating = true;
    this.animationId = requestAnimationFrame(animate);
  }

  // 缓动函数：三次方缓入缓出
  private easeInOutCubic(t: number): number {
    return t < 0.5
      ? 4 * t * t * t
      : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  // 增大缩放
  zoomIn(centerX?: number, centerY?: number): void {
    if (!this.config.enabled) return;
    const newScale = Math.min(this.currentScale + this.config.scaleStep, this.config.maxScale);
    this.setScale(newScale, centerX, centerY);
  }

  // 减小缩放
  zoomOut(centerX?: number, centerY?: number): void {
    if (!this.config.enabled) return;
    const newScale = Math.max(this.currentScale - this.config.scaleStep, this.config.minScale);
    this.setScale(newScale, centerX, centerY);
  }
  
  // 设置绝对缩放值
  setScale(scale: number, centerX?: number, centerY?: number): void {
    if (!this.config.enabled) return;
    
    // 确保缩放值在允许范围内
    scale = Math.max(this.config.minScale, Math.min(scale, this.config.maxScale));
    
    // 如果缩放值没有变化，则不执行任何操作
    if (Math.abs(scale - this.currentScale) < 0.001) return;
    
    // 如果需要保持缩放中心点的位置
    if (centerX !== undefined && centerY !== undefined && this.model.position) {
      const scaleRatio = scale / this.currentScale;
      const currentX = this.model.position.x;
      const currentY = this.model.position.y;
      
      // 调整位置以保持缩放中心点
      const newX = centerX - (centerX - currentX) * scaleRatio;
      const newY = centerY - (centerY - currentY) * scaleRatio;
      
      // 先设置新位置，再进行缩放
      this.model.position.x = newX;
      this.model.position.y = newY;
    }
    
    this.targetScale = scale;
    
    // 如果启用平滑缩放，使用动画
    if (this.config.smoothing) {
      this.animateScale(this.currentScale, this.targetScale, this.config.smoothDuration);
    } else {
      this.applyScale(this.targetScale);
    }
  }

  // 重置为初始缩放
  reset(): void {
    this.setScale(this.config.initialScale);
  }

  // 获取当前缩放值
  getScale(): number {
    return this.currentScale;
  }

  // 获取配置
  getConfig(): ScaleConfig {
    return { ...this.config };
  }

  // 设置配置
  setConfig(config: Partial<ScaleConfig>): void {
    this.config = { ...this.config, ...config };
    // 确保当前缩放值在新的范围内
    this.currentScale = Math.max(this.config.minScale, Math.min(this.currentScale, this.config.maxScale));
  }

  // 停止当前动画
  stopAnimation(): void {
    if (this.animationId !== null) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
      this.isAnimating = false;
    }
  }

  // 检查是否正在动画
  isAnimatingScale(): boolean {
    return this.isAnimating;
  }

  // 启用缩放功能
  enable(): void {
    if (this.config) {
      this.config.enabled = true;
    }
  }

  // 禁用缩放功能
  disable(): void {
    if (this.config) {
      this.config.enabled = false;
    }
  }

  // 检查缩放功能是否启用
  isEnabled(): boolean {
    return this.config.enabled ?? true;
  }

  // 销毁管理器
  destroy(): void {
    this.stopAnimation();
    this.scaleChangeCallbacks = [];
  }
}