// Narrow page generator: only the two pages covered by the content update.
import {writeFile} from 'node:fs/promises';
const head = (title, description, page, script) => `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title><meta name="description" content="${description}">
<meta property="og:title" content="${title}"><meta property="og:description" content="${description}"><meta property="og:type" content="website">
<meta property="og:url" content="{{ORIGIN}}/${page}.html"><link rel="canonical" href="{{ORIGIN}}/${page}.html">
<link rel="icon" href="/assets/icons/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/css/global.css?v=3"><link rel="stylesheet" href="/css/website.css?v=3"><link rel="stylesheet" href="/css/media-pages.css?v=1">${page === 'media' ? '\n<link rel="stylesheet" href="/css/youtube-marquee.css?v=1">' : ''}
<script type="module" src="/js/main.js"></script><script type="module" src="/js/${script}.js"></script>
</head><body data-page="${page}" class="media-page"><a class="skip-link" href="#main">Skip to content</a>
<header class="site-header" id="header"></header><main id="main" lang="ta">`;
const footer = '<div class="container"><div id="message" class="notice" role="status" tabindex="-1" aria-live="polite"></div></div></main><footer class="site-footer" id="footer"></footer></body></html>\n';

await writeFile('frontend/media.html', head('MVR | Media – Motivational Speeches, Videos & Interviews', "Explore MVR's motivational speeches, educational programmes, interviews, videos, and social media updates.", 'media', 'media') + `
<section class="page-banner media-hero"><div class="container">
<p class="eyebrow" lang="en">MVR / Media</p><h1>ஊடகங்களில் MVR</h1>
<p>ஊக்கமூட்டும் உரைகள், சிறப்புத் தருணங்கள், நேர்காணல்கள் மற்றும் சமூக ஊடகப் பதிவுகள் மூலம் MVR அவர்களின் பயணத்தை அறிந்துகொள்ளுங்கள்.</p>
<div class="actions"><a class="btn gold" href="#youtube">YouTube வீடியோக்கள் <span aria-hidden="true">↓</span></a><a class="btn secondary" href="#instagram">Instagram பதிவுகள் <span aria-hidden="true">↓</span></a></div>
</div></section>
<div class="container"><p id="media-status" class="notice" role="status" aria-live="polite">ஊடகப் பதிவுகள் ஏற்றப்படுகின்றன…</p><button class="btn secondary" id="media-retry" type="button" hidden>மீண்டும் முயற்சிக்கவும்</button></div>
<section class="media-section" id="youtube" aria-labelledby="youtube-heading"><div class="container">
<div class="media-heading"><div><span class="media-index" aria-hidden="true">01 /</span><h2 id="youtube-heading">YouTube வீடியோக்கள்</h2><p>உரைகளையும் நிகழ்ச்சிப் பதிவுகளையும் காணுங்கள்.</p></div><a id="youtube-channel-link" class="btn secondary" target="_blank" rel="noopener noreferrer" hidden>YouTube-இல் மேலும் பார்க்க ↗</a></div>
<article class="media-channel" id="youtube-channel" hidden><img alt="" width="124" height="124"><div><p class="eyebrow" lang="en">MVR on YouTube</p><h3></h3><p>மேலும் பல வீடியோக்களை MVR-ன் YouTube சேனலில் காணலாம்.</p><a class="btn gold" target="_blank" rel="noopener noreferrer">YouTube சேனலைப் பார்க்க ↗</a></div></article>
<div id="youtube-gallery" class="mvr-marquee" data-mvr-marquee aria-label="MVR YouTube வீடியோக்கள்" aria-busy="true"></div>
</div></section>
<section class="media-section" id="instagram" aria-labelledby="instagram-heading"><div class="container">
<div class="media-heading"><div><span class="media-index" aria-hidden="true">02 /</span><h2 id="instagram-heading">Instagram பதிவுகள்</h2><p>சமூக ஊடகங்களில் MVR-ன் பதிவுகளைத் தொடர்ந்து காணுங்கள்.</p></div><a id="instagram-profile-link" class="btn secondary" href="https://www.instagram.com/madurai.ramakrishnan/" target="_blank" rel="noopener noreferrer">Instagram-இல் பின்தொடர ↗</a></div>
<div id="instagram-gallery" class="media-grid" aria-busy="true"></div><p id="instagram-note" class="media-note"></p>
</div></section>
<section class="media-section" id="other-media" aria-labelledby="resources-heading" hidden><div class="container"><h2 id="resources-heading">மேலும் ஊடகப் பதிவுகள்</h2><div id="resource-gallery" class="media-grid"></div></div></section>
<noscript><div class="container"><p>வீடியோக்களின் பட்டியலைக் காண JavaScript-ஐ இயக்கவும்.</p><a href="https://www.youtube.com/@MaduraiRamakrishnan">MVR YouTube சேனல்</a> · <a href="https://www.instagram.com/madurai.ramakrishnan/">MVR Instagram</a></div></noscript>
` + footer);

