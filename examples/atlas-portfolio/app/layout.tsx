import type { ReactNode } from "react";
import { PortfolioChatPanel } from "../components/portfolio-chat/portfolio-chat-panel";

export default function Layout({ children }: { children: ReactNode }) {
  return <html lang="en"><body style={{ margin: 0, fontFamily: "system-ui" }}>
    <PortfolioChatPanel config={{
      ownerName: "Morgan Reed", supportedLanguages: ["en"],
      endpoint: "/api/studio-assistant", clickEndpoint: "/api/studio-assistant/click",
      publishedPaths: ["/", "/work/lantern", "/case-studies/signal", "/journal/field-notes"],
      suggestions: { en: ["How did the Lantern team test tactile signs?", "Compare Lantern and Signal."] },
    }}>{children}</PortfolioChatPanel>
  </body></html>;
}
