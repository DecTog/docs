// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import starlightLlmsTxt from 'starlight-llms-txt';
import starlightLinksValidator from 'starlight-links-validator';

const description =
	'Deep links, install attribution and real-time analytics for mobile apps: the Flutter SDK, the REST API, the dashboard and self-hosting.';

// https://astro.build/config
export default defineConfig({
	site: 'https://docs.dectog.com',
	trailingSlash: 'always',
	// Pages that moved; published copies of SKILL.md and the plugin still link the old URLs.
	redirects: {
		'/api/install-webhook/': '/api/webhooks/',
	},
	integrations: [
		starlight({
			title: 'DecTog Docs',
			description,
			favicon: '/favicon.svg',
			// dectog.com is reached from the logo (src/components/SiteTitle.astro).
			social: [{ icon: 'github', label: 'GitHub', href: 'https://github.com/DecTog' }],
			editLink: { baseUrl: 'https://github.com/DecTog/docs/edit/main/' },
			lastUpdated: true,
			customCss: [
				// Self-hosted variable fonts: Outfit for headings, Inter for text, Fira Code for code.
				'@fontsource-variable/outfit/wght.css',
				'@fontsource-variable/inter/wght.css',
				'@fontsource-variable/fira-code/wght.css',
				'./src/styles/custom.css',
				'./src/styles/chrome.css',
				'./src/styles/content.css',
			],
			components: {
				Footer: './src/components/Footer.astro',
				Header: './src/components/Header.astro',
				Hero: './src/components/Hero.astro',
				MobileMenuFooter: './src/components/MobileMenuFooter.astro',
				PageTitle: './src/components/PageTitle.astro',
				SiteTitle: './src/components/SiteTitle.astro',
			},
			head: [
				{ tag: 'meta', attrs: { name: 'theme-color', content: '#141414' } },
				// The share card every page previews with (WhatsApp, iMessage, Slack, X,
				// LinkedIn): public/og-card.png, rendered from src/brand/og-card.html.
				// Absolute URL and the size: WhatsApp and Facebook read neither relative
				// URLs nor unsized images reliably.
				{ tag: 'meta', attrs: { property: 'og:image', content: 'https://docs.dectog.com/og-card.png' } },
				{ tag: 'meta', attrs: { property: 'og:image:type', content: 'image/png' } },
				{ tag: 'meta', attrs: { property: 'og:image:width', content: '1200' } },
				{ tag: 'meta', attrs: { property: 'og:image:height', content: '630' } },
				{ tag: 'meta', attrs: { property: 'og:image:alt', content: 'DecTog documentation: how deep links land in the app' } },
				{ tag: 'meta', attrs: { name: 'twitter:image', content: 'https://docs.dectog.com/og-card.png' } },
			],
			// Each group lists the pages found in its directory. Order inside a group comes
			// from the `sidebar.order` frontmatter field of each page. Groups start collapsed;
			// Starlight opens the one that holds the current page.
			sidebar: [
				{ label: 'Start here', collapsed: true, items: [{ autogenerate: { directory: 'start' } }] },
				{ label: 'Links & routing', collapsed: true, items: [{ autogenerate: { directory: 'links' } }] },
				{ label: 'Flutter SDK', collapsed: true, items: [{ autogenerate: { directory: 'sdk' } }] },
				{ label: 'React Native SDK', collapsed: true, items: [{ autogenerate: { directory: 'react-native' } }] },
				{ label: 'Dashboard', collapsed: true, items: [{ autogenerate: { directory: 'dashboard' } }] },
				{ label: 'REST API', collapsed: true, items: [{ autogenerate: { directory: 'api' } }] },
				{ label: 'Self-hosting', collapsed: true, items: [{ autogenerate: { directory: 'self-hosting' } }] },
				{ label: 'Guides', collapsed: true, items: [{ autogenerate: { directory: 'guides' } }] },
				{ label: 'Contributing', collapsed: true, items: [{ autogenerate: { directory: 'contributing' } }] },
			],
			plugins: [
				starlightLlmsTxt({
					projectName: 'DecTog',
					description,
					details: [
						'DecTog is a self-hostable deep-linking and install-attribution service: short links that open an installed app or route visitors through the app stores, deferred deep linking for new installs, post-install events and a real-time dashboard.',
						'The hosted service lives at https://dectog.com (API at https://app.dectog.com, links on `{username}.dectog.com`). The server (Cloudflare Worker + D1 + Next.js dashboard) is AGPL-3.0; the Flutter SDK `flutter_dectog` and the React Native SDK `react-native-dectog` are MIT.',
						'These pages describe the behaviour of flutter_dectog 1.0.x, react-native-dectog 1.0.x and the server on its current database migrations.',
					].join('\n\n'),
					optionalLinks: [
						{
							label: 'Agent skill file',
							url: 'https://dectog.com/SKILL.md',
							description: 'Compact integration guide for AI coding agents.',
						},
						{
							label: 'Flutter SDK agent reference',
							url: 'https://raw.githubusercontent.com/DecTog/flutter_dectog/main/llms.txt',
							description: 'llms.txt shipped inside the flutter_dectog package: types, link URLs, routing and init.',
						},
						{
							label: 'React Native SDK agent reference',
							url: 'https://raw.githubusercontent.com/DecTog/react-native-dectog/main/llms.txt',
							description: 'llms.txt shipped inside the react-native-dectog package: types, link URLs, setup and init.',
						},
						{
							label: 'Source code',
							url: 'https://github.com/DecTog',
							description: 'Server, SDKs and these docs on GitHub.',
						},
					],
					customSets: [
						{ label: 'Flutter SDK', paths: ['sdk/**'], description: 'Installing and using the Flutter SDK.' },
						{ label: 'React Native SDK', paths: ['react-native/**'], description: 'Installing and using the React Native and Expo SDK.' },
						{ label: 'REST API', paths: ['api/**'], description: 'The REST API: links, attribution, events, raw export and webhooks.' },
						{ label: 'Self-hosting', paths: ['self-hosting/**'], description: 'Running your own DecTog server.' },
					],
				}),
				// Also check the links passed to the home page components.
				starlightLinksValidator({
					components: [
						['StepCard', 'href'],
						['LiveBand', 'href'],
					],
				}),
			],
		}),
	],
});
