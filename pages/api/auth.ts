import type { NextApiRequest, NextApiResponse } from 'next';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'GET') {
    // Return the API key from environment variables
    const apiKey = process.env.DASHSCOPE_API_KEY;
    
    if (!apiKey || apiKey === 'your_key_here') {
      return res.status(400).json({ error: 'API key not configured' });
    }

    res.status(200).json({ apiKey });
  } else {
    res.setHeader('Allow', ['GET']);
    res.status(405).json({ error: 'Method not allowed' });
  }
}