// pages/api/parse-favorites.ts
import { NextApiRequest, NextApiResponse } from 'next';

interface VideoInfo {
  bv: string;
  title: string;
  video: string;
}

interface ParseApiResponse {
  code: number;
  msg: string;
  data: {
    title: string;
    video: string;
    cover?: string;
    desc?: string;
    publish_time?: string;
  };
}

interface ParseResponse {
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

// 分页获取收藏夹BV号
async function getPlaylistBVIds(mediaId: string, page: number = 1, pageSize: number = 20): Promise<{
  bvids: string[];
  hasMore: boolean;
  totalItems: number;
}> {
  try {
    const apiUrl = `https://api.bilibili.com/x/v3/fav/resource/list?media_id=${mediaId}&pn=${page}&ps=${pageSize}`;
    
    const response = await fetch(apiUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://www.bilibili.com/'
      }
    });

    if (!response.ok) {
      throw new Error(`B站API请求失败: ${response.status}`);
    }

    const data = await response.json();
    
    if (data.code !== 0) {
      throw new Error(`B站API返回错误: ${data.message}`);
    }

    const resources = data.data?.medias || [];
    const bvids: string[] = [];

    for (const item of resources) {
      if (item.bvid) {
        bvids.push(item.bvid);
      }
    }

    const hasMore = data.data?.has_more === 1;
    const totalItems = data.data?.info?.media_count || 0;

    return { bvids, hasMore, totalItems };
    
  } catch (error) {
    console.error(`获取第${page}页时出错:`, error);
    throw error;
  }
}

// 解析单个视频信息（保持不变）
async function parseVideoInfo(bv: string): Promise<VideoInfo | null> {
  try {
    const parseUrl = `https://api.yuafeng.cn/API/ly/bilibili_jx.php?url=https://www.bilibili.com/video/${bv}`;
    
    const response = await fetch(parseUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://www.bilibili.com/'
      }
    });

    if (!response.ok) {
      throw new Error(`解析接口请求失败: ${response.status}`);
    }

    const data: ParseApiResponse = await response.json();
    
    if (data.code === 0 && data.data && data.data.title && data.data.video) {
      return {
        bv,
        title: data.data.title,
        video: data.data.video
      };
    } else {
      console.warn(`视频 ${bv} 解析失败:`, data.msg);
      return null;
    }
    
  } catch (error) {
    console.error(`解析视频 ${bv} 时出错:`, error);
    return null;
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse<ParseResponse>) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ 
      success: false, 
      count: 0, 
      videos: [], 
      pagination: {
        currentPage: 1,
        pageSize: 20,
        totalItems: 0,
        hasMore: false
      },
      error: 'Method not allowed' 
    });
  }

 /* try {
    const { page = '1', pageSize = '10' } = req.query;
    const mediaId = '3399027968';
*/
    // 在 parse-favorites.ts 中修改 handler 函数

  // ... 其他代码保持不变

  try {
  /*  const { page = '1', pageSize = '10', mediaId = '3399027968' } = req.query;
    
    // 使用传入的 mediaId 或默认值
    const finalMediaId = mediaId as string;
    
   
    
//  
    const pageNum = parseInt(page as string);
    const pageSizeNum = parseInt(pageSize as string);
    */
// 修复：安全地从 query 中提取参数，并处理数组情况
    const { page = '1', pageSize = '10', mediaId } = req.query;
    
    // 处理 mediaId：如果是数组则取第一个元素，否则使用传入值或默认值
    const mediaIdString = Array.isArray(mediaId) ? mediaId[0] : (mediaId || '3399027968');
    const pageNum = parseInt(Array.isArray(page) ? page[0] : page);
    const pageSizeNum = parseInt(Array.isArray(pageSize) ? pageSize[0] : pageSize);
    
    if (pageNum < 1 || pageSizeNum < 1 || pageSizeNum > 20) {
      return res.status(400).json({
        success: false,
        count: 0,
        videos: [],
        pagination: {
          currentPage: pageNum,
          pageSize: pageSizeNum,
          totalItems: 0,
          hasMore: false
        },
        error: '分页参数无效: page ≥ 1, 1 ≤ pageSize ≤ 20'
      });
    }

    console.log(`开始获取收藏夹第${pageNum}页，每页${pageSizeNum}条...`);
    
    // 1. 获取当前页的BV号
    const { bvids, hasMore, totalItems } = await getPlaylistBVIds(mediaIdString, pageNum, pageSizeNum);
    
    if (bvids.length === 0) {
      return res.status(200).json({
        success: true,
        count: 0,
        videos: [],
        pagination: {
          currentPage: pageNum,
          pageSize: pageSizeNum,
          totalItems,
          hasMore: false
        }
      });
    }

    console.log(`第${pageNum}页获取到 ${bvids.length} 个视频，开始解析...`);

    // 2. 解析当前页的所有视频信息（控制并发）
    const batchPromises = bvids.map(bv => parseVideoInfo(bv));
    const batchResults = await Promise.all(batchPromises);
    
    const validResults = batchResults.filter((result): result is VideoInfo => result !== null);

    console.log(`第${pageNum}页解析完成，成功解析 ${validResults.length} 个视频`);

    // 3. 返回分页数据
    res.status(200).json({
      success: true,
      count: validResults.length,
      videos: validResults,
      pagination: {
        currentPage: pageNum,
        pageSize: pageSizeNum,
        totalItems,
        hasMore,
        totalPages: Math.ceil(totalItems / pageSizeNum)
      }
    });

  } catch (error) {
    console.error('处理收藏夹时出错:', error);
    
    const errorMessage = error instanceof Error ? error.message : '发生了未知错误';
    
    res.status(500).json({ 
      success: false, 
      count: 0, 
      videos: [], 
      pagination: {
        currentPage: 1,
        pageSize: 20,
        totalItems: 0,
        hasMore: false
      },
      error: errorMessage 
    });
  }
}
