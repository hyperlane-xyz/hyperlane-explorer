import { Space_Grotesk as SpaceGrostek } from 'next/font/google';

export const MAIN_FONT = SpaceGrostek({
  subsets: ['latin'],
  variable: '--font-main',
  preload: true,
  fallback: ['sans-serif'],
});
