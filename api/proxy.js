export default async function handler(req, res) {
  // URL প্যারামিটার চেক করা
  const { url } = req.query;
  if (!url) {
    return res.status(400).send('❌ url parameter missing');
  }

  // শুধুমাত্র নির্দিষ্ট ডোমেইন অনুমোদন (নিরাপত্তার জন্য)
  const allowedDomain = 'cdn.ghuddi.live';
  try {
    const urlObj = new URL(url);
    if (urlObj.hostname !== allowedDomain) {
      return res.status(403).send('❌ This domain is not allowed');
    }
  } catch (e) {
    return res.status(400).send('❌ Invalid URL');
  }

  try {
    // মূল সার্ভারে রিকোয়েস্ট পাঠানো, সাথে Referer হেডার
    const response = await fetch(url, {
      headers: {
        'Referer': 'https://www.ghuddi.tv/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    if (!response.ok) {
      return res.status(response.status).send('Source server error');
    }

    // কন্টেন্ট টাইপ সেট করা
    const contentType = response.headers.get('content-type');
    res.setHeader('Content-Type', contentType || 'application/vnd.apple.mpegurl');

    // .m3u8 ফাইলের ক্ষেত্রে ভেতরের URL-ও পরিবর্তন করতে হবে
    if (url.includes('.m3u8')) {
      const data = await response.text();
      
      // বেস URL বের করা (যাতে আপেক্ষিক পাথকে পরম পাথে রূপান্তর করা যায়)
      const baseUrl = url.substring(0, url.lastIndexOf('/') + 1);
      
      // প্রতিটি লাইন চেক করা
      const modifiedData = data.split('\n').map(line => {
        const trimmed = line.trim();
        // যদি লাইন খালি না হয় এবং কমেন্ট না হয় এবং .ts ফাইল হয়
        if (trimmed && !trimmed.startsWith('#') && (trimmed.endsWith('.ts') || trimmed.includes('.ts?'))) {
          // আপেক্ষিক পাথকে পরম URL বানানো
          let absoluteUrl;
          if (trimmed.startsWith('http')) {
            absoluteUrl = trimmed;
          } else {
            absoluteUrl = new URL(trimmed, baseUrl).toString();
          }
          // প্রক্সির মাধ্যমে কল করার জন্য URL তৈরি
          const callbackUrl = `${req.headers['x-forwarded-proto'] || 'https'}://${req.headers.host}${req.url.split('?')[0]}?url=${encodeURIComponent(absoluteUrl)}`;
          return callbackUrl;
        }
        return line;
      }).join('\n');
      
      return res.send(modifiedData);
    }

    // .ts বা অন্য ফাইল সরাসরি পাঠানো
    const buffer = await response.arrayBuffer();
    res.send(Buffer.from(buffer));
    
  } catch (error) {
    console.error(error);
    res.status(500).send('Proxy error: ' + error.message);
  }
}
