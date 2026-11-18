// @ts-check
import starlight from '@astrojs/starlight';
import { defineConfig } from 'astro/config';

// Served by GitHub Pages at https://taulit.github.io/visor/.
const site = 'https://taulit.github.io';
const base = '/visor';
const ogImage = `${site}${base}/og.png`;

export default defineConfig({
  site,
  base,
  trailingSlash: 'always',
  integrations: [
    // Starlight adds the sitemap (sitemap-index.xml) because `site` is set.
    starlight({
      title: 'Visor',
      description:
        'Visor is a Dynamic Island and notch for GNOME Shell: media, timers, downloads, calendar, notifications, search and AI agent approvals below the top bar.',
      logo: { src: './src/assets/logo.svg', alt: 'Visor' },
      favicon: '/favicon.svg',
      social: [{ icon: 'github', label: 'GitHub', href: 'https://github.com/taulit/visor' }],
      editLink: { baseUrl: 'https://github.com/taulit/visor/edit/main/site/' },
      lastUpdated: true,
      customCss: ['./src/styles/custom.css'],
      head: [
        { tag: 'meta', attrs: { property: 'og:image', content: ogImage } },
        { tag: 'meta', attrs: { property: 'og:image:width', content: '1200' } },
        { tag: 'meta', attrs: { property: 'og:image:height', content: '630' } },
        {
          tag: 'meta',
          attrs: {
            property: 'og:image:alt',
            content: 'Visor, the open notch panel below the GNOME top bar',
          },
        },
        { tag: 'meta', attrs: { name: 'twitter:image', content: ogImage } },
        { tag: 'meta', attrs: { name: 'theme-color', content: '#0c0a10' } },
        {
          tag: 'script',
          attrs: { type: 'application/ld+json' },
          content: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'SoftwareApplication',
            name: 'Visor',
            applicationCategory: 'UtilitiesApplication',
            operatingSystem: 'Linux (GNOME Shell 50, 51)',
            description: 'A Dynamic Island and notch for GNOME Shell.',
            url: `${site}${base}/`,
            license: 'https://spdx.org/licenses/GPL-2.0-or-later.html',
            offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' },
            codeRepository: 'https://github.com/taulit/visor',
          }),
        },
      ],
      sidebar: [
        { label: 'Get started', items: [{ slug: 'install' }] },
        { label: 'Use', items: [{ slug: 'features' }, { slug: 'search' }, { slug: 'privacy' }] },
        { label: 'Write a module', items: [{ slug: 'modules' }, { slug: 'modules/api-v1' }] },
      ],
    }),
  ],
});
