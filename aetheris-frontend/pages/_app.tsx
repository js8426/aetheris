// Aetheris\aetheris-frontend\pages\_app.tsx

import type { AppProps } from 'next/app';
import { Geist, Geist_Mono } from 'next/font/google';
import { Web3Provider } from '@/components/Web3Provider';
import '@/app/globals.css';

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] });

export default function App({ Component, pageProps }: AppProps) {
  return (
    <Web3Provider>
      <div className={`${geistSans.variable} ${geistMono.variable}`}>
        <Component {...pageProps} />
      </div>
    </Web3Provider>
  );
}