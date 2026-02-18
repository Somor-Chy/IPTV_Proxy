export default async function handler(req, res) {
  const { url } = req.query;
  if (!url) {
    return res.status(400).send('❌ url parameter missing');
  }

  // URL বৈধ কিনা পরীক্ষা
  try {
    new URL(url);
  } catch (e) {
    return res.status(400).send('❌ Invalid URL');
  }

  // উৎস সার্ভারে পাঠানোর জন্য হেডার তৈরি
  const headers = {
    'Referer': 'https://www.ghuddi.tv/',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': '*/*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Connection': 'keep-alive',
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'cross-site'
  };

  // কিছু সার্ভার Origin হেডারও চেক করতে পারে
  headers['Origin'] = 'https://www.ghuddi.tv';

  try {
    console.log(`🔄 Fetching: ${url}`); // Vercel লগে দেখা যাবে

    const response = await fetch(url, { headers });

    console.log(`📡 Response status: ${response.status}`);

    if (!response.ok) {
      return res.status(response.status).send(`Source server error: ${response.status} ${response.statusText}`);
    }

    const contentType = response.headers.get('content-type');
    res.setHeader('Content-Type', contentType || 'application/vnd.apple.mpegurl');

    // যদি .m3u8 ফাইল হয়, তাহলে ভেতরের URL গুলো পরিবর্তন করুন
    if (url.includes('.m3u8')) {
      const data = await response.text();
      
      // বেস URL বের করুন
      const baseUrl = url.substring(0, url.lastIndexOf('/') + 1);
      const protocol = req.headers['x-forwarded-proto'] || 'https';
      const host = req.headers.host;
      const baseProxyUrl = `${protocol}://${host}${req.url.split('?')[0]}`;

      const modifiedData = data.split('\n').map(line => {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
          let absoluteUrl;
          if (trimmed.startsWith('http')) {
            absoluteUrl = trimmed;
          } else {
            try {
              absoluteUrl = new URL(trimmed, baseUrl).toString();
            } catch {
              return line;
            }
          }
          return `${baseProxyUrl}?url=${encodeURIComponent(absoluteUrl)}`;
        }
        return line;
      }).join('\n');

      return res.send(modifiedData);
    }

    // অন্যান্য ফাইল (যেমন .ts) সরাসরি পাঠান
    const buffer = await response.arrayBuffer();
    res.send(Buffer.from(buffer));

  } catch (error) {
    console.error('❌ Proxy error:', error);
    res.status(500).send(`Proxy error: ${error.message}`);
  }
}
