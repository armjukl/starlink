import React, { useCallback, useMemo, useRef, useState, useEffect } from 'react';
import clsx from 'clsx';
import { AlertCircle, Loader2, RefreshCw, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';
import Live2DViewer, { Live2DLoadProgress, Live2DViewerHandle } from './Live2DViewer';

export type Live2DModelPanelProps = {
  defaultModelPath?: string;
  className?: string;
};

const FALLBACK_MODEL_PATH = '/live2d/chara/chara.model3.json';

export default function Live2DModelPanel({ defaultModelPath, className }: Live2DModelPanelProps) {
  const viewerRef = useRef<Live2DViewerHandle | null>(null);

  const initialPath = useMemo(() => {
    return (
      defaultModelPath ||
      process.env.NEXT_PUBLIC_LIVE2D_MODEL_PATH ||
      process.env.NEXT_PUBLIC_LIVE2D_DEFAULT_MODEL_PATH ||
      FALLBACK_MODEL_PATH
    );
  }, [defaultModelPath]);

  const [inputPath, setInputPath] = useState(initialPath);
  const [activePath, setActivePath] = useState(initialPath);

  const [loadStatus, setLoadStatus] = useState<'idle' | 'loading' | 'loaded' | 'error'>('idle');
  const [loadProgress, setLoadProgress] = useState(0);
  const [loadStage, setLoadStage] = useState<string>('');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [lastAction, setLastAction] = useState<string | null>(null);
  const [currentScale, setCurrentScale] = useState(1.0);

  const triggerLoad = useCallback(async () => {
    const path = inputPath.trim();
    if (!path) return;

    if (path !== activePath) {
      setActivePath(path);
      return;
    }

    try {
      await viewerRef.current?.loadModel(path);
    } catch {
      // error state will be updated via onLoadError
    }
  }, [activePath, inputPath]);

  const handleLoadProgress = useCallback((p: Live2DLoadProgress) => {
    setLoadProgress(p.progress);
    setLoadStage(p.stage);
  }, []);

  const handleLoadStart = useCallback(() => {
    setLoadStatus('loading');
    setLoadProgress(0);
    setLoadStage('starting');
    setLoadError(null);
  }, []);

  const handleLoadComplete = useCallback(() => {
    setLoadStatus('loaded');
    setLoadProgress(100);
    setLoadStage('ready');
    setLoadError(null);
  }, []);

  const handleLoadError = useCallback((_path: string, error: Error) => {
    setLoadStatus('error');
    setLoadError(error.message || '模型加载失败');
  }, []);

  const handleAction = useCallback((actionName: string) => {
    setLastAction(actionName);
    window.setTimeout(() => setLastAction(null), 1500);
  }, []);

  // Update scale display periodically
  useEffect(() => {
    const updateScale = () => {
      if (viewerRef.current) {
        const scale = viewerRef.current.getScale();
        setCurrentScale(scale);
      }
    };

    // Update scale immediately
    updateScale();

    // Set up interval to update scale
    const interval = setInterval(updateScale, 100);

    return () => clearInterval(interval);
  }, []);

  return (
    <div
      className={clsx(
        'relative h-full w-full overflow-hidden rounded-xl border border-gray-200 bg-gradient-to-b from-gray-100 to-gray-50',
        className
      )}
    >
      <Live2DViewer
        ref={viewerRef}
        modelPath={activePath}
        onLoadStart={handleLoadStart}
        onLoadProgress={handleLoadProgress}
        onLoadComplete={handleLoadComplete}
        onLoadError={handleLoadError}
        onAction={handleAction}
      />

      <div className="absolute left-3 right-3 top-3 flex flex-col gap-2 md:flex-row md:items-center">
        <input
          value={inputPath}
          onChange={(e) => setInputPath(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') triggerLoad();
          }}
          className="w-full flex-1 rounded-lg border border-gray-300 bg-white/90 px-3 py-2 text-sm text-gray-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="/live2d/.../model3.json"
        />
        <button
          onClick={triggerLoad}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700"
        >
          <RefreshCw size={16} />
          重新加载
        </button>
      </div>

      <div className="absolute right-3 top-16 flex gap-2">
        <button
          onClick={() => {
            viewerRef.current?.zoomIn();
          }}
          className="rounded-full bg-white/80 p-1.5 shadow-sm hover:bg-white transition-colors"
          title="放大"
        >
          <ZoomIn size={16} />
        </button>
        <button
          onClick={() => {
            viewerRef.current?.zoomOut();
          }}
          className="rounded-full bg-white/80 p-1.5 shadow-sm hover:bg-white transition-colors"
          title="缩小"
        >
          <ZoomOut size={16} />
        </button>
        <button
          onClick={() => {
            viewerRef.current?.resetZoom();
          }}
          className="rounded-full bg-white/80 p-1.5 shadow-sm hover:bg-white transition-colors"
          title="重置缩放"
        >
          <RotateCcw size={16} />
        </button>
      </div>

      {/* Scale percentage display */}
      <div className="absolute right-3 top-28 bg-white/90 backdrop-blur-sm rounded-lg px-3 py-2 text-sm font-medium text-gray-700 shadow-sm">
        {Math.round(currentScale * 100)}%
      </div>

      {(loadStatus === 'loading' || loadStatus === 'error') && (
        <div className="absolute inset-x-3 bottom-3 rounded-lg border border-gray-200 bg-white/90 p-3 shadow-sm">
          {loadStatus === 'loading' && (
            <div className="flex items-center gap-2 text-sm text-gray-700">
              <Loader2 size={16} className="animate-spin" />
              <span className="flex-1">
                加载中 {loadProgress}%
                {loadStage ? ` · ${loadStage}` : ''}
              </span>
            </div>
          )}

          {loadStatus === 'error' && (
            <div className="flex items-start gap-2 text-sm text-red-600">
              <AlertCircle size={16} className="mt-0.5" />
              <div className="flex-1">
                <div className="font-medium">加载失败</div>
                <div className="break-all text-xs text-red-600/90">{loadError}</div>
              </div>
            </div>
          )}

          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-gray-200">
            <div
              className={clsx('h-full transition-all', loadStatus === 'error' ? 'bg-red-500' : 'bg-blue-600')}
              style={{ width: `${loadProgress}%` }}
            />
          </div>
        </div>
      )}

      <div className="pointer-events-none absolute bottom-3 left-3 rounded-full bg-black/50 px-2 py-1 text-xs text-white">
        点击模型触发动作{lastAction ? ` · ${lastAction}` : ''}
      </div>
    </div>
  );
}
