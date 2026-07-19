import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import clsx from 'clsx';
import { DragManager } from '../lib/live2d/drag-manager';
import { ScaleManager } from '../lib/live2d/scale-manager';
import { LockManager, LockConfig } from '../lib/live2d/lock-manager';

export type Live2DLoadStage =
  | 'starting'
  | 'pixi'
  | 'cubismCore'
  | 'runtime'
  | 'settings'
  | 'moc'
  | 'pose'
  | 'physics'
  | 'textures'
  | 'ready';

export type Live2DLoadProgress = {
  path: string;
  progress: number; // 0-100
  stage: Live2DLoadStage;
};

export type Live2DViewerHandle = {
  loadModel: (path: string) => Promise<void>;
  playAction: (actionName: string) => void;
  playRandomAction: () => void;
  zoomIn: (centerX?: number, centerY?: number) => void;
  zoomOut: (centerX?: number, centerY?: number) => void;
  resetZoom: () => void;
  setScale: (scale: number, centerX?: number, centerY?: number) => void;
  getScale: () => number;
  lock: () => void;
  unlock: () => void;
  lockManager: LockManager | null;
  dispose: () => void;
};

export type Live2DViewerProps = {
  modelPath: string;
  onAction?: (actionName: string) => void;
  onLoadStart?: (path: string) => void;
  onLoadProgress?: (progress: Live2DLoadProgress) => void;
  onLoadComplete?: (path: string) => void;
  onLoadError?: (path: string, error: Error) => void;
  className?: string;
  style?: React.CSSProperties;
};

type PixiApp = any;

type Live2DModelInstance = any;

const CLICK_FLASH_MS = 120;

function toError(err: unknown): Error {
  if (err instanceof Error) return err;
  return new Error(typeof err === 'string' ? err : 'Unknown error');
}

