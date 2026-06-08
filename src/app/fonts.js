import localFont from "next/font/local";

export const ptSans = localFont({
  src: [
    {
      path: "./fonts/pt-sans-400-latin.woff2",
      weight: "400",
      style: "normal",
    },
    {
      path: "./fonts/pt-sans-700-latin.woff2",
      weight: "700",
      style: "normal",
    },
  ],
  display: "swap",
  variable: "--font-pt-sans",
});

export const anton = localFont({
  src: [
    {
      path: "./fonts/anton-400-latin.woff2",
      weight: "400",
      style: "normal",
    },
  ],
  display: "swap",
  variable: "--font-anton",
});
