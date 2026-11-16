import { defineConfig } from 'astro/config';

// 用户 Pages 站点挂在根域名 https://wanghesong2019.github.io/，base 用默认 '/'
export default defineConfig({
  site: 'https://wanghesong2019.github.io',
  compressHTML: true,
});
