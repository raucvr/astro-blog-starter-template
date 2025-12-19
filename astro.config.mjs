// @ts-check
import { defineConfig } from "astro/config";
import mdx from "@astrojs/mdx";
import sitemap from "@astrojs/sitemap";

import cloudflare from "@astrojs/cloudflare";

// https://astro.build/config
export default defineConfig({
	site: "https://neuroship.com",
	integrations: [mdx(), sitemap()],
	adapter: cloudflare({
		platformProxy: {
			enabled: true,
		},
		imageService: "passthrough", // 禁用图片优化，防止构建超时
	}),
	// 使用 Astro 内置图片服务而非 sharp
	image: {
		service: {
			entrypoint: 'astro/assets/services/noop'
		}
	}
});
