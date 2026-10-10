import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Touchline — Football Club Manager",
    short_name: "Touchline",
    description: "Build a club, develop players, out-think rival managers and win trophies.",
    start_url: "/",
    display: "standalone",
    background_color: "#f4f3ef",
    theme_color: "#f4f3ef",
    orientation: "any",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}
