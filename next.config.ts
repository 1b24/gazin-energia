import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Next 16 bloqueia por padrão acessos cross-origin a recursos de dev
  // (/_next/webpack-hmr etc.) — necessário liberar quando acessa o dev
  // server via IP da LAN (ex: 172.17.10.163 em vez de localhost).
  // Lista controlada apenas com IPs da rede privada confiável; produção
  // não usa essa flag (não há dev server).
  allowedDevOrigins: ["172.17.10.163"],
};

export default nextConfig;
