import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Native / worker-based packages must not be bundled by webpack.
  serverExternalPackages: [
    "tesseract.js",
    "tesseract.js-core",
    "@tesseract.js-data/eng",
    "unpdf",
    "@prisma/client",
    "@prisma/adapter-libsql",
    "@libsql/client",
  ],
  // Make sure the OCR engine + local language data ship with serverless functions.
  outputFileTracingIncludes: {
    "/**": [
      "./node_modules/@tesseract.js-data/eng/4.0.0_best_int/**",
      "./node_modules/tesseract.js-core/**",
      "./node_modules/tesseract.js/src/**",
    ],
  },
  experimental: {
    serverActions: { bodySizeLimit: "2mb" },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
