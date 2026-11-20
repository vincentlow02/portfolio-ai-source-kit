import type { ReactNode } from "react";
import { PortfolioChatPanel } from "../components/portfolio-chat/portfolio-chat-panel";
export default function Layout({ children }: { children: ReactNode }) {
  return <html lang="en"><body><header>Independent portfolio</header><PortfolioChatPanel config={{
    ownerName: "Avery Park", supportedLanguages: ["en"], endpoint: "/api/studio-assistant",
    clickEndpoint: "/api/studio-assistant/click", publishedPaths: ["/", "/projects/orbit"],
    suggestions: { en: ["How was Orbit Garden tested?"] },
  }}>{children}</PortfolioChatPanel></body></html>;
}
