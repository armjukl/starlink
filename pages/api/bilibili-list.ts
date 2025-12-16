// pages/api/bilibili-list.ts
import { NextApiRequest, NextApiResponse } from 'next';

// 分页接口定义
interface PaginatedResponse {
  success: boolean;
  mediaId: string;
  bvids: string[];
  pagination: {
    currentPage: number;
    pageSize: number;
    totalItems: number;
    hasMore: boolean;
    totalPages?: number;
  };
}

async function getPlaylistBVIds(mediaId: string, page: number = 1, pageSize: number = 20): Promise<{
  bvids: string[];
  hasMore: boolean;
  totalItems: number;
}> {
  const bvids: string[] = [];
  
  try {
    const apiUrl = `https://api.bilibili.com/x/v3/fav/resource/list?media_id=${mediaId}&pn=${page}&ps=${pageSize}`;
    
    const response = await fetch(apiUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
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
    
    // 提取当前页的BV号
    for (const item of resources) {
      if (item.bvid) {
        bvids.push(item.bvid);
      }
    }

    // 判断是否还有更多数据[citation:6]
    const hasMore = data.data?.has_more === 1;
    const totalItems = data.data?.info?.media_count || 0;

    return {
      bvids,
      hasMore,
      totalItems
    };
    
  } catch (error) {
    console.error(`获取第${page}页时出错:`, error);
    throw error;
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { mediaId, page = '1', pageSize = '20' } = req.query;

  if (!mediaId) {
    return res.status(400).json({ 
      error: 'Missing mediaId parameter',
      usage: 'GET /api/bilibili-list?mediaId=YOUR_MEDIA_ID&page=1&pageSize=20'
    });
  }

  try {
    const pageNum = parseInt(page as string);
    const pageSizeNum = parseInt(pageSize as string);
    
    // 验证分页参数
    if (pageNum < 1 || pageSizeNum < 1 || pageSizeNum > 20) {
      return res.status(400).json({
        success: false,
        error: '分页参数无效: page ≥ 1, 1 ≤ pageSize ≤ 20'
      });
    }

    const { bvids, hasMore, totalItems } = await getPlaylistBVIds(
      mediaId as string, 
      pageNum, 
      pageSizeNum
    );

    const response: PaginatedResponse = {
      success: true,
      mediaId: mediaId as string,
      bvids,
      pagination: {
        currentPage: pageNum,
        pageSize: pageSizeNum,
        totalItems,
        hasMore,
        totalPages: Math.ceil(totalItems / pageSizeNum)
      }
    };

    res.status(200).json(response);
  } catch (error) {
    console.error('Error fetching B站 playlist:', error);
    
    let errorMessage = 'An unknown error occurred';
    if (error instanceof Error) {
      errorMessage = error.message;
    }
    
    res.status(500).json({ 
      success: false,
      error: errorMessage 
    });
  }
}
