import type { ReactNode } from "react";
export default function Layout({ children }: { children: ReactNode }) {
  return <html lang="en"><body><header>Cold start host header</header>{children}<footer>Cold start host footer</footer></body></html>;
}
