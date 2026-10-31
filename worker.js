// Cloudflare Worker: sajikan index.html + proxy ke Discord API.
// Discord menolak request bot token dari browser (User-Agent browser), jadi request lewat Worker ini.
const ALLOWED = [
  /^users\/@me\/guilds$/,
  /^guilds\/\d+\/channels$/,
  /^channels\/\d+\/messages$/,
];

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname.startsWith('/discord-api/')) {
      const path = url.pathname.slice('/discord-api/'.length);
      if (!['GET', 'POST'].includes(request.method) || !ALLOWED.some((r) => r.test(path))) {
        return json({ message: 'Endpoint tidak diizinkan' }, 403);
      }
      const headers = new Headers({
        'User-Agent': `DiscordBot (${url.origin}, 1.0)`,
        'Content-Type': request.headers.get('Content-Type') || 'application/json',
      });
      const auth = request.headers.get('Authorization');
      if (auth) headers.set('Authorization', auth);

      const upstream = await fetch(`https://discord.com/api/v10/${path}${url.search}`, {
        method: request.method,
        headers,
        body: request.method === 'GET' ? undefined : request.body,
      });
      return new Response(upstream.body, {
        status: upstream.status,
        headers: { 'Content-Type': upstream.headers.get('Content-Type') || 'application/json' },
      });
    }

    // selain itu: sajikan file statis (index.html, bg.mp4, dst) dari folder public/
    return env.ASSETS.fetch(request);
  },
};

const json = (obj, status) =>
  new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });
