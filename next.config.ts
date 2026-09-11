import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // Dev only. Izinkan dev resource (/_next/*, /__nextjs*, HMR websocket)
  // diakses dari semua alamat IPv4, mis. http://172.28.188.53:3000,
  // http://192.168.x.x:3000, dsb.
  // Catatan: pola wildcard hanya bisa mencocokkan segmen subdomain
  // (dipisah titik), sehingga '*.*.*.*' = semua IPv4. IPv6 literal
  // (mis. '[::1]') harus ditulis eksplisit karena tidak mengandung titik.
  allowedDevOrigins: ['*.*.*.*', '[::1]'],
};

export default nextConfig;
