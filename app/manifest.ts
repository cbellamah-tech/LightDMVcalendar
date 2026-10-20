import type { MetadataRoute } from "next";

// Lets crews "Add to Home Screen" so the app opens full screen like a native app.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Light DMV",
    short_name: "Light DMV",
    start_url: "/",
    display: "standalone",
    background_color: "#F3F5F9",
    theme_color: "#112E5B",
    icons: [{ src: "/icon", sizes: "512x512", type: "image/png" }],
  };
}
