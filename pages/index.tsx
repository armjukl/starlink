// pages/video-player.tsx
import { useState, useEffect, useRef } from 'react';

interface VideoInfo {
  bv: string;
  title: string;
  video: string;
}

interface ApiResponse {
  success: boolean;
  count: number;
  videos: VideoInfo[];
  pagination: {
    currentPage: number;
    pageSize: number;
    totalItems: number;
    hasMore: boolean;
    totalPages?: number;
  };
  error?: string;
}

export default function VideoPlayer() {
  // 状态管理
  const [videos, setVideos] = useState<VideoInfo[]>([]);
  const [currentVideo, setCurrentVideo] = useState<VideoInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [jumpPage, setJumpPage] = useState('');
  const [customMediaId, setCustomMediaId] = useState('');
  const [currentMediaId, setCurrentMediaId] = useState('3399027968'); // 默认收藏夹ID
  const [pagination, setPagination] = useState<{
    currentPage: number;
    pageSize: number;
    totalItems: number;
    hasMore: boolean;
    totalPages?: number;
  }>({
    currentPage: 1,
    pageSize: 10,
    totalItems: 0,
    hasMore: false
  });

  // 视频元素引用
  const videoRef = useRef<HTMLVideoElement>(null);
  const jumpInputRef = useRef<HTMLInputElement>(null);
  const mediaIdInputRef = useRef<HTMLInputElement>(null);

  // 从URL中提取mediaId的函数
  const extractMediaIdFromUrl = (url: string): string | null => {
    // 支持格式: https://www.bilibili.com/list/ml3399027968
    const match = url.match(/list\/ml(\d+)/);
    return match ? match[1] : null;
  };

  // 获取播放列表
  const fetchPlaylist = async (page: number = pagination.currentPage, pageSize: number = pagination.pageSize, mediaId: string = currentMediaId) => {
    setLoading(true);
    setError('');
    
    try {
      const response = await fetch(`/api/parse-favorites?page=${page}&pageSize=${pageSize}&mediaId=${mediaId}`);
      const data: ApiResponse = await response.json();
      
      if (data.success) {
        setVideos(data.videos);
        setPagination(data.pagination);
        
        // 如果还没有当前播放的视频，自动选择第一个
        if (!currentVideo && data.videos.length > 0) {
          setCurrentVideo(data.videos[0]);
        }
      } else {
        setError(data.error || '获取播放列表失败');
      }
    } catch (err) {
      setError('网络请求失败，请检查API服务是否正常');
    } finally {
      setLoading(false);
    }
  };

  // 初始化加载
  useEffect(() => {
    fetchPlaylist(1, 10, currentMediaId);
  }, []);

  // 处理视频结束事件，实现自动连播
  useEffect(() => {
    const videoElement = videoRef.current;
    if (!videoElement) return;

    const handleVideoEnd = () => {
      if (videos.length === 0) return;
      
      const currentIndex = videos.findIndex(v => v.bv === currentVideo?.bv);
      if (currentIndex === -1) return;
      
      // 播放下一个视频
      const nextIndex = (currentIndex + 1) % videos.length;
      setCurrentVideo(videos[nextIndex]);
    };

    videoElement.addEventListener('ended', handleVideoEnd);
    
    return () => {
      videoElement.removeEventListener('ended', handleVideoEnd);
    };
  }, [videos, currentVideo]);

  // 分页控制 - 移除禁用逻辑
  const handlePageChange = (newPage: number) => {
    if (newPage < 1) return;
    fetchPlaylist(newPage, pagination.pageSize, currentMediaId);
  };

  const handlePageSizeChange = (newSize: number) => {
    if (newSize < 1 || newSize > 20) return;
    fetchPlaylist(1, newSize, currentMediaId);
  };

  // 跳转到指定页面
  const handleJumpToPage = () => {
    const pageNum = parseInt(jumpPage);
    if (pageNum && pageNum > 0 && pageNum <= (pagination.totalPages || 1)) {
      fetchPlaylist(pageNum, pagination.pageSize, currentMediaId);
      setJumpPage('');
    }
  };

  // 处理回车键跳转
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleJumpToPage();
    }
  };

  // 处理自定义收藏夹
  const handleCustomMediaIdSubmit = () => {
    let mediaId = customMediaId.trim();
    
    if (!mediaId) {
      setError('请输入收藏夹链接或ID');
      return;
    }

    // 如果输入的是URL，尝试提取mediaId
    if (mediaId.includes('bilibili.com')) {
      const extractedId = extractMediaIdFromUrl(mediaId);
      if (extractedId) {
        mediaId = extractedId;
      } else {
        setError('无法从URL中解析出收藏夹ID，请确保是类似 https://www.bilibili.com/list/ml3399027968 的格式');
        return;
      }
    }

    // 验证mediaId是否为纯数字
    if (!/^\d+$/.test(mediaId)) {
      setError('收藏夹ID必须是纯数字');
      return;
    }

    setCurrentMediaId(mediaId);
    setCustomMediaId('');
    fetchPlaylist(1, pagination.pageSize, mediaId);
  };

  // 重置为默认收藏夹
  const handleResetToDefault = () => {
    setCurrentMediaId('3399027968');
    setCustomMediaId('');
    fetchPlaylist(1, pagination.pageSize, '3399027968');
  };

  // 播放指定视频
  const playVideo = (video: VideoInfo) => {
    setCurrentVideo(video);
    // 滚动到播放器位置
    setTimeout(() => {
      document.getElementById('video-player-section')?.scrollIntoView({ 
        behavior: 'smooth',
        block: 'start'
      });
    }, 100);
  };

  // 播放下一个视频
  const playNext = () => {
    if (videos.length === 0) return;
    
    const currentIndex = videos.findIndex(v => v.bv === currentVideo?.bv);
    if (currentIndex === -1) return;
    
    const nextIndex = (currentIndex + 1) % videos.length;
    setCurrentVideo(videos[nextIndex]);
  };

  // 播放上一个视频
  const playPrev = () => {
    if (videos.length === 0) return;
    
    const currentIndex = videos.findIndex(v => v.bv === currentVideo?.bv);
    if (currentIndex === -1) return;
    
    const prevIndex = (currentIndex - 1 + videos.length) % videos.length;
    setCurrentVideo(videos[prevIndex]);
  };

  return (
    <>
      {/* 全局样式 */}
      <style jsx global>{`
        /* 全局滚动条样式 */
        html, body {
          overflow: auto;
          scrollbar-width: thin;
          scrollbar-color: #c1c1c1 #f1f1f1;
        }
        
        ::-webkit-scrollbar {
          width: 12px;
          height: 12px;
        }
        
        ::-webkit-scrollbar-track {
          background: #f1f1f1;
          border-radius: 6px;
        }
        
        ::-webkit-scrollbar-thumb {
          background: #c1c1c1;
          border-radius: 6px;
          border: 2px solid #f1f1f1;
        }
        
        ::-webkit-scrollbar-thumb:hover {
          background: #a8a8a8;
        }
        
        /* 播放列表滚动条 */
        .playlist-container::-webkit-scrollbar {
          width: 8px;
        }
        
        .playlist-container::-webkit-scrollbar-track {
          background: #f1f1f1;
          border-radius: 4px;
        }
        
        .playlist-container::-webkit-scrollbar-thumb {
          background: #00a1d6;
          border-radius: 4px;
        }
        
        .playlist-container::-webkit-scrollbar-thumb:hover {
          background: #008fb3;
        }
        
        /* 动画 */
        @keyframes pulse {
          0% { opacity: 1; }
          50% { opacity: 0.5; }
          100% { opacity: 1; }
        }
        
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>

      <div style={{ 
        minHeight: '100vh',
        backgroundColor: '#f8f9fa',
        fontFamily: 'Arial, sans-serif'
      }}>
        <div style={{ 
          maxWidth: '1200px', 
          margin: '0 auto', 
          padding: '20px',
          minHeight: '100vh'
        }}>
          <h1 style={{ 
            textAlign: 'center', 
            color: '#00a1d6',
            marginBottom: '30px',
            fontSize: '2rem',
            fontWeight: 'bold'
          }}>
            B站视频播放器
          </h1>

          {/* 自定义收藏夹输入区域 */}
          <div style={{
            backgroundColor: 'white',
            padding: '20px',
            borderRadius: '12px',
            marginBottom: '20px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
          }}>
            <h3 style={{ 
              marginTop: 0, 
              marginBottom: '15px',
              color: '#333',
              fontSize: '1.1rem'
            }}>
              自定义收藏夹
            </h3>
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '10px',
              flexWrap: 'wrap'
            }}>
              <div style={{ flex: 1, minWidth: '300px' }}>
                <input
                  ref={mediaIdInputRef}
                  type="text"
                  value={customMediaId}
                  onChange={(e) => setCustomMediaId(e.target.value)}
                  placeholder="输入收藏夹链接或ID (例如: https://www.bilibili.com/list/ml3399027968 或 3399027968)"
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    border: '1px solid #ddd',
                    borderRadius: '6px',
                    fontSize: '14px'
                  }}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter') {
                      handleCustomMediaIdSubmit();
                    }
                  }}
                />
              </div>
              <button
                onClick={handleCustomMediaIdSubmit}
                disabled={loading}
                style={{
                  padding: '10px 20px',
                  backgroundColor: '#28a745',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  fontWeight: 'bold',
                  fontSize: '14px',
                  transition: 'all 0.2s ease',
                  opacity: loading ? 0.7 : 1
                }}
                onMouseEnter={(e) => {
                  if (!loading) {
                    e.currentTarget.style.backgroundColor = '#218838';
                    e.currentTarget.style.transform = 'translateY(-1px)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!loading) {
                    e.currentTarget.style.backgroundColor = '#28a745';
                    e.currentTarget.style.transform = 'translateY(0)';
                  }
                }}
              >
                {loading ? '加载中...' : '加载收藏夹'}
              </button>
              <button
                onClick={handleResetToDefault}
                disabled={loading}
                style={{
                  padding: '10px 15px',
                  backgroundColor: '#6c757d',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  fontSize: '14px',
                  transition: 'all 0.2s ease',
                  opacity: loading ? 0.7 : 1
                }}
                onMouseEnter={(e) => {
                  if (!loading) {
                    e.currentTarget.style.backgroundColor = '#5a6268';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!loading) {
                    e.currentTarget.style.backgroundColor = '#6c757d';
                  }
                }}
              >
                重置默认
              </button>
            </div>
            <div style={{ 
              marginTop: '10px', 
              fontSize: '13px', 
              color: '#666',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <span>
                当前收藏夹: <strong>{currentMediaId}</strong>
                {currentMediaId === '3399027968' && ' (默认)'}
              </span>
              <span>
                示例: ml3399027968 或 https://www.bilibili.com/list/ml3399027968
              </span>
            </div>
          </div>

          {/* 分页控制 */}
          <div style={{
            backgroundColor: 'white',
            padding: '20px',
            borderRadius: '12px',
            marginBottom: '20px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '15px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontWeight: '500' }}>每页显示:</span>
              <select 
                value={pagination.pageSize}
                onChange={(e) => handlePageSizeChange(Number(e.target.value))}
                style={{
                  padding: '8px 12px',
                  border: '1px solid #ddd',
                  borderRadius: '6px',
                  backgroundColor: 'white',
                  cursor: 'pointer',
                  fontWeight: '500'
                }}
              >
                <option value={5}>5个视频</option>
                <option value={10}>10个视频</option>
                <option value={15}>15个视频</option>
                <option value={20}>20个视频</option>
              </select>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '15px', flexWrap: 'wrap' }}>
              <button
                onClick={() => handlePageChange(pagination.currentPage - 1)}
                style={{
                  padding: '10px 20px',
                  backgroundColor: '#00a1d6',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontWeight: 'bold',
                  fontSize: '14px',
                  transition: 'all 0.2s ease',
                  minWidth: '80px',
                  opacity: loading ? 0.7 : 1
                }}
                onMouseEnter={(e) => {
                  if (!loading) {
                    e.currentTarget.style.backgroundColor = '#008fb3';
                    e.currentTarget.style.transform = 'translateY(-1px)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!loading) {
                    e.currentTarget.style.backgroundColor = '#00a1d6';
                    e.currentTarget.style.transform = 'translateY(0)';
                  }
                }}
              >
                {loading ? '...' : '上一页'}
              </button>

              <div style={{ 
                minWidth: '140px', 
                textAlign: 'center',
                fontWeight: '500',
                fontSize: '14px'
              }}>
                第 <strong>{pagination.currentPage}</strong> 页 / 共 <strong>{pagination.totalPages || 1}</strong> 页
              </div>

              <button
                onClick={() => handlePageChange(pagination.currentPage + 1)}
                style={{
                  padding: '10px 20px',
                  backgroundColor: '#00a1d6',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontWeight: 'bold',
                  fontSize: '14px',
                  transition: 'all 0.2s ease',
                  minWidth: '80px',
                  opacity: loading ? 0.7 : 1
                }}
                onMouseEnter={(e) => {
                  if (!loading) {
                    e.currentTarget.style.backgroundColor = '#008fb3';
                    e.currentTarget.style.transform = 'translateY(-1px)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!loading) {
                    e.currentTarget.style.backgroundColor = '#00a1d6';
                    e.currentTarget.style.transform = 'translateY(0)';
                  }
                }}
              >
                {loading ? '...' : '下一页'}
              </button>

              {/* 页面跳转输入框 */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '14px', fontWeight: '500' }}>跳转至:</span>
                <input
                  ref={jumpInputRef}
                  type="number"
                  value={jumpPage}
                  onChange={(e) => setJumpPage(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder="页码"
                  min="1"
                  max={pagination.totalPages || 1}
                  style={{
                    width: '80px',
                    padding: '8px',
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                    fontSize: '14px',
                    textAlign: 'center'
                  }}
                />
                <button
                  onClick={handleJumpToPage}
                  style={{
                    padding: '8px 12px',
                    backgroundColor: '#28a745',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '12px',
                    fontWeight: 'bold'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#218838';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = '#28a745';
                  }}
                >
                  跳转
                </button>
              </div>
            </div>

            <div style={{ fontWeight: 'bold', color: '#666' }}>
              共 {pagination.totalItems} 个视频
            </div>
          </div>

          {/* 错误显示 */}
          {error && (
            <div style={{
              padding: '15px',
              backgroundColor: '#ffe6e6',
              border: '1px solid #ffcccc',
              borderRadius: '8px',
              marginBottom: '20px',
              color: '#cc0000',
              fontWeight: '500'
            }}>
              {error}
            </div>
          )}

          {/* 加载状态提示 */}
          {loading && (
            <div style={{
              padding: '10px',
              backgroundColor: '#e6f7ff',
              border: '1px solid #b3e0ff',
              borderRadius: '6px',
              marginBottom: '20px',
              textAlign: 'center',
              color: '#0066cc',
              fontWeight: '500'
            }}>
              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                <div style={{
                  width: '16px',
                  height: '16px',
                  border: '2px solid #f3f3f3',
                  borderTop: '2px solid #00a1d6',
                  borderRadius: '50%',
                  animation: 'spin 1s linear infinite'
                }}></div>
                正在加载第 {pagination.currentPage} 页...
              </div>
            </div>
          )}

          {/* 主要内容区域 */}
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: '1fr 2fr',
            gap: '24px',
            alignItems: 'start',
            minHeight: '600px'
          }}>
            {/* 播放列表 */}
            <div 
              className="playlist-container"
              style={{
                backgroundColor: 'white',
                borderRadius: '12px',
                padding: '20px',
                maxHeight: '700px',
                overflowY: 'auto',
                boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                scrollbarWidth: 'thin' as any,
                scrollbarColor: '#00a1d6 #f1f1f1'
              }}
            >
              <h2 style={{ 
                marginTop: 0, 
                marginBottom: '20px',
                paddingBottom: '15px',
                borderBottom: '2px solid #f0f0f0',
                position: 'sticky',
                top: 0,
                backgroundColor: 'white',
                zIndex: 1,
                fontSize: '1.2rem',
                color: '#333'
              }}>
                播放列表 <span style={{ color: '#00a1d6' }}>({videos.length})</span>
              </h2>

              {loading ? (
                <div style={{ 
                  textAlign: 'center', 
                  padding: '40px',
                  color: '#666'
                }}>
                  <div style={{
                    width: '40px',
                    height: '40px',
                    border: '4px solid #f3f3f3',
                    borderTop: '4px solid #00a1d6',
                    borderRadius: '50%',
                    animation: 'spin 1s linear infinite',
                    margin: '0 auto 15px'
                  }}></div>
                  加载中...
                </div>
              ) : videos.length === 0 ? (
                <div style={{ 
                  textAlign: 'center', 
                  padding: '40px', 
                  color: '#666',
                  fontSize: '16px'
                }}>
                  📺 暂无视频
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {videos.map((video, index) => (
                    <div
                      key={video.bv}
                      onClick={() => playVideo(video)}
                      style={{
                        padding: '16px',
                        borderRadius: '8px',
                        backgroundColor: currentVideo?.bv === video.bv ? '#e6f7ff' : '#f8f9fa',
                        border: currentVideo?.bv === video.bv ? '2px solid #00a1d6' : '1px solid #e9ecef',
                        cursor: 'pointer',
                        transition: 'all 0.3s ease',
                        position: 'relative'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = currentVideo?.bv === video.bv ? '#d4f0ff' : '#e9ecef';
                        e.currentTarget.style.transform = 'translateY(-2px)';
                        e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = currentVideo?.bv === video.bv ? '#e6f7ff' : '#f8f9fa';
                        e.currentTarget.style.transform = 'translateY(0)';
                        e.currentTarget.style.boxShadow = 'none';
                      }}
                    >
                      <div style={{ 
                        fontWeight: currentVideo?.bv === video.bv ? '600' : '500',
                        fontSize: '14px',
                        lineHeight: '1.5',
                        display: 'flex',
                        alignItems: 'flex-start'
                      }}>
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          width: '28px',
                          height: '28px',
                          lineHeight: '28px',
                          textAlign: 'center',
                          backgroundColor: currentVideo?.bv === video.bv ? '#00a1d6' : '#dee2e6',
                          color: currentVideo?.bv === video.bv ? 'white' : '#495057',
                          borderRadius: '50%',
                          marginRight: '12px',
                          fontSize: '12px',
                          flexShrink: 0,
                          marginTop: '2px'
                        }}>
                          {index + 1}
                        </span>
                        <span style={{ flex: 1 }}>
                          {video.title}
                        </span>
                      </div>
                      <div style={{ 
                        fontSize: '12px', 
                        color: '#6c757d', 
                        marginTop: '8px',
                        fontFamily: 'monospace',
                        marginLeft: '40px'
                      }}>
                        {video.bv}
                      </div>
                      
                      {/* 当前播放指示器 */}
                      {currentVideo?.bv === video.bv && (
                        <div style={{
                          position: 'absolute',
                          right: '12px',
                          top: '50%',
                          transform: 'translateY(-50%)',
                          width: '10px',
                          height: '10px',
                          backgroundColor: '#00a1d6',
                          borderRadius: '50%',
                          animation: 'pulse 1.5s infinite'
                        }}></div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 视频播放器 */}
            <div id="video-player-section">
              {currentVideo ? (
                <div style={{
                  backgroundColor: 'white',
                  borderRadius: '12px',
                  padding: '24px',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                  position: 'sticky',
                  top: '20px'
                }}>
                  <h2 style={{ 
                    marginTop: 0, 
                    marginBottom: '20px',
                    fontSize: '1.3rem',
                    lineHeight: '1.4',
                    color: '#333',
                    fontWeight: '600'
                  }}>
                    {currentVideo.title}
                  </h2>

                  {/* 视频播放器 */}
                  <div style={{ 
                    position: 'relative', 
                    paddingBottom: '56.25%', /* 16:9 宽高比 */
                    height: 0,
                    marginBottom: '20px',
                    borderRadius: '8px',
                    overflow: 'hidden'
                  }}>
                    <video
                      ref={videoRef}
                      controls
                      autoPlay
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: '100%',
                        borderRadius: '8px',
                        backgroundColor: '#000'
                      }}
                      src={currentVideo.video}
                    >
                      您的浏览器不支持视频播放。
                    </video>
                  </div>

                  {/* 视频信息 */}
                  <div style={{ 
                    backgroundColor: '#f8f9fa',
                    padding: '20px',
                    borderRadius: '8px',
                    border: '1px solid #e9ecef',
                    maxHeight: '200px',
                    overflowY: 'auto'
                  }}>
                    <div style={{ marginBottom: '12px', display: 'flex', alignItems: 'center' }}>
                      <strong style={{ minWidth: '60px' }}>BV号:</strong> 
                      <span style={{ 
                        fontFamily: 'monospace', 
                        marginLeft: '8px',
                        backgroundColor: '#e9ecef',
                        padding: '6px 10px',
                        borderRadius: '4px',
                        fontSize: '14px'
                      }}>
                        {currentVideo.bv}
                      </span>
                    </div>
                    
                    <div style={{ marginBottom: '0' }}>
                      <strong style={{ display: 'block', marginBottom: '8px' }}>视频链接:</strong>
                      <a 
                        href={currentVideo.video} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        style={{ 
                          display: 'block',
                          wordBreak: 'break-all',
                          color: '#00a1d6',
                          fontSize: '14px',
                          textDecoration: 'none',
                          lineHeight: '1.4',
                          padding: '8px',
                          backgroundColor: 'white',
                          borderRadius: '4px',
                          border: '1px solid #e9ecef'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.textDecoration = 'underline';
                          e.currentTarget.style.backgroundColor = '#f8f9fa';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.textDecoration = 'none';
                          e.currentTarget.style.backgroundColor = 'white';
                        }}
                      >
                        {currentVideo.video}
                      </a>
                    </div>
                  </div>

                  {/* 播放控制 */}
                  <div style={{ 
                    display: 'flex', 
                    justifyContent: 'center', 
                    gap: '20px',
                    marginTop: '20px'
                  }}>
                    <button
                      onClick={playPrev}
                      disabled={videos.length <= 1}
                      style={{
                        padding: '12px 24px',
                        backgroundColor: videos.length <= 1 ? '#e0e0e0' : '#00a1d6',
                        color: 'white',
                        border: 'none',
                        borderRadius: '8px',
                        cursor: videos.length <= 1 ? 'not-allowed' : 'pointer',
                        fontWeight: 'bold',
                        fontSize: '14px',
                        transition: 'all 0.2s ease'
                      }}
                      onMouseEnter={(e) => {
                        if (videos.length > 1) {
                          e.currentTarget.style.backgroundColor = '#008fb3';
                          e.currentTarget.style.transform = 'translateY(-2px)';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (videos.length > 1) {
                          e.currentTarget.style.backgroundColor = '#00a1d6';
                          e.currentTarget.style.transform = 'translateY(0)';
                        }
                      }}
                    >
                      ⏮ 上一个
                    </button>
                    
                    <button
                      onClick={playNext}
                      disabled={videos.length <= 1}
                      style={{
                        padding: '12px 24px',
                        backgroundColor: videos.length <= 1 ? '#e0e0e0' : '#00a1d6',
                        color: 'white',
                        border: 'none',
                        borderRadius: '8px',
                        cursor: videos.length <= 1 ? 'not-allowed' : 'pointer',
                        fontWeight: 'bold',
                        fontSize: '14px',
                        transition: 'all 0.2s ease'
                      }}
                      onMouseEnter={(e) => {
                        if (videos.length > 1) {
                          e.currentTarget.style.backgroundColor = '#008fb3';
                          e.currentTarget.style.transform = 'translateY(-2px)';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (videos.length > 1) {
                          e.currentTarget.style.backgroundColor = '#00a1d6';
                          e.currentTarget.style.transform = 'translateY(0)';
                        }
                      }}
                    >
                      下一个 ⏭
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{
                  backgroundColor: 'white',
                  borderRadius: '12px',
                  padding: '60px',
                  textAlign: 'center',
                  color: '#666',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  minHeight: '400px',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
                }}>
                  {loading ? (
                    <>
                      <div style={{
                        width: '50px',
                        height: '50px',
                        border: '4px solid #f3f3f3',
                        borderTop: '4px solid #00a1d6',
                        borderRadius: '50%',
                        animation: 'spin 1s linear infinite',
                        marginBottom: '20px'
                      }}></div>
                      <div style={{ fontSize: '16px' }}>加载中...</div>
                    </>
                  ) : (
                    <>
                      <div style={{ fontSize: '64px', marginBottom: '20px' }}>📺</div>
                      <div style={{ fontSize: '18px', marginBottom: '10px' }}>选择视频开始播放</div>
                      <div style={{ fontSize: '14px', color: '#999' }}>请从左侧播放列表中选择一个视频</div>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* 功能说明 */}
          <div style={{
            marginTop: '30px',
            padding: '20px',
            backgroundColor: '#e6f7ff',
            borderRadius: '12px',
            fontSize: '14px',
            border: '1px solid #b3e0ff',
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
          }}>
            <h3 style={{ marginTop: 0, color: '#0077b3', fontSize: '16px' }}>功能说明:</h3>
            <ul style={{ paddingLeft: '20px', marginBottom: 0, lineHeight: '1.6' }}>
              <li>支持自定义收藏夹：输入收藏夹链接或ID即可加载</li>
              <li>使用分页控件调整显示的播放列表</li>
              <li>点击左侧列表中的视频标题开始播放</li>
              <li>当前播放的视频会高亮显示</li>
              <li>视频播放结束后会自动播放下一个</li>
              <li>可以使用"上一个"/"下一个"按钮手动切换</li>
              <li>显示当前视频的BV号和原始链接</li>
              <li>新增页面跳转功能，可直接输入页码跳转</li>
            </ul>
          </div>
        </div>
      </div>
    </>
  );
}
