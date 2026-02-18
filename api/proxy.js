export default async function handler(req, res) {
  // URL প্যারামিটার চেক করা
  const { url } = req.query;
  if (!url) {
    return res.status(400).send('❌ url parameter missing');
  }

  // URL বৈধ কিনা চেক করা (কিন্তু ডোমেইন রেস্ট্রিকশন সরানো হয়েছে)
  try {
    new URL(url);
  } catch (e) {
    return res.status(400).send('❌ Invalid URL format');
  }

  try {
    // মূল সার্ভারে রিকোয়েস্ট পাঠানো, সাথে Referer হেডার
    const response = await fetch(url, {
      headers: {
        'Referer': 'https://www.ghuddi.tv/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });

    if (!response.ok) {
      return res.status(response.status).send(`Source server error: ${response.status} ${response.statusText}`);
    }

    // কন্টেন্ট টাইপ সেট করা
    const contentType = response.headers.get('content-type');
    res.setHeader('Content-Type', contentType || 'application/vnd.apple.mpegurl');

    // .m3u8 ফাইলের ক্ষেত্রে ভেতরের URL-ও পরিবর্তন করতে হবে
    if (url.includes('.m3u8')) {
      const data = await response.text();
      
      // বেস URL বের করা (যাতে আপেক্ষিক পাথকে পরম পাথে রূপান্তর করা যায়)
      const baseUrl = url.substring(0, url.lastIndexOf('/') + 1);
      
      // বর্তমান প্রক্সির বেস URL বের করা
      const protocol = req.headers['x-forwarded-proto'] || 'https';
      const host = req.headers.host;
      const baseProxyUrl = `${protocol}://${host}${req.url.split('?')[0]}`;
      
      // প্রতিটি লাইন চেক করা
      const modifiedData = data.split('\n').map(line => {
        const trimmed = line.trim();
        // যদি লাইন খালি না হয় এবং কমেন্ট না হয় এবং এটি একটি মিডিয়া ফাইল হয় (.ts, .m3u8, .m3u, .key, .vtt ইত্যাদি)
        if (trimmed && !trimmed.startsWith('#')) {
          // আপেক্ষিক পাথকে পরম URL বানানো
          let absoluteUrl;
          if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
            absoluteUrl = trimmed;
          } else {
            try {
              absoluteUrl = new URL(trimmed, baseUrl).toString();
            } catch (e) {
              // URL তৈরি করতে সমস্যা হলে মূল লাইন ফেরত দিন
              return line;
            }
          }
          // প্রক্সির মাধ্যমে কল করার জন্য URL তৈরি
          return `${baseProxyUrl}?url=${encodeURIComponent(absoluteUrl)}`;
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
