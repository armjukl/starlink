export interface DragConfig {
  enabled: boolean          // 是否启用拖动，默认 true
  bounds?: {               // 拖动边界限制（可选）
    minX: number
    maxX: number
    minY: number
    maxY: number
  }
  smoothing: boolean        // 是否平滑拖动，默认 true
  cursor: string           // 拖动时的光标样式
}

export interface Position {
  x: number
  y: number
}

type Live2DModel = any

export class DragManager {
  private canvas: HTMLCanvasElement
  private model: Live2DModel
  private config: DragConfig
  
  private isDragging = false
  private dragStartX = 0
  private dragStartY = 0
  private modelStartX = 0
  private modelStartY = 0
  
  private modelX = 0
  private modelY = 0
  private initialModelX = 0
  private initialModelY = 0
  
  private activePointers = new Map<number, { x: number; y: number }>()
  
  constructor(canvas: HTMLCanvasElement, model: Live2DModel, config: Partial<DragConfig> = {}) {
    this.canvas = canvas
    this.model = model
    this.config = {
      enabled: config.enabled ?? true,
      bounds: config.bounds,
      smoothing: config.smoothing ?? true,
      cursor: config.cursor ?? 'grab'
    }
    
    this.setupListeners()
    this.updateCursor()
  }
  
  private setupListeners() {
    // Mouse events
    this.canvas.addEventListener('mousedown', this.onMouseDown.bind(this))
    this.canvas.addEventListener('mousemove', this.onMouseMove.bind(this))
    this.canvas.addEventListener('mouseup', this.onMouseUp.bind(this))
    this.canvas.addEventListener('mouseleave', this.onMouseUp.bind(this))
    
    // Touch events
    this.canvas.addEventListener('touchstart', this.onTouchStart.bind(this), { passive: false })
    this.canvas.addEventListener('touchmove', this.onTouchMove.bind(this), { passive: false })
    this.canvas.addEventListener('touchend', this.onTouchEnd.bind(this))
    this.canvas.addEventListener('touchcancel', this.onTouchEnd.bind(this))
  }
  
  private updateCursor() {
    if (this.config.enabled) {
      this.canvas.style.cursor = this.isDragging ? 'grabbing' : 'grab'
    } else {
      this.canvas.style.cursor = 'default'
    }
  }
  
  private onMouseDown(event: MouseEvent) {
    if (!this.config.enabled) return
    
    event.preventDefault()
    event.stopPropagation()
    
    this.isDragging = true
    this.dragStartX = event.clientX
    this.dragStartY = event.clientY
    this.modelStartX = this.modelX
    this.modelStartY = this.modelY
    
    this.updateCursor()
  }
  
  private onMouseMove(event: MouseEvent) {
    if (!this.isDragging || !this.config.enabled) return
    
    event.preventDefault()
    
    const deltaX = event.clientX - this.dragStartX
    const deltaY = event.clientY - this.dragStartY
    
    let newX = this.modelStartX + deltaX
    let newY = this.modelStartY + deltaY
    
    // Apply boundary constraints
    if (this.config.bounds) {
      newX = Math.max(this.config.bounds.minX, Math.min(newX, this.config.bounds.maxX))
      newY = Math.max(this.config.bounds.minY, Math.min(newY, this.config.bounds.maxY))
    }
    
    this.updatePosition(newX, newY)
  }
  
  private onMouseUp() {
    this.isDragging = false
    this.updateCursor()
  }
  
  private onTouchStart(event: TouchEvent) {
    if (!this.config.enabled) return
    
    event.preventDefault()
    
    for (const touch of Array.from(event.changedTouches)) {
      if (this.activePointers.size === 0) {
        // First touch - start dragging
        this.isDragging = true
        this.dragStartX = touch.clientX
        this.dragStartY = touch.clientY
        this.modelStartX = this.modelX
        this.modelStartY = this.modelY
        
        this.activePointers.set(touch.identifier, {
          x: touch.clientX,
          y: touch.clientY
        })
        
        this.updateCursor()
        break
      }
    }
  }
  
  private onTouchMove(event: TouchEvent) {
    if (!this.isDragging || !this.config.enabled) return
    
    event.preventDefault()
    
    for (const touch of Array.from(event.changedTouches)) {
      const pointer = this.activePointers.get(touch.identifier)
      if (pointer) {
        pointer.x = touch.clientX
        pointer.y = touch.clientY
        
        const deltaX = touch.clientX - this.dragStartX
        const deltaY = touch.clientY - this.dragStartY
        
        let newX = this.modelStartX + deltaX
        let newY = this.modelStartY + deltaY
        
        // Apply boundary constraints
        if (this.config.bounds) {
          newX = Math.max(this.config.bounds.minX, Math.min(newX, this.config.bounds.maxX))
          newY = Math.max(this.config.bounds.minY, Math.min(newY, this.config.bounds.maxY))
        }
        
        this.updatePosition(newX, newY)
        break
      }
    }
  }
  
  private onTouchEnd() {
    this.isDragging = false
    this.activePointers.clear()
    this.updateCursor()
  }
  
  private updatePosition(x: number, y: number) {
    this.modelX = x
    this.modelY = y
    
    // Update model position using PIXI/pixi-live2d-display API
    if (this.model) {
      if (this.model.position) {
        this.model.position.set(x, y)
      } else if (this.model.x !== undefined && this.model.y !== undefined) {
        this.model.x = x
        this.model.y = y
      }
    }
  }
  
  // Public API
  
  /**
   * 启用拖动功能
   */
  enable(): void {
    this.config.enabled = true
    this.updateCursor()
  }
  
  /**
   * 禁用拖动功能
   */
  disable(): void {
    this.config.enabled = false
    this.isDragging = false
    this.updateCursor()
  }
  
  /**
   * 获取模型当前位置
   */
  getPosition(): Position {
    return { x: this.modelX, y: this.modelY }
  }
  
  /**
   * 设置模型位置
   */
  setPosition(x: number, y: number): void {
    // Apply boundary constraints
    if (this.config.bounds) {
      x = Math.max(this.config.bounds.minX, Math.min(x, this.config.bounds.maxX))
      y = Math.max(this.config.bounds.minY, Math.min(y, this.config.bounds.maxY))
    }
    
    this.updatePosition(x, y)
  }
  
  /**
   * 重置模型位置为初始值
   */
  reset(): void {
    this.setPosition(this.initialModelX, this.initialModelY)
  }
  
  /**
   * 设置拖动边界
   */
  setBounds(bounds: { minX: number; maxX: number; minY: number; maxY: number } | undefined): void {
    this.config.bounds = bounds
  }
  
  /**
   * 检查是否正在拖动
   */
  isDraggingNow(): boolean {
    return this.isDragging
  }
  
  /**
   * 清理监听器（在组件卸载时调用）
   */
  destroy(): void {
    // Remove event listeners
    this.canvas.removeEventListener('mousedown', this.onMouseDown.bind(this))
    this.canvas.removeEventListener('mousemove', this.onMouseMove.bind(this))
    this.canvas.removeEventListener('mouseup', this.onMouseUp.bind(this))
    this.canvas.removeEventListener('mouseleave', this.onMouseUp.bind(this))
    
    this.canvas.removeEventListener('touchstart', this.onTouchStart.bind(this))
    this.canvas.removeEventListener('touchmove', this.onTouchMove.bind(this))
    this.canvas.removeEventListener('touchend', this.onTouchEnd.bind(this))
    this.canvas.removeEventListener('touchcancel', this.onTouchEnd.bind(this))
  }
}