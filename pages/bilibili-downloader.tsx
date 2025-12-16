// pages/bilibili-downloader.tsx
import { useState, FormEvent } from 'react';

export default function BilibiliDownloader() {
  const [mediaId, setMediaId] = useState<string>('');
  const [bvids, setBvids] = useState<string[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');

  const extractMediaIdFromUrl = (url: string): string | null => {
    // 从B站播放列表URL中提取media_id
    // 支持格式: https://www.bilibili.com/list/ml3399027968
    const match = url.match(/list\/ml(\d+)/);
    return match ? match[1] : null;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setBvids([]);

    try {
      let finalMediaId = mediaId;
      
      // 如果输入的是完整URL，尝试从中提取media_id
      if (mediaId.includes('bilibili.com')) {
        const extractedId = extractMediaIdFromUrl(mediaId);
        if (extractedId) {
          finalMediaId = extractedId;
        } else {
          throw new Error('无法从URL中解析出播放列表ID，请确保是类似 https://www.bilibili.com/list/ml3399027968 的格式');
        }
      }

      const response = await fetch(`/api/bilibili-list?mediaId=${finalMediaId}`);
      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error);
      }

      setBvids(data.bvids);
      setMediaId(finalMediaId); // 更新为纯数字ID
    } catch (err) {
      // 处理 unknown 类型的错误
      const errorMessage = err instanceof Error ? err.message : '发生了未知错误';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = () => {
    const text = bvids.join('\n');
    navigator.clipboard.writeText(text)
      .then(() => alert('BV号已复制到剪贴板！'))
      .catch((err: Error) => console.error('复制失败:', err));
  };

  const downloadAsText = () => {
    const text = bvids.join('\n');
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bilibili_bvids_${mediaId}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '20px' }}>
      <h1>B站播放列表BV号提取工具</h1>
      
      <form onSubmit={handleSubmit} style={{ marginBottom: '30px' }}>
        <div style={{ marginBottom: '15px' }}>
          <label htmlFor="mediaId" style={{ display: 'block', marginBottom: '5px' }}>
            播放列表ID或URL：
          </label>
          <input
            id="mediaId"
            type="text"
            value={mediaId}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setMediaId(e.target.value)}
            placeholder="输入播放列表ID (如: 3399027968) 或完整URL"
            required
            style={{
              width: '100%',
              padding: '10px',
              border: '1px solid #ddd',
              borderRadius: '4px',
              fontSize: '16px'
            }}
          />
        </div>
        <button 
          type="submit" 
          disabled={loading}
          style={{
            padding: '10px 20px',
            backgroundColor: '#00a1d6',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: loading ? 'not-allowed' : 'pointer',
            fontSize: '16px'
          }}
        >
          {loading ? '获取中...' : '获取BV号'}
        </button>
      </form>

      {error && (
        <div style={{
          padding: '15px',
          backgroundColor: '#ffe6e6',
          border: '1px solid #ffcccc',
          borderRadius: '4px',
          marginBottom: '20px',
          color: '#cc0000'
        }}>
          {error}
        </div>
      )}

      {bvids.length > 0 && (
        <div>
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center',
            marginBottom: '15px'
          }}>
            <h2>获取到的BV号 (共{bvids.length}个)</h2>
            <div>
              <button 
                onClick={copyToClipboard}
                style={{
                  padding: '8px 15px',
                  marginRight: '10px',
                  backgroundColor: '#28a745',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
              >
                复制到剪贴板
              </button>
              <button 
                onClick={downloadAsText}
                style={{
                  padding: '8px 15px',
                  backgroundColor: '#17a2b8',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
              >
                下载为文本文件
              </button>
            </div>
          </div>
          
          <div style={{
            border: '1px solid #ddd',
            borderRadius: '4px',
            padding: '15px',
            backgroundColor: '#f9f9f9',
            maxHeight: '400px',
            overflowY: 'auto'
          }}>
            {bvids.map((bvid, index) => (
              <div 
                key={index}
                style={{
                  padding: '8px 5px',
                  borderBottom: index < bvids.length - 1 ? '1px solid #eee' : 'none',
                  fontFamily: 'monospace',
                  fontSize: '14px'
                }}
              >
                {bvid}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
