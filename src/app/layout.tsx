import './globals.css';
import { Inter } from 'next/font/google';
import { ThirdwebProviderWrapper } from './ThirdwebProviderWrapper';

const inter = Inter({ subsets: ['latin'] });

export const metadata = {
  title: 'DRUB Dashboard',
  description: 'Decentralized Ruble Lending Dashboard',
  icons: {
    icon: '/RUB.png',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <ThirdwebProviderWrapper>{children}</ThirdwebProviderWrapper>
      </body>
    </html>
  );
}