export const Live2DViewer = forwardRef<Live2DViewerHandle, Live2DViewerProps>(
  function Live2DViewer(
    {
      modelPath,
      onAction,
      onLoadStart,
      onLoadProgress,
      onLoadComplete,
      onLoadError,
      className,
      style,
    },
    ref
  ) {
    const containerRef = useRef<HTMLDivElement | null>(null);

    const appRef = useRef<PixiApp | null>(null);
    const pixiRef = useRef<any>(null);
    const modelRef = useRef<Live2DModelInstance | null>(null);
    const tickerFnRef = useRef<((delta: number) => void) | null>(null);

    const initPromiseRef = useRef<Promise<void> | null>(null);
    const resizeObserverRef = useRef<ResizeObserver | null>(null);
    const loadTokenRef = useRef(0);
    const disposedRef = useRef(false);
    const dragManagerRef = useRef<DragManager | null>(null);
    const scaleManagerRef = useRef<ScaleManager | null>(null);
    const lockManagerRef = useRef<LockManager | null>(null);

    const [isClickFlashing, setIsClickFlashing] = useState(false);
    const [isLocked, setIsLocked] = useState(false);
    const [currentScale, setCurrentScale] = useState(1);
    const [lockStatus, setLockStatus] = useState<LockConfig>({
      lockAll: false
    });
    const [toast, setToast] = useState<{
      message: string;
      type: 'info' | 'warning' | 'error';
      visible: boolean;
    }>({ message: '', type: 'info', visible: false });

    // Toast显示函数
    const showToast = useCallback((message: string, type: 'info' | 'warning' | 'error' = 'info', duration = 2000) => {
      setToast({ message, type, visible: true });
      setTimeout(() => {
        setToast(prev => ({ ...prev, visible: false }));
      }, duration);
    }, []);

    const fitModelToView = useCallback(() => {
      const container = containerRef.current;
      const app = appRef.current;
      const model = modelRef.current;
      const dragManager = dragManagerRef.current;
      const scaleManager = scaleManagerRef.current;
      const lockManager = lockManagerRef.current;
      
      if (!container || !app || !model) return;

      const width = Math.max(1, container.clientWidth);
      const height = Math.max(1, container.clientHeight);

      if (app.renderer?.width !== width || app.renderer?.height !== height) {
        app.renderer.resize(width, height);
      }

      const padding = 24;

      const bounds =
        model.getLocalBounds?.() ?? { x: 0, y: 0, width: model.width, height: model.height };
      const contentWidth = Math.max(1, bounds.width);
      const contentHeight = Math.max(1, bounds.height);

      const baseFitScale = Math.min(
        (width - padding * 2) / contentWidth,
        (height - padding * 2) / contentHeight
      );

      if (Number.isFinite(baseFitScale) && baseFitScale > 0) {
        model.pivot?.set?.(bounds.x + bounds.width / 2, bounds.y + bounds.height);
        
        // Initialize drag manager position if not yet initialized
        if (dragManager && dragManager.getPosition().x === 0 && dragManager.getPosition().y === 0) {
          const centerX = width / 2;
          const bottomY = height - padding;
          dragManager.setPosition(centerX, bottomY);
        }
        
        // If not being dragged and not locked, center the model
        if ((!dragManager || !dragManager.isDraggingNow()) && !isLocked) {
          model.position?.set?.(width / 2, height - padding);
        }
        
        // Update scale using ScaleManager if available
        if (scaleManager) {
          // 只有在缩放功能未被禁用时才应用缩放
          if (scaleManager.isEnabled()) {
            const finalScale = isLocked ? scaleManager.getScale() : baseFitScale * scaleManager.getScale();
            // Stop any ongoing animation and apply final scale
            scaleManager.stopAnimation();
            scaleManager.setScale(finalScale / baseFitScale);
          }
        } else {
          // Fallback: direct scale application
          const finalScale = isLocked ? currentScale : baseFitScale * currentScale;
          model.scale?.set?.(finalScale, finalScale);
        }
      }
    }, [currentScale, isLocked]);

    const destroyCurrentModel = useCallback(() => {
      const app = appRef.current;
      const model = modelRef.current;
      if (!app || !model) return;

      try {
        if (tickerFnRef.current) {
          app.ticker.remove(tickerFnRef.current);
          tickerFnRef.current = null;
        }

        model.removeAllListeners?.();
        app.stage.removeChild(model);
        model.destroy?.({ children: true, texture: true, baseTexture: true });
      } catch {
        // ignore
      } finally {
        modelRef.current = null;
      }
    }, []);

    // Zoom and Lock functionality using ScaleManager
    const zoomIn = useCallback((centerX?: number, centerY?: number) => {
      if (scaleManagerRef.current) {
        scaleManagerRef.current.zoomIn(centerX, centerY);
      } else {
        setCurrentScale(prev => Math.min(prev * 1.2, 2.5));
        fitModelToView();
      }
    }, [fitModelToView]);

    const zoomOut = useCallback((centerX?: number, centerY?: number) => {
      if (scaleManagerRef.current) {
        scaleManagerRef.current.zoomOut(centerX, centerY);
      } else {
        setCurrentScale(prev => Math.max(prev * 0.8, 0.5));
        fitModelToView();
      }
    }, [fitModelToView]);

    const resetZoom = useCallback(() => {
      if (scaleManagerRef.current) {
        scaleManagerRef.current.reset();
      } else {
        setCurrentScale(1);
        fitModelToView();
      }
    }, [fitModelToView]);

    const setScale = useCallback((scale: number, centerX?: number, centerY?: number) => {
      if (scaleManagerRef.current) {
        scaleManagerRef.current.setScale(scale, centerX, centerY);
      } else {
        setCurrentScale(scale);
        fitModelToView();
      }
    }, [fitModelToView]);

    const getScale = useCallback(() => {
      if (scaleManagerRef.current) {
        return scaleManagerRef.current.getScale();
      }
      return currentScale;
    }, [currentScale]);

    // Mouse wheel zoom handler
    const handleWheel = useCallback((event: WheelEvent) => {
      if (!scaleManagerRef.current || !appRef.current?.view) return;
      
      // Prevent default to stop page scrolling
      event.preventDefault();
      
      // Get mouse position relative to canvas
      const rect = appRef.current.view.getBoundingClientRect();
      const mouseX = event.clientX - rect.left;
      const mouseY = event.clientY - rect.top;
      
      // Determine zoom direction based on wheel delta
      if (event.deltaY < 0) {
        scaleManagerRef.current.zoomIn(mouseX, mouseY);
      } else {
        scaleManagerRef.current.zoomOut(mouseX, mouseY);
      }
    }, []);

    // Keyboard shortcut handler
    const handleKeyDown = useCallback((event: KeyboardEvent) => {
      // Handle locking/unlocking shortcuts first (always available)
      if (lockManagerRef.current) {
        const key = event.key.toLowerCase();
        
        // L key: toggle all locks
        if (key === 'l') {
          event.preventDefault();
          lockManagerRef.current.toggle();
          return;
        }
      }
      
      // Handle zoom shortcuts (always enabled when canvas is available)
      if (scaleManagerRef.current && appRef.current?.view) {
        // Handle +/- keys for zoom
        if (event.key === '+' || event.key === '=') {
          event.preventDefault();
          const rect = appRef.current.view.getBoundingClientRect();
          const centerX = rect.width / 2;
          const centerY = rect.height / 2;
          scaleManagerRef.current.zoomIn(centerX, centerY);
        } else if (event.key === '-' || event.key === '_') {
          event.preventDefault();
          const rect = appRef.current.view.getBoundingClientRect();
          const centerX = rect.width / 2;
          const centerY = rect.height / 2;
          scaleManagerRef.current.zoomOut(centerX, centerY);
        }
        
        // Handle Ctrl+0 for reset
        if (event.key === '0' && (event.ctrlKey || event.metaKey)) {
          event.preventDefault();
          scaleManagerRef.current.reset();
        }
      }
    }, []);



    const ensurePixiApp = useCallback(async () => {
      if (disposedRef.current) return;
      if (appRef.current) return;
      if (!containerRef.current) return;

      if (initPromiseRef.current) {
        await initPromiseRef.current;
        return;
      }

      initPromiseRef.current = (async () => {
        const PIXI = await import('pixi.js');
        pixiRef.current = PIXI;

        const container = containerRef.current;
        if (!container) return;

        const app = new PIXI.Application({
          width: Math.max(1, container.clientWidth),
          height: Math.max(1, container.clientHeight),
          autoDensity: true,
          antialias: true,
          backgroundAlpha: 0,
          resolution: typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1,
        });

        appRef.current = app;

        const view: HTMLCanvasElement = app.view;
        view.style.width = '100%';
        view.style.height = '100%';
        view.style.display = 'block';

        container.appendChild(view);

        resizeObserverRef.current = new ResizeObserver(() => {
          fitModelToView();
        });
        resizeObserverRef.current.observe(container);
      })();

      await initPromiseRef.current;
    }, [fitModelToView]);

    const ensureCubismCore = useCallback(async () => {
      if (typeof window === 'undefined') return;
      if ((window as any).Live2DCubismCore) return;

      const w = window as any;
      if (w.__live2dCubismCoreLoadingPromise) {
        await w.__live2dCubismCoreLoadingPromise;
        return;
      }

      const src =
        process.env.NEXT_PUBLIC_LIVE2D_CUBISM_CORE_URL ||
        'https://cubism.live2d.com/sdk-web/cubismcore/live2dcubismcore.min.js';

      w.__live2dCubismCoreLoadingPromise = new Promise<void>((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.async = true;
        script.crossOrigin = 'anonymous';
        script.dataset.live2dCubismCore = 'true';

        script.onload = () => resolve();
        script.onerror = () => reject(new Error(`Failed to load Cubism Core: ${src}`));

        document.head.appendChild(script);
      });

      await w.__live2dCubismCoreLoadingPromise;
    }, []);

    const playAction = useCallback(
      (actionName: string) => {
        const model = modelRef.current;
        if (!model) return;

        try {
          onAction?.(actionName);

          if (typeof model.motion === 'function') {
            model.motion(actionName);
            return;
          }

          const internal = model.internalModel;
          const motionManager = internal?.motionManager;
          if (motionManager?.startMotion) {
            motionManager.startMotion(actionName, 0);
          }
        } catch (error) {
          console.error('Failed to play Live2D action:', actionName, error);
        }
      },
      [onAction]
    );

    const getAvailableMotionGroups = useCallback((): string[] => {
      const model = modelRef.current;
      if (!model) return [];

      const fromSettings = model.internalModel?.settings?.motions;
      if (fromSettings && typeof fromSettings === 'object') {
        const keys = Object.keys(fromSettings);
        if (keys.length > 0) return keys;
      }

      const fromMotionManager = model.internalModel?.motionManager?.motionGroups;
      if (fromMotionManager && typeof fromMotionManager === 'object') {
        const keys = Object.keys(fromMotionManager);
        if (keys.length > 0) return keys;
      }

      return ['Idle', 'TapBody', 'TapHead'];
    }, []);

    const playRandomAction = useCallback(() => {
      const groups = getAvailableMotionGroups();
      if (groups.length === 0) return;

      const actionName = groups[Math.floor(Math.random() * groups.length)];
      playAction(actionName);
    }, [getAvailableMotionGroups, playAction]);

    const flashClick = useCallback(() => {
      setIsClickFlashing(true);
      window.setTimeout(() => setIsClickFlashing(false), CLICK_FLASH_MS);
    }, []);

    const loadModel = useCallback(
      async (path: string) => {
        if (!path) return;

        disposedRef.current = false;
        const token = ++loadTokenRef.current;

        const notifyProgress = (progress: number, stage: Live2DLoadStage) => {
          onLoadProgress?.({
            path,
            progress: Math.max(0, Math.min(100, Math.round(progress))),
            stage,
          });
        };

        try {
          onLoadStart?.(path);
          notifyProgress(0, 'starting');

          await ensurePixiApp();
          if (disposedRef.current || token !== loadTokenRef.current) return;
          notifyProgress(5, 'pixi');

          const app = appRef.current;
          if (!app) return;

          destroyCurrentModel();

          const PIXI = pixiRef.current ?? (await import('pixi.js'));
          pixiRef.current = PIXI;

          if (typeof window !== 'undefined') {
            (window as any).PIXI = PIXI;
          }

          await ensureCubismCore();
          if (disposedRef.current || token !== loadTokenRef.current) return;
          notifyProgress(10, 'cubismCore');

          if (typeof window !== 'undefined' && !(window as any).Live2DCubismCore) {
            throw new Error('Cubism Core is not available on window.Live2DCubismCore');
          }

          const live2d = await import('pixi-live2d-display/cubism4');
          notifyProgress(15, 'runtime');

          const Live2DModel = (live2d as any).Live2DModel ?? (live2d as any).default?.Live2DModel;
          if (!Live2DModel) {
            throw new Error('pixi-live2d-display: Live2DModel export not found');
          }

          let resolveLoaded: (() => void) | null = null;
          let rejectLoaded: ((e: any) => void) | null = null;

          const loadedPromise = new Promise<void>((resolve, reject) => {
            resolveLoaded = resolve;
            rejectLoaded = reject;
          });

          const model = Live2DModel.fromSync(path, {
            autoInteract: false,
            autoUpdate: false,
            onLoad: () => resolveLoaded?.(),
            onError: (e: any) => rejectLoaded?.(e),
          }) as Live2DModelInstance;

          model.once?.('settingsJSONLoaded', () => notifyProgress(25, 'settings'));
          model.once?.('modelLoaded', () => notifyProgress(55, 'moc'));
          model.once?.('poseLoaded', () => notifyProgress(65, 'pose'));
          model.once?.('physicsLoaded', () => notifyProgress(70, 'physics'));
          model.once?.('textureLoaded', () => notifyProgress(95, 'textures'));

          await loadedPromise;

          if (disposedRef.current || token !== loadTokenRef.current) {
            model.destroy?.({ children: true, texture: true, baseTexture: true });
            return;
          }

          modelRef.current = model;
          app.stage.addChild(model);

          model.interactive = true;
          model.buttonMode = true;

          // Initialize drag manager and scale manager
          if (app.view && model) {
            dragManagerRef.current = new DragManager(
              app.view as HTMLCanvasElement,
              model,
              {
                enabled: !isLocked,
                smoothing: true,
                cursor: isLocked ? 'default' : 'grab'
              }
            );

            // Initialize scale manager
            scaleManagerRef.current = new ScaleManager(model, {
              enabled: true,
              minScale: 0.1,
              maxScale: 2.5,
              initialScale: 0.2,
              scaleStep: 0.02,
              smoothing: true,
              smoothDuration: 200
            });

            // Initialize lock manager
            if (dragManagerRef.current && scaleManagerRef.current) {
              lockManagerRef.current = new LockManager(
                dragManagerRef.current,
                scaleManagerRef.current,
                {
                  lockAll: lockStatus.lockAll
                }
              );

              // 设置提示函数
              lockManagerRef.current.setToastFunction(showToast);

              // 添加锁定状态变化回调
              lockManagerRef.current.addLockStatusCallback((status) => {
                setLockStatus(status);
                setIsLocked(status.lockAll || false);
              });

              // 立即同步当前锁定状态
              const currentStatus = lockManagerRef.current.getStatus();
              setLockStatus(currentStatus);
              setIsLocked(currentStatus.lockAll || false);
            }

            // Add scale change callback to update UI
            scaleManagerRef.current.addScaleChangeCallback((scale) => {
              setCurrentScale(scale);
            });
          }

          model.on?.('pointertap', () => {
            const dragManager = dragManagerRef.current;
            if (!dragManager || !dragManager.isDraggingNow()) {
              flashClick();
              playRandomAction();
            }
          });

          tickerFnRef.current = () => {
            model.update?.(app.ticker.deltaMS);
          };
          app.ticker.add(tickerFnRef.current);

          fitModelToView();

          notifyProgress(100, 'ready');
          onLoadComplete?.(path);
        } catch (err) {
          const error = toError(err);
          onLoadError?.(path, error);
          throw error;
        }
      },
      [
        destroyCurrentModel,
        ensureCubismCore,
        ensurePixiApp,
        fitModelToView,
        flashClick,
        isLocked,
        onLoadComplete,
        onLoadError,
        onLoadProgress,
        onLoadStart,
        playRandomAction,
      ]
    );

    const dispose = useCallback(() => {
      disposedRef.current = true;

      const app = appRef.current;
      if (app) {
        try {
          destroyCurrentModel();
          resizeObserverRef.current?.disconnect();
          resizeObserverRef.current = null;

          app.destroy(true, { children: true, texture: true, baseTexture: true });
        } catch {
          // ignore
        }
      }

      // Clean up scale manager
      if (scaleManagerRef.current) {
        scaleManagerRef.current.destroy();
        scaleManagerRef.current = null;
      }

      appRef.current = null;
      pixiRef.current = null;
      initPromiseRef.current = null;

      const container = containerRef.current;
      if (container) {
        container.innerHTML = '';
      }
    }, [destroyCurrentModel]);

    useImperativeHandle(
      ref,
      () => ({
        loadModel,
        playAction,
        playRandomAction,
        zoomIn,
        zoomOut,
        resetZoom,
        setScale,
        getScale,
        lock: () => lockManagerRef.current?.lockAll(),
        unlock: () => lockManagerRef.current?.unlockAll(),
        lockManager: lockManagerRef.current,
        dispose,
      }),
      [dispose, loadModel, playAction, playRandomAction, zoomIn, zoomOut, resetZoom, setScale, getScale]
    );

    useEffect(() => {
      disposedRef.current = false;
      
      // Add event listeners for zoom functionality
      const canvas = appRef.current?.view as HTMLCanvasElement;
      if (canvas) {
        canvas.addEventListener('wheel', handleWheel, { passive: false });
        document.addEventListener('keydown', handleKeyDown);
      }
      
      return () => {
        // Clean up event listeners
        if (canvas) {
          canvas.removeEventListener('wheel', handleWheel);
        }
        document.removeEventListener('keydown', handleKeyDown);
        dispose();
      };
    }, [dispose, handleWheel, handleKeyDown]);

    useEffect(() => {
      if (!modelPath) return;

      loadModel(modelPath).catch((error) => {
        console.error('Failed to load Live2D model:', error);
      });
    }, [modelPath]); // 只依赖modelPath，避免无限循环

    return (
      <div
        className={clsx(
          'relative h-full w-full overflow-hidden',
          isClickFlashing && 'ring-2 ring-blue-500 ring-offset-2 ring-offset-transparent',
          // 根据锁定状态设置鼠标光标
          lockStatus.lockAll && 'cursor-not-allowed',
          !lockStatus.lockAll && 'cursor-grab',
          !lockStatus.lockAll && 'cursor-grabbing',
          className
        )}
        style={style}
      >
        <div ref={containerRef} className="absolute inset-0" />
        
        {/* 简单锁定按钮 */}
        {lockManagerRef.current && (
          <div className="absolute right-3 top-40 z-10">
            <button 
              onClick={() => lockManagerRef.current?.toggle()}
              className={clsx(
                'text-sm py-2 px-3 rounded-lg transition-colors flex items-center gap-2 shadow-md',
                lockStatus.lockAll 
                  ? 'bg-red-500 text-white hover:bg-red-600' 
                  : 'bg-white/90 text-gray-700 hover:bg-white/95'
              )}
              title={lockStatus.lockAll ? '点击解锁拖动和缩放' : '点击锁定拖动和缩放'}
            >
              {lockStatus.lockAll ? '🔒 已锁定' : '🔓 已解锁'}
            </button>
          </div>
        )}
        
        {/* Toast提示组件 */}
        {toast.visible && (
          <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 z-50">
            <div className={clsx(
              'px-4 py-2 rounded-lg shadow-lg text-white text-sm font-medium max-w-sm text-center',
              toast.type === 'error' && 'bg-red-500',
              toast.type === 'warning' && 'bg-yellow-500',
              toast.type === 'info' && 'bg-blue-500'
            )}>
              {toast.message}
            </div>
          </div>
        )}
      </div>
    );
  }
);

export default Live2DViewer;
