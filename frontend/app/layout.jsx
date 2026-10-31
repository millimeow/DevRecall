import '../src/styles.css';

export const metadata = {
  title: 'DevRecall — Decision intelligence',
  description: 'Recover decisions, rejected alternatives, and reasoning from engineering discussions, with original-source evidence.',
};
export const viewport = { themeColor: '#101211' };

export default function RootLayout({ children }) {
  return <html lang="en"><body>{children}</body></html>;
}