const programmes = [
  ['WvY89k6jhHI', 'ஒரு நிமிடக் கதை', 'One-Minute Story', 'அழுகிய ஆப்பிளிலும் ஒரு மரத்திற்கான வாய்ப்பு இருக்கிறது என்ற சிந்தனையுடன், நம்பிக்கையைத் தளரவிடாமல் இருக்க அழைக்கும் குறுங்காணொளி.', 'https://youtube.com/shorts/WvY89k6jhHI?si=cWGGHRCY3hRO5g7s'],
  ['u1xtTwJ9ujk', 'பட்டிமன்றம்', 'Debate Programme', 'சமூக ஊடகங்கள் நம்மை அடிமையாக்குகின்றனவா, அறிவை வளர்க்கின்றனவா? இந்தக் கேள்வியை மையமாகக் கொண்ட சிறப்புப் பட்டிமன்றத்தைக் காணுங்கள்.', 'https://youtu.be/u1xtTwJ9ujk?si=bNApox9j84YtxxrO'],
  ['T1-ADWx-xmc', 'ஆதித்யா ஷோ', 'Adithya Show', 'இனிமையான வார்த்தைகள் வாழ்க்கையில் ஏற்படுத்தும் மாற்றத்தை மையமாகக் கொண்ட “இந்த நாள் இனிய நாள்” காணொளியைப் பாருங்கள்.', 'https://youtu.be/T1-ADWx-xmc?si=POJeX3nR51tsu1b8']
];
await writeFile('frontend/programmes.html', head('Programmes | MVR', 'MVR நிகழ்ச்சிகள்: மாணவர் மேம்பாடு, ஒரு நிமிடக் கதை, பட்டிமன்றம் மற்றும் ஆதித்யா ஷோ காணொளிகள்.', 'programmes', 'programmes') + `
<section class="page-banner media-hero"><div class="container"><p class="eyebrow" lang="en">MVR / Programmes</p><h1>சிந்தனையைத் தூண்டும் நிகழ்ச்சிகள்</h1><p>கல்வி, கதைகள், கருத்துப் பரிமாற்றம் — MVR நிகழ்ச்சிகளின் காணொளிகளை இங்கே காணுங்கள்.</p><div class="actions"><a class="btn gold" href="#programmes">நிகழ்ச்சிகளைப் பார்க்க ↓</a></div></div></section>
<section class="media-section" id="programmes" aria-labelledby="programmes-heading"><div class="container"><div class="media-heading"><div><span class="media-index" aria-hidden="true">MVR /</span><h2 id="programmes-heading">MVR வழங்கும் நிகழ்ச்சிகள்</h2></div></div>
<div id="programmes-status" role="status" aria-live="polite"></div>
<div class="media-grid" id="programme-gallery"><div id="saved-programmes" class="saved-programmes" data-content="programmes" aria-live="polite" lang="en"></div>
${programmes.map(([id, title, english, body, url]) => `<article class="media-card" data-video-id="${id}"><div class="media-thumbnail"><img src="https://i.ytimg.com/vi/${id}/hqdefault.jpg" alt="${title} — YouTube காணொளி முன்னோட்டம்" width="480" height="270" loading="lazy"><span class="thumbnail-fallback" hidden>முன்னோட்டம் கிடைக்கவில்லை</span><span class="play-mark" aria-hidden="true">▶</span></div><div class="media-card-copy"><p class="media-label" lang="en">${english}</p><h2>${title}</h2><p class="content-body">${body}</p><a class="btn secondary" href="${url}" target="_blank" rel="noopener noreferrer">வீடியோ பார்க்க ↗<span class="sr-only"> — ${title}; புதிய தாவலில் திறக்கும்</span></a></div></article>`).join('\n')}
</div><div class="actions section"><a class="btn" href="/availability.html">நிகழ்ச்சிக்காகத் தொடர்புகொள்ளுங்கள்</a></div></div></section>
` + footer);
