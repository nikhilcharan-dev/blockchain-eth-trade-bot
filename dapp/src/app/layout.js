import localFont from "next/font/local";
import "./globals.css";

const myFont = localFont({
    src: [{
        path: "./fonts/font.ttf",
        weight: "400",
        style: "normal"
    }],
    variable: "--font-myFont"
})

const myHeaderFont = localFont({
  src: [{
    path: "./fonts/banner-font.otf",
    weight: "700",
    style: "bold"
  }],
  variable: "--font-myHeader"
})

export const metadata = {
  title: "Crypto Dashboard",
  description: "Personalised DApp Dashboard for Cryptography & Trade",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${myFont.variable} ${myHeaderFont.variable}`}>
      <body>
        {children}
      </body>
    </html>
  );
}
