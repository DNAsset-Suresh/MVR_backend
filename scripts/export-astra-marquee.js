import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {selectedVideos} from '../frontend/js/mvr-video-selection.js';
import {youtubeId} from '../frontend/js/media-utils.js';
const folder = 'wordpress';
await mkdir(folder,{recursive:true});
const escape = value => String(value).replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
const videos = [{title:'Student Motivation and Personality Development Programme',body:'A school programme supporting self-confidence, leadership, communication, positive thinking and study skills.',url:'https://www.youtube.com/watch?v=_XFSHInQ_Cw'},...selectedVideos];
const css = await readFile('frontend/css/youtube-marquee.css','utf8') + `
/* Banner styles for the standalone WordPress block only. */
.mvr-youtube-section{max-width:1220px;margin:0 auto;padding:24px 0;font-family:'Noto Sans Tamil','Nirmala UI',Latha,Arial,sans-serif}
.mvr-youtube-banner{padding:32px;border-radius:14px;background:#0d1b2a;color:#fff;margin-bottom:26px}
.mvr-youtube-banner .mvr-youtube-eyebrow{font-size:12px;letter-spacing:.16em;color:#ead5ac;margin:0 0 14px}
.mvr-youtube-banner h2{color:#fff;font:600 clamp(22px,4vw,32px)/1.4 Arial,sans-serif;margin:0 0 14px}
.mvr-youtube-banner p{color:#cbd6df;line-height:1.85;margin:0 0 22px}
.mvr-youtube-banner .mvr-youtube-channel{display:inline-block;padding:12px 20px;background:#e65a4c;color:#201717;border-radius:6px;text-decoration:none;font-weight:600;line-height:1.7}
.mvr-youtube-banner a:focus-visible{outline:3px solid #ead5ac;outline-offset:4px}
@media(max-width:600px){.mvr-youtube-banner{padding:24px}}
`;
const js = await readFile('frontend/js/youtube-marquee.js','utf8');
const html = `<section class="mvr-youtube-section" aria-label="MVR on YouTube">
  <header class="mvr-youtube-banner">
    <p class="mvr-youtube-eyebrow">MVR ON YOUTUBE</p>
    <h2>Madurai Ramakrishnan</h2>
    <p lang="ta">மேலும் பல வீடியோக்களை MVR-ன் YouTube சேனலில் காணலாம்.</p>
    <a class="mvr-youtube-channel" href="https://www.youtube.com/@MaduraiRamakrishnan/videos" target="_blank" rel="noopener noreferrer" lang="ta">YouTube சேனலைப் பார்க்க ↗</a>
  </header>
  <div class="mvr-marquee" data-mvr-marquee aria-label="MVR video selection">
    <div class="mvr-marquee-controls"><button type="button" class="mvr-marquee-toggle" aria-pressed="false" hidden>நிறுத்தவும் / Pause</button></div>
    <div class="mvr-marquee-viewport">
      <div class="mvr-marquee-track">
        <div class="mvr-marquee-group">
${videos.map(row => `          <article class="mvr-marquee-card">
            <div class="mvr-marquee-thumb">
              <img src="https://i.ytimg.com/vi/${youtubeId(row.url)}/hqdefault.jpg" alt="" width="480" height="270" loading="eager">
              <span class="mvr-marquee-fallback" hidden>முன்னோட்டம் கிடைக்கவில்லை</span>
              <span class="mvr-marquee-play" aria-hidden="true">▶</span>
            </div>
            <div class="mvr-marquee-copy">
              <h3 class="mvr-marquee-title"><a href="${escape(row.url)}" target="_blank" rel="noopener noreferrer">${escape(row.title)}</a></h3>
              <p class="mvr-marquee-description">${escape(row.body)}</p>
              <span class="mvr-marquee-watch" aria-hidden="true">வீடியோ பார்க்க ↗</span>
            </div>
          </article>`).join('\n')}
        </div>
      </div>
    </div>
  </div>
</section>`;
await writeFile(`${folder}/mvr-youtube.html`,html+'\n');
await writeFile(`${folder}/mvr-youtube.css`,css);
await writeFile(`${folder}/mvr-youtube.js`,js);
await writeFile(`${folder}/mvr-youtube-paste.html`,`<style>\n${css}</style>\n${html}\n<script>\n${js}</script>\n`);
await writeFile(`${folder}/preview.html`,`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>MVR YouTube marquee — Astra preview</title><link rel="stylesheet" href="mvr-youtube.css"></head><body>${html}<script src="mvr-youtube.js" defer></script></body></html>`);
