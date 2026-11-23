import './globals.css';
import AuthProvider from '@/components/AuthProvider';
import Navbar from '@/components/Navbar';
import NetworkCanvas from '@/components/NetworkCanvas';

export const metadata = {
  title: 'SuriLake · AI-assisted mini-SOC',
  description: 'AI-assisted Mini-SOC platform on Suricata logs: Spark data lake, hybrid ML scoring and host risk scores.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <NetworkCanvas />
        <div className="app">
          <AuthProvider>
            <Navbar />
            {children}
            <footer>AI Cybersecurity Data Lake </footer>
          </AuthProvider>
        </div>
      </body>
    </html>
  );
}
